// tslint:disable
// Copied from https://github.com/yvele/azure-function-express/blob/master/src until
// https://github.com/yvele/azure-function-express/pull/20 goes in.
// Apache 2.0 licensed.

/* eslint-disable no-underscore-dangle */
import * as EventEmitter from "events";

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

/**
 * Request object wrapper
 *
 * @private
 */
export default class IncomingMessage extends EventEmitter {

  /**
   * Note: IncomingMessage assumes that all HTTP in is binded to "req" property
   *
   * @param {Object} context Sanitized Azure context object for a single HTTP request
   */
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
