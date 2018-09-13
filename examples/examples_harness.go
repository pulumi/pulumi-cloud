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
	// "crypto/rand"
	// "encoding/hex"
	// "encoding/json"
	// "fmt"
	// "io/ioutil"
	// "net/http"
	// "os"
	"path"
	// "strings"
	"testing"
	// "time"

	// "github.com/stretchr/testify/assert"

	// "github.com/pulumi/pulumi/pkg/operations"
	// "github.com/pulumi/pulumi/pkg/resource"
	// "github.com/pulumi/pulumi/pkg/resource/config"
	// "github.com/pulumi/pulumi/pkg/resource/stack"
	"github.com/pulumi/pulumi/pkg/testing/integration"
	// "github.com/pulumi/pulumi/pkg/util/contract"
)

func RunExamples(t *testing.T, provider, examplesDir string, setConfigVars func(config map[string]string) map[string]string) {
	examples := []integration.ProgramTestOptions{
		{
			Dir: path.Join(examplesDir, "crawler"),
			Config: setConfigVars(map[string]string{
				"cloud:provider": provider,
			}),
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-" + provider,
			},
		},
	}

	longExamples := []integration.ProgramTestOptions{}

	// Only include the long examples on non-Short test runs
	if !testing.Short() {
		examples = append(examples, longExamples...)
	}

	for _, ex := range examples {
		example := ex.With(integration.ProgramTestOptions{
			ReportStats: integration.NewS3Reporter("us-west-2", "eng.pulumi.com", "testreports"),
			Tracing:     "https://tracing.pulumi-engineering.com/collector/api/v1/spans",
			// TODO[pulumi/pulumi#1900]: This should be the default value, every test we have causes some sort of
			// change during a `pulumi refresh` for reasons outside our control.
			ExpectRefreshChanges: true,
		})

		t.Run(example.Dir, func(t *testing.T) {
			integration.ProgramTest(t, &example)
		})
	}
}
