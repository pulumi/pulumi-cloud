// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as assertModule from "assert";
export type AssertType = typeof assertModule;

import * as harnessModule from "./harness";
export type HarnessType = typeof harnessModule;

function errorJSON(err: any) {
    const result: any = Object.create(null);
    Object.getOwnPropertyNames(err).forEach(key => result[key] = err[key]);
    return result;
}

export async function testModulesWorker(
    testFunctions: { (arg: any, result: any): Promise<boolean>}[],
    arg: any): Promise<[boolean, any]> {
    let passed = true;
    const result: any = Object.create(null);

    await Promise.all(testFunctions.map(async (testFn) => {
        passed = await testFn(arg, result) && passed;
    }));

    return [passed, result];
}

// Run tests in each submodule of `module` in parallel, writing results into `result`.
export async function testModule(
    arg: { assert: AssertType, harness: HarnessType }, result: any, module: any): Promise<boolean> {
    let passed = true;

    await Promise.all(Object.keys(module).map(async (moduleName) => {
        passed = await runTests(arg, moduleName, module[moduleName], result) && passed;
    }));

    return passed;
}

// Run each exported test function on `module` sequentially, writing results into `result`.
async function runTests(
        arg: { assert: AssertType, harness: HarnessType },
        moduleName: string, module: any, result: any) {
    let passed = true;
    for (const name of Object.keys(module)) {
        if (!name.startsWith("test")) {
            continue;
        }

        const fullName = `${moduleName}.${name}`;
        try {
            await module[name](arg);
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
