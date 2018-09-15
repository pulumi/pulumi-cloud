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
	"io/ioutil"
	"net/http"
	// "os"
	"path"
	"strings"
	"testing"
	// "time"

	"github.com/stretchr/testify/assert"

	// "github.com/pulumi/pulumi/pkg/operations"
	// "github.com/pulumi/pulumi/pkg/resource"
	// "github.com/pulumi/pulumi/pkg/resource/config"
	// "github.com/pulumi/pulumi/pkg/resource/stack"
	"github.com/pulumi/pulumi/pkg/testing/integration"
	// "github.com/pulumi/pulumi/pkg/util/contract"
)

func RunExamples(
	t *testing.T,
	provider, examplesDir string,
	secrets map[string]string,
	setConfigVars func(config map[string]string) map[string]string) {

	examples := []integration.ProgramTestOptions{
		{
			Dir: path.Join(examplesDir, "crawler"),
			Config: setConfigVars(map[string]string{
				"cloud:provider": provider,
			}),
			Secrets: secrets,
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-" + provider,
			},
		},
		{
			Dir: path.Join(examplesDir, "timers"),
			Config: setConfigVars(map[string]string{
				"cloud:provider": provider,
				"timers:message": "Hello, Pulumi Timers!",
			}),
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-" + provider,
			},
		},
		{
			Dir: path.Join(examplesDir, "httpServer"),
			Config: setConfigVars(map[string]string{
				"cloud:provider": provider,
			}),
			Secrets: secrets,
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-" + provider,
			},
			ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
				baseURL, ok := stackInfo.Outputs["url1"].(string)
				assert.True(t, ok, "expected a `url1` output string property")
				testURLGet(t, baseURL, "test1.txt", "You got test1")
			},
			EditDirs: []integration.EditDir{
				{
					Additive: true,
					Dir:      path.Join(examplesDir, "httpServer/variants/update1"),
					ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
						baseURL, ok := stackInfo.Outputs["url2"].(string)
						assert.True(t, ok, "expected a `url2` output string property")
						testURLGet(t, baseURL, "test2.txt", "You got test2")
					},
				},
			},
		},
		{
			Dir: path.Join(examplesDir, "todo"),
			Config: setConfigVars(map[string]string{
				"cloud:provider":                              provider,
				"cloud-" + provider + ":functionIncludePaths": "www",
			}),
			Secrets: secrets,
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-" + provider,
			},
			ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
				baseURL, ok := stackInfo.Outputs["url"].(string)
				assert.True(t, ok, "expected a `url` output property of type string")

				// Validate the GET / endpoint
				resp, err := http.Get(baseURL)
				assert.NoError(t, err, "expected to be able to GET /")
				contentType := resp.Header.Get("Content-Type")
				assert.Equal(t, "text/html", contentType)
				bytes, err := ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				t.Logf("GET %v [%v/%v]: %v", baseURL, resp.StatusCode, contentType, string(bytes))

				// Validate the GET /index.html endpoint
				resp, err = http.Get(baseURL + "/index.html")
				assert.NoError(t, err, "expected to be able to GET /index.html")
				contentType = resp.Header.Get("Content-Type")
				assert.Equal(t, "text/html", contentType)
				bytes, err = ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				t.Logf("GET %v [%v/%v]: %v", baseURL, resp.StatusCode, contentType, string(bytes))

				// Validate the GET /favico.ico endpoint
				resp, err = http.Get(baseURL + "/favicon.ico")
				assert.NoError(t, err, "expected to be able to GET /favicon.ico")
				assert.Equal(t, int64(1150), resp.ContentLength)
				contentType = resp.Header.Get("Content-Type")
				assert.Equal(t, "image/x-icon", contentType)
				t.Logf("GET %v [%v/%v]: ...", baseURL+"/favicon.ico", resp.StatusCode, contentType)

				// Validate the POST /todo/{id} endpoint
				resp, err = http.Post(baseURL+"/todo/abc",
					"application/x-www-form-urlencoded", strings.NewReader("xyz"))
				assert.NoError(t, err, "expected to be able to POST /todo/{id}")
				assert.Equal(t, 201, resp.StatusCode)
				t.Logf("POST %v [%v]: ...", baseURL+"/todo/abc", resp.StatusCode)

				// Validate the GET /todo/{id} endpoint
				resp, err = http.Get(baseURL + "/todo/abc")
				assert.NoError(t, err, "expected to be able to GET /todo/{id}")
				bytes, err = ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				assert.Equal(t, 401, resp.StatusCode)
				assert.Equal(t, "Authorization header required", string(bytes))
				t.Logf("GET %v [%v]: %v", baseURL+"/todo/abc", resp.StatusCode, string(bytes))

				// Validate the GET /todo endpoint
				resp, err = http.Get(baseURL + "/todo/")
				assert.NoError(t, err, "expected to be able to GET /todo")
				assert.Equal(t, int64(28), resp.ContentLength)
				bytes, err = ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				t.Logf("GET %v [%v]: %v", baseURL+"/todo", resp.StatusCode, string(bytes))
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

func testURLGet(t *testing.T, baseURL string, path string, contents string) {
	// Validate the GET /test1.txt endpoint
	resp, err := http.Get(baseURL + path)
	if !assert.NoError(t, err, "expected to be able to GET /"+path) {
		return
	}
	contentType := resp.Header.Get("Content-Type")
	assert.Equal(t, "text/html", contentType)
	bytes, err := ioutil.ReadAll(resp.Body)
	assert.NoError(t, err)
	t.Logf("GET %v [%v/%v]: %v", baseURL+path, resp.StatusCode, contentType, string(bytes))
	assert.Equal(t, contents, string(bytes))
}
