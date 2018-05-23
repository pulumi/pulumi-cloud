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

package examples

import (
	"os"
	"path"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi/pkg/testing/integration"
)

func Test_Examples(t *testing.T) {
	cwd, err := os.Getwd()
	if !assert.NoError(t, err, "expected a valid working directory: %v", err) {
		return
	}
	examples := []integration.LumiProgramTestOptions{
		{
			Dir: path.Join(cwd, "./table"),
			Config: map[string]string{
				"cloud:provider": "mock",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-mock",
			},
		},
	}
	for _, ex := range examples {
		example := ex
		t.Run(example.Dir, func(t *testing.T) {
			runTest(t, example)
		})
	}
}

func runTest(t *testing.T, opts integration.LumiProgramTestOptions) {
	dir, err := integration.CopyTestToTemporaryDirectory(t, &opts)
	if !assert.NoError(t, err) {
		return
	}

	integration.RunCommand(t, []string{opts.YarnBin, "run", "test"}, dir, opts)
}
