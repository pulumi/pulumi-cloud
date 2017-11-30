// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as child_process from "child_process";
import * as pulumi from "pulumi";
import * as semver from "semver";
import * as stream from "stream";
import * as config from "./config";
import { Cluster } from "./infrastructure/cluster";
import { Network } from "./infrastructure/network";
import { getLogCollector } from "./logCollector";
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

        serviceLoadBalancerRole = new aws.iam.Role(`${commonPrefix}-s-lb-role`, {
            assumeRolePolicy: JSON.stringify(assumeRolePolicy),
        });

        const rolePolicy = new aws.iam.RolePolicy(`${commonPrefix}-s-lb-role`, {
            role: serviceLoadBalancerRole.name,
            policy: JSON.stringify(policy),
        });
    }

    return serviceLoadBalancerRole;
}

function getMaxListenersPerLb(network: Network): number {
    // If we are single-AZ, we can share load balancers, and cut down on costs.  Otherwise, we cannot.
    if (network.numberOfAvailabilityZones === 1) {
        return 50;
    }
    return 1;
}

// We may allocate both internal-facing and internet-facing load balancers, and we may want to combine multiple
// listeners on a single load balancer. So we track the currently allocated load balancers to use for both internal and
// external load balancing, and the index of the next slot to use within that load balancers listeners.
let internalAppLoadBalancer: aws.elasticloadbalancingv2.LoadBalancer | undefined;
let internalAppListenerIndex = 0;
let externalAppLoadBalancer: aws.elasticloadbalancingv2.LoadBalancer | undefined;
let externalAppListenerIndex = 0;
let internalNetLoadBalancer: aws.elasticloadbalancingv2.LoadBalancer | undefined;
let internalNetListenerIndex = 0;
let externalNetLoadBalancer: aws.elasticloadbalancingv2.LoadBalancer | undefined;
let externalNetListenerIndex = 0;

// loadBalancerPrefixLength is a prefix length to avoid generating names that are too long.
const loadBalancerPrefixLength =
    32   /* max load balancer name */
    - 16 /* random hex added to ID */
    - 4  /* room for up to 9999 load balancers */
    - 3  /* for -[a|n][i|e], where a = application, n = network; i = internal, e = external */;

function getLoadBalancerPrefix(internal: boolean, application: boolean): string {
    return commonPrefix.substring(0, loadBalancerPrefixLength) + "-" +
        (application ? "a" : "n") + (internal ? "i" : "e");
}

function allocateListener(
    cluster: Cluster, network: Network, internal: boolean, application: boolean): {
        loadBalancer: aws.elasticloadbalancingv2.LoadBalancer, listenerIndex: number, listenerPort: number} {
    // Get or create the right kind of load balancer.  We try to cache LBs, but create a new one every getMaxListeners.
    const maxListeners: number = getMaxListenersPerLb(network);
    const listenerIndex: number = internal ?
        (application ? internalAppListenerIndex++ : internalNetListenerIndex++) :
        (application ? externalAppListenerIndex++ : externalNetListenerIndex++);
    const listenerPort = 34567 + listenerIndex % maxListeners;
    if (listenerIndex % maxListeners !== 0) {
        // Reuse an existing load balancer.
        return {
            loadBalancer: internal ?
                (application ? internalAppLoadBalancer! : internalNetLoadBalancer!) :
                (application ? externalAppLoadBalancer! : externalNetLoadBalancer!),
            listenerIndex: listenerIndex,
            listenerPort: listenerPort,
        };
    }

    // Otherwise, if we've exhausted the cache, allocate a new LB with a sufficiently unique name.
    const lbNumber = listenerIndex / maxListeners + 1;
    const lbName = getLoadBalancerPrefix(internal, application) + lbNumber;
    const loadBalancer = new aws.elasticloadbalancingv2.LoadBalancer(lbName, {
        loadBalancerType: application ? "application" : "network",
        subnetMapping: network.publicSubnetIds.map(s => ({ subnetId: s })),
        internal: internal,
        // If this is an application LB, we need to associate it with the ECS cluster's security group, so
        // that traffic on any ports can reach it.  Otherwise, leave blank, and default to the VPC's group.
        securityGroups: application && cluster.securityGroupId ? [ cluster.securityGroupId ] : undefined,
    });

    // Store the new load balancer in the corresponding slot, based on whether it's internal/app/etc.
    if (internal) {
        if (application) {
            internalAppLoadBalancer = loadBalancer;
        } else {
            internalNetLoadBalancer = loadBalancer;
        }
    } else {
        if (application) {
            externalAppLoadBalancer = loadBalancer;
        } else {
            externalNetLoadBalancer = loadBalancer;
        }
    }

    return { loadBalancer: loadBalancer, listenerIndex: listenerIndex, listenerPort: listenerPort };
}

