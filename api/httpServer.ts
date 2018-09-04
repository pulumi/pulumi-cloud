// Copyright 2016-2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as pulumi from "@pulumi/pulumi";
import * as http from "http";

export interface HttpServerConstructor {
    /**
     * @param createRequestListener Function that, when called, will produce the [[requestListener]]
     * function that will be called for each http request to the server.  The function will be
     * called once when the module is loaded.  As such, it is a suitable place for expensive
     * computation (like setting up a set of routes).  The function returned can then utilize the
     * results of that computation.
     */
    new (name: string,
         createRequestListener: () => (req: http.IncomingMessage, res: http.ServerResponse) => void,
         opts?: pulumi.ResourceOptions): HttpServer;
}

// tslint:disable-next-line:variable-name
export let HttpServer: HttpServerConstructor;

/**
 * An HttpServer is used to listen and respond to http requests made to the exported [[url]].
 * HttpServers can be constructed passing in a Function that with the same signature as the
 * [[requestListener]] parameter in [[http.createServer]].  See:
 * https://nodejs.org/api/http.html#http_http_createserver_options_requestlistener for more details.
 */
export interface HttpServer {
    readonly url: pulumi.Output<string>;
}
