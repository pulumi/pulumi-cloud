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

import * as azureStorage from "azure-storage";

export class Table extends pulumi.ComponentResource implements cloud.Table {
    public readonly table: azure.storage.Table;

    public readonly primaryKey: pulumi.Output<string>;
    public readonly primaryKeyType: pulumi.Output<string>;

    public get: (query: Object) => Promise<any>;
    public insert: (item: Object) => Promise<void>;
    public delete: (query: Object) => Promise<void>;
    public update: (query: Object, updates: Object) => Promise<void>;
    public scan: { (): Promise<any[]>; (callback: (items: any[]) => Promise<boolean>): Promise<void>; };

    constructor(name: string,
                primaryKey?: pulumi.Input<string>,
                primaryKeyType?: pulumi.Input<cloud.PrimaryKeyType>,
                opts?: pulumi.ResourceOptions) {
        if (primaryKey === undefined) {
            primaryKey = "id";
        }

        if (primaryKeyType === undefined) {
            primaryKeyType = "string";
        }

        if (primaryKeyType !== "string") {
            throw new RunError("Only [string] is supported for [primaryKeyType] for an Azure [cloud.Table].");
        }

        super("cloud:table:Table", name, { }, opts);

        this.primaryKey = pulumi.output(primaryKey);
        this.primaryKeyType = pulumi.output(primaryKeyType);

        const primaryKeyOutput = this.primaryKey;

        const storageAccount = shared.getGlobalStorageAccount();

        // The underlying azure table that will store all the data.
        // Table names must be alphanumeric.
        const acceptableName = name.replace(/[^A-Za-z0-9]/g, "");
        this.table = new azure.storage.Table(acceptableName, {
            resourceGroupName: shared.globalResourceGroupName,
            storageAccountName: storageAccount.name,
        }, { parent: this});

        const tableName = this.table.name;

        this.get = async (query: any) => {
            const key = query[primaryKeyOutput.get()];
            if (!key) {
                throw new Error(`[query] must have a value specified for [${primaryKeyOutput.get()}]`);
            }

            const tableService = azureStorage.createTableService(storageAccount.primaryConnectionString.get());

            const result = await new Promise((resolve, reject) => {
                tableService.retrieveEntity<any>(
                    tableName.get(), key, /*rowKey*/"", (err, result) => {
                        if (err) {
                            return reject(err);
                        }

                        resolve(result);
                    });
                });

            return deserialize(result);
        };

        this.insert = async (obj: any) => {
            const primaryKey = primaryKeyOutput.get();
            const key = obj[primaryKey];
            if (!key) {
                throw new Error(`[obj] must have a value specified for [${primaryKeyOutput.get()}]`);
            }

            const tableService = azureStorage.createTableService(storageAccount.primaryConnectionString.get());

            const descriptor = convertToDescriptor(obj, primaryKey, key, azureStorage);

            await new Promise((resolve, reject) =>  {
                tableService.insertOrReplaceEntity<any>(
                    tableName.get(), descriptor, (err, result) => {
                        if (err) {
                            return reject(err);
                        }

                        resolve(result);
                    });
                });
        };

        this.delete = async (query: any) => {
            const primaryKey = primaryKeyOutput.get();
            const key = query[primaryKey];
            if (!key) {
                throw new Error(`[query] must have a value specified for [${primaryKeyOutput.get()}]`);
            }

            const tableService = azureStorage.createTableService(storageAccount.primaryConnectionString.get());

            const descriptor = convertToDescriptor({}, primaryKey, key, azureStorage);

            await new Promise((resolve, reject) => {
                tableService.deleteEntity(tableName.get(), descriptor, (err, result) => {
                    if (err) {
                        return reject(err);
                    }

                    resolve(result);
                });
            });
        };

        this.update = async (query: any, updates: any) => {
            const primaryKey = primaryKeyOutput.get();
            const key = query[primaryKey];
            if (!key) {
                throw new Error(`[query] must have a value specified for [${primaryKeyOutput.get()}]`);
            }

            const tableService = azureStorage.createTableService(storageAccount.primaryConnectionString.get());

            // Auzre takes a single object to represent the update.  So we just merge both the query
            // object and the updates object into one and we create the descriptor from that
            // combined object.
            const obj = { ...query, ...updates };
            const descriptor = convertToDescriptor(obj, primaryKey, key, azureStorage);

            await new Promise((resolve, reject) =>  {
                tableService.insertOrMergeEntity<any>(
                    tableName.get(), descriptor, (err, result) => {
                        if (err) {
                            return reject(err);
                        }

                        resolve(result);
                    });
                });
        };

        this.scan = <any>(async (callback?: (items: any[]) => Promise<boolean>) => {
            let items: any[] | undefined;
            if (callback === undefined) {
                items = [];
                callback = (page: any[]) => {
                    items!.push(...page);
                    return Promise.resolve(true);
                };
            }

            const tableService = azureStorage.createTableService(storageAccount.primaryConnectionString.get());

            // Create an empty query.  It will return all results across all partitions.
            const query = new azureStorage.TableQuery();
            let continuationToken: azureStorage.TableService.TableContinuationToken | null | undefined = null;

            do {
                const entries = await new Promise<any[]>((resolve, reject) => {
                    tableService.queryEntities(tableName.get(), query, continuationToken!, (err, result, response) => {
                        if (err) {
                            reject(err);
                        }

                        continuationToken = result.continuationToken;
                        resolve(result.entries);
                    });
                });

                const cont = await callback(entries.map(deserialize));
                if (!cont) {
                    break;
                }
            }
            while (continuationToken);

            if (items !== undefined) {
                return items;
            }
            else {
                return;
            }
        });

        this.registerOutputs({
            primaryKey: this.primaryKey,
            primaryKeyType: this.primaryKeyType,
        });
    }
}
function convertToDescriptor(
    obj: any, primaryKey: string, partitionKey: string, mod: typeof azureStorage): any {

    // Copy all properties the user provides over.  Then supply the appropriate partition
    // and row.  Do not copy over the primary key the user supplies. It will be place in
    // RowKey instead.
    const descriptor = {
        ...obj,
        PartitionKey: partitionKey,
        RowKey: "",
    };

    for (const key in descriptor) {
        if (descriptor.hasOwnProperty(key)) {
            descriptor[key] = translate(key, descriptor[key], mod);
        }
    }

    return descriptor;
}

function translate(key: string, value: any, mod: typeof azureStorage): any {
    const entGen = mod.TableUtilities.entityGenerator;
    if (Buffer.isBuffer(value)) {
        return entGen.Binary(value);
    }

    if (value instanceof Date) {
        return entGen.DateTime(value);
    }

    switch (typeof value) {
        case "string": return entGen.String(value);
        case "number": return entGen.Double(value);
        case "boolean": return entGen.Boolean(value);
        default:
            throw new Error(`value[${key}] was not a supported type.  Supported types are: string | number | boolean | Date | Buffer`);
    }
}

function deserialize(value: any) {
    const result = {
        ...value,
    };

    // Azure include these four keys in the result.  Strip out so they do not
    // get returned to the cloud.Table client.
    delete result["PartitionKey"];
    delete result["RowKey"];
    delete result["Timestamp"];
    delete result[".metadata"];

    for (const key in result) {
        if (result.hasOwnProperty(key)) {
            // Azure has already deserialized the result values into their proper JS value
            // types under a property called '_'.
            result[key] = result[key]["_"];
        }
    }

    return result;
}
