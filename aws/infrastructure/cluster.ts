// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";

import { awsAccountId, awsRegion } from "./aws";
import { Network } from "./network";

import * as config from "../config";

/**
 * Arguments bag for creating infrastrcture for a new Cluster.
 */
export interface ClusterArgs {
    /**
     * The network in which to create this cluster.
     */
    network: Network;
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
}

export class Cluster {
    public ecsClusterARN: pulumi.Computed<string>;
    public autoScalingGroupStack?: aws.cloudformation.Stack;

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
            // TODO[pulumi/pulumi-aws/issues#41]: "roles" is deprecated, but if we use "role" then we can't delete this.
            roles: [ instanceRole ],
        });

        // Now create the EC2 infra and VMs that will back the ECS cluster.
        const ALL = {
            fromPort: 0,
            toPort: 0,
            protocol: "-1",  // all
            cidrBlocks: [ "0.0.0.0/0" ],
        };
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
        let keyName: pulumi.Computed<string> | undefined;
        if (args.publicKey) {
            const key = new aws.ec2.KeyPair(`{name}-keypair`, {
                publicKey: args.publicKey,
            });
            keyName = key.keyName;
        }
        const instanceLaunchConfiguration = new aws.ec2.LaunchConfiguration(`${name}-instance-launch-configuration`, {
            imageId: getEcsAmiId(),
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
                },
                {
                    deviceName: "/dev/xvdcz",
                    volumeSize: 50,
                    volumeType: "gp2",
                },
            ],
            securityGroups: [ instanceSecurityGroup.id ],
            userData: getInstanceUserData(cluster),
        });

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
            "autoScalingGroupStack",
            {
                templateBody: getCloudFormationAsgTemplate(
                    args.minSize || 2,
                    args.maxSize || 100,
                    instanceLaunchConfiguration.id,
                    args.network.subnetIds,
                ),
            },
            dependsOn,
        );

    }
}

// http://docs.aws.amazon.com/AmazonECS/latest/developerguide/container_agent_versions.html
async function getEcsAmiId() {
    const result: aws.GetAmiResult = await aws.getAmi({
        filter: [
            {
                name: "name",
                values: [ "amzn-ami-2017.03.g-amazon-ecs-optimized" ],
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
async function getInstanceUserData(cluster: aws.ecs.Cluster) {
    return `#cloud-config
    repo_upgrade_exclude:
        - kernel*
    packages:
        - aws-cfn-bootstrap
        - aws-cli
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
            AWS_REGION=$(curl -s 169.254.169.254/2016-09-02/meta-data/placement/availability-zone | sed 's/.$//')
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
