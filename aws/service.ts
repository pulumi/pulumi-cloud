// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";
import { ecsClusterARN, ecsClusterEfsMountPath, ecsClusterSubnets, ecsClusterVpcId } from "./config";


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
        let assumeRolePolicy = {
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
        let policy = {
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
        let rolePolicy = new aws.iam.RolePolicy("pulumi-s-lb-role", {
            role: serviceLoadBalancerRole.name,
            policy: JSON.stringify(policy),
        });
    }
    return serviceLoadBalancerRole;
}

let MAX_LISTENERS_PER_NLB = 50;
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
    if (!ecsClusterVpcId) {
        throw new Error("Cannot create 'Service'. Missing cluster config 'cloud-aws:config:ecsClusterVpcId'");
    }
    if (!ecsClusterSubnets) {
        throw new Error("Cannot create 'Service'. Missing cluster config 'cloud-aws:config:ecsClusterSubnets'");
    }
    if (listenerIndex % MAX_LISTENERS_PER_NLB === 0) {
        // Create a new Load Balancer every 50 requests for a new TargetGroup.
        let subnets = ecsClusterSubnets.split(",");
        let subnetmapping = subnets.map(s => ({ subnetId: s }));
        let lbname = `pulumi-s-lb-${listenerIndex / MAX_LISTENERS_PER_NLB + 1}`;
        loadBalancer = new aws.elasticloadbalancingv2.LoadBalancer(lbname, {
            loadBalancerType: "network",
            subnetMapping: subnetmapping,
            internal: false,
        });
    }
    let targetListenerName = `pulumi-s-lb-${listenerIndex}`;
    // Create the target group for the new container/port pair.
    let target = new aws.elasticloadbalancingv2.TargetGroup(targetListenerName, {
        port: port,
        protocol: "TCP",
        vpcId: ecsClusterVpcId,
        deregistrationDelay: 30,
    });
    // Listen on a new port on the NLB and forward to the target.
    let listenerPort = 34567 + listenerIndex % MAX_LISTENERS_PER_NLB;
    let listener = new aws.elasticloadbalancingv2.Listener(targetListenerName, {
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

// computeImage turns the `image`, `function` or `build` setting on a
// `cloud.Container` into a valid Docker image name which can be used in an ECS
// TaskDefinition.
async function computeImage(container: cloud.Container): Promise<ImageOptions> {
    if (container.image) {
        return { image: container.image, environment: [] };
    } else if (container.build) {
        throw new Error("Not yet implemented.");
    } else if (container.function) {
        let closure = await pulumi.runtime.serializeClosure(container.function);
        let jsSrcText = pulumi.runtime.serializeJavaScriptText(closure);
        // TODO[pulumi/pulumi-cloud#85]: Put this in a real Pulumi-owned Docker image.
        // TODO[pulumi/pulumi-cloud#86: Pass the full local zipped folder through to the container (via S3?)
        return {
            image: "lukehoban/javascriptrunner", environment: [{
                name: "PULUMI_SRC",
                value: jsSrcText,
            }],
        };
    }
    throw new Error("Invalid container definition - exactly one of `image`, `build`, and `function` must be provided.");
}

// computeContainerDefintions builds a ContainerDefinition for a provided Containers and LogGroup.  This is
// lifted over a promise for the LogGroup and container image name generation - so should not allocate any Pulumi
// resources.
async function computeContainerDefintions(containers: cloud.Containers, logGroup: aws.cloudwatch.LogGroup):
    Promise<ECSContainerDefinition[]> {
    let logGroupId = await logGroup.id;
    return Promise.all(Object.keys(containers).map(async (containerName) => {
        let container = containers[containerName];
        let { image, environment } = await computeImage(container);
        let containerDefinition: ECSContainerDefinition = {
            name: containerName,
            image: image,
            command: container.command,
            memoryReservation: container.memory,
            portMappings: container.portMappings,
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

// createTaskDefinition builds an ECS TaskDefinition object from a collection of `cloud.Containers`.
function createTaskDefinition(name: string, containers: cloud.Containers): aws.ecs.TaskDefinition {
    // Create a single log group for all logging associated with the Service
    let logGroup = new aws.cloudwatch.LogGroup(name, {});

    // Find all referenced Volumes
    let volumes: { hostPath?: string; name: string }[] = [];
    for (let containerName of Object.keys(containers)) {
        let container = containers[containerName];
        if (container.mountPoints) {
            for (let mountPoint of container.mountPoints) {
                if (!ecsClusterEfsMountPath) {
                    throw new Error(
                        "Cannot use 'Volume'.  Missing cluster config 'cloud-aws:config:ecsClusterEfsMountPath'",
                    );
                }
                let volume = mountPoint.sourceVolume;
                volumes.push({
                    // TODO: [pulumi/pulumi##381] We should most likely be
                    // including a unique identifier for this deployment
                    // into the path, so that Volumes in this deployment
                    // don't accidentally overlap with Volumes from other
                    // deployments on the same cluster.
                    hostPath: `${ecsClusterEfsMountPath}/${volume.name}`,
                    name: volume.name,
                });
            }
        }
    }

    // Create the task definition for the group of containers associated with this Service.
    let containerDefintions = computeContainerDefintions(containers, logGroup).then(JSON.stringify);
    let taskDefinition = new aws.ecs.TaskDefinition(name, {
        family: name,
        containerDefinitions: containerDefintions,
        volume: volumes,
    });

    return taskDefinition;
}

export class Service implements cloud.Service {
    name: string;
    exposedPorts: {
        [name: string]: {
            [port: number]: {
                host: aws.elasticloadbalancingv2.LoadBalancer,
                port: number,
            },
        },
    };

    getEndpoint: (containerName?: string, containerPort?: number) => Promise<cloud.Endpoint>;

    constructor(name: string, args: cloud.ServiceArguments) {
        if (!ecsClusterARN) {
            throw new Error("Cannot create 'Service'.  Missing cluster config 'cloud-aws:config:ecsClusterARN'");
        }
        let containers = args.containers;
        let scale = args.scale === undefined ? 1 : args.scale;
        this.name = name;

        let taskDefinition = createTaskDefinition(name, containers);

        // Create load balancer listeners/targets for each exposed port.
        let loadBalancers = [];
        this.exposedPorts = {};
        for (let containerName of Object.keys(containers)) {
            let container = containers[containerName];
            this.exposedPorts[containerName] = {};
            if (container.portMappings) {
                for (let portMapping of container.portMappings) {
                    let info = newLoadBalancerTargetGroup(container, portMapping.containerPort);
                    this.exposedPorts[containerName][portMapping.containerPort] = {
                        host: info.loadBalancer,
                        port: info.listenerPort,
                    };
                    loadBalancers.push({
                        containerName: containerName,
                        containerPort: portMapping.containerPort,
                        targetGroupArn: info.targetGroup.arn,
                    });
                }
            }
        }

        // Create the service.
        let service = new aws.ecs.Service(name, {
            desiredCount: scale,
            taskDefinition: taskDefinition.arn,
            cluster: ecsClusterARN,
            loadBalancers: loadBalancers,
            iamRole: getServiceLoadBalancerRole().arn,
        });
        let serviceName = service.name;

        // getEndpoint returns the host and port info for a given
        // containerName and exposed port.
        this.getEndpoint = async function (this: Service, containerName, port): Promise<cloud.Endpoint> {
            if (!containerName) {
                // If no container name provided, choose the first container
                containerName = Object.keys(this.exposedPorts)[0];
                if (!containerName) {
                    throw new Error(
                        `No containers available in this service`,
                    );
                }
            }
            let containerPorts = this.exposedPorts[containerName] || {};
            if (!port) {
                // If no port provided, choose the first exposed port on the container.
                port = +Object.keys(containerPorts)[0];
                if (!port) {
                    throw new Error(
                        `No ports available in service container ${containerName}`,
                    );
                }
            }
            let info = containerPorts[port];
            if (!info) {
                throw new Error(
                    `No exposed port for ${containerName} port ${port}`,
                );
            }
            // TODO [pulumi/pulumi#331] When we capture promise values, they get
            // exposed on the inside as the unwrapepd value inside the promise.
            // This means we have to hack the types away. See
            // https://github.com/pulumi/pulumi/issues/331#issuecomment-333280955.
            let hostname = <string><any>info.host.dnsName;
            return {
                hostname: hostname,
                port: info.port,
            };
        };
    }

}

let volumeNames = new Set<string>();

// _Note_: In the current EFS-backed model, a Volume is purely virtual - it
// doesn't actually manage any underlying resource.  It is used just to provide
// a handle to a folder on the EFS share which can be mounted by conatainer(s).
// On platforms like ACI, we may be able to acrtually provision a unique File
// Share per Volume to keep these independently managable.  For now, on AWS
// thoguh, we rely on this File Share having been set up as part of the ECS
// Cluster outside of @pulumi/cloud, and assume that that data has a lifetime
// longer than any individual deployment.
export class Volume implements cloud.Volume {
    name: string;
    constructor(name: string) {
        if (volumeNames.has(name)) {
            throw new Error("Must provide a unique volumen name");
        }
        this.name = name;
        volumeNames.add(name);
    }
}


/**
 * A Task represents a container which can be [run] dynamically whenever (and
 * as many times as) needed.
 */
export class Task implements cloud.Task {
    taskDefinition: aws.ecs.TaskDefinition;
    run: (options?: cloud.TaskRunOptions) => Promise<void>;

    constructor(name: string, container: cloud.Container) {
        if (!ecsClusterARN) {
            throw new Error("Cannot create 'Task'.  Missing cluster config 'cloud-aws:config:ecsClusterARN'");
        }

        this.taskDefinition = createTaskDefinition(name, { container: container });
        let clusterARN = ecsClusterARN;

        this.run = function (this: Task, options?: cloud.TaskRunOptions) {
            let awssdk = require("aws-sdk");
            let ecs = new awssdk.ECS();

            // Extract the envrionment values from the options
            let environment: { name: string; value: string; }[] = [];
            if (options && options.environment) {
                for (let envName of Object.keys(options.environment)) {
                    let envVal = options.environment[envName];
                    environment.push({ name: envName, value: envVal });
                }
            }

            // Run the task
            return ecs.runTask({
                cluster: clusterARN,
                taskDefinition: this.taskDefinition.arn,
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
