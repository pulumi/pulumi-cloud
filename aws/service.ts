// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";
import * as config from "./config";

// ecsCluster is an automatically managed, lazily allocated ECS cluster if no predefined one is given.
let ecsCluster: aws.ecs.Cluster | undefined;

// See http://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_KernelCapabilities.html
type ECSKernelCapability = "ALL" | "AUDIT_CONTROL" | "AUDIT_WRITE" | "BLOCK_SUSPEND" | "CHOWN" | "DAC_OVERRIDE" |
    "DAC_READ_SEARCH" | "FOWNER" | "FSETID" | "IPC_LOCK" | "IPC_OWNER" | "KILL" | "LEASE" | "LINUX_IMMUTABLE" |
    "MAC_ADMIN" | "MAC_OVERRIDE" | "MKNOD" | "NET_ADMIN" | "NET_BIND_SERVICE" | "NET_BROADCAST" | "NET_RAW" |
    "SETFCAP" | "SETGID" | "SETPCAP" | "SETUID" | "SYS_ADMIN" | "SYS_BOOT" | "SYS_CHROOT" | "SYS_MODULE" |
    "SYS_NICE" | "SYS_PACCT" | "SYS_PTRACE" | "SYS_RAWIO" | "SYS_RESOURCE" | "SYS_TIME" | "SYS_TTY_CONFIG" |
    "SYSLOG" | "WAKE_ALARM";

// See `logdriver` at http://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
type ECSLogDriver = "json-file" | "syslog" | "journald" | "gelf" | "fluentd" | "awslogs" | "splunk";

// See http://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Ulimit.html
type ECSUlimitName = "core" | "cpu" | "data" | "fsize" | "locks" | "memlock" | "msgqueue" | "nice" |
    "nofile" | "nproc" | "rss" | "rtprio" | "rttime" | "sigpending" | "stack";

// See http://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerDefinition.html
interface ECSContainerDefinition {
    command?: string[];
    cpu?: number;
    disableNetworking?: boolean;
    dnsSearchDomains?: boolean;
    dnsServers?: string[];
    dockerLabels?: { [label: string]: string };
    dockerSecurityOptions?: string[];
    entryPoint?: string[];
    environment?: { name: string; value: string; }[];
    essential?: boolean;
    extraHosts?: { hostname: string; ipAddress: string }[];
    hostname?: string;
    image?: string;
    links?: string[];
    linuxParameters?: { capabilities?: { add?: ECSKernelCapability[]; drop?: ECSKernelCapability[] } };
    logConfiguration?: { logDriver: ECSLogDriver; options?: { [key: string]: string } };
    memory?: number;
    memoryReservation?: number;
    mountPoints?: { containerPath?: string; readOnly?: boolean; sourceVolume?: string }[];
    name: string;
    portMappings?: { containerPort?: number; hostPort?: number; protocol?: string; }[];
    privileged?: boolean;
    readonlyRootFilesystem?: boolean;
    ulimits?: { name: ECSUlimitName; hardLimit: number; softLimit: number }[];
    user?: string;
    volumesFrom?: { sourceContainer?: string; readOnly?: boolean }[];
    workingDirectory?: string;
}

// The shared Load Balancer management role used across all Services.
let serviceLoadBalancerRole: aws.iam.Role | undefined;
function getServiceLoadBalancerRole(): aws.iam.Role {
    if (!serviceLoadBalancerRole) {
        const assumeRolePolicy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "sts:AssumeRole",
                    "Principal": {
                        "Service": "ecs.amazonaws.com",
                    },
                    "Effect": "Allow",
                    "Sid": "",
                },
            ],
        };
        const policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": [
                        "elasticloadbalancing:DeregisterInstancesFromLoadBalancer",
                        "elasticloadbalancing:DeregisterTargets",
                        "elasticloadbalancing:Describe*",
                        "elasticloadbalancing:RegisterInstancesWithLoadBalancer",
                        "elasticloadbalancing:RegisterTargets",
                        "ec2:Describe*",
                        "ec2:AuthorizeSecurityGroupIngress",
                    ],
                    "Effect": "Allow",
                    "Resource": "*",
                },
            ],
        };
        serviceLoadBalancerRole = new aws.iam.Role("pulumi-s-lb-role", {
            assumeRolePolicy: JSON.stringify(assumeRolePolicy),
        });
        const rolePolicy = new aws.iam.RolePolicy("pulumi-s-lb-role", {
            role: serviceLoadBalancerRole.name,
            policy: JSON.stringify(policy),
        });
    }
    return serviceLoadBalancerRole;
}

