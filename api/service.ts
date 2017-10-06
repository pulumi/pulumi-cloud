// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

export interface Containers {
    [name: string]: Container;
}

/**
 * Container specifies the metadata for a component of a Service.
 */
export interface Container {
    /**
     * The image to use for the container.
     */
    image: string;
    /**
     * The amount of memory to reserve for the container.
     */
    memory: number;
    /**
     * An array of port mappings, indicating the container port to expose and
     * the protocal that is used on that port.
     */
    portMappings?: {containerPort: number; protocol?: string}[];
    /**
     * An array of volume mounts, indicating a volume to mount and a path within
     * the container at which to moung the volume.
     */
    mountPoints?: {containerPath: string; sourceVolume: Volume}[];
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

/**
 * A shared volume that can be mounted into one or more containers.
 */
export interface Volume {
    /*
     * The unique name of the volume.
     */
    name: string;
}

export interface VolumeConstructor {
    /**
     * Construct a new Volume with the given unique name.
     */
    new (name: string): Volume;

    // TODO - Likely important features:
    // backupToBucket(bucket: Bucket): Promise<void>
    // restoreFromBucket(bucket: Bucket): Promise<void>
}

export let Volume: VolumeConstructor; // tslint:disable-line

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
     * The number of copies of this Service's contaienrs to deploy and maintain
     * as part of the running service.  Defaults to `1`.
     */
    scale?: number;
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
    environment: { [name: string]: string};
}

/**
 * A Task represents a containers which can be [run] dynamically whenever (and
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
