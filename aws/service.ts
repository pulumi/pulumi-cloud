// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";
import * as assert from "assert";
import * as stream from "stream";

import * as config from "./config";
import * as docker from "./docker";
import * as awsinfra from "./infrastructure";
import { getLogCollector } from "./logCollector";
import { createNameWithStackInfo, getCluster, getComputeIAMRolePolicies,
    getGlobalInfrastructureResource, getOrCreateNetwork } from "./shared";
import * as utils from "./utils";

// The shared Load Balancer management role used across all Services.
let serviceLoadBalancerRoleARN: pulumi.Output<string> | undefined;
function getServiceLoadBalancerRoleARN(): pulumi.Output<string> {
    if (!serviceLoadBalancerRoleARN) {
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

        const roleName = createNameWithStackInfo("load-balancer");
        const serviceLoadBalancerRole = new aws.iam.Role(roleName, {
            assumeRolePolicy: JSON.stringify(assumeRolePolicy),
        }, { parent: getGlobalInfrastructureResource() });

        const rolePolicy = new aws.iam.RolePolicy(roleName, {
            role: serviceLoadBalancerRole.name,
            policy: JSON.stringify(policy),
        }, { parent: getGlobalInfrastructureResource() });

        serviceLoadBalancerRoleARN = pulumi.all([serviceLoadBalancerRole.arn, rolePolicy.id]).apply(([arn, _]) => arn);
    }

    return serviceLoadBalancerRoleARN;
}

interface ContainerPortLoadBalancer {
    loadBalancer: aws.elasticloadbalancingv2.LoadBalancer;
    targetGroup: aws.elasticloadbalancingv2.TargetGroup;
    protocol: cloud.ContainerProtocol;
}

// createLoadBalancer allocates a new Load Balancer and TargetGroup that can be attached to a Service container and port
// pair.
function createLoadBalancer(
        parent: pulumi.Resource,
        cluster: awsinfra.Cluster,
        serviceName: string,
        containerName: string,
        portMapping: cloud.ContainerPort,
        network: awsinfra.Network): ContainerPortLoadBalancer {

    // Load balancers need *very* short names, so we unforutnately have to hash here.
    //
    // Note: Technically, we can only support one LB per service, so only the service name is needed here, but we
    // anticipate this will not always be the case, so we include a set of values which must be unique.
    const longName = `${serviceName}-${containerName}-${portMapping.port}`;
    const shortName = utils.sha1hash(`${longName}`);

    // Create an internal load balancer if requested.
    const internal: boolean = (network.usePrivateSubnets && !portMapping.external);
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
                throw new RunError("Cannot create Service for HTTPS trafic. No ACM certificate ARN configured.");
            }
            break;
        case "http":
            protocol = "HTTP";
            targetProtocol = "HTTP";
            useAppLoadBalancer = true;
            break;
        case "udp":
            throw new RunError("UDP protocol unsupported for Services");
        case "tcp":
            protocol = "TCP";
            targetProtocol = "TCP";
            useAppLoadBalancer = false;
            break;
        default:
            throw new RunError(`Unrecognized Service protocol: ${portMapping.protocol}`);
    }

    const loadBalancer = new aws.elasticloadbalancingv2.LoadBalancer(shortName, {
        loadBalancerType: useAppLoadBalancer ? "application" : "network",
        subnetMappings: network.publicSubnetIds.map(s => ({ subnetId: s })),
        internal: internal,
        // If this is an application LB, we need to associate it with the ECS cluster's security group, so
        // that traffic on any ports can reach it.  Otherwise, leave blank, and default to the VPC's group.
        securityGroups: (useAppLoadBalancer && cluster.securityGroupId) ? [ cluster.securityGroupId ] : undefined,
        tags: {
            Name: longName,
        },
    }, {parent: parent});

    // Create the target group for the new container/port pair.
    const target = new aws.elasticloadbalancingv2.TargetGroup(shortName, {
        port: portMapping.targetPort || portMapping.port,
        protocol: targetProtocol,
        vpcId: network.vpcId,
        deregistrationDelay: 180, // 3 minutes
        tags: {
            Name: longName,
        },
        targetType: config.useFargate ? "ip" : undefined,
    }, { parent: parent });

    // Listen on the requested port on the LB and forward to the target.
    const listener = new aws.elasticloadbalancingv2.Listener(longName, {
        loadBalancerArn: loadBalancer!.arn,
        protocol: protocol,
        certificateArn: useCertificateARN,
        port: portMapping.port,
        defaultActions: [{
            type: "forward",
            targetGroupArn: target.arn,
        }],
        // If SSL is used, we automatically insert the recommended ELB security policy from
        // http://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html.
        sslPolicy: useCertificateARN ? "ELBSecurityPolicy-2016-08" : undefined,
    }, { parent: parent });

    return {
        loadBalancer: loadBalancer,
        targetGroup: target,
        protocol: portMappingProtocol,
    };
}

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
        let buildSig: string;
        if (typeof container.build === "string") {
            buildSig = container.build;
        }
        else {
            buildSig = container.build.context || ".";
            if (container.build.dockerfile ) {
                buildSig += `;dockerfile=${container.build.dockerfile}`;
            }
            if (container.build.args) {
                for (const arg of Object.keys(container.build.args)) {
                    buildSig += `;arg[${arg}]=${container.build.args[arg]}`;
                }
            }
        }
        return createNameWithStackInfo(`${utils.sha1hash(buildSig)}-container`);
    }
    else if (container.function) {
        // TODO[pulumi/pulumi-cloud#85]: move this to a Pulumi Docker Hub account.
        return "lukehoban/nodejsrunner";
    }
    else {
        throw new RunError("Invalid container definition: `image`, `build`, or `function` must be provided");
    }
}

