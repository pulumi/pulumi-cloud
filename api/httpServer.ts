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
    new (name: string,
         createRequestListener: () => (req: http.IncomingMessage, res: http.ServerResponse) => void,
         opts?: pulumi.ResourceOptions): HttpServer;
}

// tslint:disable-next-line:variable-name
export let HttpServer: HttpServerConstructor;

export interface HttpServer {
    readonly url: pulumi.Output<string>;
}
