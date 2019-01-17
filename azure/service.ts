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

// tslint:disable:max-line-length

import * as azure from "@pulumi/azure";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";
import * as shared from "./shared";

import * as docker from "@pulumi/docker";
import * as utils from "./utils";

import * as azureContainerSDK from "azure-arm-containerinstance";
import * as msrest from "ms-rest-azure";

export class Service extends pulumi.ComponentResource implements cloud.Service {
    public readonly name: string;
    public readonly group: azure.containerservice.Group;

    public readonly endpoints: pulumi.Output<cloud.Endpoints>;
    public readonly defaultEndpoint: pulumi.Output<cloud.Endpoint>;

    public readonly getEndpoint: (containerName?: string, containerPort?: number) => Promise<cloud.Endpoint>;

    constructor(name: string, args: cloud.ServiceArguments, opts?: pulumi.ResourceOptions) {
        let containers: cloud.Containers;
        if (args.image || args.build || args.function) {
            if (args.containers) {
                throw new Error(
                    "Exactly one of image, build, function, or containers must be used, not multiple");
            }
            containers = { "default": args };
        }
        else if (args.containers) {
            containers = args.containers;
        }
        else {
            throw new Error(
                "Missing one of image, build, function, or containers, specifying this service's containers");
        }

        const replicas = args.replicas === undefined ? 1 : args.replicas;
        if (replicas !== 1) {
            throw new RunError("Only a single replicable is supported in Azure currently.");
        }

        super("cloud:service:Service", name, { }, opts);

        const { group, endpoints, defaultEndpoint } = createGroup(
            this, name, args.host, containers);

        this.group = group;
        this.endpoints = endpoints;
        this.defaultEndpoint = defaultEndpoint;

        this.getEndpoint = async (containerName, containerPort) => {
            return getEndpointHelper(endpoints.get(), containerName, containerPort);
        };

        this.registerOutputs();
    }
}

function getEndpointHelper(
    endpoints: cloud.Endpoints, containerName?: string, containerPort?: number): cloud.Endpoint {

    containerName = containerName || Object.keys(endpoints)[0];
    if (!containerName)  {
        throw new RunError(`No containers available in this service`);
    }

    const containerPorts = endpoints[containerName] || {};
    containerPort = containerPort || +Object.keys(containerPorts)[0];
    if (!containerPort) {
        throw new RunError(`No ports available in service container ${containerName}`);
    }

    const endpoint = containerPorts[containerPort];
    if (!endpoint) {
        throw new RunError(`No exposed port for ${containerName} port ${containerPort}`);
    }

    return endpoint;
}

// AzureContainer and AzureCredentials are just extracted sub-portions of
// azure.containerservice.GroupArgs.  This was done to make it easy to type check small
// objets as we're building them up before making the final Group.

interface AzureContainer {
    commands?: pulumi.Input<string[]>;
    cpu: pulumi.Input<number>;
    environmentVariables?: pulumi.Input<{
        [key: string]: any;
    }>;
    image: pulumi.Input<string>;
    memory: pulumi.Input<number>;
    name: pulumi.Input<string>;
    port?: pulumi.Input<number>;
    protocol?: pulumi.Input<string>;
    volumes?: pulumi.Input<pulumi.Input<{
        mountPath: pulumi.Input<string>;
        name: pulumi.Input<string>;
        readOnly?: pulumi.Input<boolean>;
        shareName: pulumi.Input<string>;
        storageAccountKey: pulumi.Input<string>;
        storageAccountName: pulumi.Input<string>;
    }>[]>;
}

interface AzureCredentials {
    password: pulumi.Input<string>;
    server: pulumi.Input<string>;
    username: pulumi.Input<string>;
}

interface GroupInfo {
    group: azure.containerservice.Group;
    endpoints: pulumi.Output<cloud.Endpoints>;
    defaultEndpoint: pulumi.Output<cloud.Endpoint>;
}

interface ExposedPorts {
    [name: string]: {
        [port: string]: number;
    };
}

