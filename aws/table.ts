// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";

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

        super("cloud:table:Table", name, {
            primaryKey: primaryKey,
            primaryKeyType: primaryKeyType,
        }, opts);

        this.dynamodbTable = new aws.dynamodb.Table(name, {
            attributes: [{
                name: primaryKey,
                type: pulumi.output(primaryKeyType).apply(t => pulumiKeyTypeToDynamoKeyType(t)),
            }],
            hashKey: primaryKey,
            readCapacity: 5,
            writeCapacity: 5,
        }, { parent: this });

        const tableName = this.dynamodbTable.name;
        async function getDb() {
            const awssdk = await import("aws-sdk");
            return new awssdk.DynamoDB.DocumentClient();
        }

        this.get = async (query) => {
            const db = await getDb();
            const result = await db.get({
                TableName: tableName.get(),
                Key: query,
                ConsistentRead: consistentRead,
            }).promise();

            return result.Item;
        };
        this.insert = async (item) => {
            const db = await getDb();
            await db.put({
                TableName: tableName.get(),
                Item: item,
            }).promise();
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

            const db = await getDb();
            const params: any = {
                TableName: tableName.get(),
                ConsistentRead: consistentRead,
            };
            while (true) {
                const result = await db.scan(params).promise();
                const acceptMore = await callback(<any[]>result.Items);
                if (!acceptMore || (result.LastEvaluatedKey === undefined)) {
                    break;
                }
                params.ExclusiveStartKey = result.LastEvaluatedKey;
            }
            if (items !== undefined) {
                return items;
            } else {
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
            const db = await getDb();
            await db.update({
                TableName: tableName.get(),
                Key: query,
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: attributeValues,
            }).promise();
        };
        this.delete = async (query) => {
            const db = await getDb();
            await db.delete({
                TableName: tableName.get(),
                Key: query,
            }).promise();
        };
    }
}