const MAX_LISTENERS_PER_NLB = 50;
let loadBalancer: aws.elasticloadbalancingv2.LoadBalancer | undefined;
let listenerIndex = 0;

interface ContainerPortLoadBalancer {
    loadBalancer: aws.elasticloadbalancingv2.LoadBalancer;
    targetGroup: aws.elasticloadbalancingv2.TargetGroup;
    listenerPort: number;
}

// createLoadBalancer allocates a new Load Balancer TargetGroup that can be
// attached to a Service container and port pair. Allocates a new NLB is needed
// (currently 50 ports can be exposed on a single NLB).
function newLoadBalancerTargetGroup(container: cloud.Container, port: number): ContainerPortLoadBalancer {
    if (!config.ecsClusterVpcId) {
        throw new Error("Cannot create 'Service'. Missing cluster config 'cloud-aws:config:config.ecsClusterVpcId'");
    }
    if (!config.ecsClusterSubnets) {
        throw new Error("Cannot create 'Service'. Missing cluster config 'cloud-aws:config:config.ecsClusterSubnets'");
    }
    if (listenerIndex % MAX_LISTENERS_PER_NLB === 0) {
        // Create a new Load Balancer every 50 requests for a new TargetGroup.
        const subnets = config.ecsClusterSubnets.split(",");
        const subnetmapping = subnets.map(s => ({ subnetId: s }));
        const lbname = `pulumi-s-lb-${listenerIndex / MAX_LISTENERS_PER_NLB + 1}`;
        loadBalancer = new aws.elasticloadbalancingv2.LoadBalancer(lbname, {
            loadBalancerType: "network",
            subnetMapping: subnetmapping,
            internal: false,
        });
    }
    const targetListenerName = `pulumi-s-lb-${listenerIndex}`;
    // Create the target group for the new container/port pair.
    const target = new aws.elasticloadbalancingv2.TargetGroup(targetListenerName, {
        port: port,
        protocol: "TCP",
        vpcId: config.ecsClusterVpcId,
        deregistrationDelay: 30,
    });
    // Listen on a new port on the NLB and forward to the target.
    const listenerPort = 34567 + listenerIndex % MAX_LISTENERS_PER_NLB;
    const listener = new aws.elasticloadbalancingv2.Listener(targetListenerName, {
        loadBalancerArn: loadBalancer!.arn,
        protocol: "TCP",
        port: listenerPort,
        defaultActions: [{
            type: "forward",
            targetGroupArn: target.arn,
        }],
    });
    listenerIndex++;
    return {
        loadBalancer: loadBalancer!,
        targetGroup: target,
        listenerPort: listenerPort,
    };
}

interface ImageOptions {
    image: string;
    environment: { name: string; value: string; }[];
}

function ecsEnvironmentFromMap(environment: {[name: string]: string} | undefined): { name: string, value: string }[] {
    const result: { name: string; value: string; }[] = [];
    if (environment) {
        for (const name of Object.keys(environment)) {
            result.push({ name: name, value: environment[name] });
        }
    }
    return result;
}

// computeImage turns the `image`, `function` or `build` setting on a
// `cloud.Container` into a valid Docker image name which can be used in an ECS
// TaskDefinition.
async function computeImage(container: cloud.Container): Promise<ImageOptions> {
    const environment: { name: string, value: string }[] = ecsEnvironmentFromMap(container.environment);
    if (container.image) {
        return { image: container.image, environment: environment };
    } else if (container.build) {
        throw new Error("Not yet implemented.");
    } else if (container.function) {
        const closure = await pulumi.runtime.serializeClosure(container.function);
        const jsSrcText = pulumi.runtime.serializeJavaScriptText(closure);
        // TODO[pulumi/pulumi-cloud#85]: Put this in a real Pulumi-owned Docker image.
        // TODO[pulumi/pulumi-cloud#86]: Pass the full local zipped folder through to the container (via S3?)
        environment.push({ name: "PULUMI_SRC", value: jsSrcText });
        return { image: "lukehoban/nodejsrunner", environment: environment };
    }
    throw new Error("Invalid container definition - exactly one of `image`, `build`, and `function` must be provided.");
}

