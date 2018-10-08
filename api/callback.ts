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

/**
 * A cloud.CallbackData represents the full data  Pulumi needs  to create an appropriate serverless
 * callback at runtime. For example, all the data necessary to create an AWS Lambda, or an Azure
 * FunctionApp. [cloud.CallbackData]s are generally accepted anywhere a normal JavaScript callback
 * would be accepted so as to give clients the ability to flexibly control how that callback is
 * translated into a serverless runtime function.
 *
 * This type cannot be simply instantiated from within [cloud/api].  Instead, the subtypes should be
 * used from the specific cloud provider packages (i.e. [cloud/aws/AwsCallbackData],
 * [cloud/azure/AzureCallbackData], etc.). These subtypes will be provider-specific and will give
 * fine-grained control using provider-specific concepts and constructs.
 */
export interface CallbackData<T extends Function> {
    /**
     * The JavaScript function to make the cloud-specific serverless function out of.  Additional
     * cloud-specific information will have to be provided along with this.
     */
    function: T;
}

/**
 * Type for parameters that will be converted into serverless function (i.e. an AWS Lambda, Azure
 * FunctionApp, or etc.).  Either a simple JavaScript function, or an object with the full amount of
 * data to be converted into the final serverless function can be provided.
 */
export type Callback<T extends Function> = T | CallbackData<T>;
