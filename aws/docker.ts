// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

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

// buildAndPushImage will build and push the Dockerfile and context from [buildPath] into the requested ECR
// [repository].  It returns the digest of the built image.
export function buildAndPushImage(
    imageName: string,
    container: cloud.Container,
    repositoryUrl: pulumi.Input<string>,
    connectToRegistry: () => Promise<Registry>): pulumi.Output<string> {

    // First build the image.
    const imageDigest = buildImageAsync(imageName, container);

    // Then collect its output digest as well as the repo url and repo registry id.
    const outputs = pulumi.all([imageDigest, repositoryUrl]);

    // Use those then push the image.  Then just return the digest as the final result for our caller to use.
    return outputs.apply(async ([digest, url]) => {
        if (!pulumi.runtime.isDryRun()) {
            // Only push the image during an update, do not push during a preview, even if digest and url are available
            // from a previous update.
            const registry = await connectToRegistry();
            await pushImageAsync(imageName, url, registry);
        }
        return digest;
    });
}

async function buildImageAsync(
        imageName: string, container: cloud.Container): Promise<string> {
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
            const versionResult = await runCLICommand("docker", ["version", "-f", "{{json .}}"], true);
            // IDEA: In the future we could warn here on out-of-date versions of Docker which may not support key
            // features we want to use.
            cachedDockerVersionString = versionResult.stdout;
            pulumi.log.debug(`'docker version' => ${cachedDockerVersionString}`);
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

    // Prepare the build arguments.
    const buildArgs: string[] = [ "build" ];
    buildArgs.push(...[ "-t", imageName ]); // tag the image with the chosen name.
    if (build.dockerfile) {
        buildArgs.push(...[ "-f", build.dockerfile ]); // add a custom Dockerfile location.
    }
    if (build.args) {
        for (const arg of Object.keys(build.args)) {
            buildArgs.push(...[ "--build-arg", `${arg}=${build.args[arg]}` ]);
        }
    }
    buildArgs.push(build.context); // push the docker build context onto the path.

    // Invoke Docker CLI commands to build and push.
    const buildResult = await runCLICommand("docker", buildArgs);
    if (buildResult.code) {
        throw new RunError(`Docker build of image '${imageName}' failed with exit code: ${buildResult.code}`);
    }

    // Finally, inspect the image so we can return the SHA digest.
    const inspectResult = await runCLICommand("docker", ["image", "inspect", "-f", "{{.Id}}", imageName], true);
    if (inspectResult.code || !inspectResult.stdout) {
        throw new RunError(
            `No digest available for image ${imageName}: ${inspectResult.code} -- ${inspectResult.stdout}`);
    }
    return inspectResult.stdout.trim();
}

async function pushImageAsync(
    imageName: string,
    repositoryUrl: string,
    registry: Registry) {

    const { registry: registryName, username, password } = registry;

    let loginResult: CommandResult;
    if (!dockerPasswordStdin) {
        loginResult = await runCLICommand(
            "docker", ["login", "-u", username, "-p", password, registryName]);
    } else {
        loginResult = await runCLICommand(
            "docker", ["login", "-u", username, "--password-stdin", registryName], false, password);
    }
    if (loginResult.code) {
        throw new RunError(`Failed to login to Docker registry ${registryName}`);
    }

    // Tag and push the image to the remote repository.
    if (!repositoryUrl) {
        throw new RunError("Expected repository URL to be defined during push");
    }
    const tagResult = await runCLICommand("docker", ["tag", imageName, repositoryUrl]);
    if (tagResult.code) {
        throw new RunError(`Failed to tag Docker image with remote registry URL ${repositoryUrl}`);
    }
    const pushResult = await runCLICommand("docker", ["push", repositoryUrl]);
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
    returnStdout?: boolean,
    stdin?: string): Promise<CommandResult> {
    return new Promise<CommandResult>((resolve, reject) => {
        const p = child_process.spawn(cmd, args);
        let result: string | undefined;
        if (returnStdout) {
            // We store the results from stdout in memory and will return them as a string.
            const chunks: Buffer[] = [];
            p.stdout.on("data", (chunk: Buffer) => {
                chunks.push(chunk);
            });
            p.stdout.on("end", () => {
                result = Buffer.concat(chunks).toString();
            });
        } else {
            p.stdout.pipe(process.stdout);
        }
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
