// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";

/**
 * A collection of Containers
 */
export interface Containers {
    [name: string]: Container;
}

export type HostOperatingSystem = "linux" | "windows";

/**
 * HostProperties describes the kind of host where a service or task can run.
 */
export interface HostProperties {
    /**
     * The operating system of the host.
     *
     * Default is "linux".
     */
    os?: HostOperatingSystem;
}

/**
 * Container specifies the metadata for a component of a Service.
 */
export interface Container {
    /**
     * The image to use for the container. Exactly one of `image`, `build`, and
     * `function` must be specified.
     */
    image?: string;
    /**
     * A path to a folder within the current program directory where a Docker
     * build should be run to construct the image for this Container and any
     * arguments that should be passed to the build. Exactly one of `image`,
     * `build`, and `function` must be specified.
     */
    build?: {path: string; args: {[name: string]: string}};
    /**
     * Optional environment variables to set and make available to the container
     * as it is running.
     */
    environment?: {[name: string]: pulumi.ComputedValue<string>};
    /**
     * The function code to use as the implementation of the contaner. Exactly
     * one of `image`, `build`, and `function` must be specified.
     */
    function?: () => void;
    /**
     * The maximum amount of memory the container will be allowed to use. Maps to the Docker
     * `--memory` option - see
     * https://docs.docker.com/engine/reference/commandline/run.
     */
    memory?: number;
    /**
     * The amount of memory to reserve for the container, but the container will
     * be allowed to use more memory if it's available.  At least one of
     * `memory` and `memorReservation` must be specified.  Maps to the Docker
     * `--memory-reservation` option - see
     * https://docs.docker.com/engine/reference/commandline/run.
     */
    memoryReservation?: number;
    /**
     * An array of ports to publish from the container.  Ports are exposed using the TCP protocol.  If the [external]
     * flag is true, the port will be exposed to the Internet even if the service is running in a private network.
     * Maps to the Docker `--publish` option - see
     * https://docs.docker.com/engine/reference/commandline/run.
     */
    ports?: {port: number, external?: boolean}[];
    /**
     * An array of volume mounts, indicating a volume to mount and a path within
     * the container at which to moung the volume.  Maps to the Docker
     * `--volume` option - see
     * https://docs.docker.com/engine/reference/commandline/run.
     */
    volumes?: ContainerVolumeMount[];
    /**
     * The command line that is passed to the container. This parameter maps to
     * `Cmd` in the [Create a
     * container](https://docs.docker.com/engine/reference/api/docker_remote_api_v1.19/#create-a-container)
     * section of the [Docker Remote
     * API](https://docs.docker.com/engine/reference/api/docker_remote_api_v1.19/)
     * and the `COMMAND` parameter to [docker run](docker run). For more
     * information about the Docker `CMD` parameter, go to
     * https://docs.docker.com/engine/reference/builder/#cmd.
     */
    command?: string[];
}

export interface ContainerVolumeMount {
    containerPath: string;
    sourceVolume: Volume;
}

export type VolumeKind = "SharedVolume" | "HostPathVolume";

export interface Volume {
    kind: VolumeKind;
}

/**
 * A shared volume that can be mounted into one or more containers.
 */
export interface SharedVolume extends Volume {
    /*
     * The unique name of the volume.
     */
    name: string;
}

export interface SharedVolumeConstructor {
    /**
     * Construct a new Volume with the given unique name.
     */
    new (name: string): SharedVolume;

    // TODO[pulumi/pulumi-cloud#84] - Likely important features:
    // backupToBucket(bucket: Bucket): Promise<void>
    // restoreFromBucket(bucket: Bucket): Promise<void>
}

export let SharedVolume: SharedVolumeConstructor; // tslint:disable-line

/**
 * A volume mounted from a path on the host machine.
 *
 * _Note_: This is an emphemeral volume which will not persist across container restarts or
 * across different hosts.  This is not something that most containers will need, but it offers
 * a powerful escape hatch for some applications.
 */
export interface HostPathVolume extends Volume {
    /*
     * The unique name of the volume.
     */
    path: string;
}

export interface HostPathVolumeConstructor {
    /**
     * Construct a new Volume with the given unique name.
     */
    new (path: string): HostPathVolume;
}

export let HostPathVolume: HostPathVolumeConstructor; // tslint:disable-line

/**
 * The arguments to construct a Service object.
 */
export interface ServiceArguments {
    /**
     * The collection of containers that will be deployed as part of this
     * Service.
     */
    containers: Containers;
    /**
     * The number of copies of this Service's containers to deploy and maintain
     * as part of the running service.  Defaults to `1`.
     */
    replicas?: number;
    /**
     * The properties of the host where this service can run.
     */
    host?: HostProperties;
}

export interface Endpoint {
    hostname: string;
    port: number;
}

/**
 * A persistent service running as part of the Pulumi Cloud application. A
 * collection of container specifications are provided to define the compute
 * that will run inside this service.
 */
export interface Service {
    name: string;

    // Inside API

    /**
     * The exposed hostname and port for connecting to the given containerName
     * on the given containerPort.  If containerName is not provided, the first
     * container in the service is used.  If containerPort is not provided, the
     * first exposed port is used.
     */
    getEndpoint(containerName?: string, containerPort?: number): Promise<Endpoint>;
}

export interface ServiceConstructor {
    new (name: string, args: ServiceArguments): Service;
}

export let Service: ServiceConstructor; // tslint:disable-line


/**
 * Arguments to use for initializing a single run of the Task
 */
export interface TaskRunOptions {
    /**
     * Optional environment variables to override those set in the container definition.
     */
    environment?: {[name: string]: pulumi.ComputedValue<string>};
    /**
     * The properties of the host where this task can run.
     */
    host?: HostProperties;
}

/**
 * A Task represents a container which can be [run] dynamically whenever (and
 * as many times as) needed.
 */
export interface Task {
    /**
     * Run the task, passing in additional task run options.
     */
    run(options?: TaskRunOptions): Promise<void>;
}

export interface TaskConstructor {
    new (name: string, container: Container): Task;
}

export let Task: TaskConstructor; // tslint:disable-line