// computeContainerDefintions builds a ContainerDefinition for a provided Containers and LogGroup.  This is
// lifted over a promise for the LogGroup and container image name generation - so should not allocate any Pulumi
// resources.
async function computeContainerDefintions(containers: cloud.Containers, logGroup: aws.cloudwatch.LogGroup):
    Promise<ECSContainerDefinition[]> {
    const logGroupId = await logGroup.id;
    return Promise.all(Object.keys(containers).map(async (containerName) => {
        const container = containers[containerName];
        const { image, environment } = await computeImage(container);
        const portMappings = (container.ports || []).map(p => ({containerPort: p.port}));
        const containerDefinition: ECSContainerDefinition = {
            name: containerName,
            image: image,
            command: container.command,
            memory: container.memory,
            memoryReservation: container.memoryReservation,
            portMappings: portMappings,
            environment: environment,
            logConfiguration: {
                logDriver: "awslogs",
                options: {
                    "awslogs-group": logGroupId!,
                    "awslogs-region": "us-east-1",
                    "awslogs-stream-prefix": containerName,
                },
            },
        };
        return containerDefinition;
    }));
}

interface TaskDefinition {
    task: aws.ecs.TaskDefinition;
    logGroup: aws.cloudwatch.LogGroup;
}

// createTaskDefinition builds an ECS TaskDefinition object from a collection of `cloud.Containers`.
function createTaskDefinition(name: string, containers: cloud.Containers): TaskDefinition {
    // Create a single log group for all logging associated with the Service
    const logGroup = new aws.cloudwatch.LogGroup(name, {});

    // Find all referenced Volumes
    const volumes: { hostPath?: string; name: string }[] = [];
    for (const containerName of Object.keys(containers)) {
        const container = containers[containerName];
        if (container.volumes) {
            for (const volumeMount of container.volumes) {
                if (!config.ecsClusterEfsMountPath) {
                    throw new Error(
                        "Cannot use 'Volume'.  Missing cluster config 'cloud-aws:config:config.ecsClusterEfsMountPath'",
                    );
                }
                const volume = volumeMount.sourceVolume;
                volumes.push({
                    // TODO: [pulumi/pulumi##381] We should most likely be
                    // including a unique identifier for this deployment
                    // into the path, so that Volumes in this deployment
                    // don't accidentally overlap with Volumes from other
                    // deployments on the same cluster.
                    hostPath: `${config.ecsClusterEfsMountPath}/${volume.name}`,
                    name: volume.name,
                });
            }
        }
    }

    // Create the task definition for the group of containers associated with this Service.
    const containerDefintions = computeContainerDefintions(containers, logGroup).then(JSON.stringify);
    const taskDefinition = new aws.ecs.TaskDefinition(name, {
        family: name,
        containerDefinitions: containerDefintions,
        volume: volumes,
    });

    return {
        task: taskDefinition,
        logGroup: logGroup,
    };
}

export type ServicePorts = {
    [name: string]: {
        [port: number]: {
            host: aws.elasticloadbalancingv2.LoadBalancer,
            port: number,
        },
    },
};

export class Service extends pulumi.ComponentResource implements cloud.Service {
    public readonly name: string;
    public readonly containers: cloud.Containers;
    public readonly replicas: number;
    public readonly exposedPorts: ServicePorts;

    public getEndpoint: (containerName?: string, containerPort?: number) => Promise<cloud.Endpoint>;

