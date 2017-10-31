// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as child_process from "child_process";
import * as pulumi from "pulumi";
import * as stream from "stream";
import { Cluster } from "./infrastructure/cluster";
import { Network } from "./infrastructure/network";
import { commonPrefix, computePolicies, getCluster, getNetwork } from "./shared";
import { sha1hash } from "./utils";

// For type-safety purposes, we want to be able to mark some of our types with typing information
// from other libraries.  However, we don't want to actually import those libraries, causing those
// module to load and run doing pulumi planning time.  so we just do an "import + require" and we
// note that this imported variable should only be used in 'type' (and not value) positions.  The ts
// compiler will then elide this actual declaration when compiling.
import _awsSdkTypesOnly = require("aws-sdk");

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
    environment?: ECSContainerEnvironment;
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

type ECSContainerEnvironment = ECSContainerEnvironmentEntry[];

interface ECSContainerEnvironmentEntry {
    name: string;
    value: string;
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
            const role = new aws.iam.Role(`${commonPrefix}-s-lb-role`, {
                assumeRolePolicy: JSON.stringify(assumeRolePolicy),
            });
            const rolePolicy = new aws.iam.RolePolicy(`${commonPrefix}-s-lb-role`, {
                role: role.name,
                policy: JSON.stringify(policy),
            });
            return role;
        });
    }
    return serviceLoadBalancerRole;
}

// TODO[pulumi/pulumi-cloud#135] To support multi-AZ, we may need a configu variable that forces this setting to `1` -
// or perhaps automatically do that is we see the network is configured for multiple AZs.
const MAX_LISTENERS_PER_NLB = 50;

// We may allocate both internal-facing and internet-facing load balancers, and we may want to combine multiple
// listeners on a single load balancer. So we track the currently allocated load balancers to use for both internal and
// external load balancing, and the index of the next slot to use within that load balancers listeners.
let internalLoadBalancer: aws.elasticloadbalancingv2.LoadBalancer | undefined;
let internalListenerIndex = 0;
let externalLoadBalancer: aws.elasticloadbalancingv2.LoadBalancer | undefined;
let externalListenerIndex = 0;

interface ContainerPortLoadBalancer {
    loadBalancer: aws.elasticloadbalancingv2.LoadBalancer;
    targetGroup: aws.elasticloadbalancingv2.TargetGroup;
    listenerPort: number;
}

// createLoadBalancer allocates a new Load Balancer TargetGroup that can be attached to a Service container and port
// pair. Allocates a new NLB is needed (currently 50 ports can be exposed on a single NLB).
function newLoadBalancerTargetGroup(port: number, external?: boolean): ContainerPortLoadBalancer {
    const network: Network | undefined = getNetwork();
    if (!network) {
        throw new Error("Cannot create 'Service'. No VPC configured.");
    }

    let listenerIndex: number;
    let internal: boolean;
    let loadBalancer: aws.elasticloadbalancingv2.LoadBalancer | undefined;
    if (network.privateSubnets && !external) {
        // We are creating an internal load balancer
        internal = true;
        listenerIndex = internalListenerIndex++;
        loadBalancer = internalLoadBalancer;
    } else {
        // We are creating an Internet-facing load balancer
        internal = false;
        listenerIndex = externalListenerIndex++;
        loadBalancer = externalLoadBalancer;
    }

    const prefixLength =
        32 /* max load balancer name */
        - 16 /* random hex added to ID */
        - 4 /* room for up to 9999 load balancers */
        - 2 /* '-i' or '-e' */;

    if (listenerIndex % MAX_LISTENERS_PER_NLB === 0) {
        // Create a new Load Balancer every 50 requests for a new TargetGroup.
        const subnetmapping = network.publicSubnetIds.map(s => ({ subnetId: s }));
        // Make it internal-only if private subnets are being used.
        const lbNumber = listenerIndex / MAX_LISTENERS_PER_NLB + 1;
        const lbname = `${commonPrefix.substring(0, prefixLength)}-${internal ? "i" : "e"}${lbNumber}`;
        loadBalancer = pulumi.Resource.runInParentlessScope(
            () => new aws.elasticloadbalancingv2.LoadBalancer(lbname, {
                loadBalancerType: "network",
                subnetMapping: subnetmapping,
                internal: internal,
            }),
        );

        // Store the new load balancer in the corresponding slot
        if (internal) {
            internalLoadBalancer = loadBalancer;
        } else {
            externalLoadBalancer = loadBalancer;
        }
    }

    // Create the target group for the new container/port pair.
    const targetListenerName = `${commonPrefix.substring(0, prefixLength)}-${internal ? "i" : "e"}${listenerIndex}`;
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

    return {
        loadBalancer: loadBalancer!,
        targetGroup: target,
        listenerPort: listenerPort,
    };
}

