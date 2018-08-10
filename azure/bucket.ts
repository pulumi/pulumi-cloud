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
import * as serverless from "@pulumi/azure-serverless";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import * as stream from "stream";
import * as shared from "./shared";

export class Bucket extends pulumi.ComponentResource implements cloud.Bucket {
    public readonly container: azure.storage.Container;

    // deployment-time api:
    public onPut: (name: string, handler: cloud.BucketHandler, filter: cloud.BucketFilter | undefined) => void;
    public onDelete: (name: string, handler: cloud.BucketHandler, filter: cloud.BucketFilter | undefined) => void;

    // run-time api
    public get: (key: string) => Promise<Buffer>;
    public put: (key: string, contents: Buffer) => Promise<void>;
    public delete: (key: string) => Promise<void>;

    public constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:bucket:Bucket", name, {}, opts);

        const preventDestroy = opts && opts.protect;

        const resourceGroupName = shared.globalResourceGroupName;
        const storageAccount = shared.getGlobalStorageAccount();

        const container =  new azure.storage.Container(name, {
            resourceGroupName: resourceGroupName,
            storageAccountName: storageAccount.name,
        }, { parent: this, protect: preventDestroy });
        this.container = container;

        this.get = async (key) => {
            const azStorage = await import("azure-storage");
            const streamBuffers = await import("stream-buffers");

            const writableStream = new streamBuffers.WritableStreamBuffer();

            const service = new azStorage.BlobService(storageAccount.name.get());
            await new Promise((resolve, reject) => {
                service.getBlobToStream(container.name.get(), key, writableStream, err => {
                    if (err) {
                        return reject(err);
                    }

                    resolve();
                });
            });

            return writableStream.getContents();
        };

        this.put = async (key, contents) => {
            const azStorage = await import("azure-storage");

            const service = new azStorage.BlobService(storageAccount.name.get());
            const readableStream = new ReadableStream(contents);

            await new Promise((resolve, reject) => {
                service.createBlockBlobFromStream(container.name.get(), key, readableStream, contents.length, err => {
                    if (err) {
                        return reject(err);
                    }

                    resolve();
                });
            });
        };

        this.delete = async (key) => {
            const azStorage = await import("azure-storage");

            const service = new azStorage.BlobService(storageAccount.name.get());
            await new Promise((resolve, reject) => {
                service.deleteBlob(container.name.get(), key, (err: Error) => {
                    if (err) {
                        return reject(err);
                    }

                    resolve();
                });
            });
        };

        this.onPut = async (putName, handler, filter) => {
            const resourceGroup = shared.globalResourceGroup;
            filter = filter || {};
            serverless.storage.onBlobEvent(putName, storageAccount, (context, buffer) => {
                    handler({
                        key: context.bindingData.blobTrigger,
                        eventTime: context.bindingData.sys.utcNow,
                        size: buffer.length,
                    }).then(() => context.done());
                },
                {
                    storageAccount: storageAccount,
                    containerName: container.name,
                    resourceGroup: resourceGroup,
                    filterPrefix: filter.keyPrefix,
                    filterSuffix: filter.keySuffix,
                },
                { parent: this });
        };

        this.onDelete = async (delName, handler, filter) => {
            throw new Error("Method not implemented.");
        };
    }
}

class ReadableStream extends stream.Readable {
    public constructor(private buffer: Buffer | undefined) {
        super();
    }

    public _read() {
        if (this.buffer) {
            this.push(this.buffer);
            this.buffer = undefined;
        }
    }
}
