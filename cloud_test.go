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

package cloudtests

import (
	"testing"

	aws "github.com/pulumi/pulumi-cloud/aws"
	azure "github.com/pulumi/pulumi-cloud/azure"
)

// Fargate is only supported in `us-east-1`, so force Fargate-based tests to run there.
const fargateRegion = "us-east-1"

func Test_Examples(t *testing.T) {
	t.Parallel()
	aws.RunAwsTests(t)
	azure.RunAzureTests(t)
}
