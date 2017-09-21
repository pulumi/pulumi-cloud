// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as fabric from "@pulumi/pulumi-fabric";
import * as types from "./../api/types";

function pulumiKeyTypeToDynamoKeyType(keyType: types.PrimaryKeyType): string {
    switch (keyType) {
        case "string": return "S";
        case "number": return "N";
        case "boolean": return "B";
        default: throw new Error(`Unexpected key type ${keyType} - expected "string", "number" or "boolean"`);
    }
}

/**
 * Table is a simple document store for persistent application backend storage.
 *
 * ```javascript
 * let table = new Table("my-table");
 * await table.insert({id: "kuibai", data: 42});
 * let item = await table.get({id: "kuibai"});
 * ```
 *
 * Tables support a single primary key with a user-defined name and type.  All other document
 * properties are schemaless.  If not specified, a primary key named `id` with type `string` is
 * used.
 *
 * All queries provide a subset of properties to filter on, and only filters on value equality
 * are supported.  The `get`, `update` and `delete` operations expect the query to contain only the
 * value for the primary key.
 */
export class Table {
    private table: aws.dynamodb.Table;

    // Inside + Outside API

    /**
     * The computed name of the table.
     */
    public tableName: fabric.Computed<string>;
    /**
     * The name of the primary key.
     */
    public readonly primaryKey: string;
    /**
     * The type of the primary key.
     */
    public readonly primaryKeyType: string;

    // Inside API (lambda-valued properties)
    /**
     * Get a document from the table.
     *
     * @param query An object with the primary key ("id" by default) assigned the value to lookup.
     * @returns A promise for the resulting document, or a failed promise if the lookup fails.
     */
    get: (query: Object) => Promise<any>;
    /**
     * Insert a document into the table.
     *
     * @param item An object representing the full document to insert. Must include a property for
     *   the primary key ("id" by default).
     * @returns A promise for the success or failure of the insert.
     */
    insert: (item: Object) => Promise<void>;
    /**
     * Gets all documents from the table.
     *
     * @returns A promise for the resulting documents, or a failed promise if the lookup fails.
     */
    scan: () => Promise<any[]>;
    /**
     * Deletes a documents from the table.
     *
     * @param query An object with the primary key ("id" by default) assigned the value to lookup.
     * @returns A promise for the success or failure of the delete.
     */
    delete: (query: Object) => Promise<void>;
    /**
     * Updates a documents in the table.
     *
     * @param query An object with the primary key ("id" by default) assigned the value to lookup.
     * @param updates An object with all document properties that should be updated.
     * @returns A promise for the success or failure of the update.
     */
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