// repositories contains a cache of already created ECR repositories.
const repositories = new Map<string, aws.ecr.Repository>();

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
const buildImageCache = new Map<string, pulumi.Output<string>>();

// makeServiceEnvName turns a service name into something suitable for an environment variable.
function makeServiceEnvName(service: string): string {
    return service.toUpperCase().replace(/-/g, "_");
}

interface ImageOptions {
    image: string;
    environment: Record<string, string>;
}

// computeImage turns the `image`, `function` or `build` setting on a `cloud.Container` into a valid Docker image
// name and environment which can be used in an ECS TaskDefinition.
function computeImage(
        imageName: string,
        container: cloud.Container,
        ports: ExposedPorts | undefined,
        repository: aws.ecr.Repository | undefined): pulumi.Output<ImageOptions> {

    // Start with a copy from the container specification.
    const preEnv: {[key: string]: pulumi.Input<string>} =
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

                const fullHost = hostname.apply(h => `${hostproto}://${h}:${hostport}`);
                preEnv[`${serviceEnv}_PORT`] = fullHost;
                preEnv[`${serviceEnv}_PORT_${port}_TCP`] = fullHost;
                preEnv[`${serviceEnv}_PORT_${port}_TCP_PROTO`]= hostproto;
                preEnv[`${serviceEnv}_PORT_${port}_TCP_PORT`] = hostport;
                preEnv[`${serviceEnv}_PORT_${port}_TCP_ADDR`] = hostname;
            }
        }
    }

    if (container.build) {
        // This is a container to build; produce a name, either user-specified or auto-computed.
        pulumi.log.debug(`Building container image at '${container.build}'`, repository);
        if (!repository) {
            throw new RunError("Expected a container repository for build image");
        }

        let imageDigest: pulumi.Output<string>;
        // See if we've already built this.
        if (imageName && buildImageCache.has(imageName)) {
            // We got a cache hit, simply reuse the existing digest.
            // Safe to ! the result since we checked buildImageCache.has above.
            imageDigest = buildImageCache.get(imageName)!;
            imageDigest.apply(d =>
                pulumi.log.debug(`    already built: ${imageName} (${d})`, repository));
        } else {
            // If we haven't, build and push the local build context to the ECR repository, wait for
            // that to complete, then return the image name pointing to the ECT repository along
            // with an environment variable for the image digest to ensure the TaskDefinition get's
            // replaced IFF the built image changes.
            const registryId = repository!.registryId;
            imageDigest = docker.buildAndPushImage(repository, imageName, container, async () => {
                // Construct Docker registry auth data by getting the short-lived authorizationToken from ECR, and
                // extracting the username/password pair after base64-decoding the token.
                //
                // See: http://docs.aws.amazon.com/cli/latest/reference/ecr/get-authorization-token.html
                if (!registryId) {
                    throw new RunError("Expected registry ID to be defined during push");
                }
                const credentials = await aws.ecr.getCredentials({ registryId: registryId });
                const decodedCredentials = Buffer.from(credentials.authorizationToken, "base64").toString();
                const [username, password] = decodedCredentials.split(":");
                if (!password || !username) {
                    throw new RunError("Invalid credentials");
                }
                return {
                    registry: credentials.proxyEndpoint,
                    username: username,
                    password: password,
                };
            });
            if (imageName) {
                buildImageCache.set(imageName, imageDigest);
            }
            imageDigest.apply(d =>
                pulumi.log.debug(`    build complete: ${imageName} (${d})`, repository));
        }

        preEnv.IMAGE_DIGEST = imageDigest;

        return pulumi.all([repository.repositoryUrl, pulumi.all(preEnv)])
                     .apply(([url, e]) => ({ image: url, environment: e }));
    }
    else if (container.image) {
        return pulumi.all(preEnv).apply(e => ({ image: imageName, environment: e }));
    }
    else if (container.function) {
        const func = container.function;
        preEnv.PULUMI_SRC = pulumi.runtime.serializeFunctionAsync(func);

        // TODO[pulumi/pulumi-cloud#85]: Put this in a real Pulumi-owned Docker image.
        // TODO[pulumi/pulumi-cloud#86]: Pass the full local zipped folder through to the container (via S3?)
        return pulumi.all(preEnv).apply(e => ({ image: imageName, environment: e }));
    }
    else {
        throw new RunError("Invalid container definition: `image`, `build`, or `function` must be provided");
    }
}

