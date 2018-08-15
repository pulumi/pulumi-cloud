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
import * as crypto from "crypto";
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
        console.log("Image name: " + imageName);

        let registry: azure.containerservice.Registry | undefined;
        if (container.build) {
            // Create the repository.  Note that we must do this in the current turn, before we hit any awaits.
            // The reason is subtle; however, if we do not, we end up with a circular reference between the
            // TaskDefinition that depends on this repository and the repository waiting for the TaskDefinition,
            // simply because permitting a turn in between lets the TaskDefinition's registration race ahead of us.
            registry = getOrCreateRegistry(imageName);
        }

        const imageOptions = computeImage(imageName, container, registry);

        const globalResourceGroupName = shared.globalResourceGroupName;
        const memory = pulumi.output(container.memoryReservation);

        const config = new pulumi.Config("cloud-azure");
        const subscriptionId = config.require("subscriptionId");
        const clientId = config.require("clientId");
        const clientSecret = config.require("clientSecret");
        const tenantId = config.require("tenantId");

        this.run = async (options) => {
            const azureContainerSDK = await import("azure-arm-containerinstance");
            const msrest = await import("ms-rest-azure");

            try {
                options = options || {};
                options.host = options.host || {};

                console.log("Credentials: " + JSON.stringify({ clientId, clientSecret, tenantId, subscriptionId }, null, 2));

                const credentials: any = await new Promise((resolve, reject) => {
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

                console.log("Succeeded making client.");

                const client = new azureContainerSDK.ContainerInstanceManagementClient(credentials, subscriptionId);

                const imageOpts = imageOptions.get();
                let envMap = imageOpts.environment;
                if (options.environment) {
                    envMap = Object.assign(options.environment, envMap);
                }

                // Convert the environment to the form that azure needs.
                const env = Object.keys(envMap).map(k => ({ name: k, value: envMap[k] }));
                console.log("Total env: " + JSON.stringify(envMap, null, 2));

                const group = await client.containerGroups.createOrUpdate(
                    globalResourceGroupName.get(), name, {
                        osType: options.host.os || "Linux",
                        containers: [{
                            name,
                            image: imageOpts.image,
                            environmentVariables: env,
                            resources: {
                                requests: {
                                    cpu: 1,
                                    memoryInGB: memory.get() || 1,
                                },
                            },
                        }],
                        restartPolicy: "Never",
                    });

                console.log("Succeeded making container group!");
            }
            catch (err) {
                console.log("Error: " + JSON.stringify(err, null, 2));
                throw err;
            }
        };
    }
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

        const imageName = shared.createNameWithStackInfo(`${sha1hash(buildSig)}container`);
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

// registries contains a cache of already created azure container registries.
const registries = new Map<string, azure.containerservice.Registry>();

function getOrCreateRegistry(imageName: string): azure.containerservice.Registry {
    let registry = registries.get(imageName);
    if (!registry) {
        console.log("Creating registry: " + imageName);
        registry = new azure.containerservice.Registry(imageName, {
            resourceGroupName: shared.globalResourceGroupName,
            location: shared.location,

            // We need the admin account enabled so that we can grab the name/password to send to
            // docker.  We could consider an approach whereby this was not enabled, but it was
            // conditionally enabled/disabled on demand when needed.
            adminEnabled: true,

            sku: "Standard",
        });

        registries.set(imageName, registry);
    }

    return registry;
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

// sha1hash returns a partial SHA1 hash of the input string.
export function sha1hash(s: string): string {
    const shasum = crypto.createHash("sha1");
    shasum.update(s);
    // TODO[pulumi/pulumi#377] Workaround for issue with long names not generating per-deplioyment randomness, leading
    //     to collisions.  For now, limit the size of hashes to ensure we generate shorter/ resource names.
    return shasum.digest("hex").substring(0, 8);
}
