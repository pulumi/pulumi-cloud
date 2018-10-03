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

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

interface ApigatewayIntegration {
    passthroughBehavior?: string;
    httpMethod: string;
    type: string;
    uri: pulumi.Output<string>;
}

export interface SwaggerSpec {
    swagger: string;
    info: SwaggerInfo;
    paths: { [path: string]: { [method: string]: SwaggerOperation; }; };
    "x-amazon-apigateway-binary-media-types"?: string[];
}

interface SwaggerInfo {
    title: string;
    version: string;
}

interface SwaggerOperation {
    "x-amazon-apigateway-integration": ApigatewayIntegration;
}

// createSwaggerString creates a JSON string out of a Swagger spec object.  This is required versus
// an ordinary JSON.stringify because the spec contains computed values.
export function createSwaggerString(spec: SwaggerSpec): pulumi.Output<string> {
    return pulumi.output(spec).apply(s => {
        return JSON.stringify({
            swagger: s.swagger,
            info: s.info,
            paths: s.paths,
            "x-amazon-apigateway-binary-media-types": s["x-amazon-apigateway-binary-media-types"],
            // Map paths the user doesn't have access to as 404.
            // http://docs.aws.amazon.com/apigateway/latest/developerguide/supported-gateway-response-types.html
            "x-amazon-apigateway-gateway-responses": {
                "MISSING_AUTHENTICATION_TOKEN": {
                    "statusCode": 404,
                    "responseTemplates": {
                        "application/json": "{\"message\": \"404 Not found\" }",
                    },
                },
                "ACCESS_DENIED": {
                    "statusCode": 404,
                    "responseTemplates": {
                        "application/json": "{\"message\": \"404 Not found\" }",
                    },
                },
            },
        });
    });
}

export function createBaseSpec(apiName: string): SwaggerSpec {
    return {
        swagger: "2.0",
        info: { title: apiName, version: "1.0" },
        paths: {},
        "x-amazon-apigateway-binary-media-types": [ "*/*" ],
    };
}

export function createPathSpecLambda(lambda: aws.lambda.Function): SwaggerOperation {
    const region = aws.config.requireRegion();
    const uri = lambda.arn.apply(lambdaARN =>
        "arn:aws:apigateway:" + region + ":lambda:path/2015-03-31/functions/" + lambdaARN + "/invocations");

    return {
        "x-amazon-apigateway-integration": {
            uri: uri,
            passthroughBehavior: "when_no_match",
            httpMethod: "POST",
            type: "aws_proxy",
        },
    };
}
