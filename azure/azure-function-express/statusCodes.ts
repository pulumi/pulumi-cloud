// tslint:disable
// Copied from https://github.com/yvele/azure-function-express/blob/master/src until
// https://github.com/yvele/azure-function-express/pull/20 goes in.
// Apache 2.0 licensed.

export default {
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
