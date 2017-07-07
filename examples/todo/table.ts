// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/*tslint:disable*/
declare let require: any;
import * as platform from "@lumi/platform";

export interface DB {
    get(query: Object): Promise<any>;
    insert(item: Object): Promise<void>;
    scan(): Promise<any[]>;
}

export let db: (table: platform.Table) => DB = table => {
    let aws = require("aws-sdk");
    let db = new aws.DynamoDB.DocumentClient();
    return <DB>{
        get: (query) => {
            return db.get({
                TableName: table.tableName,
                Key: query,
            }).promise().then((x: any) => x.Item);
        },
        insert: (item) => {
            return db.put({
                TableName: table.tableName,
                Item: item,
            }).promise();
        },
        scan: () => {
            return db.scan({
                TableName: table.tableName,
            }).promise().then((x: any) => x.Items);
        },
    }
}