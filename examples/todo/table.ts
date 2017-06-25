// Licensed to Pulumi Corporation ("Pulumi") under one or more
// contributor license agreements.  See the NOTICE file distributed with
// this work for additional information regarding copyright ownership.
// Pulumi licenses this file to You under the Apache License, Version 2.0
// (the "License"); you may not use this file except in compliance with
// the License.  You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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