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
	"io/ioutil"
	"net/http"
	"path"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi/pkg/testing/integration"
)

func RunExamples(
	t *testing.T,
	provider, examplesDir string,
	secrets map[string]string,
	setConfigVars func(config map[string]string) map[string]string) {

	shortTests := []integration.ProgramTestOptions{
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
				"cloud:provider": provider,
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
				resp := GetHTTP(t, baseURL, 200)
				contentType := resp.Header.Get("Content-Type")
				assert.Equal(t, "text/html; charset=UTF-8", contentType)
				bytes, err := ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				t.Logf("GET %v [%v/%v]: %v", baseURL, resp.StatusCode, contentType, string(bytes))

				// Validate the GET /index.html endpoint
				resp = GetHTTP(t, baseURL+"/index.html", 200)
				contentType = resp.Header.Get("Content-Type")
				assert.Equal(t, "text/html; charset=UTF-8", contentType)
				bytes, err = ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				t.Logf("GET %v [%v/%v]: %v", baseURL, resp.StatusCode, contentType, string(bytes))

				// Validate the GET /favico.ico endpoint
				resp = GetHTTP(t, baseURL+"/favicon.ico", 200)
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
				resp = GetHTTP(t, baseURL+"/todo/abc", 401)
				assert.NoError(t, err, "expected to be able to GET /todo/{id}")
				bytes, err = ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				assert.Equal(t, "Authorization header required", string(bytes))
				t.Logf("GET %v [%v]: %v", baseURL+"/todo/abc", resp.StatusCode, string(bytes))

				// Validate the GET /todo endpoint
				resp = GetHTTP(t, baseURL+"/todo/", 200)
				assert.NoError(t, err, "expected to be able to GET /todo")
				bytes, err = ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				t.Logf("GET %v [%v]: %v", baseURL+"/todo", resp.StatusCode, string(bytes))
				assert.Equal(t, "[{\"id\":\"abc\",\"value\":\"xyz\"}]", string(bytes))
			},
		},
	}

	longTests := []integration.ProgramTestOptions{}

	tests := shortTests
	if !testing.Short() {
		tests = append(tests, longTests...)
	}

	for _, ex := range tests {
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

func GetHTTP(t *testing.T, url string, statusCode int) *http.Response {
	var resp *http.Response
	var err error
	for i := 0; i <= 5; i++ {
		resp, err = http.Get(url)
		if err == nil && resp.StatusCode == statusCode {
			return resp
		}

		if err != nil {
			t.Logf("Got error trying to get %v. %v", url, err.Error())
		}

		if resp != nil && resp.StatusCode != statusCode {
			t.Logf("Expected to get status code %v for %v. Got: %v", statusCode, url, resp.StatusCode)
		}

		time.Sleep(1 * time.Minute)
	}

	if !assert.NoError(t, err, "expected to be able to GET "+url) {
		t.FailNow()
	}

	if !assert.Equal(t, statusCode, resp.StatusCode, "Got unexpected status code. Body was:") {
		contentType := resp.Header.Get("Content-Type")
		bytes, _ := ioutil.ReadAll(resp.Body)
		t.Logf("GET %v [%v/%v]: %v", url, resp.StatusCode, contentType, string(bytes))
		t.FailNow()
	}

	return nil
}

func testURLGet(t *testing.T, baseURL string, path string, contents string) {
	// Validate the GET endpoint

	resp := GetHTTP(t, baseURL+path, 200)

	contentType := resp.Header.Get("Content-Type")
	assert.Equal(t, "text/html", contentType)
	bytes, err := ioutil.ReadAll(resp.Body)
	assert.NoError(t, err)
	t.Logf("GET %v [%v/%v]: %v", baseURL+path, resp.StatusCode, contentType, string(bytes))
	assert.Equal(t, contents, string(bytes))
}
