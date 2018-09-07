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

import * as cloud from "@pulumi/cloud-azure";
import * as azureStorage from "azure-storage";

const bucket = new cloud.Bucket("myBucket");
const primaryConnectionString = bucket.storageAccount.primaryBlobConnectionString;
const containerName = bucket.container.name;

cloud.timer.cron("timer", "0 * * * * *", async () => {
    console.log("Started: " + new Date().toString());
    try {
        const service = azureStorage.createBlobService(primaryConnectionString.get());

        const iso = new Date().toISOString();
        await new Promise((resolve, reject) => service.createBlockBlobFromText(
            containerName.get(), "_" + new Date().getTime() + ".json", iso, (err, res) => {
                if (err) {
                    return reject(err);
                }

                return resolve(res);
            }));
    }
    catch (err) {
        console.log("Error: " + JSON.stringify(err, null, 2));
        return;
    }

    console.log("Completed: " + new Date().toString());
});
