// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/*tslint:disable*/
declare let require: any;
import * as platform from "@lumi/platform";

export interface DB {
    get(query: Object, callback: (err: any, data: any) => void): void;
    insert(item: Object, callback: (err: any, data: any) => void): void;
    scan(callback: (err: any, data: any) => void): void;
}

export let db: (table: platform.Table) => DB = table => {
    let aws = require("aws-sdk");
    let db = new aws.DynamoDB.DocumentClient();
    return <DB>{
        get: (query, callback) => {
            return db.get({
                TableName: table.tableName,
                Key: query,
            }, callback);
        },
        insert: (item, callback) => {
            return db.put({
                TableName: table.tableName,
                Item: item,
            }, callback);
        },
        scan: (callback) => {
            return db.scan({
                TableName: table.tableName,
            }, callback);
        },
    }
}