// computeContainerDefinitions builds a ContainerDefinition for a provided Containers and LogGroup.
function computeContainerDefinitions(
        containers: cloud.Containers,
        ports: ExposedPorts | undefined,
        logGroup: aws.cloudwatch.LogGroup): pulumi.Output<aws.ecs.ContainerDefinition[]> {

    const containerDefinitions: pulumi.Output<aws.ecs.ContainerDefinition>[] =
        Object.keys(containers).map(containerName => {
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
            const imageOptions = computeImage(imageName, container, ports, repository);
            const portMappings = (container.ports || []).map(p => ({
                containerPort: p.targetPort || p.port,
            }));

            // tslint:disable-next-line:max-line-length
            return pulumi.all([imageOptions, container.command, container.memory, container.memoryReservation, logGroup.id])
                         .apply(([imageOpts, command, memory, memoryReservation, logGroupId]) => {
                const keyValuePairs: { name: string, value: string }[] = [];
                for (const key of Object.keys(imageOpts.environment)) {
                    keyValuePairs.push({ name: key, value: imageOpts.environment[key] });
                }

                const containerDefinition: aws.ecs.ContainerDefinition = {
                    name: containerName,
                    image: imageOpts.image,
                    command: command,
                    memory: memory,
                    memoryReservation: memoryReservation,
                    portMappings: portMappings,
                    environment: keyValuePairs,
                    mountPoints: (container.volumes || []).map(v => ({
                        containerPath: v.containerPath,
                        sourceVolume: (v.sourceVolume as Volume).getVolumeName(),
                    })),
                    logConfiguration: {
                        logDriver: "awslogs",
                        options: {
                            "awslogs-group": logGroupId,
                            "awslogs-region": aws.config.requireRegion(),
                            "awslogs-stream-prefix": containerName,
                        },
                    },
                };
                return containerDefinition;
            });
        });

    return pulumi.all(containerDefinitions);
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
        taskRole = new aws.iam.Role(createNameWithStackInfo("task"), {
            assumeRolePolicy: JSON.stringify(taskRolePolicy),
        }, { parent: getGlobalInfrastructureResource() });
        // TODO[pulumi/pulumi-cloud#145]: These permissions are used for both Lambda and ECS compute.
        // We need to audit these permissions and potentially provide ways for users to directly configure these.
        const policies = getComputeIAMRolePolicies();
        for (let i = 0; i < policies.length; i++) {
            const policyArn = policies[i];
            const _ = new aws.iam.RolePolicyAttachment(
                createNameWithStackInfo(`task-${utils.sha1hash(policyArn)}`), {
                    role: taskRole,
                    policyArn: policyArn,
                }, { parent: getGlobalInfrastructureResource() });
        }
    }
    return taskRole;
}

// Lazily initialize the role to use for ECS Task Execution
let executionRole: aws.iam.Role | undefined;
function getExecutionRole(): aws.iam.Role {
    if (!executionRole) {
        executionRole = new aws.iam.Role(createNameWithStackInfo("execution"), {
            assumeRolePolicy: JSON.stringify(taskRolePolicy),
        }, { parent: getGlobalInfrastructureResource() });
        const _ = new aws.iam.RolePolicyAttachment(createNameWithStackInfo("execution"), {
            role: executionRole,
            policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
        }, { parent: getGlobalInfrastructureResource() });
    }
    return executionRole;
}

