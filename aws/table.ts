// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";

// For type-safety purposes, we want to be able to mark some of our types with typing information
// from aws-sdk.  However, we don't want to actually import this library and cause that module to
// load and run doing pulumi planning time.  so we just do an "import + require" and we note that
// this imported variable should only be used in 'type' (and not value) positions.  The ts compiler
// will then elide this actual declaration when compiling.
import _awsTypesOnly = require("aws-sdk");

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

        const db = (): _awsTypesOnly.DynamoDB.DocumentClient => {
            const awssdk = require("aws-sdk");
            return new awssdk.DynamoDB.DocumentClient();
        };

        function getTableName(): string {
            // Hack: Because of our outside/inside system for pulumi, tableName is seen as a
            // Computed<string> on the outside, but a string on the inside. Of course, there's no
            // way to make TypeScript aware of that.  So we just fool the typesystem with these
            // explicit casts.
            //
            // see: https://github.com/pulumi/pulumi/issues/331#issuecomment-333280955
            return <string><any>tableName;
        }

        this.get = async (query) => {
            const result = await db().get({
                TableName: getTableName(),
                Key: query,
                ConsistentRead: true,
            }).promise();

            return result.Item;
        };
        this.insert = async (item) => {
            await db().put({
                TableName: getTableName(),
                Item: item,
            }).promise();
        };
        this.scan = async () => {
            const result = await db().scan({
                TableName: getTableName(),
                ConsistentRead: true,
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
            await db().update({
                TableName: getTableName(),
                Key: query,
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: attributeValues,
            }).promise();
        };
        this.delete = async (query) => {
            await db().delete({
                TableName: getTableName(),
                Key: query,
            }).promise();
        };
    }
}
