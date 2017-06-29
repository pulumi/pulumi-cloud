# Pulumi Platform Design Doc

The pulumi platform library offers core building block resources for building cloud applications.
An outline of the proposed API surface area is in [./pulumi.d.ts](pulumi.d.ts).

In this doc, we'll review some of the major design decisions for Pulumi and Lumi that impact the
design of the Pulumi Platform library.

## Runtime vs. deploytime APIs

Pulumi platform objects provide a set of APIs for use during deployment, as well as a set of APIs
for use at application runtime.  For example, a `Queue` in the Pulumi Platform exposes the following API:

```typescript
export class Queue<T> {
    // Outside
    constructor(name: string);
    forEach(name: string, handler: QueueHandler<T>);
    // Inside
    push(item: T): Promise<void>;
}
export type QueueHandler<T> = (item: T) => void
```

The `constructor` and `forEach` APIs are available during deployment, and in the backing implementation
these APIs will create and manage underlying infrastructure (e.g. an AWS SNS Topic and SNS Subscription).
The `push` API on the other hand is available at runtime.  Notably, in our current design, it is not
available at deployment time, as it leads to non-deterministic I/O during deployment.

For the current Pulumi platforms, this pattern is consistent - each platform object exposes distinct API
surface area for deploy time and runtime.  We have two options for how we expose this to developers:

1. A single API, which throws errors for the APIs that are unusable in the current context.
2. Two seperate APIs, with a function to convert the deploy time refrence to the runtime API.

The first option leads to the following developer experience.  The most important benefit of this
approach is that there is just a single object API, and capturing a reference to `queue` provides 
direct access to the runtime API for the resource.  However, especially because the APIs are disjoint,
it is perhaps unexpected that many/most of the API available on the object is not availble in each
execution context.

```typescript
// Option 1
let queue = new Queue("queue");
queue.forEach("watcher", item => {
    console.log(item);
    if (item.length > 0) {
        queue.push(item.substring(1))
    }
    if (item.length > 10000) {
        queue.forEach(item, console.log); // ERROR - `forEach` not availble at runtime.
    }
});
queue.push("hello"); // ERROR - `push` not available at deployment time.
```

The second option seperates the two APIs, with a projection function to access the runtime API. This option 
provides accurate intellisense and TypeScript error checking of whether APIs can be used in each context.  
This is explicit, but breaks some of the illusion that the resource reference can be captured and used directly.

```typescript
// Option 2
import { pulumi } from "@pulumi/platfform";
let queue = new Queue("queue");
queue.forEach("watcher", item => {
    console.log(item);
    if (item.length > 0) {
        pulumi(queue).push(item.substring(1))
    }
    if (item.length > 10000) {
        pulumi(queue).forEach(item, console.log); // ERROR - no member `forEach`.
    }
});
queue.push("hello"); // ERROR - no member `push`.
```

__Recommendation__: Option 1 provides the simpler developer experience and maintains the illusion that the 
resource object can be captured and used directly at runtime.

## Promises

The Pulumi Platform is being defined initially as a JavaScript/TypeScript library.  For the deployment time
APIs, we hide the I/O under a synchronous API surface - for example, `new` effectively blocks execution until 
dependent resources are available or created in the underlying infrastructure environment.  But for the runtime
APIs, these must run in a normal Node.js execution environment with asynchronous I/O primtives.

Node.js APIs generally have three options for exposing new async I/O APIs:
1. Use `(err, data) => void` callback parameters.
2. Use `Promise`s
3. Offer both options, through overloading or a `.promise` member.

Option #1 is the most flexible, as it can be used in any Node.js environment and can easily be wrapped into a promise
with an external library like `util.promisify()`.  Option #2 provides the most directly desirable developer experience,
but without the option to use standard Node.js-style callbacks.  Option #3 with overloading aims to provide the best of 
both options but adds complexity.

__Recommendation__: For now, we'll stick with callbacks, as this is the simpler and more consistent model.  We will
reconsider introducing promises via either option #2 or #3 in the future.



