// tslint:disable
// Copied from https://github.com/yvele/azure-function-express/blob/master/src until
// https://github.com/yvele/azure-function-express/pull/20 goes in.
// Apache 2.0 licensed.

import * as EventEmitter from "events";

const statusCodes = {
    100 : "Continue",
    101 : "Switching Protocols",
    102 : "Processing",                 // RFC 2518, obsoleted by RFC 4918
    200 : "OK",
    201 : "Created",
    202 : "Accepted",
    203 : "Non-Authoritative Information",
    204 : "No Content",
    205 : "Reset Content",
    206 : "Partial Content",
    207 : "Multi-Status",               // RFC 4918
    208 : "Already Reported",
    226 : "IM Used",
    300 : "Multiple Choices",
    301 : "Moved Permanently",
    302 : "Found",
    303 : "See Other",
    304 : "Not Modified",
    305 : "Use Proxy",
    307 : "Temporary Redirect",
    308 : "Permanent Redirect",         // RFC 7238
    400 : "Bad Request",
    401 : "Unauthorized",
    402 : "Payment Required",
    403 : "Forbidden",
    404 : "Not Found",
    405 : "Method Not Allowed",
    406 : "Not Acceptable",
    407 : "Proxy Authentication Required",
    408 : "Request Timeout",
    409 : "Conflict",
    410 : "Gone",
    411 : "Length Required",
    412 : "Precondition Failed",
    413 : "Payload Too Large",
    414 : "URI Too Long",
    415 : "Unsupported Media Type",
    416 : "Range Not Satisfiable",
    417 : "Expectation Failed",
    418 : "I\"m a teapot",              // RFC 2324
    421 : "Misdirected Request",
    422 : "Unprocessable Entity",       // RFC 4918
    423 : "Locked",                     // RFC 4918
    424 : "Failed Dependency",          // RFC 4918
    425 : "Unordered Collection",       // RFC 4918
    426 : "Upgrade Required",           // RFC 2817
    428 : "Precondition Required",      // RFC 6585
    429 : "Too Many Requests",          // RFC 6585
    431 : "Request Header Fields Too Large", // RFC 6585
    451 : "Unavailable For Legal Reasons",
    500 : "Internal Server Error",
    501 : "Not Implemented",
    502 : "Bad Gateway",
    503 : "Service Unavailable",
    504 : "Gateway Timeout",
    505 : "HTTP Version Not Supported",
    506 : "Variant Also Negotiates",    // RFC 2295
    507 : "Insufficient Storage",       // RFC 4918
    508 : "Loop Detected",
    509 : "Bandwidth Limit Exceeded",
    510 : "Not Extended",               // RFC 2774
    511 : "Network Authentication Required" // RFC 6585
  };


const NOOP = () => {};

function removePortFromAddress(address: any) {
  return address
    ? address.replace(/:[0-9]*$/, "")
    : address;
}

/**
 * Create a fake connection object
 *
 * @param {Object} context Raw Azure context object for a single HTTP request
 * @returns {object} Connection object
 */
function createConnectionObject(context: any) {
  const { req } = context.bindings;
  const xForwardedFor = req.headers ? req.headers["x-forwarded-for"] : undefined;

  return {
    encrypted     : req.originalUrl && req.originalUrl.toLowerCase().startsWith("https"),
    remoteAddress : removePortFromAddress(xForwardedFor)
  };
}

/**
 * Copy usefull context properties from the native context provided by the Azure Function engine
 *
 * See:
 * - https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node#context-object
 * - https://github.com/christopheranderson/azure-functions-typescript/blob/master/src/context.d.ts
 *
 * @param {Object} context Raw Azure context object for a single HTTP request
 * @returns {Object} Filtered context
 */
function sanitizeContext(context: any) {
  const sanitizedContext = {
    ...context,
    log : context.log.bind(context)
  };

  // We don't want the developper to mess up express flow
  // See https://github.com/yvele/azure-function-express/pull/12#issuecomment-336733540
  delete sanitizedContext.done;

  return sanitizedContext;
}

class IncomingMessage extends EventEmitter {
  constructor(context: any) {
    super();

    Object.assign(this, context.bindings.req); // Inherit

    (<any>this).url = (<any>this).originalUrl;
    (<any>this).headers = (<any>this).headers || {}; // Should always have a headers object

    (<any>this)._readableState = { pipesCount: 0 }; // To make unpipe happy
    (<any>this).resume = NOOP;
    (<any>this).socket = { destroy: NOOP };
    (<any>this).connection = createConnectionObject(context);

    (<any>this).context = sanitizeContext(context); // Specific to Azure Function
  }

}

function convertToBody(body: any, encoding: any) {
    // This may be removed on Azure Function native support for Buffer
    // https://github.com/Azure/azure-webjobs-sdk-script/issues/814
    // https://github.com/Azure/azure-webjobs-sdk-script/pull/781
    return Buffer.isBuffer(body)
      ? body.toString(encoding)
      : body;
}

