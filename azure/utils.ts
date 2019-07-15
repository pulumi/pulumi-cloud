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

/** @deprecated [@pulumi/cloud-azure] has been deprecated.  Please migrate your code to [@pulumi/azure] */
export function apply<T, U>(val: Record<string, T>, func: (t: T) => U): Record<string, U> {
    const result: Record<string, U> = {};
    for (const k of Object.keys(val)) {
        result[k] = func(val[k]);
    }

    return result;
}
