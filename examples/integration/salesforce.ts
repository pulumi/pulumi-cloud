// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as config from "./config";
import { poll } from "./poll";

let salesforceEmail = config.salesforceEmail;
let salesforcePassword = config.salesforcePassword;

let getAuthenticatedSalesforceConnection: () => Promise<any> = async () => {
    let jsforce = require("jsforce");
    console.log(`loaded jsforce`);
    let conn = new jsforce.Connection();
    let auth = await conn.login(salesforceEmail, salesforcePassword);
    console.log(`authed with Salesforce: ${JSON.stringify(auth, null, "")}`);
    return conn;
};

// query returns a stream of all Salesforce records matching the SOQL query.
// This is a deployment-time API.
export function query(
    name: string,
    soql: (watermark: string) => string,
    watermarkDefault: string,
    watermarkField: string,
    watermarkSelection: (a: string, b: string) => string): cloud.Stream<Record> {
    let queryPoll = poll<Record>(name, {minutes: 1}, async (watermark) => {
        let conn = await getAuthenticatedSalesforceConnection();
        if (watermark === undefined) {
            watermark = watermarkDefault;
        }
        let queryText = soql(watermark);
        console.log(`query text: ${queryText}`);
        let res: QueryResult = await conn.query(queryText).run({autoFetch: true});
        console.log(`data from Salesforce: ${JSON.stringify(res, null, "")}`);
        watermark = (<string>(<any>res.records).reduce(
            (a: string, b: Record) => watermarkSelection(a, b[watermarkField]),
            watermark,
        ));
        return {
            nextToken: watermark,
            items: res.records,
        };
    });
    return queryPoll;
}

// queryAll runs a single SOQL query and returns the resulting records.
// This is a runtime API.
export let queryAll: (soql: string) => Promise<Record[]> = async (soql) => {
    let conn = await getAuthenticatedSalesforceConnection();
    console.log(`query text: ${soql}`);
    let res: QueryResult = await conn.query(soql).run({autoFetch: true});
    console.log(`data from Salesforce: ${JSON.stringify(res, null, "")}`);
    if (!res.done) {
        throw new Error(`expected to fetch all results - got ${(<any>res.records).length} of ${<any>res.totalSize}`);
    }
    return <any>res.records;
};

export type Record = { [property: string]: any };

interface QueryResult {
    done: boolean;
    nextRecordsUrl?: string;
    totalSize: number;
    records: Record[];
}

// allObjectModifications returns a stream of all Salesforce records for modifications to an object.
// This is a deployment-time API.
export function allObjectModifications(name: string, object: string, fields: string): cloud.Stream<Record> {
    if ((<any>fields).length === 0) {
        throw new Error("Expect at least one field name in the format `FieldA,FieldB`");
    }
    return query(
        "contacts",
        (timestamp) => `SELECT ${fields},LastModifiedDate FROM ${object} WHERE LastModifiedDate > ${timestamp}`,
        "2000-01-01T00:00:00.000Z",
        "LastModifiedDate",
        (a, b) => a > b ? a : b,
    );
}

export let insert: (tableName: string, object: any) => Promise<void> = async(tableName, object) => {
    let conn = await getAuthenticatedSalesforceConnection();
    let record = await conn.sobject(tableName).insert(object);
    console.log(record);
};