function createGroup(
        parent: pulumi.Resource,
        name: string,
        props: cloud.HostProperties | undefined,
        containers: cloud.Containers): GroupInfo {

    const disallowedChars = /[^-a-zA-Z0-9]/g;

    props = props || {};
    const azureContainers: AzureContainer[] = [];
    let credentials: AzureCredentials[] | undefined;

    let firstContainerName: string | undefined;
    let firstContainerPort: number | undefined;
    const exposedPorts: ExposedPorts = {};

    for (const containerName of Object.keys(containers)) {
        const container = containers[containerName];

        if (firstContainerName === undefined) {
            firstContainerName = containerName;
        }

        const ports = container.ports;

        let hostPortNumber: number | undefined;
        let targetPortNumber: number | undefined;
        let protocol: string | undefined;
        let isPublic: boolean | undefined;
        if (ports) {
            if (ports.length >= 2) {
                throw new RunError("Only zero or one port can be provided with a container: " + containerName);
            }

            if (ports.length === 1) {
                const port = ports[0];
                hostPortNumber = port.port;
                targetPortNumber = port.targetPort !== undefined ? port.targetPort : hostPortNumber;
                protocol = port.protocol;

                if (targetPortNumber !== hostPortNumber) {
                    throw new RunError("Mapping a host port to a different target port is not supported in Azure currently.");
                }

                if (containerName === firstContainerName) {
                    firstContainerPort = targetPortNumber;
                }

                const external = port.external === undefined ? false : port.external;
                if (isPublic === undefined) {
                    // first port we're seeing.  set the isPublic value based on that.
                    isPublic = external;
                }
                else if (isPublic !== external) {
                    // have an existing port.  Values have to match.
                    throw new RunError("All ports must have a matching [external] value.");
                }
            }
        }

        if (isPublic === false) {
            throw new RunError("Only public ip address types are supported by Azure currently.");
        }

        const { imageOptions, registry } = computeImageOptionsAndRegistry(this, container);

        const memoryInGB = pulumi.output(container.memoryReservation).apply(
            r => r === undefined ? 1 : r / 1024);

        const qualifiedName = (name + "-" + containerName).replace(disallowedChars, "-");
        azureContainers.push({
            name: qualifiedName,
            cpu: pulumi.output(container.cpu).apply(c => c === undefined ? 1 : c),
            memory: memoryInGB,
            port: targetPortNumber,
            protocol: protocol,
            image: imageOptions.apply(io => io.image),
            environmentVariables: imageOptions.apply(io => io.environment),
            commands: container.command,
        });

        credentials = credentials || (registry
            ? [{ password: registry.adminPassword, server: registry.loginServer, username: registry.adminUsername }]
            : undefined);

        if (targetPortNumber !== undefined) {
            exposedPorts[containerName] = { [targetPortNumber]: hostPortNumber! };
        }
    }

    const group = new azure.containerservice.Group(
        name.replace(disallowedChars, "-"), {
            containers: azureContainers,
            location: shared.location,
            resourceGroupName: shared.globalResourceGroupName,
            osType: getOS(props),
            imageRegistryCredentials: credentials,
            ipAddressType: "Public",
        }, { parent: parent });

    const endpoints = getEndpoints(exposedPorts, group);
    const defaultEndpoint = firstContainerName === undefined || firstContainerPort === undefined
        ? pulumi.output<cloud.Endpoint>(undefined!)
        : endpoints.apply(
            ep => getEndpointHelper(ep));

    return { group, endpoints, defaultEndpoint };
}

function getEndpoints(ports: ExposedPorts, group: azure.containerservice.Group): pulumi.Output<cloud.Endpoints> {
    return pulumi.all(utils.apply(ports, targetPortToHostPort => {
        const inner: pulumi.Output<{ [port: string]: cloud.Endpoint }> =
            pulumi.all(utils.apply(targetPortToHostPort, hostPort =>
                group.ipAddress.apply(ip => ({
                    port: hostPort, hostname: ip,
                }))));

        return inner;
    }));
}

/**
 * A Task represents a container which can be [run] dynamically whenever (and as many times as)
 * needed.
 */
export class Task extends pulumi.ComponentResource implements cloud.Task {
    public readonly run: (options?: cloud.TaskRunOptions) => Promise<void>;

