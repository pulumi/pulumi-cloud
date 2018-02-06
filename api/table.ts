// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";

/**
 * The available types for primary keys. The default primary key type is
 * `string`.
 */
export type PrimaryKeyType = "string" | "number" | "boolean";

export interface TableConstructor {
    /**
     * Creates a new Table.
     *
     * @param name A unique name for the table.
     * @param primaryKey An optional primary key name.
     * @param primaryKeyType An optional primary key type.
     * @param opts A bag of options that controls how this resource behaves.
     */
    new (name: string,
         primaryKey?: pulumi.Input<string>,
         primaryKeyType?: pulumi.Input<PrimaryKeyType>,
         opts?: pulumi.ResourceOptions): Table;
}

export let Table: TableConstructor; // tslint:disable-line

/**
 * Table is a simple document store for persistent application backend storage.
 *
 * ```javascript
 * let table = new Table("my-table");
 * await table.insert({id: "kuibai", data: 42});
 * let item = await table.get({id: "kuibai"});
 * ```
 *
 * Tables support a single primary key with a user-defined name and type.  All
 * other document properties are schemaless.  If not specified, a primary key
 * named `id` with type `string` is used.
 *
 * All queries provide a subset of properties to filter on, and only filters on
 * value equality are supported.  The `get`, `update` and `delete` operations
 * expect the query to contain only the value for the primary key.
 */
export interface Table {
    /**
     * The name of the primary key.
     */
    readonly primaryKey: pulumi.Output<string>;
    /**
     * The type of the primary key.
     */
    readonly primaryKeyType: pulumi.Output<string>;

    /**
     * Get a document from the table.
     *
     * @param query An object with the primary key ("id" by default) assigned
     * the value to lookup.
     * @returns A promise for the resulting document if found, or for undefined if not found,
     *   or a failed promise if the query could not be processed.
     */
    get(query: Object): Promise<any>;
    /**
     * Insert a document into the table.
     *
     * @param item An object representing the full document to insert. Must
     *   include a property for the primary key ("id" by default).
     * @returns A promise for the success or failure of the insert.
     */
    insert(item: Object): Promise<void>;
    /**
     * Gets all documents from the table.
     *
     * @returns A promise for the resulting documents, or a failed promise if
     * the lookup fails.
     */
    scan(): Promise<any[]>;
    /**
     * Deletes a documents from the table.
     *
     * @param query An object with the primary key ("id" by default) assigned
     * the value to lookup.
     * @returns A promise for the success or failure of the delete.
     */
    delete(query: Object): Promise<void>;
    /**
     * Updates a documents in the table.
     *
     * @param query An object with the primary key ("id" by default) assigned
     * the value to lookup.
     * @param updates An object with all document properties that should be
     * updated.
     * @returns A promise for the success or failure of the update.
     */
    update(query: Object, updates: Object): Promise<void>;
}
