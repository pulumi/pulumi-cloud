// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";
import { Dependency } from "pulumi";

function pulumiKeyTypeToDynamoKeyType(keyType: cloud.PrimaryKeyType): string {
    switch (keyType) {
        case "string": return "S";
        case "number": return "N";
        case "boolean": return "B";
        default: throw new Error(`Unexpected key type ${keyType} - expected "string", "number" or "boolean"`);
    }
}

const consistentRead = true;

export class Table extends pulumi.ComponentResource implements cloud.Table {
    public readonly primaryKey: pulumi.Computed<string>;
    public readonly primaryKeyType: pulumi.Computed<string>;
    public readonly dynamodbTable: aws.dynamodb.Table;

    public get: (query: Object) => Promise<any>;
    public insert: (item: Object) => Promise<void>;
    public scan: () => Promise<any[]>;
    public delete: (query: Object) => Promise<void>;
    public update: (query: Object, updates: Object) => Promise<void>;

    constructor(name: string,
                primaryKey?: pulumi.ComputedValue<string>,
                primaryKeyType?: pulumi.ComputedValue<cloud.PrimaryKeyType>,
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
            attribute: [
                {
                    name: primaryKey,
                    type: Dependency.resolve(primaryKeyType).apply(t => pulumiKeyTypeToDynamoKeyType(t)),
                },
            ],
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
        this.scan = async () => {
            const db = await getDb();
            const result = await db.scan({
                TableName: tableName.get(),
                ConsistentRead: consistentRead,
            }).promise();
            return <any[]>result.Items;
        };
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
