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

export class Table extends pulumi.Resource implements cloud.Table {
    private table: aws.dynamodb.Table;

    // Inside + Outside API

    public readonly primaryKey: string;
    public readonly primaryKeyType: string;
    public readonly tableName: pulumi.Computed<string>;

    public get: (query: Object) => Promise<any>;
    public insert: (item: Object) => Promise<void>;
    public scan: () => Promise<any[]>;
    public delete: (query: Object) => Promise<void>;
    public update: (query: Object, updates: Object) => Promise<void>;

    // Outside API (constructor and methods)

    constructor(name: string, primaryKey?: string, primaryKeyType?: cloud.PrimaryKeyType) {
        super();

        if (primaryKey === undefined) {
            primaryKey = "id";
        }
        if (primaryKeyType === undefined) {
            primaryKeyType = "string";
        }

        const keyType = pulumiKeyTypeToDynamoKeyType(primaryKeyType);
        this.table = new aws.dynamodb.Table(name, {
            attribute: [
                { name: primaryKey, type: keyType },
            ],
            hashKey: primaryKey,
            readCapacity: 5,
            writeCapacity: 5,
        });
        this.adopt(this.table);

        this.tableName = this.table.name;
        this.primaryKey = primaryKey;
        this.primaryKeyType = primaryKeyType;

        const db = () => {
            const awssdk = require("aws-sdk");
            return new awssdk.DynamoDB.DocumentClient();
        };
        this.get = (query) => {
            return db().get({
                TableName: this.tableName,
                Key: query,
            }).promise().then((x: any) => x.Item);
        };
        this.insert = (item) => {
            return db().put({
                TableName: this.tableName,
                Item: item,
            }).promise();
        };
        this.scan = () => {
            return db().scan({
                TableName: this.tableName,
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
                TableName: this.tableName,
                Key: query,
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: attributeValues,
            }).promise().then((x: any) => x.Items);
        };
        this.delete = (query) => {
            return db().delete({
                TableName: this.tableName,
                Key: query,
            }).promise();
        };

        this.register("cloud:table:Table", name, false, {
            primaryKey: primaryKey,
            primaryKeyType: primaryKeyType,
        });
    }
}
