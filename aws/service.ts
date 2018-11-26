// Copyright 2016-2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as aws from "@pulumi/aws";
import * as awsinfra from "@pulumi/aws-infra";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { CloudNetwork } from "./shared";

import * as docker from "@pulumi/docker";
import * as config from "./config";

import {
    getAutoScalingGroup,
    getCluster,
    getComputeIAMRolePolicies,
    getFileSystem,
    getOrCreateNetwork } from "./shared";
import * as utils from "./utils";

// The AWS-specific Endpoint interface includes additional AWS implementation details for the exposed Endpoint.
export interface Endpoint extends cloud.Endpoint {
    loadBalancer: aws.elasticloadbalancingv2.LoadBalancer;
}

export type Endpoints = { [containerName: string]: { [port: number]: Endpoint } };

export interface ServiceArguments extends cloud.ServiceArguments {
    /**
     * Seconds to ignore failing load balancer health checks on newly instantiated tasks to prevent
     * premature shutdown, up to 7200. Only valid for services configured to use load balancers.
     */
    healthCheckGracePeriodSeconds?: pulumi.Input<number>;
}

export class Service extends pulumi.ComponentResource implements cloud.Service {
    public readonly name: string;
    public readonly containers: cloud.Containers;
    public readonly replicas: number;
    public readonly cluster: awsinfra.x.Cluster;
    public readonly infraService: awsinfra.x.ClusterService;
    public readonly service: aws.ecs.Service;

    public readonly endpoints: pulumi.Output<Endpoints>;
    public readonly defaultEndpoint: pulumi.Output<Endpoint>;

    public readonly getEndpoint: (containerName?: string, containerPort?: number) => Promise<Endpoint>;

    constructor(name: string, args: ServiceArguments, opts?: pulumi.ResourceOptions) {
        const cluster = getCluster();
        if (!cluster) {
            throw new Error("Cannot create 'Service'.  Missing cluster config 'cloud-aws:ecsClusterARN'" +
                " or 'cloud-aws:ecsAutoCluster' or 'cloud-aws:useFargate'");
        }

        let cloudContainers: cloud.Containers;
        if (args.image || args.build || args.function) {
            if (args.containers) {
                throw new Error(
                    "Exactly one of image, build, function, or containers must be used, not multiple");
            }
            cloudContainers = { "default": args };
        } else if (args.containers) {
            cloudContainers = args.containers;
        } else {
            throw new Error(
                "Missing one of image, build, function, or containers, specifying this service's containers");
        }

        const replicas = args.replicas === undefined ? 1 : args.replicas;

        super("cloud:service:Service", name, {
            containers: cloudContainers,
            replicas: replicas,
        }, opts);

        this.name = name;
        this.cluster = cluster;

        const parentOpts = { parent: this };
        const containers = createContainers(cluster, cloudContainers);

        const taskRole = createTaskRole(parentOpts);
        const taskArgs = { containers, taskRole };
        const taskDefinition = config.useFargate
            ? new awsinfra.x.FargateTaskDefinition(name, taskArgs, parentOpts)
            : new awsinfra.x.EC2TaskDefinition(name, taskArgs, parentOpts);

        const serviceArgs = {
            cluster,
            taskDefinition,
            waitForSteadyState: args.waitForSteadyState,
            healthCheckGracePeriodSeconds: args.healthCheckGracePeriodSeconds,
            desiredCount: replicas,
            autoScalingGroup: getAutoScalingGroup(),
        };
        const service = config.useFargate
            ? new awsinfra.x.FargateService(name, <awsinfra.x.FargateServiceArgs>serviceArgs, parentOpts)
            : new awsinfra.x.EC2Service(name, <awsinfra.x.EC2ServiceArgs>serviceArgs, parentOpts);
        this.infraService = service;
        this.service = service.instance;

        const { containerName, loadBalancerProvider } = getLoadBalancerProvider(containers);
        let defaultEndpoint: pulumi.Output<Endpoint>;
        let endpoints: pulumi.Output<Endpoints>;
        if (!loadBalancerProvider || !containerName) {
            defaultEndpoint = pulumi.output(<Endpoint>undefined!);
            endpoints = pulumi.output(<Endpoints>{});
        }
        else {
            const cloudContainer = cloudContainers[containerName];
            const port = cloudContainer.ports![0];
            defaultEndpoint = loadBalancerProvider.defaultEndpoint();
            endpoints = defaultEndpoint.apply(e => ({ [containerName]: { [port.port]: e }}));
        }

        this.defaultEndpoint = defaultEndpoint;
        this.endpoints = endpoints;

        this.getEndpoint = async (containerName, containerPort) => {
            const localEndpoints = endpoints.get();
            return getEndpointHelper(localEndpoints, containerName, containerPort);
        };
    }
}

function getLoadBalancerProvider(containers: Record<string, awsinfra.x.ContainerDefinition>) {
    for (const containerName of Object.keys(containers)) {
        const container = containers[containerName];
        if (container.loadBalancerProvider) {
            return { containerName, loadBalancerProvider: <awsinfra.x.PortInfoLoadBalancerProvider>container.loadBalancerProvider };
        }
    }

    return { containerName: undefined, loadBalancerProvider: undefined };
}

function getEndpointHelper(
    endpoints: Endpoints, containerName: string | undefined, containerPort: number | undefined): Endpoint {

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
}

const volumeNames = new Set<string>();

export interface Volume extends cloud.Volume {
    getVolumeName(): any;
    getHostPath(): any;
}