interface ImageOptions {
    image: string;
    environment: ECSContainerEnvironment;
}

async function ecsEnvironmentFromMap(
        environment: {[name: string]: pulumi.ComputedValue<string>} | undefined): Promise<ECSContainerEnvironment> {
    const result: ECSContainerEnvironment = [];
    if (environment) {
        for (const name of Object.keys(environment)) {
            let env: string | undefined = await environment[name];
            if (env) {
                result.push({ name: name, value: env });
            }
        }
    }
    return result;
}

interface CommandResult {
    code: number;
    stdout?: string;
}

// Runs a CLI command in a child process, returning a promise for the process's exit.
// Both stdout and stderr are redirected to process.stdout and process.stder by default.
// If the [returnStdout] argument is `true`, stdout is not redirected and is instead returned with the promise.
// If the [stdin] argument is defined, it's contents are piped into stdin for the child process.
async function runCLICommand(
    cmd: string,
    args: string[],
    cwd: string,
    returnStdout?: boolean,
    stdin?: string): Promise<CommandResult> {
    return new Promise<CommandResult>((resolve, reject) => {
        const p = child_process.spawn(cmd, args, {cwd: cwd});
        let result: string | undefined;
        if (returnStdout) {
            // We store the results from stdout in memory and will return them as a string.
            const chunks: Buffer[] = [];
            p.stdout.on("data", (chunk: Buffer) => {
                chunks.push(chunk);
            });
            p.stdout.on("end", () => {
                result = Buffer.concat(chunks).toString();
            });
        } else {
            p.stdout.pipe(process.stdout);
        }
        p.stderr.pipe(process.stderr);
        p.on("error", (err) => {
            reject(err);
        });
        p.on("exit", (code) => {
            resolve({
                code: code,
                stdout: result,
            });
        });
        if (stdin) {
            p.stdin.end(stdin);
        }
    });
}