    constructor(name: string, container: cloud.Container, opts?: pulumi.ResourceOptions) {
        super("cloud:task:Task", name, { }, opts);

        if (container.ports && container.ports.length > 0) {
            throw new RunError("Tasks should not be given any [ports] in their Container definition.");
        }

        const { imageOptions, registry } = computeImageOptionsAndRegistry(this, container);

        const globalResourceGroupName = shared.globalResourceGroupName;
        const memory = pulumi.output(container.memoryReservation);

        // Require the client credentials at deployment time so we can fail up-front if they are not
        // provided.
        const config = new pulumi.Config("cloud-azure");
        const subscriptionId = config.require("subscriptionId");
        const clientId = config.require("clientId");
        const clientSecret = config.require("clientSecret");
        const tenantId = config.require("tenantId");

        this.run = async (options) => {
            try {
                options = options || {};

                // For now, we use Service Principal Authentication:
                // https://github.com/Azure/azure-sdk-for-node/blob/master/Documentation/Authentication.md#service-principal-authentication
                //
                // We should consider supporting other forms (including Managed Service Identity) in
                // the future.
                const clientCredentials: any = await new Promise((resolve, reject) => {
                    msrest.loginWithServicePrincipalSecret(
                        clientId,
                        clientSecret,
                        tenantId,
                        (err, credentials) => {
                            if (err) {
                                return reject(err);
                            }

                            resolve(credentials);
                        },
                    );
                });

                const client = new azureContainerSDK.ContainerInstanceManagementClient(
                    clientCredentials, subscriptionId);

                // Join the environment options specified by the image, along with any options
                // provided by the caller of [Task.run].
                const imageOpts = imageOptions.get();
                let envMap = imageOpts.environment;
                if (options.environment) {
                    envMap = Object.assign(options.environment, envMap);
                }

                // Convert the environment to the form that azure needs.
                const env = Object.keys(envMap).map(k => ({ name: k, value: envMap[k] }));

                const containerCredentials = registry
                    ? [{ server: registry.loginServer.get(), username: registry.adminUsername.get(), password: registry.adminPassword.get() }]
                    : undefined;

                const uniqueName = createUniqueContainerName(name);
                const group = await client.containerGroups.createOrUpdate(
                    globalResourceGroupName.get(),
                    uniqueName, {
                        location: shared.location,
                        osType: getOS(options.host),
                        containers: [{
                            name: uniqueName,
                            image: imageOpts.image,
                            environmentVariables: env,
                            resources: {
                                requests: {
                                    cpu: 1,
                                    memoryInGB: memory.get() || 1,
                                },
                            },
                        }],
                        imageRegistryCredentials: containerCredentials,
                        // We specify 'Never' as the restart policy because we want a Task to
                        // launch, execute once, and be done.  Note: this means that the account
                        // will generally fill up with terminated container instances.  This Azure
                        // feedback issue tracks Azure adding a facility for these to be
                        // automatically cleaned up:
                        // https://feedback.azure.com/forums/602224-azure-container-instances/suggestions/34066633-support-auto-delete-of-aci-when-container-exits-no
                        //
                        // In the meantime, we should consider if we should have some mechanism that
                        // does this on behalf of the user.  For example, we could store the name
                        // of this ephemeral instance somewhere.  Then, with each Task.run we could
                        // enumerate that list and attempt to cleanup any terminated instances.
                        restartPolicy: "Never",
                    });
            }
            catch (err) {
                console.log("Error: " + JSON.stringify(err, null, 2));
                throw err;
            }
        };

        this.registerOutputs();
    }
}

function getOS(props: cloud.HostProperties | undefined) {
    return props && props.os ? props.os : "Linux";
}

function createUniqueContainerName(name: string) {
    const uniqueName = name + shared.sha1hash(Math.random().toString());

    // Azure requires container names to be all lowercase.
    return uniqueName.toLowerCase();
}

export class SharedVolume extends pulumi.ComponentResource implements cloud.SharedVolume {
    public readonly kind: cloud.VolumeKind;
    public readonly name: string;

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:volume:Volume", name, {}, opts);

        throw new Error("Method not implemented.");

        this.registerOutputs();
    }
}

export class HostPathVolume implements cloud.HostPathVolume {
    public readonly kind: cloud.VolumeKind;
    public readonly path: string;

    constructor(path: string) {
        this.kind = "HostPathVolume";
        this.path = path;
    }
}

function getBuildImageName(build: string | cloud.ContainerBuild) {
    // Produce a hash of the build context and use that for the image name.
    let buildSig: string;
    if (typeof build === "string") {
        buildSig = build;
    }
    else {
        buildSig = build.context || ".";
        if (build.dockerfile) {
            buildSig += `;dockerfile=${build.dockerfile}`;
        }
        if (build.args) {
            for (const arg of Object.keys(build.args)) {
                buildSig += `;arg[${arg}]=${build.args[arg]}`;
            }
        }
    }

    // The container name must contain no more than 63 characters and must match the regex
    // '[a-z0-9]([-a-z0-9]*[a-z0-9])?' (e.g. 'my-name')."
    const imageName = shared.createNameWithStackInfo(`container-${shared.sha1hash(buildSig)}`, 63, "-");
    const disallowedChars = /[^-a-zA-Z0-9]/g;
    return imageName.replace(disallowedChars, "-");
}

