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

import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";

import * as child_process from "child_process";
import * as semver from "semver";

// Store this so we can verify `docker` command is available only once per deployment.
let cachedDockerVersionString: string|undefined;
let dockerPasswordStdin: boolean = false;

// Registry is the information required to login to a Docker registry.
export interface Registry {
    registry: string;
    username: string;
    password: string;
}

interface BuildResult {
    digest: string;
    stages: string[];
}

// buildAndPushImage will build and push the Dockerfile and context from [buildPath] into the requested ECR
// [repository].  It returns the digest of the built image.
export function buildAndPushImage(
    imageName: string,
    container: cloud.Container,
    repositoryUrl: pulumi.Input<string>,
    logResource: pulumi.Resource,
    connectToRegistry: () => Promise<Registry>): pulumi.Output<string> {

    let loggedIn: Promise<void> | undefined;
    const login = () => {
        if (!loggedIn) {
            console.log("logging in to registry...");
            loggedIn = connectToRegistry().then(r => loginToRegistry(r, logResource));
        }
        return loggedIn;
    };

    // If the container specified a cacheFrom parameter, first set up the cached stages.
    let cacheFrom: Promise<string[] | undefined>;
    if (typeof container.build !== "string" && container.build && container.build.cacheFrom) {
        // NOTE: we pull the promise out of the repository URL s.t. we can observe whether or not it exists. Were we
        // to instead hang an apply off of the raw Input<>, we would never end up running the pull if the repository
        // had not yet been created.
        const repoUrl = (<any>pulumi.output(repositoryUrl)).promise();
        const cacheFromParam = typeof container.build.cacheFrom === "boolean" ? {} : container.build.cacheFrom;
        cacheFrom = pullCacheAsync(imageName, cacheFromParam, login, repoUrl, logResource);
    } else {
        cacheFrom = Promise.resolve(undefined);
    }

    // First build the image.
    const buildResult = buildImageAsync(imageName, container, logResource, cacheFrom);

    // Then collect its output digest as well as the repo url and repo registry id.
    const outputs = pulumi.all([buildResult, repositoryUrl]);

    // Use those then push the image.  Then just return the digest as the final result for our caller to use.
    return outputs.apply(async ([result, url]) => {
        if (!pulumi.runtime.isDryRun()) {
            // Only push the image during an update, do not push during a preview, even if digest and url are available
            // from a previous update.
            await login();

            // Push the final image first, then push the stage images to use for caching.
            await pushImageAsync(imageName, url, logResource);

            for (const stage of result.stages) {
                await pushImageAsync(
                    localStageImageName(imageName, stage), url, logResource, stage);
            }
        }
        return result.digest;
    });
}

async function pullCacheAsync(
    imageName: string,
    cacheFrom: cloud.CacheFrom,
    login: () => Promise<void>,
    repositoryUrl: Promise<string>,
    logResource: pulumi.Resource): Promise<string[] | undefined> {

    // Ensure that we have a repository URL. If we don't, we won't be able to pull anything.
    const repoUrl = await repositoryUrl;
    if (!repoUrl) {
        return undefined;
    }

    pulumi.log.debug(`pulling cache for ${imageName} from ${repoUrl}`, logResource);

    // Ensure that we're logged in to the source registry and attempt to pull each stage in turn.
    await login();

    const cacheFromImages = [];
    const stages = (cacheFrom.stages || []).concat([""]);
    for (const stage of stages) {
        const tag = stage ? `:${stage}` : "";
        const image = `${repoUrl}${tag}`;
        const pullResult = await runCLICommand("docker", ["pull", image], logResource);
        if (pullResult.code) {
            console.log(`Docker pull of build stage ${image} failed with exit code: ${pullResult.code}`);
        } else {
            cacheFromImages.push(image);
        }
    }

    return cacheFromImages;
}

function localStageImageName(imageName: string, stage: string): string {
    return `${imageName}-${stage}`;
}