function end(context: any, data: any, encoding: any) {
// 1. Write head
    this.writeHead(this.statusCode); // Make jshttp/on-headers able to trigger

    // 2. Return raw body to Azure Function runtime
    context.res.body = convertToBody(data, encoding);
    context.res.isRaw = true;
    context.done();
}

function writeHead(context: any, statusCode: any, statusMessage: any, headers: any) {
    // 1. Status code
    statusCode |= 0; // eslint-disable-line no-param-reassign
    if (statusCode < 100 || statusCode > 999) {
        throw new RangeError(`Invalid status code: ${statusCode}`);
    }

    // 2. Status message
    if (typeof statusMessage === "string") {
        this.statusMessage = statusMessage;
    } else {
        this.statusMessage = (<any>statusCodes)[statusCode] || "unknown";
    }

    // 3. Headers
    if (typeof statusMessage === "object" && typeof headers === "undefined") {
        headers = statusMessage; // eslint-disable-line no-param-reassign
    }
    if (this._headers) {
        // Slow-case: when progressive API and header fields are passed.
        if (headers) {
            const keys = Object.keys(headers);
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                if (k) {
                this.setHeader(k, headers[k]);
                }
            }
        }
        // only progressive api is used
        headers = this._renderHeaders(); // eslint-disable-line no-param-reassign
    }

    // 4. Sets everything
    context.res.status = statusCode;
    context.res.headers = headers;
}

/**
 * OutgoingMessage mock based on https://github.com/nodejs/node/blob/v6.x
 *
 * Note: This implementation is only meant to be working with Node.js v6.x
 *
 * @private
 */
class OutgoingMessage {

    /**
     * Original implementation: https://github.com/nodejs/node/blob/v6.x/lib/_http_outgoing.js#L48
     */
    constructor(context: any) {
        (<any>this)._headers = null;
        (<any>this)._headerNames = {};
        (<any>this)._removedHeader = {};
        (<any>this)._hasBody = true;

        // Those methods cannot be prototyped because express explicitelly overrides __proto__
        // See https://github.com/expressjs/express/blob/master/lib/middleware/init.js#L29
        (<any>this).writeHead = writeHead.bind(this, context);
        (<any>this).end = end.bind(this, context);
    }

    /**
     * Original implementation: https://github.com/nodejs/node/blob/v6.x/lib/_http_outgoing.js#L349
     *
     * Note: Although express overrides all prototypes, this method still needs to be added because
     *       express may call setHeader right before overriding prototype (to set "X-Powered-By")
     *       See https://github.com/expressjs/express/blob/master/lib/middleware/init.js#L23
     *
     * @param {string} name
     * @param {string} value
     */
    setHeader(name: any, value: any) {
        if (!(<any>this)._headers) {
            (<any>this)._headers = {};
        }

        const key = name.toLowerCase();
        (<any>this)._headers[key] = value;
        (<any>this)._headerNames[key] = name;
    }

}

/**
 * @param {Object} context Azure Function native context object
 * @throws {Error}
 * @private
 */
function assertContext(context: any) {
  if (!context) {
    throw new Error("context is null or undefined");
  }

  if (!context.bindings) {
    throw new Error("context.bindings is null or undefined");
  }

  if (!context.bindings.req) {
    throw new Error("context.bindings.req is null or undefined");
  }

  if (!context.bindings.req.originalUrl) {
    throw new Error("context.bindings.req.originalUrl is null or undefined");
  }
}

class ExpressAdapter extends EventEmitter {
  constructor(requestListener: (...args: any[]) => void) {
    super();

    if (requestListener !== undefined) {
      this.addRequestListener(requestListener);
    }
  }

  /**
   * Adds a request listener (typically an express/connect instance).
   *
   * @param {Object} requestListener Request listener (typically an express/connect instance)
   */
  addRequestListener(requestListener: any) {
    this.addListener("request", requestListener);
  }

  /**
   * Handles Azure Function requests.
   *
   * @param {Object} context Azure context object for a single request
   */
  handleAzureFunctionRequest(context: any) {
    assertContext(context);

    // 1. Context basic initialization
    context.res = context.res || {};

    // 2. Wrapping
    const req = new IncomingMessage(context);
    const res = new OutgoingMessage(context);

    // 3. Synchronously calls each of the listeners registered for the event
    this.emit("request", req, res);
  }

  /**
   * Create function ready to be exposed to Azure Function for request handling.
   *
   * @returns {function(context: Object)} Azure Function handle
   */
  createAzureFunctionHandler() {
    return this.handleAzureFunctionRequest.bind(this);
  }

}

/**
 * Creates a function ready to be exposed to Azure Function for request handling.
 *
 * @param {Object} requestListener Request listener (typically an express/connect instance)
 * @returns {function(context: Object)} Azure Function handle
 */
function createAzureFunctionHandler(requestListener: any) {
    const adapter = new ExpressAdapter(requestListener);
    return adapter.createAzureFunctionHandler();
  }

export { createAzureFunctionHandler as createHandler };