// buildAndPushImage will build and push the Dockerfile and context from [buildPath] into the requested ECR
// [repository].  It returns the digest of the built image.
async function buildAndPushImage(imageName: string, container: cloud.Container): Promise<string | undefined> {
    // Create a repository regardless of whether we will push to it, so that previews look right.
    const repository: aws.ecr.Repository = getOrCreateRepository(imageName);

    // Invoke Docker CLI commands to build and push
    const buildPath: string | undefined = container.build;
    if (!buildPath) {
        throw new Error(`Cannot build a container with an empty build specification`);
    }
    const buildResult = await runCLICommand("docker", ["build", "-t", imageName, "."], buildPath);
    if (buildResult.code) {
        throw new Error(`Docker build of image '${imageName}' failed with exit code: ${buildResult.code}`);
    }

    // Skip the publication of the image if we're only planning.
    if (pulumi.runtime.options.dryRun) {
        console.log(`Skipping image publish during preview: ${imageName}`);
    }
    else {
        // First, login to the repository.  Construct Docker registry auth data by getting the short-lived
        // authorizationToken from ECR, and extracting the username/password pair after base64-decoding the token.
        // See: http://docs.aws.amazon.com/cli/latest/reference/ecr/get-authorization-token.html
        const registryId = await repository.registryId;
        if (!registryId) {
            throw new Error("Expected registry ID to be defined during push");
        }
        const credentials = await aws.ecr.getCredentials({ registryId: registryId });
        const decodedCredentials = Buffer.from(credentials.authorizationToken, "base64").toString();
        const [username, password] = decodedCredentials.split(":");
        if (!password || !username) {
            throw new Error("Invalid credentials");
        }
        const registry = credentials.proxyEndpoint;
        const loginResult = await runCLICommand(
            "docker", ["login", "-u", username, "-p", password, registry], buildPath);
        if (loginResult.code) {
            throw new Error(`Failed to login to Docker registry ${registry}`);
        }

        // Tag and push the image to the remote repository.
        const repositoryUrl = await repository.repositoryUrl;
        if (!repositoryUrl) {
            throw new Error("Expected repository URL to be defined during push");
        }
        const tagResult = await runCLICommand("docker", ["tag", imageName, repositoryUrl], buildPath);
        if (tagResult.code) {
            throw new Error(`Failed to tag Docker image with remote registry URL ${repositoryUrl}`);
        }
        const pushResult = await runCLICommand("docker", ["push", repositoryUrl], buildPath);
        if (pushResult.code) {
            throw new Error(`Docker push of image '${imageName}' failed with exit code: ${pushResult.code}`);
        }
    }

    // Finally, inspect the image so we can return the SHA digest.
    const inspectResult = await runCLICommand("docker", ["inspect", "-f", "{{.Id}}", imageName], buildPath, true);
    if (inspectResult.code || !inspectResult.stdout) {
        throw new Error(`No digest available for image ${imageName}`);
    }
    return inspectResult.stdout.trim();
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

// repositories contains a cache of already created ECR repositories.
const repositories = new Map<string, aws.ecr.Repository>();

// getImageName generates an image name from a container definition.  It uses a combination of the container's name and
// container specification to normalize the names of resulting repositories.  Notably, this leads to better caching in
// the event that multiple container specifications exist that build the same location on disk.
function getImageName(container: cloud.Container): string {
    if (container.image) {
        // In the event of an image, just use it.
        return container.image;
    }
    else if (container.build) {
        // Produce a hash of the build context and use that for the image name.
        return `${commonPrefix}-container-${sha1hash(container.build)}`;
    }
    else if (container.function) {
        // TODO[pulumi/pulumi-cloud#85]: move this to a Pulumi Docker Hub account.
        return "lukehoban/nodejsrunner";
    }
    else {
        throw new Error("Invalid container definition: `image`, `build`, or `function` must be provided");
    }
}

// getOrCreateRepository lazily allocates a unique repository per image name.
function getOrCreateRepository(imageName: string): aws.ecr.Repository {
    if (!repositories.has(imageName)) {
        repositories.set(imageName, new aws.ecr.Repository(imageName.toLowerCase()));
    }
    return repositories.get(imageName)!;
}

// buildImageCache remembers the digests for all past built images, keyed by image name.
const buildImageCache = new Map<string, Promise<string | undefined>>();

// computeImage turns the `image`, `function` or `build` setting on a `cloud.Container` into a valid Docker image
// name which can be used in an ECS TaskDefinition.
async function computeImage(container: cloud.Container): Promise<ImageOptions> {
    const imageName: string = getImageName(container);
    const env: ECSContainerEnvironment = await ecsEnvironmentFromMap(container.environment);
    if (container.build) {
        // This is a container to build; produce a name, either user-specified or auto-computed.
        console.log(`Building container image at '${container.build}'`);

        // See if we've already built this.
        let imageDigest: string | undefined;
        if (imageName && buildImageCache.has(imageName)) {
            // We got a cache hit, simply reuse the existing digest.
            imageDigest = await buildImageCache.get(imageName);
            console.log(`    already built: ${imageName} (${imageDigest})`);
        }
        else {
            // If we haven't, build and push the local build context to the ECR repository, wait for that to complete,
            // then return the image name pointing to the ECT repository along with an environment variable for the
            // image digest to ensure the TaskDefinition get's replaced IFF the built image changes.
            const imageDigestAsync: Promise<string | undefined> = buildAndPushImage(imageName, container);
            if (imageName) {
                buildImageCache.set(imageName, imageDigestAsync);
            }
            imageDigest = await imageDigestAsync;
            console.log(`    build complete: ${imageName} (${imageDigest})`);
        }

        env.push({ name: "IMAGE_DIGEST", value: await imageDigest! });
        return { image: imageName, environment: env };
    }
    else if (container.image) {
        assert(!container.build);
        return { image: imageName, environment: env };
    }
    else if (container.function) {
        const closure = await pulumi.runtime.serializeClosure(container.function);
        const jsSrcText = pulumi.runtime.serializeJavaScriptText(closure);
        // TODO[pulumi/pulumi-cloud#85]: Put this in a real Pulumi-owned Docker image.
        // TODO[pulumi/pulumi-cloud#86]: Pass the full local zipped folder through to the container (via S3?)
        env.push({ name: "PULUMI_SRC", value: jsSrcText });
        return { image: imageName, environment: env };
    }
    else {
        throw new Error("Invalid container definition: `image`, `build`, or `function` must be provided");
    }
}

// computeContainerDefintions builds a ContainerDefinition for a provided Containers and LogGroup.  This is lifted over
// a promise for the LogGroup and container image name generation - so should not allocate any Pulumi resources.
async function computeContainerDefintions(containers: cloud.Containers,
                                          logGroup: aws.cloudwatch.LogGroup): Promise<ECSContainerDefinition[]> {
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
            mountPoints: (container.volumes || []).map(v => ({
                containerPath: v.containerPath,
                sourceVolume: (v.sourceVolume as Volume).getVolumeName(),
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

// The ECS Task assume role policy for Task Roles
const taskRolePolicy = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": "sts:AssumeRole",
            "Principal": {
                "Service": "ecs-tasks.amazonaws.com",
            },
            "Effect": "Allow",
            "Sid": "",
        },
    ],
};

// Lazily initialize the role to use for ECS Tasks
let taskRole: aws.iam.Role | undefined;
function getTaskRole(): aws.iam.Role {
    if (!taskRole) {
        taskRole = new aws.iam.Role(`${commonPrefix}-task-role`, {
            assumeRolePolicy: JSON.stringify(taskRolePolicy),
        });
        // TODO[pulumi/pulumi-cloud#145]: These permissions are used for both Lambda and ECS compute.
        // We need to audit these permissions and potentially provide ways for users to directly configure these.
        const policies = computePolicies;
        for (let i = 0; i < policies.length; i++) {
            const _ = new aws.iam.RolePolicyAttachment(`${commonPrefix}-task-iampolicy-${i}`, {
                role: taskRole,
                policyArn: policies[i],
            });
        }
    }
    return taskRole!;
}

interface TaskDefinition {
    task: aws.ecs.TaskDefinition;
    logGroup: aws.cloudwatch.LogGroup;
}

// createTaskDefinition builds an ECS TaskDefinition object from a collection of `cloud.Containers`.
function createTaskDefinition(name: string, containers: cloud.Containers): TaskDefinition {
    // Create a single log group for all logging associated with the Service
    const logGroup = new aws.cloudwatch.LogGroup(`${name}-task-logs`);

    // Find all referenced Volumes and any `build` containers.
    const volumes: { hostPath?: string; name: string }[] = [];
    const repos = new Map<string, aws.ecr.Repository>();
    for (const containerName of Object.keys(containers)) {
        const container = containers[containerName];

        // Collect referenced Volumes.
        if (container.volumes) {
            for (const volumeMount of container.volumes) {
                const volume = volumeMount.sourceVolume;
                volumes.push({
                    hostPath: (volume as Volume).getHostPath(),
                    name: (volume as Volume).getVolumeName(),
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
        taskRoleArn: getTaskRole().arn,
    });

    return {
        task: taskDefinition,
        logGroup: logGroup,
    };
}

function placementConstraintsForHost(host: cloud.HostProperties | undefined) {
    const os = (host && host.os) || "linux";

    return [{
        type: "memberOf",
        expression: `attribute:ecs.os-type == ${os}`,
    }];
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
        const cluster: Cluster | undefined = getCluster();
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
                            const info = newLoadBalancerTargetGroup(portMapping.port, portMapping.external);
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

                // Only provide a role if the service is attached to a load balancer.
                const iamRole = loadBalancers.length ? getServiceLoadBalancerRole().arn : undefined;

                // Create the service.
                const service = new aws.ecs.Service(name, {
                    desiredCount: replicas,
                    taskDefinition: taskDefinition.task.arn,
                    cluster: cluster!.ecsClusterARN,
                    loadBalancers: loadBalancers,
                    iamRole: iamRole,
                    placementConstraints: placementConstraintsForHost(args.host),
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

export interface Volume extends cloud.Volume {
    getVolumeName(): any;
    getHostPath(): any;
}

// _Note_: In the current EFS-backed model, a Volume is purely virtual - it
// doesn't actually manage any underlying resource.  It is used just to provide
// a handle to a folder on the EFS share which can be mounted by conatainer(s).
// On platforms like ACI, we may be able to actually provision a unique File
// Share per Volume to keep these independently managable.  For now, on AWS
// though, we rely on this File Share having been set up as part of the ECS
// Cluster outside of @pulumi/cloud, and assume that that data has a lifetime
// longer than any individual deployment.
export class SharedVolume extends pulumi.ComponentResource implements Volume, cloud.SharedVolume {
    public readonly kind: cloud.VolumeKind;
    public readonly name: string;

    constructor(name: string) {
        if (volumeNames.has(name)) {
            throw new Error("Must provide a unique volume name");
        }
        super("cloud:volume:Volume", name, {}, () => {/* no children */});
        this.kind = "SharedVolume";
        this.name = name;
        volumeNames.add(name);
    }

    getVolumeName() {
        // Ensure this is unique to avoid conflicts both in EFS and in the
        // TaskDefinition we pass to ECS.
        return sha1hash(`${pulumi.getProject()}:${pulumi.getStack()}:${this.kind}:${this.name}`);
    }

    getHostPath() {
        const cluster: Cluster | undefined = getCluster();
        if (!cluster || !cluster.efsMountPath) {
            throw new Error(
                "Cannot use 'Volume'.  Configured cluster does not support EFS.",
            );
        }
        // Include the unique `getVolumeName` in the EFS host path to ensure this doesn't
        // clash with other deployments.
        return `${cluster.efsMountPath}/${this.name}_${this.getVolumeName()}`;
    }
}

export class HostPathVolume implements cloud.HostPathVolume {
    public readonly kind: cloud.VolumeKind;
    public readonly path: string;

    constructor(path: string) {
        this.kind = "HostPathVolume";
        this.path = path;
    }

    getVolumeName() {
        return sha1hash(`${this.kind}:${this.path}`);
    }

    getHostPath() {
        return this.path;
    }
}

/**
 * A Task represents a container which can be [run] dynamically whenever (and as many times as) needed.
 */
export class Task extends pulumi.ComponentResource implements cloud.Task {
    public readonly run: (options?: cloud.TaskRunOptions) => Promise<void>;

    constructor(name: string, container: cloud.Container) {
        const cluster: Cluster | undefined = getCluster();
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
        this.run = async function (this: Task, options?: cloud.TaskRunOptions) {
            const awssdk: typeof _awsSdkTypesOnly = require("aws-sdk");
            const ecs = new awssdk.ECS();

            // Extract the envrionment values from the options
            const environment: ECSContainerEnvironment = await ecsEnvironmentFromMap(container.environment);
            if (options && options.environment) {
                for (const envName of Object.keys(options.environment)) {
                    let envVal: string | undefined = await options.environment[envName];
                    if (envVal) {
                        environment.push({ name: envName, value: envVal });
                    }
                }
            }

            function getTypeDefinitionARN(): string {
                // BUGBUG[pulumi/pulumi#459]:
                //
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

            // Ensure all environment entries are accessible.  These can contain promises, so we'll need to await.
            const env: {name: string; value: string}[] = [];
            for (const entry of environment) {
                // TODO[pulumi/pulumi#459]: we will eventually need to reenable the await, rather than casting.
                env.push({ name: entry.name, value: <string><any>/*await*/entry.value });
            }

            // Run the task
            const request: _awsSdkTypesOnly.ECS.RunTaskRequest = {
                cluster: getClusterARN(),
                taskDefinition: getTypeDefinitionARN(),
                placementConstraints: placementConstraintsForHost(options && options.host),
                overrides: {
                    containerOverrides: [
                        {
                            name: "container",
                            environment: env,
                        },
                    ],
                },
            };
            await ecs.runTask(request).promise();
        };
    }
}