    constructor(name: string, args: cloud.ServiceArguments) {
        const containers = args.containers;
        const replicas = args.replicas === undefined ? 1 : args.replicas;

        const exposedPorts: ServicePorts = {};
        super(
            "cloud:service:Service",
            name,
            {
                containers: containers,
                replicas: replicas,
            },
            () => {
                // Create the task definition, parented to this component.
                const taskDefinition = createTaskDefinition(name, containers);

                // Create load balancer listeners/targets for each exposed port.
                const loadBalancers = [];
                for (const containerName of Object.keys(containers)) {
                    const container = containers[containerName];
                    exposedPorts[containerName] = {};
                    if (container.ports) {
                        for (const portMapping of container.ports) {
                            const info = newLoadBalancerTargetGroup(container, portMapping.port);
                            exposedPorts[containerName][portMapping.port] = {
                                host: info.loadBalancer,
                                port: info.listenerPort,
                            };
                            loadBalancers.push({
                                containerName: containerName,
                                containerPort: portMapping.port,
                                targetGroupArn: info.targetGroup.arn,
                            });
                        }
                    }
                }

                // Create the service.
                const service = new aws.ecs.Service(name, {
                    desiredCount: replicas,
                    taskDefinition: taskDefinition.task.arn,
                    cluster: getOrCreateECSCluster(),
                    loadBalancers: loadBalancers,
                    iamRole: getServiceLoadBalancerRole().arn,
                });
            },
        );

        this.name = name;
        this.exposedPorts = exposedPorts;

        // getEndpoint returns the host and port info for a given
        // containerName and exposed port.
        this.getEndpoint =
            async function (this: Service, containerName: string, port: number): Promise<cloud.Endpoint> {
                if (!containerName) {
                    // If no container name provided, choose the first container
                    containerName = Object.keys(this.exposedPorts)[0];
                    if (!containerName) {
                        throw new Error(
                            `No containers available in this service`,
                        );
                    }
                }
                const containerPorts = this.exposedPorts[containerName] || {};
                if (!port) {
                    // If no port provided, choose the first exposed port on the container.
                    port = +Object.keys(containerPorts)[0];
                    if (!port) {
                        throw new Error(
                            `No ports available in service container ${containerName}`,
                        );
                    }
                }
                const info = containerPorts[port];
                if (!info) {
                    throw new Error(
                        `No exposed port for ${containerName} port ${port}`,
                    );
                }
                // TODO [pulumi/pulumi#331] When we capture promise values, they get
                // exposed on the inside as the unwrapepd value inside the promise.
                // This means we have to hack the types away. See
                // https://github.com/pulumi/pulumi/issues/331#issuecomment-333280955.
                const hostname = <string><any>info.host.dnsName;
                return {
                    hostname: hostname,
                    port: info.port,
                };
            };
    }

}

const volumeNames = new Set<string>();

// _Note_: In the current EFS-backed model, a Volume is purely virtual - it
// doesn't actually manage any underlying resource.  It is used just to provide
// a handle to a folder on the EFS share which can be mounted by conatainer(s).
// On platforms like ACI, we may be able to acrtually provision a unique File
// Share per Volume to keep these independently managable.  For now, on AWS
// thoguh, we rely on this File Share having been set up as part of the ECS
// Cluster outside of @pulumi/cloud, and assume that that data has a lifetime
// longer than any individual deployment.
export class Volume extends pulumi.ComponentResource implements cloud.Volume {
    public readonly name: string;

    constructor(name: string) {
        if (volumeNames.has(name)) {
            throw new Error("Must provide a unique volume name");
        }
        super("cloud:volume:Volume", name, {}, () => {/* no children */});
        this.name = name;
        volumeNames.add(name);
    }
}


/**
 * A Task represents a container which can be [run] dynamically whenever (and
 * as many times as) needed.
 */
export class Task extends pulumi.ComponentResource implements cloud.Task {
    public readonly run: (options?: cloud.TaskRunOptions) => Promise<void>;

    constructor(name: string, container: cloud.Container) {
        let taskDefinition: aws.ecs.TaskDefinition;
        super(
            "cloud:task:Task",
            name,
            {
                container: container,
            },
            () => {
                taskDefinition = createTaskDefinition(name, { container: container }).task;
            },
        );

        const clusterARN = getOrCreateECSCluster();
        const environment: { name: string, value: string }[] = ecsEnvironmentFromMap(container.environment);
        this.run = function (this: Task, options?: cloud.TaskRunOptions) {
            const awssdk = require("aws-sdk");
            const ecs = new awssdk.ECS();

            // Extract the envrionment values from the options
            if (options && options.environment) {
                for (const envName of Object.keys(options.environment)) {
                    environment.push({ name: envName, value: options.environment[envName] });
                }
            }

            // Run the task
            return ecs.runTask({
                cluster: clusterARN,
                taskDefinition: taskDefinition,
                overrides: {
                    containerOverrides: [
                        {
                            name: "container",
                            environment: environment,
                        },
                    ],
                },
            }).promise().then((data: any) => undefined);
        };
    }
}

