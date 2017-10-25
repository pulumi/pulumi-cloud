// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as Docker from "dockerode";
import * as pulumi from "pulumi";
import * as tar from "tar";
import { cluster, network } from "./network";

// For type-safety purposes, we want to be able to mark some of our types with typing information
// from other libraries.  However, we don't want to actually import those libraries, causing those
// module to load and run doing pulumi planning time.  so we just do an "import + require" and we
// note that this imported variable should only be used in 'type' (and not value) positions.  The ts
// compiler will then elide this actual declaration when compiling.
import _awsSdkTypesOnly = require("aws-sdk");

// A shared Docker engine client.  Currently always connects to the default
// `/var/run/docker.sock`.  We could in the future parameterize this with config
// to connect to a remote Docker engine.
const docker = new Docker();

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
        serviceLoadBalancerRole = pulumi.Resource.runInParentlessScope(() => {
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
            const role = new aws.iam.Role("pulumi-s-lb-role", {
                assumeRolePolicy: JSON.stringify(assumeRolePolicy),
            });
            const rolePolicy = new aws.iam.RolePolicy("pulumi-s-lb-role", {
                role: role.name,
                policy: JSON.stringify(policy),
            });
            return role;
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
    if (!network) {
        throw new Error("Cannot create 'Service'. No VPC configured.");
    }
    if (listenerIndex % MAX_LISTENERS_PER_NLB === 0) {
        // Create a new Load Balancer every 50 requests for a new TargetGroup.
        const subnetmapping = network.publicSubnetIds.map(s => ({ subnetId: s }));
        // Make it internal-only if private subnets are being used. TODO: should
        // allow overriding this with container port specification.
        const internal = network.privateSubnets;
        const lbname = `pulumi-s-lb-${listenerIndex / MAX_LISTENERS_PER_NLB + 1}`;
        loadBalancer = pulumi.Resource.runInParentlessScope(
            () => new aws.elasticloadbalancingv2.LoadBalancer(lbname, {
                loadBalancerType: "network",
                subnetMapping: subnetmapping,
                internal: internal,
            }),
        );
    }
    const targetListenerName = `pulumi-s-lb-${listenerIndex}`;
    // Create the target group for the new container/port pair.
    const target = new aws.elasticloadbalancingv2.TargetGroup(targetListenerName, {
        port: port,
        protocol: "TCP",
        vpcId: network.vpcId,
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

// buildAndPushImage will build and push the Dockerfile and context from
// [buildPath] into the requested ECR [repository].  It returns the digest
// of the built image.
async function buildAndPushImage(buildPath: string, repository: aws.ecr.Repository):
    Promise<string | undefined> {

    const imageName = await repository.repositoryUrl;
    const registryId = await repository.registryId;
    if (!imageName || !registryId) {
        // These may be undefined during a `preview` operation - if so, skip the
        // build and push. TODO: Should the Docker build-and-push be a Resource
        // which can move this code inside a Create or Update operation?
        return undefined;
    }

    // The build context is a tgz of the buildPath
    const buildContext = tar.create({ gzip: true, cwd: buildPath }, ["."]);

    // Construct Docker registry auth data by getting the short-lived
    // authorizationToken from ECR, and extracting the username password pair
    // after base64-decoding the token.  See:
    // http://docs.aws.amazon.com/cli/latest/reference/ecr/get-authorization-token.html
    const credentials = await aws.ecr.getCredentials({ registryId: registryId });
    const decodedCredentials = Buffer.from(credentials.authorizationToken, "base64").toString();
    const [username, password] = decodedCredentials.split(":");
    if (!password || !username) {
        throw new Error("Invalid credentials");
    }
    const registry = credentials.proxyEndpoint;
    const authData = {
        username: username,
        password: password,
        auth: "",
        serveraddress: registry,
    };

    // Note: We use callbacks instead of promises because we need to handle
    // streams for the outputs of the Docker operations, which do not compose
    // well with Promises.
    const imageDigest = await new Promise<string>((resolve, reject) => {
        // Build the Docker image, using the `imageName` of the remote
        // repository as the tag name.
        console.log(`Building image at '${buildPath}'`);
        docker.buildImage(buildContext, {t: imageName}, (err, output) => {
            try {
                if (err) {
                    return reject(err);
                }
                output.on("data", (buf: Buffer) => {
                    try {
                        const items = parseDockerEngineUpdatesFromBuffer(buf);
                        for (const item of items) {
                            if (item.stream) {
                                // These messages represent direct output of the
                                // operation.
                                process.stdout.write(item.stream);
                            }
                        }
                    } catch (dataerr) {
                        reject(dataerr);
                    }
                });
                output.on("end", () => {
                    try {
                        console.log(`Pushing image: ${imageName}`);
                        const img = docker.getImage(imageName);
                        img.push({registry: registry, authconfig: authData}, (err2: any, data: any) => {
                            try {
                                if (err2) {
                                    return reject(err2);
                                }
                                let digest: string | undefined = undefined;
                                data.on("data", (buf: Buffer) => {
                                    try {
                                        const items = parseDockerEngineUpdatesFromBuffer(buf);
                                        // We do not report status on Docker push because it
                                        // expects to be rendered using a dynamically updated
                                        // display of per-layer status. We could consider
                                        // integrating this display or just shelling out to the
                                        // Docker CLI directly.
                                        for (const item of items) {
                                            if (item.aux && item.aux.Digest) {
                                                digest = item.aux.Digest;
                                            }
                                        }
                                    } catch (dataerr) {
                                        reject(dataerr);
                                    }
                                });
                                data.on("end", () => {
                                    console.log(`Pushed image: ${imageName}`);
                                    console.log(` with digest: ${digest}`);
                                    resolve(digest);
                                });
                            } catch (pusherr) {
                                reject(pusherr);
                            }
                        });
                    } catch (builddoneerr) {
                        reject(builddoneerr);
                    }
                });
            } catch (builderr) {
                reject(builderr);
            }
        });
    });
    return imageDigest;
}

// parseDockerEngineUpdatesFromBuffer extracts messages from the Docker engine
// that are communicated over the stream returned from a Build or Push
// operation.
function parseDockerEngineUpdatesFromBuffer(buffer: Buffer): any[] {
    const str = buffer.toString();
    const lines = str.split("\n");
    const results = [];
    for (const line of lines) {
        if (line.length === 0) {
            continue;
        }
        results.push(JSON.parse(line));
    }
    return results;
}

// computeImage turns the `image`, `function` or `build` setting on a
// `cloud.Container` into a valid Docker image name which can be used in an ECS
// TaskDefinition.
async function computeImage(
    container: cloud.Container,
    repository: aws.ecr.Repository | undefined): Promise<ImageOptions> {

    const environment: { name: string, value: string }[] = ecsEnvironmentFromMap(container.environment);
    if (container.image) {
        return { image: container.image, environment: environment };
    } else if (container.build) {
        if (!repository) {
            throw new Error("Expected a repository to be created for a `build` container definition");
        }
        // Build and push the local build context to the ECR repository, wait
        // for that to complete, then return the image name pointing to the ECT
        // repository along with an environment variable for the image digest to
        // ensure the TaskDefinition get's replaced IFF the built image changes.
        const imageName = await repository.repositoryUrl;
        const imageDigest = await buildAndPushImage(container.build, repository);
        return { image: imageName!, environment: [{
            name: "IMAGE_DIGEST",
            value: imageDigest!,
        }]};
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
async function computeContainerDefintions(
    containers: cloud.Containers,
    logGroup: aws.cloudwatch.LogGroup,
    repositories: Map<string, aws.ecr.Repository>): Promise<ECSContainerDefinition[]> {
    const logGroupId = await logGroup.id;
    return Promise.all(Object.keys(containers).map(async (containerName) => {
        const container = containers[containerName];
        const repository = repositories.get(containerName);
        const { image, environment } = await computeImage(container, repository);
        const portMappings = (container.ports || []).map(p => ({containerPort: p.port}));
        const containerDefinition: ECSContainerDefinition = {
            name: containerName,
            image: image,
            command: container.command,
            memory: container.memory,
            memoryReservation: container.memoryReservation,
            portMappings: portMappings,
            environment: environment,
            mountPoints: (container.volumes || []).map(v => ({
                containerPath: v.containerPath,
                sourceVolume: v.sourceVolume.name,
            })),
            logConfiguration: {
                logDriver: "awslogs",
                options: {
                    "awslogs-group": logGroupId!,
                    "awslogs-region": aws.config.requireRegion(),
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
    const logGroup = new aws.cloudwatch.LogGroup(`${name}-task-logs`);

    // Find all referenced Volumes and any `build` containers
    const volumes: { hostPath?: string; name: string }[] = [];
    const repositories = new Map<string, aws.ecr.Repository>();
    for (const containerName of Object.keys(containers)) {
        const container = containers[containerName];
        // Collect referenced Volumes.
        if (container.volumes) {
            for (const volumeMount of container.volumes) {
                if (!cluster || !cluster.efsMountPath) {
                    throw new Error(
                        "Cannot use 'Volume'.  Configured cluster does not support EFS.",
                    );
                }
                const volume = volumeMount.sourceVolume;
                volumes.push({
                    // TODO: [pulumi/pulumi##381] We should most likely be
                    // including a unique identifier for this deployment
                    // into the path, so that Volumes in this deployment
                    // don't accidentally overlap with Volumes from other
                    // deployments on the same cluster.
                    hostPath: `${cluster.efsMountPath}/${volume.name}`,
                    name: volume.name,
                });
            }
        }
        // Create registry for each `build` container.
        if (container.build) {
            const repo = new aws.ecr.Repository(`${name}_${containerName}`, {});
            repositories.set(containerName, repo);
        }
    }

    // Create the task definition for the group of containers associated with this Service.
    const containerDefintions = computeContainerDefintions(containers, logGroup, repositories).then(JSON.stringify);
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

interface ExposedPorts {
    [name: string]: {
        [port: number]: {
            host: aws.elasticloadbalancingv2.LoadBalancer,
            port: number,
        },
    };
}

export class Service extends pulumi.ComponentResource implements cloud.Service {
    public readonly name: string;
    public readonly containers: cloud.Containers;
    public readonly replicas: number;

    public getEndpoint: (containerName?: string, containerPort?: number) => Promise<cloud.Endpoint>;

    constructor(name: string, args: cloud.ServiceArguments) {
        if (!cluster) {
            throw new Error("Cannot create 'Service'.  Missing cluster config 'cloud-aws:config:ecsClusterARN'" +
                " or 'cloud-aws:config:ecsAutoCluster'");
        }

        const containers = args.containers;
        const replicas = args.replicas === undefined ? 1 : args.replicas;
        const exposedPorts: ExposedPorts = {};

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
                    cluster: cluster!.ecsClusterARN,
                    loadBalancers: loadBalancers,
                    iamRole: getServiceLoadBalancerRole().arn,
                });
            },
        );

        this.name = name;

        // getEndpoint returns the host and port info for a given
        // containerName and exposed port.
        this.getEndpoint =
            async function (this: Service, containerName: string, port: number): Promise<cloud.Endpoint> {
                if (!containerName) {
                    // If no container name provided, choose the first container
                    containerName = Object.keys(exposedPorts)[0];
                    if (!containerName) {
                        throw new Error(
                            `No containers available in this service`,
                        );
                    }
                }
                const containerPorts = exposedPorts[containerName] || {};
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
        if (!cluster) {
            throw new Error("Cannot create 'Task'.  Missing cluster config 'cloud-aws:config:ecsClusterARN'");
        }

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

        const clusterARN = cluster.ecsClusterARN;
        const environment: { name: string, value: string }[] = ecsEnvironmentFromMap(container.environment);
        this.run = async function (this: Task, options?: cloud.TaskRunOptions) {
            const awssdk: typeof _awsSdkTypesOnly = require("aws-sdk");
            const ecs = new awssdk.ECS();

            // Extract the envrionment values from the options
            if (options && options.environment) {
                for (const envName of Object.keys(options.environment)) {
                    environment.push({ name: envName, value: options.environment[envName] });
                }
            }

            function getTypeDefinitionARN(): string {
                // Hack: Because of our outside/inside system for pulumi, typeDefinition.arg is seen as a
                // Computed<string> on the outside, but a string on the inside. Of course, there's no
                // way to make TypeScript aware of that.  So we just fool the typesystem with these
                // explicit casts.
                //
                // see: https://github.com/pulumi/pulumi/issues/331#issuecomment-333280955
                return <string><any>taskDefinition.arn;
            }

            function getClusterARN(): string {
                return <string><any>clusterARN;
            }

            // Run the task
            const request: _awsSdkTypesOnly.ECS.RunTaskRequest = {
                cluster: getClusterARN(),
                taskDefinition: getTypeDefinitionARN(),
                overrides: {
                    containerOverrides: [
                        {
                            name: "container",
                            environment: environment,
                        },
                    ],
                },
            };
            await ecs.runTask(request).promise();
        };
    }
}
