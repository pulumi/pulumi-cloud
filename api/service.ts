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

import * as pulumi from "@pulumi/pulumi";

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
     * The image to use for the container.  If `image` is specified, but not `build`, the image will be
     * pulled from the Docker Hub.  If `image` *and* `build` are specified, the `image` controls the
     * resulting image tag for the build image that gets pushed.
     */
    image?: string;
    /**
     * Either a path to a folder in which a Docker build should be run to construct the image for this
     * Container, or a ContainerBuild object with more detailed build instructions.  If `image` is also specified, the
     * built container will be tagged with that name, but otherwise will get an auto-generated image name.
     */
    build?: string | ContainerBuild;
    /**
     * The function code to use as the implementation of the contaner.  If `function` is specified,
     * neither `image` nor `build` are legal.
     */
    function?: () => void;

    /**
     * Optional environment variables to set and make available to the container
     * as it is running.
     */
    environment?: {[name: string]: pulumi.Input<string>};
    /**
     * The maximum amount of memory the container will be allowed to use. Maps to the Docker
     * `--memory` option - see
     * https://docs.docker.com/engine/reference/commandline/run.
     */
    memory?: pulumi.Input<number>;
    /**
     * The amount of memory to reserve for the container, but the container will
     * be allowed to use more memory if it's available.  At least one of
     * `memory` and `memoryReservation` must be specified.  Maps to the Docker
     * `--memory-reservation` option - see
     * https://docs.docker.com/engine/reference/commandline/run.
     */
    memoryReservation?: pulumi.Input<number>;
    /**
     * An array of ports to publish from the container.  Ports are exposed using the TCP protocol.  If the [external]
     * flag is true, the port will be exposed to the Internet even if the service is running in a private network.
     * Maps to the Docker `--publish` option - see
     * https://docs.docker.com/engine/reference/commandline/run.
     */
    ports?: ContainerPort[];
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
     * and the `COMMAND` parameter to [docker run](https://docs.docker.com/engine/reference/commandline/run/). For more
     * information about the Docker `CMD` parameter, go to
     * https://docs.docker.com/engine/reference/builder/#cmd.
     */
    command?: pulumi.Input<string[]>;
    /**
     * A key/value map of labels to add to the container. This parameter maps to Labels in the [Create a
     * container](https://docs.docker.com/engine/api/v1.27/#operation/ContainerCreate) section of the [Docker Remote
     * API](https://docs.docker.com/engine/api/v1.27/) and the --label option to [docker
     * run](https://docs.docker.com/engine/reference/run/).
     */
    dockerLabels?: pulumi.Input<{[name: string]: string}>;
}

/**
 * CacheFrom may be used to specify build stages to use for the Docker build cache. The final image is always
 * implicitly included.
 */
export interface CacheFrom {
    /**
     * An optional list of build stages to use for caching. Each build stage in this list will be built explicitly and
     * pushed to the target repository. A given stage's image will be tagged as "[stage-name]".
     */
    stages?: string[];
}

/**
 * ContainerBuild may be used to specify detailed instructions about how to build a container.
 */
