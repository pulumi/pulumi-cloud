// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/*tslint:disable:no-require-imports*/
declare let require: any;
import * as aws from "@lumi/aws";

export interface TableOptions {
    readCapacity?: number;
    writeCapacity?: number;
}

export class Table {
    private table: aws.dynamodb.Table;
    private readonly readCapacity: number;
    private readonly writeCapacity: number;

    // Inside + Outside API
    public tableName: string;
    public readonly primaryKey: string;
    public readonly primaryKeyType: string;

    // Inside API (lambda-valued properties)
    get: (query: Object) => Promise<any>;
    insert: (item: Object) => Promise<void>;
    scan: () => Promise<any[]>;

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
            attributes: [
                { name: primaryKey, type: primaryKeyType },
            ],
            hashKey: primaryKey,
            readCapacity: readCapacity,
            writeCapacity: writeCapacity,
        });
        this.tableName = this.table.tableName!;
        this.primaryKey = primaryKey;
        this.primaryKeyType = primaryKeyType;
        this.readCapacity = this.table.readCapacity;
        this.writeCapacity = this.table.writeCapacity;
        let db = () => {
            let aws = require("aws-sdk");
            return new aws.DynamoDB.DocumentClient();
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
    }
}