let globalRegistry: azure.containerservice.Registry | undefined;
function getOrCreateGlobalRegistry(): azure.containerservice.Registry {
    if (!globalRegistry) {
        globalRegistry = new azure.containerservice.Registry("global", {
            resourceGroupName: shared.globalResourceGroupName,
            location: shared.location,

            // We need the admin account enabled so that we can grab the name/password to send to
            // docker.  We could consider an approach whereby this was not enabled, but it was
            // conditionally enabled/disabled on demand when needed.
            adminEnabled: true,

            sku: "Standard",
        }, { parent: shared.getGlobalInfrastructureResource() });
    }

    return globalRegistry;
}

// buildImageCache remembers the digests for all past built images, keyed by image name.
const buildImageCache = new Map<string, pulumi.Output<string>>();

interface ImageOptions {
    image: string;
    environment: Record<string, string>;
}

function computeImageOptionsAndRegistry(
    parent: pulumi.Resource,
    container: cloud.Container) {

    // Start with a copy from the container specification.
    const preEnv: Record<string, pulumi.Input<string>> =
        Object.assign({}, container.environment || {});

    if (container.build) {
        return computeImageFromBuild(parent, preEnv, container.build);
    }
    else if (container.image) {
        return { imageOptions: createImageOptions(container.image, preEnv), registry: undefined };
    }
    else if (container.function) {
        return { imageOptions: computeImageFromFunction(container.function, preEnv), registry: undefined };
    }
    else {
        throw new RunError("Invalid container definition: `image`, `build`, or `function` must be provided");
    }
}

function computeImageFromBuild(
    parent: pulumi.Resource,
    preEnv: Record<string, pulumi.Input<string>>,
    build: string | cloud.ContainerBuild) {

    const imageName = getBuildImageName(build);
    const registry = getOrCreateGlobalRegistry();

    // This is a container to build; produce a name, either user-specified or auto-computed.
    pulumi.log.debug(`Building container image at '${build}'`, registry);

    const dockerRegistry = pulumi.output({
        registry: registry.loginServer,
        username: registry.adminUsername,
        password: registry.adminPassword,
    });

    const imageOptions = pulumi.all([registry.loginServer, dockerRegistry]).apply(([loginServer, dockerRegistry]) =>
        computeImageFromBuildWorker(preEnv, build, imageName, loginServer + "/" + imageName, dockerRegistry, parent));

    return { imageOptions, registry };
}

function computeImageFromBuildWorker(
    preEnv: Record<string, pulumi.Input<string>>,
    build: string | cloud.ContainerBuild,
    imageName: string,
    repositoryUrl: string,
    dockerRegistry: docker.Registry,
    logResource: pulumi.Resource): pulumi.Output<ImageOptions> {

    let uniqueImageName = buildImageCache.get(imageName);
    // See if we've already built this.
    if (uniqueImageName) {
        uniqueImageName.apply(d =>
            pulumi.log.debug(`    already built: ${imageName} (${d})`, logResource));
    }
    else {
        // If we haven't, build and push the local build context to the azure docker repository.
        // Then return the unique name given to this image in that repository. The name will change
        // if the image changes ensuring the TaskDefinition get's replaced IFF the built image
        // changes.
        uniqueImageName = docker.buildAndPushImage(
            imageName, build, repositoryUrl, logResource,
            async () => dockerRegistry);

        uniqueImageName.apply(d =>
            pulumi.log.debug(`    build complete: ${imageName} (${d})`, logResource));
    }

    return createImageOptions(uniqueImageName, preEnv);
}

function computeImageFromFunction(
    func: () => void,
    preEnv: Record<string, pulumi.Input<string>>): pulumi.Output<ImageOptions> {

    // TODO[pulumi/pulumi-cloud#85]: Put this in a real Pulumi-owned Docker image.
    // TODO[pulumi/pulumi-cloud#86]: Pass the full local zipped folder through to the container (via S3?)
    preEnv.PULUMI_SRC = pulumi.runtime.serializeFunctionAsync(func);

    // TODO[pulumi/pulumi-cloud#85]: move this to a Pulumi Docker Hub account.
    return createImageOptions("lukehoban/nodejsrunner", preEnv);
}

function createImageOptions(
    image: pulumi.Input<string>,
    environment: Record<string, pulumi.Input<string>>): pulumi.Output<ImageOptions> {

    return pulumi.output({ image, environment });
}
