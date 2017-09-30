// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/**
 * Container specifies the metadata for a component of a Service.
 */
export interface Container {
    /**
     * The name of the container.
     */
    name: string;
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
    getHostAndPort(containerIndex: number, containerPort: number): Promise<string>;
}

export interface ServiceConstructor {
    new (name: string, ...containeers: Container[]): Service;
}

export let Service: ServiceConstructor; // tslint:disable-line