interface TaskDefinition {
    task: aws.ecs.TaskDefinition;
    logGroup: aws.cloudwatch.LogGroup;
}

// createTaskDefinition builds an ECS TaskDefinition object from a collection of `cloud.Containers`.
function createTaskDefinition(parent: pulumi.Resource, name: string,
                              containers: cloud.Containers, ports?: ExposedPorts): TaskDefinition {
    // Create a single log group for all logging associated with the Service
    const logGroup = new aws.cloudwatch.LogGroup(name, {
        retentionInDays: 1,
    }, { parent: parent });

    // And hook it up to the aggregated log collector
    const subscriptionFilter = new aws.cloudwatch.LogSubscriptionFilter(name, {
        logGroup: logGroup,
        destinationArn: getLogCollector().arn,
        filterPattern: "",
    }, { parent: parent });

    // Find all referenced Volumes.
    const volumes: { hostPath?: string; name: string }[] = [];
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
    const containerDefinitions = computeContainerDefinitions(containers, ports, logGroup);

    // Compute the memory and CPU requirements of the task for Fargate
    const taskMemoryAndCPU = containerDefinitions.apply(taskMemoryAndCPUForContainers);

    const taskDefinition = new aws.ecs.TaskDefinition(name, {
        family: name,
        containerDefinitions: containerDefinitions.apply(JSON.stringify),
        volumes: volumes,
        taskRoleArn: getTaskRole().arn,
        requiresCompatibilities: config.useFargate ? ["FARGATE"] : undefined,
        memory: config.useFargate ? taskMemoryAndCPU.apply(t => t.memory) : undefined,
        cpu: config.useFargate ? taskMemoryAndCPU.apply(t => t.cpu) : undefined,
        networkMode: "awsvpc",
        executionRoleArn: getExecutionRole().arn,
    }, { parent: parent });

    return {
        task: taskDefinition,
        logGroup: logGroup,
    };
}

// Compute the memory and CPU requirements of the task for Fargate. See
// https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html#task_size.
function taskMemoryAndCPUForContainers(defs: aws.ecs.ContainerDefinition[]) {
    // Sum the requested memory and CPU for each container in the task.
    let minTaskMemory = 0;
    let minTaskCPU = 0;
    for (const containerDef of defs) {
        if (containerDef.memoryReservation) {
            minTaskMemory += containerDef.memoryReservation;
        } else if (containerDef.memory) {
            minTaskMemory += containerDef.memory;
        }
        if (containerDef.cpu) {
            minTaskCPU += containerDef.cpu;
        }
    }

    // Compute the smallest allowed Fargate memory value compatible with the requested minimum memory.
    let taskMemory: number;
    let taskMemoryString: string;
    if (minTaskMemory <= 512) {
        taskMemory = 512;
        taskMemoryString = "0.5GB";
    } else {
        const taskMemGB = minTaskMemory / 1024;
        const taskMemWholeGB = Math.ceil(taskMemGB);
        taskMemory = taskMemWholeGB * 1024;
        taskMemoryString = `${taskMemWholeGB}GB`;
    }

    // Allowed CPU values are powers of 2 between 256 and 4096.  We just ensure it's a power of 2 that is at least
    // 256. We leave the error case for requiring more CPU than is supported to ECS.
    let taskCPU = Math.pow(2, Math.ceil(Math.log2(Math.max(minTaskCPU, 256))));

    // Make sure we select an allowed CPU value for the specified memory.
    if (taskMemory > 16384) {
        taskCPU = Math.max(taskCPU, 4096);
    } else if (taskMemory > 8192) {
        taskCPU = Math.max(taskCPU, 2048);
    } else if (taskMemory > 4096) {
        taskCPU = Math.max(taskCPU, 1024);
    } else if (taskMemory > 2048) {
        taskCPU = Math.max(taskCPU, 512);
    }

    // Return the computed task memory and CPU values
    return {
        memory: taskMemoryString,
        cpu: `${taskCPU}`,
    };
}

function placementConstraintsForHost(host: cloud.HostProperties | undefined) {
    if (host && host.os) {
        return [{
            type: "memberOf",
            expression: `attribute:ecs.os-type == ${host.os}`,
        }];
    }
    return undefined;
}

interface ExposedPorts {
    [name: string]: {
        [port: string]: ExposedPort;
    };
}