async function buildImageAsync(
    imageName: string,
    container: cloud.Container,
    logResource: pulumi.Resource,
    cacheFrom: Promise<string[] | undefined>): Promise<BuildResult> {

    let build: cloud.ContainerBuild;
    if (typeof container.build === "string") {
        build = {
            context: container.build,
        };
    } else if (container.build) {
        build = container.build;
    } else {
        throw new RunError(`Cannot build a container with an empty build specification`);
    }

    // If the build context is missing, default it to the working directory.
    if (!build.context) {
        build.context = ".";
    }

    console.log(
        `Building container image '${imageName}': context=${build.context}` +
            (build.dockerfile ? `, dockerfile=${build.dockerfile}` : "") +
                (build.args ? `, args=${JSON.stringify(build.args)}` : ""),
    );

    // Verify that 'docker' is on the PATH and get the client/server versions
    if (!cachedDockerVersionString) {
        try {
            const versionResult = await runCLICommand(
                "docker", ["version", "-f", "{{json .}}"], logResource);
            // IDEA: In the future we could warn here on out-of-date versions of Docker which may not support key
            // features we want to use.
            cachedDockerVersionString = versionResult.stdout;
            pulumi.log.debug(`'docker version' => ${cachedDockerVersionString}`, logResource);
        } catch (err) {
            throw new RunError("No 'docker' command available on PATH: Please install to use container 'build' mode.");
        }

        // Decide whether to use --password or --password-stdin based on the client version.
        try {
            const versionData: any = JSON.parse(cachedDockerVersionString!);
            const clientVersion: string = versionData.Client.Version;
            if (semver.gte(clientVersion, "17.07.0", true)) {
                dockerPasswordStdin = true;
            }
        } catch (err) {
            console.log(`Could not process Docker version (${err})`);
        }
    }

    // If the container build specified build stages to cache, build each in turn.
    const stages = [];
    if (build.cacheFrom && typeof build.cacheFrom !== "boolean" && build.cacheFrom.stages) {
        for (const stage of build.cacheFrom.stages) {
            await dockerBuild(
                localStageImageName(imageName, stage), build, cacheFrom, logResource, stage);
            stages.push(stage);
        }
    }

    // Invoke Docker CLI commands to build.
    await dockerBuild(imageName, build, cacheFrom, logResource);

    // Finally, inspect the image so we can return the SHA digest.
    const inspectResult = await runCLICommand(
        "docker", ["image", "inspect", "-f", "{{.Id}}", imageName], logResource);
    if (inspectResult.code || !inspectResult.stdout) {
        throw new RunError(
            `No digest available for image ${imageName}: ${inspectResult.code} -- ${inspectResult.stdout}`);
    }

    return {
        digest: inspectResult.stdout.trim(),
        stages: stages,
    };
}

async function dockerBuild(
    imageName: string,
    build: cloud.ContainerBuild,
    cacheFrom: Promise<string[] | undefined>,
    logResource: pulumi.Resource,
    target?: string): Promise<void> {

    // Prepare the build arguments.
    const buildArgs: string[] = [ "build" ];
    if (build.dockerfile) {
        buildArgs.push(...[ "-f", build.dockerfile ]); // add a custom Dockerfile location.
    }
    if (build.args) {
        for (const arg of Object.keys(build.args)) {
            buildArgs.push(...[ "--build-arg", `${arg}=${build.args[arg]}` ]);
        }
    }
    if (build.cacheFrom) {
        const cacheFromImages = await cacheFrom;
        if (cacheFromImages) {
            buildArgs.push(...[ "--cache-from", cacheFromImages.join() ]);
        }
    }
    buildArgs.push(build.context!); // push the docker build context onto the path.

    buildArgs.push(...[ "-t", imageName ]); // tag the image with the chosen name.
    if (target) {
        buildArgs.push(...[ "--target", target ]);
    }

    const buildResult = await runCLICommand("docker", buildArgs, logResource);
    if (buildResult.code) {
        throw new RunError(`Docker build of image '${imageName}' failed with exit code: ${buildResult.code}`);
    }
}

