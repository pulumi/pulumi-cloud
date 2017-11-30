// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";

import { awsAccountId, awsRegion } from "./aws";
import { Network } from "./network";

import * as config from "../config";

// The default path to use for mounting EFS inside ECS container instances.
const efsMountPath = "/mnt/efs";

/**
 * Arguments bag for creating infrastrcture for a new Cluster.
 */
export interface ClusterArgs {
    /**
     * The network in which to create this cluster.
     */
    network: Network;
    /**
     * Whether to create an EFS File System to manage volumes across the cluster.
     */
    addEFS: boolean;
    /**
     * The EC2 instance type to use for the Cluster.  Defaults to `t2-micro`.
     */
    instanceType?: string;
    /**
     * The minimum size of the cluster. Defaults to 2.
     */
    minSize?: number;
    /**
     * The maximum size of the cluster. Defaults to 100.
     */
    maxSize?: number;
    /**
     * Public key material for SSH access. See allowed formats at:
     * https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-key-pairs.html
     * If not provided, no SSH access is enabled on VMs.
     */
    publicKey?: string;
    /**
     * The name of the ECS-optimzed AMI to use for the Container Instances in this cluster, e.g.
     * "amzn-ami-2017.09.a-amazon-ecs-optimized".
     *
     * See http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html for valid values.
     */
    ecsOptimizedAMIName?: string;
}

/**
 * A Cluster is a general purpose ECS cluster configured to run in a provided
 * Network.
 */
export class Cluster {
    /**
     * The ECS Cluster ARN.
     */
    public readonly ecsClusterARN: pulumi.Computed<string>;
    /**
     * The ECS Cluster's Security Group ID.
     */
    public readonly securityGroupId?: pulumi.Computed<string>;
    /**
     * The auto-scaling group that ECS Service's should add to their
     * `dependsOn`.
     */
    public readonly autoScalingGroupStack?: pulumi.Resource;
    /**
     * The EFS host mount path if EFS is enabled on this Cluster.
     */
    public readonly efsMountPath?: string;

