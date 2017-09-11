// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as fabric from "@pulumi/pulumi-fabric";

export interface TableOptions {
    readCapacity?: number;
    writeCapacity?: number;
}

export class Table {
    private table: aws.dynamodb.Table;
    private readonly readCapacity: fabric.Computed<number>;
    private readonly writeCapacity: fabric.Computed<number>;

    // Inside + Outside API
    public tableName: fabric.Computed<string>;
    public readonly primaryKey: string;
    public readonly primaryKeyType: string;

    // Inside API (lambda-valued properties)
    get: (query: Object) => Promise<any>;
    insert: (item: Object) => Promise<void>;
    scan: () => Promise<any[]>;
    delete: (query: Object) => Promise<void>;
    update: (query: Object, updates: Object) => Promise<void>;

    // Outside API (constructor and methods)
    constructor(name: string, primaryKey?: string, primaryKeyType?: "S" | "N" | "B", opts?: TableOptions) {
        if (primaryKey === undefined) {
            primaryKey = "ID";
        }
        if (primaryKeyType === undefined) {
            primaryKeyType = "S";
        }
        if (opts === undefined) {
            opts = {};
        }
        let readCapacity = opts.readCapacity;
        if (readCapacity === undefined) {
            readCapacity = 5;
        }
        let writeCapacity = opts.writeCapacity;
        if (writeCapacity === undefined) {
            writeCapacity = 5;
        }
        this.table = new aws.dynamodb.Table(name, {
            attribute: [
                { name: primaryKey, type: primaryKeyType },
            ],
            hashKey: primaryKey,
            readCapacity: readCapacity,
            writeCapacity: writeCapacity,
        });
        this.tableName = this.table.name;
        this.primaryKey = primaryKey;
        this.primaryKeyType = primaryKeyType;
        this.readCapacity = this.table.readCapacity;
        this.writeCapacity = this.table.writeCapacity;
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
