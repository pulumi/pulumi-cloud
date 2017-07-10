// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

// *******************************
// The Pulumi Platform library provides core building blocks for Pulumi cloud programs.
// *******************************

// HttpAPI publishes an internet-facing HTTP API, for serving web applications or REST APIs.
//
//   let api = new HttpAPI("myapi")
//   api.publish();
//   api.get("/", (req, res) => res.json({hello: "world"}));
//   console.log(`Serving myapi at ${api.url}`);
//
// Paths are `/` seperated.  A path can use `{param}` to capture zero-or-more non-`/` characters 
// and make the captured path segment available in `req.params.param`, or `{param+}` to greedily 
// capture all remaining characters in the url path into `req.params.param`.
//
// Paths and routing are defined statically, and cannot overlap. Code inside a route handler
// can be used to provide dynamic decisions about sub-routing within a static path.
export interface Request {
    body: string;
    method: string;
    params: { [param: string]: string; };
    headers: { [header: string]: string; };
    query: { [query: string]: string; };
}
export interface Response {
    status(code: number): Response;
    setHeader(name: string, value: string): Response;
    write(data: string): Response;
    end(data?: string): void;
    json(obj: any): void;
}
export type RouteHandler = (req: Request, res: Response) => void;
export class HttpAPI {
    // The url where the API is published.  Only available after calling `publish`.
    readonly url?: string;
    //////////
    // Outside
    //////////
    constructor(apiName: string);
    // Handles a request of the provided method and path on the HttpAPI using the provided handler.
    route(method: string, path: string, handler: RouteHandler): void;
    // Handles a GET request for the provided path on the HttpAPI using the provided handler.
    get(path: string, handler: RouteHandler): void;
    // Handles a GET request for the provided path on the HttpAPI using the provided handler.
    post(path: string, handler: RouteHandler): void;
    // Handles a GET request for the provided path on the HttpAPI using the provided handler.
    put(path: string, handler: RouteHandler): void;
    // Handles a GET request for the provided path on the HttpAPI using the provided handler.
    delete(path: string, handler: RouteHandler): void;
    // Publishes the HttpAPI with the configured routes.
    publish(): void;
    //////////
    // Inside
    //////////
    // None
}

// Table is a simplified document store for persistent application backend storage.
//
//   let table = new Table("id");
//   await table.insert({id: "kuibai", data: 42});
//   let item = await table.get({id: "kuibai"});
//
// Tables support a single primary key with a user-defined name.  All other document
// properties are schemaless.
//
// All queries provide a subset of properties to filter on, and only filters on value equality
// are supported.  The get, update and delete operations expect the query to contain only the 
// value for the primary key. 
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

// Topic is a pub/sub topic for distributing work to job handlers which can run concurrently.
//
//   let topic = new Topic();
//   topic.subscribe(async (num) => {
//     if (num > 0) {
//       await topic.publish(num - 1);
//     }
//   });
//
export class Topic<T> {
    //////////
    // Outside
    //////////
    constructor(name: string);
    subscribe(name: string, handler: (item: T) => Promise<void>);
    //////////
    // Inside
    //////////
    publish(item: T): Promise<void>;
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
type ErrorHandler = (message: string, payload: any) => void;
export function onError(name: string, handler: ErrorHandler);

// TODO:
// - Asset/Archive: How are references to local files handled?  Can they just be treated as string paths at the Pulumi Platform layer?
// - Task: Containers, presumably take a collection of one or more Dockerfiles + some task execution parameters.
//         QUESTIONS:
//         - How are ports exposed back into the program as services?
//         - Related - what is the Inside API for a Task?
//         - Allow configruation of execution params (cpu, memory, network-mode, mount-points, etc.)? 