    constructor(name: string, args: ClusterArgs) {
        if (!args.network) {
            throw new Error("Expected a valid Network to use for creating Cluster");
        }

        // First create an ECS cluster.
        const cluster = new aws.ecs.Cluster(`${name}-cluster`);
        this.ecsClusterARN = cluster.id;

        // Next create all of the IAM/security resources.
        const assumeInstanceRolePolicyDoc: aws.iam.PolicyDocument = {
            Version: "2012-10-17",
            Statement: [{
                Action: [
                    "sts:AssumeRole",
                ],
                Effect: "Allow",
                Principal: {
                    Service: [ "ec2.amazonaws.com" ],
                },
            }],
        };
        const instanceRolePolicyDoc: aws.iam.PolicyDocument = {
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Action: [
                    "apigateway:*",
                    "autoscaling:CompleteLifecycleAction",
                    "autoscaling:DescribeAutoScalingInstances",
                    "autoscaling:DescribeLifecycleHooks",
                    "autoscaling:SetInstanceHealth",
                    "ec2:DescribeInstances",
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:BatchGetImage",
                    "ecr:GetAuthorizationToken",
                    "ecr:GetDownloadUrlForLayer",
                    "ecs:CreateCluster",
                    "ecs:DeregisterContainerInstance",
                    "ecs:DiscoverPollEndpoint",
                    "ecs:Poll",
                    "ecs:RegisterContainerInstance",
                    "ecs:RegisterTaskDefinition",
                    "ecs:RunTask",
                    "ecs:StartTelemetrySession",
                    "ecs:Submit*",
                    "events:*",
                    "iam:*",
                    "lambda:*",
                    "logs:*",
                    "logs:CreateLogStream",
                    "logs:DescribeLogStreams",
                    "logs:GetLogEvents",
                    "logs:PutLogEvents",
                    "s3:*",
                    "sns:*",
                ],
                Resource: "*",
            }],
        };
        const instanceRole = new aws.iam.Role(`${name}-instance-role`, {
            assumeRolePolicy: JSON.stringify(assumeInstanceRolePolicyDoc),
        });
        const instanceRolePolicy = new aws.iam.RolePolicy(`${name}-instance-role-policy`, {
            role: instanceRole.id,
            policy: JSON.stringify(instanceRolePolicyDoc),
        });
        const instanceProfile = new aws.iam.InstanceProfile(`${name}-instance-profile`, {
            role: instanceRole,
        });

        // Create the EC2 instance security group
        const ALL = {
            fromPort: 0,
            toPort: 0,
            protocol: "-1",  // all
            cidrBlocks: [ "0.0.0.0/0" ],
        };
        // IDEA: Can we re-use the network's default security group instead of creating a specific
        // new security group in the Cluster layer?  This may allow us to share a single Security Group
        // across both instance and Lambda compute.
        const instanceSecurityGroup = new aws.ec2.SecurityGroup(`${name}-instance-security-group`, {
            vpcId: args.network.vpcId,
            ingress: [
                // Expose SSH
                {
                    fromPort: 22,
                    toPort: 22,
                    protocol: "TCP",
                    cidrBlocks: [ "0.0.0.0/0" ],
                },
                // Expose ephemeral container ports to Internet.
                // TODO: Limit to load balancer(s).
                {
                    fromPort: 0,
                    toPort: 65535,
                    protocol: "TCP",
                    cidrBlocks: [ "0.0.0.0/0" ],
                },
            ],
            egress: [ ALL ],  // See TerraformEgressNote
        });
        this.securityGroupId = instanceSecurityGroup.id;

        // If requested, add EFS file system and mount targets in each subnet.
        let filesystem: aws.efs.FileSystem | undefined;
        if (args.addEFS) {
            filesystem = new aws.efs.FileSystem(`${name}-filesystem`);
            const efsSecurityGroup = new aws.ec2.SecurityGroup(`${name}-filesystem-securitygroup`, {
                vpcId: args.network.vpcId,
                ingress: [
                    // Allow NFS traffic from the instance security group
                    {
                        securityGroups: [ instanceSecurityGroup.id ],
                        protocol: "TCP",
                        fromPort: 2049,
                        toPort: 2049,
                    },
                ],
            });
            for (let i = 0; i <  args.network.subnetIds.length; i++) {
                const subnetId = args.network.subnetIds[i];
                const mountTarget = new aws.efs.MountTarget(`${name}-mounttarget-${i}`, {
                    fileSystemId: filesystem.id,
                    subnetId: subnetId,
                    securityGroups: [ efsSecurityGroup.id ],
                });
            }
            this.efsMountPath = efsMountPath;
        }

        // If requested, add a new EC2 KeyPair for SSH access to the instances.
        let keyName: pulumi.Computed<string> | undefined;
        if (args.publicKey) {
            const key = new aws.ec2.KeyPair(`${name}-keypair`, {
                publicKey: args.publicKey,
            });
            keyName = key.keyName;
        }

        // Specify the intance configuration for the cluster.
        const instanceLaunchConfiguration = new aws.ec2.LaunchConfiguration(`${name}-instance-launch-configuration`, {
            imageId: getEcsAmiId(args.ecsOptimizedAMIName),
            instanceType: args.instanceType || "t2.micro",
            keyName: keyName,
            iamInstanceProfile: instanceProfile.id,
            enableMonitoring: true,  // default is true
            placementTenancy: "default",  // default is "default"
            ebsBlockDevices: [
                {
                    deviceName: "/dev/xvdb",
                    volumeSize: 5, // GB
                    volumeType: "gp2", // default is "standard"
                    deleteOnTermination: true,
                },
                {
                    deviceName: "/dev/xvdcz",
                    volumeSize: 50,
                    volumeType: "gp2",
                    deleteOnTermination: true,
                },
            ],
            securityGroups: [ instanceSecurityGroup.id ],
            userData: getInstanceUserData(cluster, filesystem, this.efsMountPath),
        });

        // Finally, create the AutoScaling Group.
        const dependsOn: pulumi.Resource[] = [];
        if (args.network.internetGateway) {
            dependsOn.push(args.network.internetGateway);
        }
        if (args.network.natGateways) {
            for (const natGateway of args.network.natGateways) {
                dependsOn.push(natGateway);
            }
        }
        this.autoScalingGroupStack = new aws.cloudformation.Stack(
            `${name}-asg-stack`,
            {
                templateBody: getCloudFormationAsgTemplate(
                    args.minSize || 2,
                    args.maxSize || 100,
                    instanceLaunchConfiguration.id,
                    args.network.subnetIds,
                ),
            },
            undefined,
            dependsOn,
        );

    }
}

// http://docs.aws.amazon.com/AmazonECS/latest/developerguide/container_agent_versions.html
async function getEcsAmiId(name?: string) {
    const result: aws.GetAmiResult = await aws.getAmi({
        filter: [
            {
                name: "name",
                values: [ name || "amzn-ami-2017.09.a-amazon-ecs-optimized" ],
            },
            {
                name: "owner-id",
                values: [ "591542846629" ], // Amazon
            },
        ],
        mostRecent: true,
    });
    return result.imageId;
}

