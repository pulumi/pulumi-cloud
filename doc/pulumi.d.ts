// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

// *******************************
// The Pulumi Platform library provides core building blocks for Pulumi cloud programs.
// *******************************

// HttpAPI publishes an internet-facing HTTP API, for serving web applications or REST APIs.
// TODO[pulumi/lumi-platform#4] We will make this API more Express-like.
export interface Request {
    resource: string;
    path: string;
    httpMethod: string;
    headers: { [header: string]: string; };
    queryStringParameters: { [param: string]: string; };
    pathParameters: { [param: string]: string; };
    stageVariables: { [name: string]: string; };
    body: string;
    isBase64Encoded: boolean;
}
export interface Response {
    isBase64Encoded?: boolean;
    statusCode: number;
    headers?: { [header: string]: string; };
    body: string;
}
export type RouteCallback = (err: any, resp: Response) => void;
export type RouteHandler = (req: Request, callback: RouteCallback) => void;
export class HttpAPI {
    url?: string;
    //////////
    // Outside
    //////////
    constructor(apiName: string);
    route(method: string, path: string, handler: RouteHandler): void;
    get(path: string, handler: RouteHandler): void;
    post(path: string, handler: RouteHandler): void;
    put(path: string, handler: RouteHandler): void;
    delete(path: string, handler: RouteHandler): void;
    publish(): void;
    //////////
    // Inside
    //////////
    // QUESTION - Is there any useful API needed inside?
}

// Table is a simplified document store for persistent application backend storage.
//   let table = new Table("id");
//   await table.insert({id: "kuibai", data: 42});
//   let item = await table.get({id: "kuibai"});
// Tables support a single primary key with a user-defined name.  All other document
// properties are schemaless.
// QUESTION - Is this thin semantic surface area useful enough for a wide range of
// applications?  Can it be faithfully implemented on Google Cloud Datastore,
// Azure DocumentDB, etc.?
export class Table {
    okayToDelete: boolean; // QUESTION - default to false and require that it manually be set to true before delete?
    //////////
    // Outside
    //////////
    constructor(tableName: string, key: string);
    // QUESTION - trigger events on insert/update/delete?
    //////////
    // Inside
    //////////
    // QUESTION - get/query only support identity filters, are other comparison needed, (e.g. $lte)?
    get(query: Object): Promise<any>;
    query(query?: Object): Promise<any[]>;
    insert(item: Object): Promise<void>;
    update(query: Object, item: Object): Promise<void>;
    // QUESTION - count is an expensive operation on most document DBs - can we leave off?
    count(query?: Object): Promise<number>;
    delete(query: Object): Promise<void>;
}

// Queue is a job queue for distributing work to job handlers which can run concurrently.
// TODO[pulumi/lumi-platform#8] Need to adopt new naming
export type QueueHandler<T> = (item: T) => void
export class Queue<T> {
    //////////
    // Outside
    //////////
    constructor(name: string);
    forEach(handler: QueueHandler<T>);
    //////////
    // Inside
    //////////
    push(item: T): Promise<void>;
}

export interface BucketEvent {
    bucketName: string;
    key: string;
    size: number;
}
export type BucketEventHandler = (obj: BucketEvent) => Promise<void>;
// Bucket is a blob store
export class Bucket {
    //////////
    // Outside
    //////////
    constructor(name: string);
    onObjectCreated(handler: BucketEventHandler);
    onObjectDeleted(handler: BucketEventHandler);
    //////////
    // Both
    //////////
    put(key: string, value: string); // QUESTION: Binary data, content-type, publically viewable URL, file upload?
    get(key: string): string; // QUESTION: Is it safe to expose this on the outside?
    list(): string[];
}

// onInterval invokes the handler on a regular cadence. 
export function onInterval(intervalMinutes: number, handler: () => void);
// Note - we are not (yet) exposing the ability to set time-of-day, time-of-week, etc.
// Maybe in the future:
// export function onDaily(hourUtc: number, minuteUtc: number, handler: () => void);
// export function onMonthly(dayOfMonthUtc: number hourUtc: number, minuteUtc: number, handler: () => void);

// A global onError handler - hook up a dead letter queue on all lambdas and redirect them
// to this handler.  We may also want/need more granular exception handling, but this can 
// be a start.
type ErrorHandler = (message: any) => void;
export function onError(handler: ErrorHandler);

// TODO:
// - Asset/Archive: How are references to local files handled?  Can they just be treated as string paths at the Pulumi Platform layer?
// - Task: Containers, presumably take a collection of one or more Dockerfiles + some task execution parameters.
//         QUESTIONS:
//         - How are ports exposed back into the program as services?
//         - Related - what is the Inside API for a Task?
//         - Allow configruation of execution params (cpu, memory, network-mode, mount-points, etc.)? 