export interface ContainerBuild {
    /**
     * context is a path to a directory to use for the Docker build context, usually the directory in which the
     * Dockerfile resides (although dockerfile may be used to choose a custom location independent of this choice).
     * If not specified, the context defaults to the current working directory; if a relative path is used, it
     * is relative to the current working directory that Pulumi is evaluating.
     */
    context?: string;
    /**
     * dockerfile may be used to override the default Dockerfile name and/or location.  By default, it is assumed
     * to be a file named Dockerfile in the root of the build context.
     */
    dockerfile?: string;
    /**
     * An optional map of named build-time argument variables to set during the Docker build.  This flag allows you
     * to pass built-time variables that can be accessed like environment variables inside the `RUN` instruction.
     */
    args?: {[key: string]: string};
    /**
     * An optional CacheFrom object with information about the build stages to use for the Docker build cache.
     * This parameter maps to the --cache-from argument to the Docker CLI. If this parameter is `true`, only the final
     * image will be pulled and passed to --cache-from; if it is a CacheFrom object, the stages named therein will
     * also be pulled and passed to --cache-from.
     */
    cacheFrom?: boolean | CacheFrom;
}
/**
 * ContainerPort represents the information about how to expose a container port on a [Service].
*/
export interface ContainerPort {
    /**
     * The incoming port where the service exposes the endpoint.
    */
    port: number;
    /**
     * The target port on the backing container.  Defaults to the value of [port].
    */
    targetPort?: number;
    /**
     * Whether the port should be exposed externally.  Defaults to `false`.
    */
    external?: boolean;
    /**
     * The protocol to use for exposing the service:
     * * `tcp`: Expose TCP externaly and to the container.
     * * `udp`: Expose UDP externally and to the container.
     * * `http`: Expose HTTP externally and to the container.
     * * `https`: Expose HTTPS externally and HTTP to the container.
     */
    protocol?: ContainerProtocol;
}

export type ContainerProtocol = "tcp" | "udp" | "http" | "https";

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
     *
     * @param name The unique name of the volume.
     * @param opts A bag of options that controls how this resource behaves.
     */
    new (name: string, opts?: pulumi.ResourceOptions): SharedVolume;
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
 * The arguments to construct a Service object. These arguments may include container information, for simple
 * single-container scenarios, or you may specify that information using the containers property. If a single container
 * is specified in-line, it is implicitly given the name "default".
 */
export interface ServiceArguments extends Container {
    /**
     * A collection of containers that will be deployed as part of this Service, if there are multiple.
     */
    containers?: Containers;
    /**
     * The number of copies of this Service's containers to deploy and maintain
     * as part of the running service.  Defaults to `1`.
     */
    replicas?: number;
    /**
     * The properties of the host where this service can run.
     */
    host?: HostProperties;
    /**
     *
     * Determines whether the service should wait to fully transition to a new steady state on creation and updates. If
     * set to false, the service may complete its deployment before it is fully ready to be used. Defaults to 'true'.
     */
    waitForSteadyState?: boolean;
}

export interface Endpoint {
    hostname: string;
    port: number;
}

export interface Endpoints {
    [containerName: string]: {
        [port: number]: Endpoint;
    };
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
     * on the given containerPort.
     */
    endpoints: pulumi.Output<Endpoints>;

    /**
     * The primary endpoint exposed by the service.  All endpoints (including this one)
     * can also be retrieved by using the 'Service.endpoints' property.  Note: this value
     * may not be present if the service does not actually expose any endpoints.
     */
    defaultEndpoint: pulumi.Output<Endpoint>;

    /**
      * The exposed hostname and port for connecting to the given containerName
     * on the given containerPort.  If containerName is not provided, the first
     * container in the service is used.  If containerPort is not provided, the
     * first exposed port is used.
     *
     * Only usable on the inside.
      */
    getEndpoint(containerName?: string, containerPort?: number): Promise<Endpoint>;
}

export interface ServiceConstructor {
    /**
     * Construct a new Service, which is one or more managed replicas of a group of one or more Containers.
     *
     * @param name The unique name of the service.
     * @param opts A bag of options that controls how this resource behaves.
     */
    new (name: string, args: ServiceArguments, opts?: pulumi.ResourceOptions): Service;
}

export let Service: ServiceConstructor; // tslint:disable-line


/**
 * Arguments to use for initializing a single run of the Task
 */
export interface TaskRunOptions {
    /**
     * Optional environment variables to override those set in the container definition.
     */
    environment?: Record<string, string>;
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
    /**
     * Construct a new Task, which is a Container that can be run many times as individual tasks.
     *
     * @param name The unique name of the task.
     * @param container The container specification.
     * @param opts A bag of options that controls how this resource behaves.
     */
    new (name: string, container: Container, opts?: pulumi.ResourceOptions): Task;
}

export let Task: TaskConstructor; // tslint:disable-line
