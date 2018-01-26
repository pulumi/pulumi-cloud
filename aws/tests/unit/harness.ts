// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

export function errorJSON(err: any) {
    const result: any = Object.create(null);
    Object.getOwnPropertyNames(err).forEach(key => result[key] = err[key]);
    return result;
}

async function testModulesWorker(
    testFunctions: { (result: any): Promise<boolean>}[]): Promise<[boolean, any]> {
    let passed = true;
    const result: any = Object.create(null);

    await Promise.all(testFunctions.map(async (testFn) => {
        passed = await testFn(result) && passed;
    }));

    return [passed, result];
}

// Run each of the `testFunction`s in parallel, each writing their results into `result.
export async function testModules(
    res: cloud.Response,
    testFunctions: { (result: any): Promise<boolean>}[]) {

    try {
        const [passed, json] = await testModulesWorker(testFunctions);
        if (passed) {
            res.json(json);
        }
        else {
            res.status(500).json(json);
        }
    } catch (err) {
        res.status(500).json(errorJSON(err));
    }
}

// Run tests in each submodule of `module` in parallel, writing results into `result`.
export async function testModule(result: any, module: any): Promise<boolean> {
    let passed = true;

    await Promise.all(Object.keys(module).map(async (moduleName) => {
        passed = await runTests(moduleName, module[moduleName], result) && passed;
    }));

    return passed;
}

// Run each exported test function on `module` sequentially, writing results into `result`.
async function runTests(moduleName: string, module: any, result: any) {
    let passed = true;
    for (const name of Object.keys(module)) {
        if (!name.startsWith("test")) {
            continue;
        }

        const fullName = `${moduleName}.${name}`;
        try {
            await module[name]();
            result[fullName] = "passed";
        }
        catch (err) {
            passed = false;
            result[fullName] = errorJSON(err);
        }
    }

    return passed;
}

export async function assertThrowsAsync(body: () => Promise<void>): Promise<void> {
    try {
        await body();
    }
    catch (err) {
        return;
    }

    throw new Error("Expected error to be thrown");
}
