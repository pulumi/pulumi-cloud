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

import * as azureStorageModule from "azure-storage";

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

        super("cloud:table:Table", name, {
            primaryKey: primaryKey,
            primaryKeyType: primaryKeyType,
        }, opts);

        const primaryKeyOutput = pulumi.output(primaryKey);

        const storageAccount = shared.getGlobalStorageAccount();

        // Azure storage tables need a 'partition' to place data into.  Because we have no need to
        // expose such functionality through the cloud.Table API, we just create a simple 'part1'
        // partition and place all data there.
        const partitionKey = "part1";

        // The underlying azure table that will store all the data.
        this.table = new azure.storage.Table(name, {
            resourceGroupName: shared.globalResourceGroupName,
            storageAccountName: storageAccount.name,
        }, { parent: this});

        const tableName = this.table.name;

        this.get = async (query: any) => {
            const rowKey = query[primaryKeyOutput.get()];
            if (!rowKey) {
                throw new RunError(`[query] must have a value specified for [${primaryKeyOutput.get()}]`);
            }

            const azureStorageSDK = await import("azure-storage");
            const tableService = azureStorageSDK.createTableService(storageAccount.primaryConnectionString.get());

            const result = await new Promise((resolve, reject) => {
                tableService.retrieveEntity<any>(
                    tableName.get(), partitionKey, rowKey, (err, result) => {
                        if (err) {
                            return reject(err);
                        }

                        resolve(result);
                    });
                });

            return deserialize(result);
        };

        this.insert = async (obj: any) => {
            const rowKey = obj[primaryKeyOutput.get()];
            if (!rowKey) {
                throw new RunError(`[obj] must have a value specified for [${primaryKeyOutput.get()}]`);
            }

            const azureStorageSDK = await import("azure-storage");
            const tableService = azureStorageSDK.createTableService(storageAccount.primaryConnectionString.get());
            const entGen = azureStorageSDK.TableUtilities.entityGenerator;

            const descriptor = convertToDescriptor(obj, partitionKey, rowKey, entGen);

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
            const rowKey = query[primaryKeyOutput.get()];
            if (!rowKey) {
                throw new RunError(`[query] must have a value specified for [${primaryKeyOutput.get()}]`);
            }

            const azureStorageSDK = await import("azure-storage");
            const tableService = azureStorageSDK.createTableService(storageAccount.primaryConnectionString.get());
            const entGen = azureStorageSDK.TableUtilities.entityGenerator;

            const descriptor = convertToDescriptor({}, partitionKey, rowKey, entGen);

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
            const rowKey = query[primaryKeyOutput.get()];
            if (!rowKey) {
                throw new RunError(`[query] must have a value specified for [${primaryKeyOutput.get()}]`);
            }

            const azureStorageSDK = await import("azure-storage");
            const tableService = azureStorageSDK.createTableService(storageAccount.primaryConnectionString.get());
            const entGen = azureStorageSDK.TableUtilities.entityGenerator;

            // Auzre takes a single object to represent the update.  So we just merge both the query
            // object and the updates object into one and we create the descriptor from that
            // combined object.
            const obj = { ...query, ...updates };
            const descriptor = convertToDescriptor(obj, partitionKey, rowKey, entGen);

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

            const azureStorageSDK = await import("azure-storage");
            const tableService = azureStorageSDK.createTableService(storageAccount.primaryConnectionString.get());

            const query = new azureStorageSDK.TableQuery().where("PartitionKey eq ?", partitionKey);
            let continuationToken: azureStorageModule.TableService.TableContinuationToken | null | undefined = null;

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

        return;

        function convertToDescriptor(
                obj: any, partitionKey: string, rowKey: string,
                entGen: typeof azureStorageModule.TableUtilities.entityGenerator): any {
            // Copy all properties the user provides over.  Then supply the appropraite partition
            // and row.  Do not copy over the primary key the user supplies. It will be place in
            // RowKey instead.
            const descriptor = {
                ...obj,
                PartitionKey: partitionKey,
                RowKey: rowKey,
            };

            delete descriptor[primaryKeyOutput.get()];

            for (const key in descriptor) {
                if (descriptor.hasOwnProperty(key)) {
                    descriptor[key] = translate(key, descriptor[key]);
                }
            }

            return descriptor;

            function translate(key: string, value: any): any {
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
    }
}
