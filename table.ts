// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import { Table as DynamoTable } from "@lumi/aws/dynamodb";

export interface TableOptions {
    readCapacity?: number;
    writeCapacity?: number;
}

export class Table {
    private table: DynamoTable;
    public tableName: string;

    public readonly primaryKey: string;
    public readonly primaryKeyType: string;
    private readonly readCapacity: number;
    private readonly writeCapacity: number;

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
        this.table = new DynamoTable(name, {
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
    }
}
