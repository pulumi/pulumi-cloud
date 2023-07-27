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

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";

import * as ddbsdk from "@aws-sdk/client-dynamodb";
import * as ddbdocumentsdk from "@aws-sdk/lib-dynamodb";

function pulumiKeyTypeToDynamoKeyType(keyType: cloud.PrimaryKeyType): string {
    switch (keyType) {
        case "string": return "S";
        case "number": return "N";
        case "boolean": return "B";
        default: throw new RunError(`Unsupported key type ${keyType} - expected "string", "number" or "boolean"`);
    }
}

const consistentRead = true;

export class Table extends pulumi.ComponentResource implements cloud.Table {
    public readonly primaryKey: pulumi.Output<string>;
    public readonly primaryKeyType: pulumi.Output<string>;
    public readonly dynamodbTable: aws.dynamodb.Table;

    public get: (query: Object) => Promise<any>;
    public insert: (item: Object) => Promise<void>;
    public scan: { (): Promise<any[]>; (callback: (items: any[]) => Promise<boolean>): Promise<void>; };
    public delete: (query: Object) => Promise<void>;
    public update: (query: Object, updates: Object) => Promise<void>;

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

        super("cloud:table:Table", name, { }, opts);

        this.primaryKey = pulumi.output(primaryKey);
        this.primaryKeyType = pulumi.output(primaryKeyType);

        this.dynamodbTable = new aws.dynamodb.Table(name, {
            attributes: [{
                name: primaryKey,
                type: pulumi.output(primaryKeyType).apply(t => pulumiKeyTypeToDynamoKeyType(t)),
            }],
            hashKey: primaryKey,
            billingMode: "PAY_PER_REQUEST",
        }, { parent: this });

        const tableName = this.dynamodbTable.name;

        this.get = async (query) => {
            const db = ddbdocumentsdk.DynamoDBDocument.from(new ddbsdk.DynamoDB({}));
            const result = await db.get({
                TableName: tableName.get(),
                Key: query,
                ConsistentRead: consistentRead,
            });

            return result.Item;
        };
        this.insert = async (item) => {
            const db = ddbdocumentsdk.DynamoDBDocument.from(new ddbsdk.DynamoDB({}));
            await db.put({
                TableName: tableName.get(),
                Item: item,
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

            const db = ddbdocumentsdk.DynamoDBDocument.from(new ddbsdk.DynamoDB({}));
            const params: ddbdocumentsdk.ScanCommandInput = {
                TableName: tableName.get(),
                ConsistentRead: consistentRead,
            };
            while (true) {
                const result = await db.scan(params);
                const acceptMore = await callback(<any[]>result.Items);
                if (!acceptMore || (result.LastEvaluatedKey === undefined)) {
                    break;
                }
                params.ExclusiveStartKey = result.LastEvaluatedKey;
            }

            if (items !== undefined) {
                return items;
            }
            else {
                return;
            }
        });
        this.update = async (query: any, updates: any) => {
            let updateExpression = "";
            const attributeValues: {[key: string]: any} = {};
            for (const key of Object.keys(updates)) {
                const val = updates[key];
                if (updateExpression === "") {
                    updateExpression += "SET ";
                } else {
                    updateExpression += ", ";
                }
                updateExpression += `${key} = :${key}`;
                attributeValues[`:${key}`] = val;
            }
            const db = ddbdocumentsdk.DynamoDBDocument.from(new ddbsdk.DynamoDB({}));
            await db.update({
                TableName: tableName.get(),
                Key: query,
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: attributeValues,
            });
        };
        this.delete = async (query) => {
            const db = ddbdocumentsdk.DynamoDBDocument.from(new ddbsdk.DynamoDB({}));
            await db.delete({
                TableName: tableName.get(),
                Key: query,
            });
        };

        this.registerOutputs({
            primaryKey: this.primaryKey,
            primaryKeyType: this.primaryKeyType,
            dynamodbTable: this.dynamodbTable,
        });
    }
}