// _Note_: In the current EFS-backed model, a Volume is purely virtual - it
// doesn't actually manage any underlying resource.  It is used just to provide
// a handle to a folder on the EFS share which can be mounted by container(s).
// On platforms like ACI, we may be able to actually provision a unique File
// Share per Volume to keep these independently manageable.  For now, on AWS
// though, we rely on this File Share having been set up as part of the ECS
// Cluster outside of @pulumi/cloud, and assume that that data has a lifetime
// longer than any individual deployment.
export class SharedVolume extends pulumi.ComponentResource implements Volume, cloud.SharedVolume {
    public readonly kind: cloud.VolumeKind;
    public readonly name: string;

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        if (volumeNames.has(name)) {
            throw new Error("Must provide a unique volume name");
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
        const fileSystem = getFileSystem();
        if (!fileSystem || !fileSystem.mountPath) {
            throw new Error(
                "Cannot use 'Volume'.  Configured cluster does not support EFS.",
            );
        }

        // Include the unique `getVolumeName` in the EFS host path to ensure this doesn't
        // clash with other deployments.
        return `${fileSystem.mountPath}/${this.name}_${this.getVolumeName()}`;
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
    public readonly infraTaskDefinition: awsinfra.x.TaskDefinition;
    public readonly cluster: awsinfra.x.Cluster;
    public readonly taskDefinition: aws.ecs.TaskDefinition;

    public readonly run: (options?: cloud.TaskRunOptions) => Promise<void>;

    constructor(name: string, container: cloud.Container, opts?: pulumi.ResourceOptions) {
        super("cloud:task:Task", name, { container: container }, opts);

        const network = getOrCreateNetwork();
        const cluster = getCluster();
        if (!cluster) {
            throw new Error("Cannot create 'Task'.  Missing cluster config 'cloud-aws:ecsClusterARN'" +
                " or 'cloud-aws:ecsAutoCluster' or 'cloud-aws:useFargate'");
        }

        const parentOpts = { parent: this };

        this.cluster = cluster;
        const containers = createContainers(cluster, { container: container });

        const taskRole = createTaskRole(parentOpts);
        const taskDefArgs = { containers, taskRole };

        const infraTaskDefinition = config.useFargate
            ? new awsinfra.x.FargateTaskDefinition(name, taskDefArgs, parentOpts)
            : new awsinfra.x.EC2TaskDefinition(name, taskDefArgs, parentOpts);

        this.infraTaskDefinition = infraTaskDefinition;
        this.taskDefinition = infraTaskDefinition.instance;
        this.run = async (options: cloud.TaskRunOptions = { }) => {
            options.host = options.host || {};

            const environment = convertEnvironment(options.environment || {});
            infraTaskDefinition.run({ cluster, os: options.host.os, environment });
        };
    }
}

function createTaskRole(opts: pulumi.ResourceOptions): aws.iam.Role {
    const taskRole = new aws.iam.Role(`task`, {
        assumeRolePolicy: JSON.stringify(awsinfra.x.TaskDefinition.defaultRoleAssumeRolePolicy()),
    }, opts);

    // TODO[pulumi/pulumi-cloud#145]: These permissions are used for both Lambda and ECS compute.
    // We need to audit these permissions and potentially provide ways for users to directly configure these.
    const policies = getComputeIAMRolePolicies();
    for (let i = 0; i < policies.length; i++) {
        const policyArn = policies[i];
        const _ = new aws.iam.RolePolicyAttachment(
            `task-${utils.sha1hash(policyArn)}`, {
                role: taskRole,
                policyArn: policyArn,
            }, opts);
    }

    return taskRole;
}

function createContainers(cluster: awsinfra.x.Cluster, containers: Record<string, cloud.Container>): Record<string, awsinfra.x.ContainerDefinition> {
    const result: Record<string, awsinfra.x.ContainerDefinition> = {};
    for (const containerName of Object.keys(containers)) {
        const container = containers[containerName];
        if (container.volumes) {
            throw new Error("container.volumes NYI.");
        }

        result[containerName] = {
            command: container.command,
            cpu: container.cpu,
            dockerLabels: container.dockerLabels,
            environment: pulumi.output(container.environment).apply(e => convertEnvironment(e)),
            memory: container.memory,
            memoryReservation: container.memoryReservation,
            image: container.image,
            imageProvider: createImageProvider(container),
            loadBalancerProvider: createLoadBalancerProvider(cluster, container),
        };
    }

    return result;
}

function createLoadBalancerProvider(cluster: awsinfra.x.Cluster, container: cloud.Container) {
    if (container.ports && container.ports.length > 0) {
        if (container.ports.length >= 2) {
            throw new Error("Only a single port is allowed per container.");
        }

        const port = container.ports[0];
        return awsinfra.x.LoadBalancerProvider.fromPortInfo({
            cluster,
            port: port.port,
            targetPort: port.targetPort,
            protocol: <any>port.protocol,
            external: port.external,
        });
    }

    return undefined;
}

function createImageProvider(container: cloud.Container) {
    if (typeof container.build === "string") {
        return awsinfra.x.ImageProvider.fromPath(container.build);
    }
    else if (container.build) {
        return awsinfra.x.ImageProvider.fromDockerBuild(container.build);
    }
    else if (container.function !== undefined) {
        return awsinfra.x.ImageProvider.fromFunction(container.function);
    }

    return undefined;
}

function convertEnvironment(env: Record<string, string> | undefined) {
    const envMap = env || {};

    const array = Object.keys(envMap).map(name => ({
        name,
        value: envMap[name],
    }));

    return array;
}