interface ExposedPort {
    host: aws.elasticloadbalancingv2.LoadBalancer;
    hostPort: number;
    hostProtocol: cloud.ContainerProtocol;
}

// The AWS-specific Endpoint interface includes additional AWS implementation details for the exposed Endpoint.
export interface Endpoint extends cloud.Endpoint {
    loadBalancer: aws.elasticloadbalancingv2.LoadBalancer;
}

export type Endpoints = { [containerName: string]: { [port: number]: Endpoint } };

export class Service extends pulumi.ComponentResource implements cloud.Service {
    public readonly name: string;
    public readonly containers: cloud.Containers;
    public readonly replicas: number;
    public readonly cluster: awsinfra.Cluster;
    public readonly ecsService: aws.ecs.Service;

    public readonly endpoints: pulumi.Output<Endpoints>;

    public readonly getEndpoint: (containerName?: string, containerPort?: number) => Promise<cloud.Endpoint>;

    // Expose the task role we create to clients (who will cast through <any>)
    // so they can attach their own policies.
    // TODO[pulumi/pulumi-cloud#145]: Find a better way to expose this functionality.
    public static getTaskRole(): aws.iam.Role {
        return getTaskRole();
    }

    constructor(name: string, args: cloud.ServiceArguments, opts?: pulumi.ResourceOptions) {
        const cluster: awsinfra.Cluster | undefined = getCluster();
        if (!cluster) {
            throw new RunError("Cannot create 'Service'.  Missing cluster config 'cloud-aws:config:ecsClusterARN'" +
                " or 'cloud-aws:config:ecsAutoCluster' or 'cloud-aws:config:useFargate'");
        }

        const containers = args.containers;
        const replicas = args.replicas === undefined ? 1 : args.replicas;
        const ports: ExposedPorts = {};

        super("cloud:service:Service", name, {
            containers: containers,
            replicas: replicas,
        }, opts);

        this.name = name;
        this.cluster = cluster;

        // Get the network to create the Service within.
        const network = getOrCreateNetwork();

        // Create load balancer listeners/targets for each exposed port.
        const loadBalancers = [];
        for (const containerName of Object.keys(containers)) {
            const container = containers[containerName];
            ports[containerName] = {};
            if (container.ports) {
                for (const portMapping of container.ports) {
                    if (loadBalancers.length > 0) {
                        throw new RunError("Only one port can currently be exposed per Service.");
                    }
                    const info = createLoadBalancer(this, cluster, name, containerName, portMapping, network);
                    ports[containerName][portMapping.port] = {
                        host: info.loadBalancer,
                        hostPort: portMapping.port,
                        hostProtocol: info.protocol,
                    };
                    loadBalancers.push({
                        containerName: containerName,
                        containerPort: portMapping.targetPort || portMapping.port,
                        targetGroupArn: info.targetGroup.arn,
                    });
                }
            }
        }

        // Only provide a role if the service is attached to a load balancer.
        const iamRole = loadBalancers.length ? getServiceLoadBalancerRoleARN() : undefined;

        // Create the task definition, parented to this component.
        const taskDefinition = createTaskDefinition(this, name, containers, ports);

        // Create the service.
        this.ecsService = new aws.ecs.Service(name, {
            desiredCount: replicas,
            taskDefinition: taskDefinition.task.arn,
            cluster: cluster.ecsClusterARN,
            loadBalancers: loadBalancers,
            iamRole: config.useFargate ? undefined : iamRole,
            placementConstraints: placementConstraintsForHost(args.host),
            waitForSteadyState: true,
            launchType: config.useFargate ? "FARGATE" : "EC2",
            networkConfiguration: {
                assignPublicIp: !network.usePrivateSubnets,
                securityGroups: [ cluster.securityGroupId!],
                subnets: network.subnetIds,
            },
        }, { parent: this });

        const localEndpoints = getEndpoints(ports);
        this.endpoints = localEndpoints;

        this.getEndpoint = async (containerName, containerPort) => {
            const endpoints = localEndpoints.get();

            containerName = containerName || Object.keys(endpoints)[0];
            if (!containerName)  {
                throw new Error(`No containers available in this service`);
            }

            const containerPorts = endpoints[containerName] || {};
            containerPort = containerPort || +Object.keys(containerPorts)[0];
            if (!containerPort) {
                throw new Error(`No ports available in service container ${containerName}`);
            }

            const endpoint = containerPorts[containerPort];
            if (!endpoint) {
                throw new Error(`No exposed port for ${containerName} port ${containerPort}`);
            }

            return endpoint;
        };
    }
}