async function loginToRegistry(registry: Registry, logResource: pulumi.Resource) {
    const { registry: registryName, username, password } = registry;

    let loginResult: CommandResult;
    if (!dockerPasswordStdin) {
        loginResult = await runCLICommand(
            "docker", ["login", "-u", username, "-p", password, registryName], logResource);
    } else {
        loginResult = await runCLICommand(
            "docker", ["login", "-u", username, "--password-stdin", registryName],
            logResource, password);
    }
    if (loginResult.code) {
        throw new RunError(`Failed to login to Docker registry ${registryName}`);
    }
}

async function pushImageAsync(
        imageName: string, repositoryUrl: string, logResource: pulumi.Resource, tag?: string) {

    // Tag and push the image to the remote repository.
    if (!repositoryUrl) {
        throw new RunError("Expected repository URL to be defined during push");
    }

    tag = tag ? `:${tag}` : "";
    const targetImage = `${repositoryUrl}${tag}`;

    const tagResult = await runCLICommand("docker", ["tag", imageName, targetImage], logResource);
    if (tagResult.code) {
        throw new RunError(`Failed to tag Docker image with remote registry URL ${repositoryUrl}`);
    }
    const pushResult = await runCLICommand("docker", ["push", targetImage], logResource);
    if (pushResult.code) {
        throw new RunError(`Docker push of image '${imageName}' failed with exit code: ${pushResult.code}`);
    }
}

// parseDockerEngineUpdatesFromBuffer extracts messages from the Docker engine
// that are communicated over the stream returned from a Build or Push
// operation.
function parseDockerEngineUpdatesFromBuffer(buffer: Buffer): any[] {
    const str = buffer.toString();
    const lines = str.split("\n");
    const results = [];
    for (const line of lines) {
        if (line.length === 0) {
            continue;
        }
        results.push(JSON.parse(line));
    }
    return results;
}

interface CommandResult {
    code: number;
    stdout?: string;
}

// Runs a CLI command in a child process, returning a promise for the process's exit.
// Both stdout and stderr are redirected to process.stdout and process.stder by default.
// If the [returnStdout] argument is `true`, stdout is not redirected and is instead returned with the promise.
// If the [stdin] argument is defined, it's contents are piped into stdin for the child process.
async function runCLICommand(
    cmd: string,
    args: string[],
    resource: pulumi.Resource,
    stdin?: string): Promise<CommandResult> {

    // Generate a unique stream-ID that we'll associate all the docker output with. This will allow
    // each spawned CLI command's output to associated with 'resource' and also streamed to the UI
    // in pieces so that it can be displayed live.  The stream-ID is so that the UI knows these
    // messages are all related and should be considered as one large message (just one that was
    // sent over in chunks).
    //
    // We use Math.random here in case our package is loaded multiple times in memory (i.e. because
    // different downstream dependencies depend on different versions of us).  By being random we
    // effectively make it completely unlikely that any two cli outputs could map to the same stream
    // id.
    //
    // Pick a reasonably distributed number between 0 and 2^30.  This will fit as an int32
    // which the grpc layer needs.
    const streamID = Math.floor(Math.random() * (1 << 30));

    return new Promise<CommandResult>((resolve, reject) => {
        const p = child_process.spawn(cmd, args);
        let result: string | undefined;

        // We store the results from stdout in memory and will return them as a string.
        const chunks: Buffer[] = [];
        p.stdout.on("data", (chunk: Buffer) => {
            pulumi.log.info(chunk.toString(), resource, streamID);
            chunks.push(chunk);
        });
        p.stdout.on("end", () => {
            result = Buffer.concat(chunks).toString();
        });

        p.stderr.pipe(process.stderr);
        p.on("error", (err) => {
            reject(err);
        });
        p.on("close", (code) => {
            resolve({
                code: code,
                stdout: result,
            });
        });
        if (stdin) {
            p.stdin.end(stdin);
        }
    });
}
