// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as types from "@pulumi/pulumi";
import * as fabric from "@pulumi/pulumi-fabric";

function pulumiKeyTypeToDynamoKeyType(keyType: types.PrimaryKeyType): string {
    switch (keyType) {
        case "string": return "S";
        case "number": return "N";
        case "boolean": return "B";
        default: throw new Error(`Unexpected key type ${keyType} - expected "string", "number" or "boolean"`);
    }
}

export class Table implements types.Table {
    private table: aws.dynamodb.Table;

    // Inside + Outside API

    public tableName: fabric.Computed<string>;
    public readonly primaryKey: string;
    public readonly primaryKeyType: string;

    get: (query: Object) => Promise<any>;
    insert: (item: Object) => Promise<void>;
    scan: () => Promise<any[]>;
    delete: (query: Object) => Promise<void>;
    update: (query: Object, updates: Object) => Promise<void>;

    // Outside API (constructor and methods)

    constructor(name: string, primaryKey?: string, primaryKeyType?: types.PrimaryKeyType) {
        if (primaryKey === undefined) {
            primaryKey = "id";
        }
        if (primaryKeyType === undefined) {
            primaryKeyType = "string";
        }
        let keyType = pulumiKeyTypeToDynamoKeyType(primaryKeyType);
        this.table = new aws.dynamodb.Table(name, {
            attribute: [
                { name: primaryKey, type: keyType },
            ],
            hashKey: primaryKey,
            readCapacity: 5,
            writeCapacity: 5,
        });
        this.tableName = this.table.name;
        this.primaryKey = primaryKey;
        this.primaryKeyType = primaryKeyType;
        let db = () => {
            let awssdk = require("aws-sdk");
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
            let attributeValues: {[key: string]: any} = {};
            for (let key of Object.keys(updates)) {
                let val = updates[key];
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
    }
}