function getEndpoints(ports: ExposedPorts): pulumi.Output<Endpoints> {
    return pulumi.all(utils.apply(ports, portToExposedPort => {
        const inner: pulumi.Output<{ [port: string]: Endpoint }> =
            pulumi.all(utils.apply(portToExposedPort, exposedPort =>
                exposedPort.host.dnsName.apply(d => ({
                    port: exposedPort.hostPort, loadBalancer: exposedPort.host, hostname: d,
                }))));

        return inner;
    }));
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

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        if (volumeNames.has(name)) {
            throw new RunError("Must provide a unique volume name");
        }
        super("cloud:volume:Volume", name, {}, opts);
        this.kind = "SharedVolume";
        this.name = name;
        volumeNames.add(name);
    }

    getVolumeName() {
        // Ensure this is unique to avoid conflicts both in EFS and in the
        // TaskDefinition we pass to ECS.
        return utils.sha1hash(`${pulumi.getProject()}:${pulumi.getStack()}:${this.kind}:${this.name}`);
    }

    getHostPath() {
        const cluster: awsinfra.Cluster | undefined = getCluster();
        if (!cluster || !cluster.efsMountPath) {
            throw new RunError(
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
        return utils.sha1hash(`${this.kind}:${this.path}`);
    }

    getHostPath() {
        return this.path;
    }
}

/**
 * A Task represents a container which can be [run] dynamically whenever (and as many times as) needed.
 */
export class Task extends pulumi.ComponentResource implements cloud.Task {
    public readonly cluster: awsinfra.Cluster;
    public readonly taskDefinition: aws.ecs.TaskDefinition;

    public readonly run: (options?: cloud.TaskRunOptions) => Promise<void>;

    // See comment for Service.getTaskRole.
    public static getTaskRole(): aws.iam.Role {
        return getTaskRole();
    }

    constructor(name: string, container: cloud.Container, opts?: pulumi.ResourceOptions) {
        super("cloud:task:Task", name, { container: container }, opts);

        const network = getOrCreateNetwork();
        const cluster: awsinfra.Cluster | undefined = getCluster();
        if (!cluster) {
            throw new Error("Cannot create 'Task'.  Missing cluster config 'cloud-aws:config:ecsClusterARN'" +
                " or 'cloud-aws:config:ecsAutoCluster' or 'cloud-aws:config:useFargate'");
        }
        this.cluster = cluster;
        this.taskDefinition = createTaskDefinition(this, name, { container: container }).task;

        const clusterARN = this.cluster.ecsClusterARN;
        const taskDefinitionArn = this.taskDefinition.arn;
        const containerEnv = pulumi.all(container.environment || {});
        const subnetIds = pulumi.all(network.subnetIds);
        const securityGroups =  cluster.securityGroupId!;
        const useFargate = config.useFargate;
        const usePrivateSubnets = network.usePrivateSubnets;

        // tslint:disable-next-line:no-empty
        this.run = async function (options?: cloud.TaskRunOptions) {
            const awssdk = await import("aws-sdk");
            const ecs = new awssdk.ECS();

            // Extract the envrionment values from the options
            const env: { name: string, value: string }[] = [];
            await addEnvironmentVariables(containerEnv.get());
            await addEnvironmentVariables(options && options.environment);

            // Run the task
            const res = await ecs.runTask({
                cluster: clusterARN.get(),
                taskDefinition: taskDefinitionArn.get(),
                placementConstraints: placementConstraintsForHost(options && options.host),
                launchType: useFargate ? "FARGATE" : "EC2",
                networkConfiguration: {
                    awsvpcConfiguration: {
                        assignPublicIp: usePrivateSubnets ? "DISABLED" : "ENABLED",
                        securityGroups: [ securityGroups.get() ],
                        subnets: subnetIds.get(),
                    },
                },
                overrides: {
                    containerOverrides: [
                        {
                            name: "container",
                            environment: env,
                        },
                    ],
                },
            }).promise();

            if (res.failures && res.failures.length > 0) {
                throw new Error("Failed to start task:" + JSON.stringify(res.failures, null, ""));
            }

            return;

            // Local functions
            async function addEnvironmentVariables(e: Record<string, string> | undefined) {
                if (e) {
                    for (const key of Object.keys(e)) {
                        const envVal = e[key];
                        if (envVal) {
                            env.push({ name: key, value: envVal });
                        }
                    }
                }
            }
        };
    }
}
