// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";

function pulumiKeyTypeToDynamoKeyType(keyType: cloud.PrimaryKeyType): string {
    switch (keyType) {
        case "string": return "S";
        case "number": return "N";
        case "boolean": return "B";
        default: throw new Error(`Unexpected key type ${keyType} - expected "string", "number" or "boolean"`);
    }
}

export class Table extends pulumi.ComponentResource implements cloud.Table {
    // Inside + Outside API

    public readonly primaryKey: string;
    public readonly primaryKeyType: string;

    public get: (query: Object) => Promise<any>;
    public insert: (item: Object) => Promise<void>;
    public scan: () => Promise<any[]>;
    public delete: (query: Object) => Promise<void>;
    public update: (query: Object, updates: Object) => Promise<void>;

    // Outside API (constructor and methods)

    constructor(name: string, primaryKey?: string, primaryKeyType?: cloud.PrimaryKeyType) {
        if (primaryKey === undefined) {
            primaryKey = "id";
        }
        if (primaryKeyType === undefined) {
            primaryKeyType = "string";
        }

        let tableName: pulumi.Computed<string>;
        super(
            "cloud:table:Table",
            name,
            {
                primaryKey: primaryKey,
                primaryKeyType: primaryKeyType,
            },
            () => {
                const table = new aws.dynamodb.Table(name, {
                    attribute: [
                        {
                            name: primaryKey,
                            type: pulumiKeyTypeToDynamoKeyType(primaryKeyType!),
                        },
                    ],
                    hashKey: primaryKey,
                    readCapacity: 5,
                    writeCapacity: 5,
                });
                tableName = table.name;
            },
        );

        const db = () => {
            const awssdk = require("aws-sdk");
            return new awssdk.DynamoDB.DocumentClient();
        };
        this.get = (query) => {
            return db().get({
                TableName: tableName,
                Key: query,
                ConsistentRead: true,
            }).promise().then((x: any) => x.Item);
        };
        this.insert = (item) => {
            return db().put({
                TableName: tableName,
                Item: item,
            }).promise();
        };
        this.scan = () => {
            return db().scan({
                TableName: tableName,
                ConsistentRead: true,
            }).promise().then((x: any) => x.Items);
        };
        this.update = (query: any, updates: any) => {
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
            return db().update({
                TableName: tableName,
                Key: query,
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: attributeValues,
            }).promise().then((x: any) => x.Items);
        };
        this.delete = (query) => {
            return db().delete({
                TableName: tableName,
                Key: query,
            }).promise();
        };
    }
}
