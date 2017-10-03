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
     * The command line that is passed to the container. This parameter maps to
     * `Cmd` in the [Create a
     * container](https://docs.docker.com/engine/reference/api/docker_remote_api_v1.19/#create-a-container)
     * section of the [Docker Remote
     * API](https://docs.docker.com/engine/reference/api/docker_remote_api_v1.19/)
     * and the `COMMAND` parameter to [docker run](docker run). For more information about the
     * Docker `CMD` parameter, go to
     * https://docs.docker.com/engine/reference/builder/#cmd.
     */
    command?: string[];
}

/**
 * A shared file system that can be mounted into one or more containers.
 */
export interface FileSystem {}

export interface FileSystemConstructor {
    /**
     * Construct a new FileSystem with the given unique name.
     */
    new (name: string): FileSystem;
}

export let FileSystem: FileSystemConstructor; // tslint:disable-line

export interface ServiceArguments {
    containers: Containers;
    scale?: number;
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
     * The exposed host and port for connecting to the given containerIndex on
     * the given containerPort.
     */
    getHostAndPort(containerName: string, containerPort: number): Promise<string>;
}

export interface ServiceConstructor {
    new (name: string, args: ServiceArguments): Service;
}

export let Service: ServiceConstructor; // tslint:disable-line