// getOrCreateECSCluster gets or creates an ECS cluster in which containers may be run.
function getOrCreateECSCluster(): pulumi.Computed<string> {
    // If there is a pre-defined ECS cluster, use it.
    if (config.ecsClusterARN) {
        return Promise.resolve(config.ecsClusterARN);
    }
    // Otherwise, lazily allocate an ECS cluster if needed, and return it.
    if (!ecsCluster) {
        // If automatic clusters are disabled, throw an error.
        if (config.ecsAutoClusterDisable) {
            throw new Error(
                "Cannot create `Service`s or `Task`s because no ECS cluster ARN was provided, "+
                "and auto-clusters have been disabled");
        }
        ecsCluster = createECSCluster();
    }
    return ecsCluster.name;
}

function createECSCluster(): aws.ecs.Cluster {
    const prefix = "default-pulumi-cloud-ecs";

    // First create an ECS cluster.
    const cluster = new aws.ecs.Cluster(`${prefix}-cluster`);

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
    const instanceRole = new aws.iam.Role(`${prefix}-instance-role`, {
        assumeRolePolicy: JSON.stringify(assumeInstanceRolePolicyDoc),
    });
    const instanceRolePolicy = new aws.iam.RolePolicy(`${prefix}-instance-role-policy`, {
        role: instanceRole.id,
        policy: JSON.stringify(instanceRolePolicyDoc),
    });
    const instanceProfile = new aws.iam.InstanceProfile(`${prefix}-instance-profile`, {
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

    function oneTcpPortFromAnywhere(port: number) {
        return {
            fromPort: port,
            toPort: port,
            protocol: "TCP",
            cidrBlocks: [ "0.0.0.0/0" ],
        };
    }
    const loadBalancerSecurityGroup = new aws.ec2.SecurityGroup(`${prefix}-load-balancer-security-group`, {
        ingress: [
            oneTcpPortFromAnywhere(80),  // HTTP
            oneTcpPortFromAnywhere(443),  // HTTPS
        ],
        egress: [ ALL ],  // See TerraformEgressNote
    });
    const instanceSecurityGroup = new aws.ec2.SecurityGroup(`${prefix}-instance-security-group`, {
        ingress: [
            oneTcpPortFromAnywhere(22),  // SSH
            // Expose ephemeral container ports to load balancer.
            {
                fromPort: 32768,
                toPort: 65535,
                protocol: "TCP",
                securityGroups: [ loadBalancerSecurityGroup.id ],
            },
        ],
        egress: [ ALL ],  // See TerraformEgressNote
    });
    const instanceLaunchConfiguration = new aws.ec2.LaunchConfiguration(`${prefix}-instance-launch-configuration`, {
        imageId: getEcsAmiId(),
        instanceType: config.ecsAutoClusterInstanceType,
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

    // Finally, create the ASG for the instances.
    // TODO[pulumi/pulumi-aws#43]: this isn't reliable; if the AMI gets updated, this doesn't properly scale
    //     down/up the service.  The alternative is to embed CloudFormation, which (sorry) I can't bring myself to do.
    const asg = new aws.autoscaling.Group(`${prefix}-cluster-asg`, {
        desiredCapacity: config.ecsAutoClusterDesiredCapacity,
        minSize: config.ecsAutoClusterMinSize,
        maxSize: config.ecsAutoClusterMaxSize,
        launchConfiguration: instanceLaunchConfiguration.id,
        defaultCooldown: 300,
        healthCheckGracePeriod: 120,
        healthCheckType: "EC2",
        metricsGranularity: "1Minute",
    });

    return cluster;
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
async function getInstanceUserData(cluster: aws.ecs.Cluster): Promise<string> {
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

