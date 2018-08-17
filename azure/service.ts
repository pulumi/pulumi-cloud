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
import * as config from "./config";

export class Service extends pulumi.ComponentResource implements cloud.Service {
    public readonly name: string;

    public readonly endpoints: pulumi.Output<cloud.Endpoints>;
    public readonly defaultEndpoint: pulumi.Output<cloud.Endpoint>;

    public readonly getEndpoint: (containerName?: string, containerPort?: number) => Promise<cloud.Endpoint>;

    constructor(name: string, args: cloud.ServiceArguments, opts?: pulumi.ResourceOptions) {
        super("cloud:service:Service", name, {}, opts);

        this.getEndpoint = _ => { throw new Error("Method not implemented."); };

        throw new Error("Method not implemented.");
    }
}

/**
 * A Task represents a container which can be [run] dynamically whenever (and as many times as)
 * needed.
 */
export class Task extends pulumi.ComponentResource implements cloud.Task {
    public readonly run: (options?: cloud.TaskRunOptions) => Promise<void>;

    constructor(name: string, container: cloud.Container, opts?: pulumi.ResourceOptions) {
        super("cloud:task:Task", name, { container: container }, opts);

        if (container.ports && container.ports.length > 0) {
            throw new RunError("Tasks should not be given any [ports] in their Container definition.");
        }

        const imageName = getImageName(container);
        if (!imageName) {
            throw new Error("[getImageName] should have always produced an image name.");
        }

        const registry = container.build ? getOrCreateGlobalRegistry() : undefined;

        const imageOptions = computeImage(imageName, container, registry);

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
            // Retrieve the azure SDKs at runtime.  We'll use them to call into azure to create and
            // launch a container instance.
            const azureContainerSDK = await import("azure-arm-containerinstance");
            const msrest = await import("ms-rest-azure");

            try {
                options = options || {};
                options.host = options.host || {};

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
                        osType: options.host.os || "Linux",
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
    }
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

// getImageName generates an image name from a container definition.  It uses a combination of the
// container's name and container specification to normalize the names of resulting repositories.
// Notably, this leads to better caching in the event that multiple container specifications exist
// that build the same location on disk.
//
// TODO(cyrusn): Share this with AWS impl.
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
            if (container.build.dockerfile) {
                buildSig += `;dockerfile=${container.build.dockerfile}`;
            }
            if (container.build.args) {
                for (const arg of Object.keys(container.build.args)) {
                    buildSig += `;arg[${arg}]=${container.build.args[arg]}`;
                }
            }
        }

        // The container name must contain no more than 63 characters and must match the regex
        // '[a-z0-9]([-a-z0-9]*[a-z0-9])?' (e.g. 'my-name')."
        const imageName = shared.createNameWithStackInfo(`${shared.sha1hash(buildSig)}container`, 63);
        const disallowedChars = /[^a-zA-Z0-9]/g;
        return imageName.replace(disallowedChars, "");
    }
    else if (container.function) {
        // TODO[pulumi/pulumi-cloud#85]: move this to a Pulumi Docker Hub account.
        return "lukehoban/nodejsrunner";
    }
    else {
        throw new RunError("Invalid container definition: `image`, `build`, or `function` must be provided");
    }
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

function computeImage(
    imageName: string,
    container: cloud.Container,
    repository: azure.containerservice.Registry | undefined): pulumi.Output<ImageOptions> {

    // Start with a copy from the container specification.
    const preEnv: Record<string, pulumi.Input<string>> =
        Object.assign({}, container.environment || {});

    if (container.build) {
        if (!repository) {
            throw new RunError("Expected a container repository for build image");
        }

        return computeImageFromBuild(preEnv, container.build, imageName, repository);
    }
    else if (container.image) {
        return computeImageFromImage(preEnv, imageName);
    }
    else if (container.function) {
        return computeImageFromFunction(container.function, preEnv, imageName);
    }
    else {
        throw new RunError("Invalid container definition: `image`, `build`, or `function` must be provided");
    }
}

function computeImageFromBuild(
    preEnv: Record<string, pulumi.Input<string>>,
    build: string | cloud.ContainerBuild,
    imageName: string,
    registry: azure.containerservice.Registry): pulumi.Output<ImageOptions> {

    // This is a container to build; produce a name, either user-specified or auto-computed.
    pulumi.log.debug(`Building container image at '${build}'`, registry);

    const dockerRegistry =
        pulumi.all([registry.loginServer, registry.adminUsername, registry.adminPassword])
            .apply(([loginServer, username, password]) => ({ registry: loginServer, username, password }));

    return pulumi.all([registry.loginServer, dockerRegistry]).apply(([loginServer, dockerRegistry]) =>
        computeImageFromBuildWorker(
            preEnv, build, imageName, loginServer + "/" + imageName, dockerRegistry, registry));
}

function computeImageFromBuildWorker(
    preEnv: Record<string, pulumi.Input<string>>,
    build: string | cloud.ContainerBuild,
    imageName: string,
    repositoryUrl: string,
    dockerRegistry: docker.Registry,
    logResource: pulumi.Resource): pulumi.Output<ImageOptions> {

    let imageDigest = buildImageCache.get(imageName);
    // See if we've already built this.
    if (imageDigest) {
        imageDigest.apply(d =>
            pulumi.log.debug(`    already built: ${imageName} (${d})`, logResource));
    } else {
        // If we haven't, build and push the local build context to the ECR repository, wait for
        // that to complete, then return the image name pointing to the ECT repository along
        // with an environment variable for the image digest to ensure the TaskDefinition get's
        // replaced IFF the built image changes.
        imageDigest = docker.buildAndPushImage(
            imageName, build, repositoryUrl, logResource,
            async () => dockerRegistry);

        imageDigest.apply(d =>
            pulumi.log.debug(`    build complete: ${imageName} (${d})`, logResource));
    }

    preEnv.IMAGE_DIGEST = imageDigest;
    return createImageOptions(repositoryUrl, preEnv);
}

function computeImageFromImage(
    preEnv: Record<string, pulumi.Input<string>>,
    imageName: string): pulumi.Output<ImageOptions> {

    return createImageOptions(imageName, preEnv);
}

function computeImageFromFunction(
    func: () => void,
    preEnv: Record<string, pulumi.Input<string>>,
    imageName: string): pulumi.Output<ImageOptions> {

    // TODO[pulumi/pulumi-cloud#85]: Put this in a real Pulumi-owned Docker image.
    // TODO[pulumi/pulumi-cloud#86]: Pass the full local zipped folder through to the container (via S3?)
    preEnv.PULUMI_SRC = pulumi.runtime.serializeFunctionAsync(func);
    return createImageOptions(imageName, preEnv);
}

function createImageOptions(
    image: string,
    env: Record<string, pulumi.Input<string>>): pulumi.Output<ImageOptions> {

    return pulumi.all(env).apply(e => ({ image: image, environment: e }));
}