interface ContainerPortLoadBalancer {
    loadBalancer: aws.elasticloadbalancingv2.LoadBalancer;
    targetGroup: aws.elasticloadbalancingv2.TargetGroup;
    protocol: cloud.ContainerProtocol;
    listenerPort: number;
}

// createLoadBalancer allocates a new Load Balancer TargetGroup that can be attached to a Service container and port
// pair. Allocates a new NLB is needed (currently 50 ports can be exposed on a single NLB).
function newLoadBalancerTargetGroup(parent: pulumi.Resource,
                                    cluster: Cluster, portMapping: cloud.ContainerPort): ContainerPortLoadBalancer {
    const network: Network | undefined = getNetwork();
    if (!network) {
        throw new Error("Cannot create 'Service'. No VPC configured.");
    }

    // Create an internal load balancer if requested.
    const internal: boolean = (network.privateSubnets && !portMapping.external);
    const portMappingProtocol: cloud.ContainerProtocol = portMapping.protocol || "tcp";

    // See what kind of load balancer to create (application L7 for HTTP(S) traffic, or network L4 otherwise).
    // Also ensure that we have an SSL certificate for termination at the LB, if that was requested.
    let protocol: string;
    let targetProtocol: string;
    let useAppLoadBalancer: boolean;
    let useCertificateARN: string | undefined;
    switch (portMappingProtocol) {
        case "https":
            protocol = "HTTPS";
            // Set the target protocol to HTTP, so that the ELB terminates the SSL traffic.
            // IDEA: eventually we should let users choose where the SSL termination occurs.
            targetProtocol = "HTTP";
            useAppLoadBalancer = true;
            useCertificateARN = config.acmCertificateARN;
            if (!useCertificateARN) {
                throw new Error("Cannot create Service for HTTPS trafic. No ACM certificate ARN configured.");
            }
            break;
        case "http":
            protocol = "HTTP";
            targetProtocol = "HTTP";
            useAppLoadBalancer = true;
            break;
        case "udp":
            throw new Error("UDP protocol unsupported for Services");
        case "tcp":
            protocol = "TCP";
            targetProtocol = "TCP";
            useAppLoadBalancer = false;
            break;
        default:
            throw new Error(`Unrecognized Service protocol: ${portMapping.protocol}`);
    }

    // Get or create the right kind of load balancer.  We try to cache LBs, but create a new one every 50 requests.
    const { loadBalancer, listenerIndex, listenerPort } =
        allocateListener(cluster, network, internal, useAppLoadBalancer);

    // Create the target group for the new container/port pair.
    const targetListenerName = getLoadBalancerPrefix(internal, useAppLoadBalancer) + listenerIndex;
    const target = new aws.elasticloadbalancingv2.TargetGroup(targetListenerName, {
        port: portMapping.port,
        protocol: targetProtocol,
        vpcId: network.vpcId,
        deregistrationDelay: 30,
    }, parent);

    // Listen on a new port on the NLB and forward to the target.
    const listener = new aws.elasticloadbalancingv2.Listener(targetListenerName, {
        loadBalancerArn: loadBalancer!.arn,
        protocol: protocol,
        certificateArn: useCertificateARN,
        port: listenerPort,
        defaultActions: [{
            type: "forward",
            targetGroupArn: target.arn,
        }],
        // If SSL is used, we automatically insert the recommended ELB security policy from
        // http://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html.
        sslPolicy: useCertificateARN ? "ELBSecurityPolicy-2016-08" : undefined,
    }, parent);

    return {
        loadBalancer: loadBalancer,
        targetGroup: target,
        protocol: portMappingProtocol,
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
            const env: string | undefined = await environment[name];
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
        p.on("close", (code) => {
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

// Store this so we can verify `docker` command is available only once per deployment.
let cachedDockerVersionString: string|undefined;
let dockerPasswordStdin: boolean = false;

// buildAndPushImage will build and push the Dockerfile and context from [buildPath] into the requested ECR
// [repository].  It returns the digest of the built image.
async function buildAndPushImage(imageName: string, container: cloud.Container,
                                 repository: aws.ecr.Repository): Promise<string | undefined> {
    const buildPath: string | undefined = container.build;
    if (!buildPath) {
        throw new Error(`Cannot build a container with an empty build specification`);
    }

    console.log(`Building container image '${imageName}' from ${buildPath}`);

    // Verify that 'docker' is on the PATH and get the client/server versions
    if (!cachedDockerVersionString) {
        try {
            const versionResult = await runCLICommand("docker", ["version", "-f", "{{json .}}"], ".", true);
            // IDEA: In the future we could warn here on out-of-date versions of Docker which may not support key
            // features we want to use.
            cachedDockerVersionString = versionResult.stdout;
            pulumi.log.debug(`'docker version' => ${cachedDockerVersionString}`);
        } catch (err) {
            throw new Error("No 'docker' command available on PATH: Please install to use container 'build' mode.");
        }

        // Decide whether to use --password or --password-stdin based on the client version.
        try {
            const versionData: any = JSON.parse(cachedDockerVersionString!);
            const clientVersion: string = versionData.Client.Version;
            if (semver.gte(clientVersion, "17.07.0", true)) {
                dockerPasswordStdin = true;
            }
        } catch (err) {
            console.log(`Could not process Docker version (${err})`);
        }
    }

    // Invoke Docker CLI commands to build and push
    const buildResult = await runCLICommand("docker", ["build", "-t", imageName, "."], buildPath);
    if (buildResult.code) {
        throw new Error(`Docker build of image '${imageName}' failed with exit code: ${buildResult.code}`);
    }

    // Skip the publication of the image if we're only planning.
    if (pulumi.runtime.options.dryRun) {
        console.log(`Skipping image publish during preview: ${imageName}`);
    }
    else {
        // Next, login to the repository.  Construct Docker registry auth data by getting the short-lived
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

        let loginResult: CommandResult;
        if (!dockerPasswordStdin) {
            loginResult = await runCLICommand(
                "docker", ["login", "-u", username, "-p", password, registry], buildPath);
        } else {
            loginResult = await runCLICommand(
                "docker", ["login", "-u", username, "--password-stdin", registry], buildPath, false, password);
        }
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
    const inspectResult = await runCLICommand(
        "docker",
        ["image", "inspect", "-f", "{{.Id}}", imageName],
        buildPath,
        true,
    );
    if (inspectResult.code || !inspectResult.stdout) {
        throw new Error(`No digest available for image ${imageName}: ${inspectResult.code} -- ${inspectResult.stdout}`);
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

// getOrCreateRepository returns the ECR repository for this image, lazily allocating if necessary.
function getOrCreateRepository(imageName: string): aws.ecr.Repository {
    let repository: aws.ecr.Repository | undefined = repositories.get(imageName);
    if (!repository) {
        repository = new aws.ecr.Repository(imageName.toLowerCase());
        repositories.set(imageName, repository);
    }
    return repository;
}

// buildImageCache remembers the digests for all past built images, keyed by image name.
const buildImageCache = new Map<string, Promise<string | undefined>>();

// makeServiceEnvName turns a service name into something suitable for an environment variable.
function makeServiceEnvName(service: string): string {
    return service.toUpperCase().replace(/-/g, "_");
}

// computeImage turns the `image`, `function` or `build` setting on a `cloud.Container` into a valid Docker image
// name which can be used in an ECS TaskDefinition.
async function computeImage(imageName: string, container: cloud.Container, ports: ExposedPorts | undefined,
                            repository: aws.ecr.Repository | undefined): Promise<ImageOptions> {
    // Start with a copy from the container specification.
    const preEnv: {[key: string]: pulumi.ComputedValue<string>} =
        <any>Object.assign({}, container.environment || {});

    // Now add entries for service discovery amongst containers exposing endpoints.
    if (ports) {
        for (const service of Object.keys(ports)) {
            let firstPort = true;
            const serviceEnv = makeServiceEnvName(service);
            for (const port of Object.keys(ports[service])) {
                const info = ports[service][parseInt(port, 10)];
                const hostname = info.host.dnsName;
                const hostport = info.hostPort.toString();
                const hostproto = info.hostProtocol;
                // Populate Kubernetes and Docker links compatible environment variables.  These take the form:
                //
                //     Kubernetes:
                //         {SVCNAME}_SERVICE_HOST=10.0.0.11 (or DNS name)
                //         {SVCNAME}_SERVICE_PORT=6379
                //     Docker links:
                //         {SVCNAME}_PORT=tcp://10.0.0.11:6379 (or DNS address)
                //         {SVCNAME}_PORT_6379_TCP=tcp://10.0.0.11:6379 (or DNS address)
                //         {SVCNAME}_PORT_6379_TCP_PROTO=tcp
                //         {SVCNAME}_PORT_6379_TCP_PORT=6379
                //         {SVCNAME}_PORT_6379_TCP_ADDR=10.0.0.11 (or DNS name)
                //
                // See https://kubernetes.io/docs/concepts/services-networking/service/#discovering-services and
                // https://docs.docker.com/engine/userguide/networking/default_network/dockerlinks/ for more info.
                if (firstPort) {
                    preEnv[`${serviceEnv}_SERVICE_HOST`] = hostname;
                    preEnv[`${serviceEnv}_SERVICE_PORT`] = hostport;
                }
                firstPort = false;

                const fullHost: Promise<string> = hostname.then((h) => `${hostproto}://${h}:${hostport}`);
                preEnv[`${serviceEnv}_PORT`] = fullHost;
                preEnv[`${serviceEnv}_PORT_${port}_TCP`] = fullHost;
                preEnv[`${serviceEnv}_PORT_${port}_TCP_PROTO`]= hostproto;
                preEnv[`${serviceEnv}_PORT_${port}_TCP_PORT`] = hostport;
                preEnv[`${serviceEnv}_PORT_${port}_TCP_ADDR`] = hostname;
            }
        }
    }

    // Now wait for any environment entries to settle before proceeding.
    const env: ECSContainerEnvironment = await ecsEnvironmentFromMap(preEnv);

    if (container.build) {
        // This is a container to build; produce a name, either user-specified or auto-computed.
        pulumi.log.debug(`Building container image at '${container.build}'`);
        if (!repository) {
            throw new Error("Expected a container repository for build image");
        }

        // See if we've already built this.
        let imageDigest: string | undefined;
        if (imageName && buildImageCache.has(imageName)) {
            // We got a cache hit, simply reuse the existing digest.
            imageDigest = await buildImageCache.get(imageName);
            pulumi.log.debug(`    already built: ${imageName} (${imageDigest})`);
        }
        else {
            // If we haven't, build and push the local build context to the ECR repository, wait for that to complete,
            // then return the image name pointing to the ECT repository along with an environment variable for the
            // image digest to ensure the TaskDefinition get's replaced IFF the built image changes.
            const imageDigestAsync: Promise<string | undefined> = buildAndPushImage(imageName, container, repository!);
            if (imageName) {
                buildImageCache.set(imageName, imageDigestAsync);
            }
            imageDigest = await imageDigestAsync;
            pulumi.log.debug(`    build complete: ${imageName} (${imageDigest})`);
        }

        env.push({ name: "IMAGE_DIGEST", value: await imageDigest! });
        return { image: (await repository.repositoryUrl)!, environment: env };
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
async function computeContainerDefintions(containers: cloud.Containers, ports: ExposedPorts | undefined,
                                          logGroup: aws.cloudwatch.LogGroup): Promise<ECSContainerDefinition[]> {
    return Promise.all(Object.keys(containers).map(async (containerName) => {
        const container = containers[containerName];
        const imageName: string = getImageName(container);
        let repository: aws.ecr.Repository | undefined;
        if (container.build) {
            // Create the repository.  Note that we must do this in the current turn, before we hit any awaits.
            // The reason is subtle; however, if we do not, we end up with a circular reference between the
            // TaskDefinition that depends on this repository and the repository waiting for the TaskDefinition,
            // simply because permitting a turn in between lets the TaskDefinition's registration race ahead of us.
            repository = getOrCreateRepository(imageName);
        }
        const { image, environment } = await computeImage(imageName, container, ports, repository);
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
                    "awslogs-group": (await logGroup.id)!,
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
function createTaskDefinition(parent: pulumi.Resource, name: string,
                              containers: cloud.Containers, ports?: ExposedPorts): TaskDefinition {
    // Create a single log group for all logging associated with the Service
    const logGroup = new aws.cloudwatch.LogGroup(`${name}-task-logs`, {
        retentionInDays: 1,
    }, parent);

    // And hook it up to the aggregated log collector
    const subscriptionFilter = new aws.cloudwatch.LogSubscriptionFilter(`${name}-task-logs-filter`, {
        logGroup: logGroup,
        destinationArn: getLogCollector().arn,
        filterPattern: "",
    }, parent);

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
    const containerDefintions = computeContainerDefintions(containers, ports, logGroup).then(JSON.stringify);
    const taskDefinition = new aws.ecs.TaskDefinition(name, {
        family: name,
        containerDefinitions: containerDefintions,
        volume: volumes,
        taskRoleArn: getTaskRole().arn,
    }, parent);

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
        [port: number]: ExposedPort;
    };
}

interface ExposedPort {
    host: aws.elasticloadbalancingv2.LoadBalancer;
    hostPort: number;
    hostProtocol: cloud.ContainerProtocol;
}

export class Service extends pulumi.ComponentResource implements cloud.Service {
    public readonly name: string;
    public readonly containers: cloud.Containers;
    public readonly replicas: number;

    public readonly getEndpoint: (containerName?: string, containerPort?: number) => Promise<cloud.Endpoint>;

    // Expose the task role we create to clients (who will cast through <any>)
    // so they can attach their own policies.
    // TODO[pulumi/pulumi-cloud#145]: Find a better way to expose this functionality.
    public static getTaskRole(): aws.iam.Role {
        return getTaskRole();
    }

    constructor(name: string, args: cloud.ServiceArguments,
                parent?: pulumi.Resource, dependsOn?: pulumi.Resource[]) {
        const cluster: Cluster | undefined = getCluster();
        if (!cluster) {
            throw new Error("Cannot create 'Service'.  Missing cluster config 'cloud-aws:config:ecsClusterARN'" +
                " or 'cloud-aws:config:ecsAutoCluster'");
        }

        const containers = args.containers;
        const replicas = args.replicas === undefined ? 1 : args.replicas;
        const ports: ExposedPorts = {};

        super("cloud:service:Service", name, {
            containers: containers,
            replicas: replicas,
        }, parent, dependsOn);

        this.name = name;

        // Create load balancer listeners/targets for each exposed port.
        const loadBalancers = [];
        for (const containerName of Object.keys(containers)) {
            const container = containers[containerName];
            ports[containerName] = {};
            if (container.ports) {
                for (const portMapping of container.ports) {
                    const info = newLoadBalancerTargetGroup(this, cluster, portMapping);
                    ports[containerName][portMapping.port] = {
                        host: info.loadBalancer,
                        hostPort: info.listenerPort,
                        hostProtocol: info.protocol,
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

        // Create the task definition, parented to this component.
        const taskDefinition = createTaskDefinition(this, name, containers, ports);

        // Create the service.
        const service = new aws.ecs.Service(name, {
            desiredCount: replicas,
            taskDefinition: taskDefinition.task.arn,
            cluster: cluster!.ecsClusterARN,
            loadBalancers: loadBalancers,
            iamRole: iamRole,
            placementConstraints: placementConstraintsForHost(args.host),
        }, this);

        // getEndpoint returns the host and port info for a given containerName and exposed port.
        this.getEndpoint =
            async function (this: Service, containerName: string, containerPort: number): Promise<cloud.Endpoint> {
                if (!containerName) {
                    // If no container name provided, choose the first container
                    containerName = Object.keys(ports)[0];
                    if (!containerName) {
                        throw new Error(`No containers available in this service`);
                    }
                }

                const containerPorts = ports[containerName] || {};
                if (!containerPort) {
                    // If no port provided, choose the first exposed port on the container.
                    containerPort = +Object.keys(containerPorts)[0];
                    if (!containerPort) {
                        throw new Error(`No ports available in service container ${containerName}`);
                    }
                }

                const info = containerPorts[containerPort];
                if (!info) {
                    throw new Error(`No exposed port for ${containerName} port ${containerPort}`);
                }

                // TODO [pulumi/pulumi#331] When we capture promise values, they get exposed on the inside as the
                // unwrapped value inside the promise.  Because this function may be called at deployment or runtime
                // the value of `info.host.dnsName` may be a Promise<string|undefined> or a string|undefined.  We
                // can use `await` to turn either of these into a `string|undefined`, because `await` in JavaScript
                // works fine on non-promise values. See
                // https://github.com/pulumi/pulumi/issues/331#issuecomment-333280955.
                const hostname = await info.host.dnsName;
                return {
                    hostname: hostname!,
                    port: info.hostPort,
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

    constructor(name: string, parent?: pulumi.Resource, dependsOn?: pulumi.Resource[]) {
        if (volumeNames.has(name)) {
            throw new Error("Must provide a unique volume name");
        }
        super("cloud:volume:Volume", name, {}, parent, dependsOn);
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

    // See comment for Service.getTaskRole.
    public static getTaskRole(): aws.iam.Role {
        return getTaskRole();
    }

    constructor(name: string, container: cloud.Container, parent?: pulumi.Resource, dependsOn?: pulumi.Resource[]) {
        super("cloud:task:Task", name, { container: container }, parent, dependsOn);

        const cluster: Cluster | undefined = getCluster();
        if (!cluster) {
            throw new Error("Cannot create 'Task'.  Missing cluster config 'cloud-aws:config:ecsClusterARN'");
        }
        const clusterARN = cluster.ecsClusterARN;

        const taskDefinition: aws.ecs.TaskDefinition = createTaskDefinition(this, name, { container: container }).task;

        this.run = async function (this: Task, options?: cloud.TaskRunOptions) {
            const awssdk: typeof _awsSdkTypesOnly = require("aws-sdk");
            const ecs = new awssdk.ECS();

            // Extract the envrionment values from the options
            const environment: ECSContainerEnvironment = await ecsEnvironmentFromMap(container.environment);
            if (options && options.environment) {
                for (const envName of Object.keys(options.environment)) {
                    const envVal: string | undefined = await options.environment[envName];
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