// http://cloudinit.readthedocs.io/en/latest/topics/format.html#cloud-config-data
// ours seems inspired by:
// https://github.com/convox/rack/blob/023831d8/provider/aws/dist/rack.json#L1669
// https://github.com/awslabs/amazon-ecs-amazon-efs/blob/d92791f3/amazon-efs-ecs.json#L655
async function getInstanceUserData(
    cluster: aws.ecs.Cluster,
    fileSystem: aws.efs.FileSystem | undefined,
    mountPath: string | undefined) {

    let fileSystemRuncmdBlock = "";
    if (fileSystem && mountPath) {
        // tslint:disable max-line-length
        fileSystemRuncmdBlock = `
            # Create EFS mount path
            mkdir ${mountPath}
            chown ec2-user:ec2-user ${mountPath}
            # Create environment variables
            EFS_FILE_SYSTEM_ID=${await fileSystem.id}
            DIR_SRC=$AWS_AVAILABILITY_ZONE.$EFS_FILE_SYSTEM_ID.efs.$AWS_REGION.amazonaws.com
            DIR_TGT=${mountPath}
            # Update /etc/fstab with the new NFS mount
            cp -p /etc/fstab /etc/fstab.back-$(date +%F)
            echo -e \"$DIR_SRC:/ $DIR_TGT nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2 0 0\" | tee -a /etc/fstab
            mount -a -t nfs4
            # Restart Docker
            docker ps
            service docker stop
            service docker start
        `;
    }

    return `#cloud-config
    repo_upgrade_exclude:
        - kernel*
    packages:
        - aws-cfn-bootstrap
        - aws-cli
        - nfs-utils
    mounts:
        - ['/dev/xvdb', 'none', 'swap', 'sw', '0', '0']
    bootcmd:
        - mkswap /dev/xvdb
        - swapon /dev/xvdb
        - echo ECS_CLUSTER='${await cluster.id}' >> /etc/ecs/ecs.config
        - echo ECS_ENGINE_AUTH_TYPE=docker >> /etc/ecs/ecs.config
    runcmd:
        # Set and use variables in the same command, since it's not obvious if
        # different commands will run in different shells.
        - |
            # Knock one letter off of availability zone to get region.
            AWS_AVAILABILITY_ZONE=$(curl -s 169.254.169.254/2016-09-02/meta-data/placement/availability-zone)
            AWS_REGION=$(echo $AWS_AVAILABILITY_ZONE | sed 's/.$//')

            ${fileSystemRuncmdBlock}

            # cloud-init docs are unclear about whether $INSTANCE_ID is available in runcmd.
            EC2_INSTANCE_ID=$(curl -s 169.254.169.254/2016-09-02/meta-data/instance-id)
            # \$ below so we don't get Javascript interpolation.
            # Line continuations are processed by Javascript before YAML or shell sees them.
            CFN_STACK=$(aws ec2 describe-instances \
                --instance-id "\${EC2_INSTANCE_ID}" \
                --region "\${AWS_REGION}" \
                --query "Reservations[0].Instances[0].Tags[?Key=='aws:cloudformation:stack-name'].Value" \
                --output text)
            CFN_RESOURCE=$(aws ec2 describe-instances \
                --instance-id "\${EC2_INSTANCE_ID}" \
                --region "\${AWS_REGION}" \
                --query "Reservations[0].Instances[0].Tags[?Key=='aws:cloudformation:logical-id'].Value" \
                --output text)
            /opt/aws/bin/cfn-signal \
                --region "\${AWS_REGION}" \
                --stack "\${CFN_STACK}" \
                --resource "\${CFN_RESOURCE}"
    `;
}

// TODO[pulumi/pulumi-aws/issues#43]: We'd prefer not to use CloudFormation, but it's the best way to implement
// rolling updates in an autoscaling group.
async function getCloudFormationAsgTemplate(
    minSize: number,
    maxSize: number,
    instanceLaunchConfigurationId: pulumi.Computed<string>,
    subnetIds: pulumi.Computed<string>[]): pulumi.Computed<string> {

    const subnetsIdsArray = await Promise.all(subnetIds);

    return `
    AWSTemplateFormatVersion: '2010-09-09'
    Outputs:
        Instances:
            Value: !Ref Instances
    Resources:
        Instances:
            Type: AWS::AutoScaling::AutoScalingGroup
            Properties:
                Cooldown: 300
                DesiredCapacity: ${minSize}
                HealthCheckGracePeriod: 120
                HealthCheckType: EC2
                LaunchConfigurationName: "${await instanceLaunchConfigurationId}"
                MaxSize: ${maxSize}
                MetricsCollection:
                -   Granularity: 1Minute
                MinSize: ${minSize}
                VPCZoneIdentifier: ${JSON.stringify(subnetsIdsArray)}
            CreationPolicy:
                ResourceSignal:
                    Count: ${minSize}
                    Timeout: PT15M
            UpdatePolicy:
                AutoScalingRollingUpdate:
                    MaxBatchSize: 1
                    MinInstancesInService: ${minSize}
                    PauseTime: PT15M
                    SuspendProcesses:
                    - ScheduledActions
                    WaitOnResourceSignals: true
    `;
}
