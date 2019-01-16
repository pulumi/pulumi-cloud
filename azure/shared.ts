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

import * as azure from "@pulumi/azure";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";
import * as crypto from "crypto";
import * as config from "./config";

/**
 * Helper to create a name for resources with a name that should be unique to this stack.
 */
export function createNameWithStackInfo(requiredInfo: string, maxLength: number, delim: string) {
    if (requiredInfo.length > maxLength) {
        throw new RunError(`'${requiredInfo}' cannot be longer then ${maxLength} characters.`);
    }

    if (requiredInfo.length === 0) {
        throw new RunError(`[requiredInfo] must be non-empty`);
    }

    const stackName = pulumi.getStack();

    // Only enough room for required portion, don't add the stack.
    // Also don't add the stack if there wouldn't be room to add it and a dash.
    if (requiredInfo.length >= maxLength - delim.length) {
        return requiredInfo;
    }

    // Attempt to keep some portion of the stack, then - then the required part.
    const suffix = delim + requiredInfo;
    const result = stackName.substr(0, maxLength - suffix.length) + suffix;
    return result;
}

// Expose a common infrastructure resource that all our global resources can consider themselves to
// be parented by.  This helps ensure unique URN naming for these guys as they cannot conflict with
// any other user resource.
class InfrastructureResource extends pulumi.ComponentResource {
    constructor() {
        super("cloud:global:infrastructure", "global-infrastructure");
    }
}

let globalInfrastructureResource: InfrastructureResource | undefined;

/**
 * Get's the resource that any global infrastructure resource for this stack can use as a parent.
 */
export function getGlobalInfrastructureResource(): pulumi.Resource {
    if (!globalInfrastructureResource) {
        globalInfrastructureResource = new InfrastructureResource();
    }

    return globalInfrastructureResource;
}

export const location = config.location;

const azureConfig = new pulumi.Config("cloud-azure");

/**
 * The Azure Resource Group to use for all resources if a specific one is not specified. To use an
 * existing Resource Group provide the [cloud-azure:resourceGroupName] config value. Otherwise, a
 * new group will be created.
 */
export const globalResourceGroup = getGlobalResourceGroup();
export const globalResourceGroupName = globalResourceGroup.apply(g => g.name);

function getGlobalResourceGroup(): pulumi.Output<azure.core.ResourceGroup> {
    const resourceGroupPromise = getOrCreateGlobalResourceGroup();
    return pulumi.output(resourceGroupPromise);

    async function getOrCreateGlobalResourceGroup() {
        const resourceGroupName = azureConfig.get("resourceGroupName");
        if (resourceGroupName) {
            // User specified the resource group they want to use.  Go fetch that.
            const result = await azure.core.getResourceGroup({
                name: resourceGroupName,
            });

            return azure.core.ResourceGroup.get("global", result.id);
        }

        // Create a new resource group to use.
        return new azure.core.ResourceGroup("global", {
            // https://docs.microsoft.com/en-us/azure/architecture/best-practices/naming-conventions#general
            // Resource groups have a max length of 90.
            name: createNameWithStackInfo("global-" + sha1hash(pulumi.getStack()), 90, "-"),
            location: location,
        },
        { parent: getGlobalInfrastructureResource() });
    }
}

let globalStorageAccount: azure.storage.Account;

/**
 * The Azure Storage Account to use for all resources that need to store data if not specific
 * account is specified. To use an existing Storage Account provide the
 * [cloud-azure:storageAccountId] config value. Otherwise, a new account will be created.
 */
export function getGlobalStorageAccount() {
    if (!globalStorageAccount) {
        globalStorageAccount = getOrCreateGlobalStorageAccount();
    }

    return globalStorageAccount;
}

function getOrCreateGlobalStorageAccount(): azure.storage.Account {
    const storageAccountId = azureConfig.get("storageAccountId");
    if (storageAccountId) {
        return azure.storage.Account.get("global", storageAccountId);
    }

    // Account name must be 24 chars or less and must be lowercase.
    // https://docs.microsoft.com/en-us/azure/architecture/best-practices/naming-conventions#storage
    const storageAccountName = makeSafeStorageAccountName(
        createNameWithStackInfo("global" + sha1hash(pulumi.getStack()), 24, /*delim*/ ""));

    return new azure.storage.Account("global", {
        resourceGroupName: globalResourceGroupName,
        location: location,
        name: storageAccountName,
        accountKind: "StorageV2",
        accountTier: "Standard",
        accountReplicationType: "LRS",
    }, { parent: getGlobalInfrastructureResource() });
}

let globalStorageContainer: azure.storage.Container;

function getGlobalStorageContainer() {
    if (!globalStorageContainer) {
        globalStorageContainer = new azure.storage.Container("global", {
            resourceGroupName: globalResourceGroupName,
            storageAccountName: getGlobalStorageAccount().name,
            containerAccessType: "private",
        }, { parent: getGlobalInfrastructureResource() });
    }

    return globalStorageContainer;
}

let globalAppServicePlan: azure.appservice.Plan;
let globalFunctionAppServicePlan: azure.appservice.Plan;

export function getGlobalAppServicePlan() {
    if (!globalAppServicePlan) {
        globalAppServicePlan = new azure.appservice.Plan("global-app", {
            resourceGroupName: globalResourceGroupName,
            location: location,

            kind: "App",

            sku: {
                tier: "Standard",
                size: "S1",
            },
        }, { parent: getGlobalInfrastructureResource() });
    }

    return globalAppServicePlan;
}

export function getGlobalFunctionAppServicePlan() {
    if (!globalFunctionAppServicePlan) {
        globalFunctionAppServicePlan = new azure.appservice.Plan("global-function-app", {
            resourceGroupName: globalResourceGroupName,
            location: location,

            kind: "FunctionApp",

            sku: {
                tier: "Dynamic",
                size: "Y1",
            },
        }, { parent: getGlobalInfrastructureResource() });
    }

    return globalFunctionAppServicePlan;
}

function makeSafeStorageAccountName(prefix: string) {
    return prefix.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

// sha1hash returns a partial SHA1 hash of the input string.
export function sha1hash(s: string): string {
    const shasum = crypto.createHash("sha1");
    shasum.update(s);
    // TODO[pulumi/pulumi#377] Workaround for issue with long names not generating per-deplioyment randomness, leading
    //     to collisions.  For now, limit the size of hashes to ensure we generate shorter/ resource names.
    return shasum.digest("hex").substring(0, 8);
}

export const defaultSubscriptionArgs: {
    includePaths: string[] | undefined,
    includePackages: string[] | undefined,
    resourceGroupName: pulumi.Output<string>,
    location: string,
    storageAccount: azure.storage.Account,
    storageContainer: azure.storage.Container,
    appServicePlanId: pulumi.Output<string>,
} = {
    includePaths: config.functionIncludePaths,
    includePackages: config.functionIncludePackages,

    resourceGroupName: globalResourceGroupName,
    location: location,
    storageAccount: getGlobalStorageAccount(),
    storageContainer: getGlobalStorageContainer(),
    appServicePlanId: getGlobalFunctionAppServicePlan().id,
};
