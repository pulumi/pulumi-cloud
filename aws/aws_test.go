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
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"path"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi/pkg/operations"
	"github.com/pulumi/pulumi/pkg/resource"
	"github.com/pulumi/pulumi/pkg/resource/config"
	"github.com/pulumi/pulumi/pkg/resource/stack"
	"github.com/pulumi/pulumi/pkg/testing/integration"
	"github.com/pulumi/pulumi/pkg/util/contract"
)

// Fargate is only supported in `us-east-1`, so force Fargate-based tests to run there.
const fargateRegion = "us-east-1"

func Test_Examples(t *testing.T) {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		t.Skipf("Skipping test due to missing AWS_REGION environment variable")
	}
	fmt.Printf("AWS Region: %v\n", region)

	cwd, err := os.Getwd()
	if !assert.NoError(t, err, "expected a valid working directory: %v", err) {
		return
	}
	examples := []integration.ProgramTestOptions{
		{
			Dir: path.Join(cwd, "/tests/performance"),
			Config: map[string]string{
				"aws:region":                        region,
				"cloud:provider":                    "aws",
				"cloud-aws:functionIncludePackages": "datadog-metrics",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
				baseURL, ok := stackInfo.Outputs["url"].(string)
				assert.True(t, ok, "expected a `url` output property of type string")

				// Validate the GET /perf endpoint
				// values url.Values := {}

				dataDogAPIKey := os.Getenv("DATADOG_API_KEY")
				dataDogAppKey := os.Getenv("DATADOG_APP_KEY")

				resp, err := http.Get(baseURL + "/start-performance-tests?DATADOG_API_KEY=" + dataDogAPIKey + "&DATADOG_APP_KEY=" + dataDogAppKey)
				assert.NoError(t, err, "expected to be able to GET /start-performance-tests")

				contentType := resp.Header.Get("Content-Type")
				assert.Equal(t, "text/html", contentType)

				_, err = ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				assert.Equal(t, 200, resp.StatusCode)

				start := time.Now()
				for true {
					elapsed := time.Now().Sub(start)

					// lambdas can ony run up to 5 minutes.  So if we go to 6, then there's no point
					// continuing.
					if elapsed.Minutes() >= 6 {
						assert.Fail(t, "Performance tests did not finish")
						break
					}

					resp, err := http.Get(baseURL + "/check-performance-tests")
					assert.NoError(t, err, "expected to be able to GET /check-performance-tests")

					contentType := resp.Header.Get("Content-Type")
					assert.Equal(t, "application/json", contentType)

					bytes, err := ioutil.ReadAll(resp.Body)
					assert.NoError(t, err)
					assert.Equal(t, 200, resp.StatusCode)
					t.Logf("GET %v [%v/%v]: %v", baseURL+"/check-performance-tests", resp.StatusCode, contentType, string(bytes))

					var v struct {
						Status string `json:"status"`
					}
					err = json.Unmarshal(bytes, &v)
					assert.NoError(t, err)
					if v.Status == "complete" {
						break
					}

					time.Sleep(5 * time.Second)
				}
			},
		},
		{
			Dir: path.Join(cwd, "../examples/crawler"),
			Config: map[string]string{
				"aws:region":     region,
				"cloud:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
		},
		{
			Dir: path.Join(cwd, "../examples/countdown"),
			Config: map[string]string{
				"aws:region":                  region,
				"cloud:provider":              "aws",
				"cloud-aws:usePrivateNetwork": "true",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
				// Wait 6 minutes to give the timer a chance to fire and for Lambda logs to be collected
				time.Sleep(6 * time.Minute)

				// Validate logs from example
				logs := getLogs(t, region, stackInfo, operations.LogQuery{})
				if !assert.NotNil(t, logs, "expected logs to be produced") {
					return
				}
				t.Logf("Got %v logs", len(*logs))
				if !assert.True(t, len(*logs) >= 26, "expected at least 26 logs entries from countdown, got") {
					return
				}
				assert.Equal(t, "examples-countDown_watcher", (*logs)[0].ID,
					"expected ID of logs to match the topic+subscription name")
				assert.Equal(t, "25", (*logs)[0].Message)
			},
		},
		{
			Dir: path.Join(cwd, "../examples/todo"),

			Config: map[string]string{
				"aws:region":     region,
				"cloud:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
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

				// Wait for a minute before getting logs
				time.Sleep(1 * time.Minute)

				// Validate logs from example
				logs := getLogs(t, region, stackInfo, operations.LogQuery{})
				if !assert.NotNil(t, logs, "expected logs to be produced") {
					return
				}
			},
		},
		{
			Dir: path.Join(cwd, "../examples/timers"),
			Config: map[string]string{
				"aws:region":     region,
				"cloud:provider": "aws",
				"timers:message": "Hello, Pulumi Timers!",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
		},
		{
			Dir: path.Join(cwd, "../examples/api"),
			Config: map[string]string{
				"aws:region":     region,
				"cloud:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
				baseURL, ok := stackInfo.Outputs["url"].(string)
				assert.True(t, ok, "expected a `url` output string property")
				testURLGet(t, baseURL, "test1.txt", "You got test1")
			},
		},
		{
			Dir: path.Join(cwd, "../examples/simplecontainers"),
			Config: map[string]string{
				"aws:region":           region,
				"cloud:provider":       "aws",
				"cloud-aws:useFargate": "true",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
				nginxEndpoint, ok := stackInfo.Outputs["nginxEndpoint"].(string)
				if !assert.True(t, ok, "expected a `nginxEndpoint` output string property") {
					return
				}
				testURLGet(t, nginxEndpoint, "", "<h1> Hi from Pulumi </h1>")
			},
		},
	}

	longExamples := []integration.ProgramTestOptions{
		{
			Dir: path.Join(cwd, "tests/unit"),
			Config: map[string]string{
				"aws:region":                  fargateRegion,
				"cloud:provider":              "aws",
				"cloud-aws:useFargate":        "true",
				"cloud-aws:usePrivateNetwork": "true",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
				hitUnitTestsEndpoint(t, stackInfo)
			},
			EditDirs: []integration.EditDir{
				{
					Dir: cwd + "/tests/unit/variants/update1",
					ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
						hitUnitTestsEndpoint(t, stackInfo)
					},
				},
				{
					Dir: cwd + "/tests/unit/variants/update2",
					ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
						hitUnitTestsEndpoint(t, stackInfo)
					},
				},
			},
		},
		{
			Dir:       path.Join(cwd, "../examples/containers"),
			StackName: addRandomSuffix("containers-fargate"),
			Config: map[string]string{
				"aws:region":               fargateRegion,
				"cloud:provider":           "aws",
				"cloud-aws:useFargate":     "true",
				"containers:redisPassword": "SECRETPASSWORD",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: containersRuntimeValidator(fargateRegion),
		},
		{
			Dir:       path.Join(cwd, "../examples/containers"),
			StackName: addRandomSuffix("containers-ec2"),
			Config: map[string]string{
				"aws:region":                          region,
				"cloud:provider":                      "aws",
				"cloud-aws:ecsAutoCluster":            "true",
				"cloud-aws:ecsAutoClusterNumberOfAZs": "2",
				"cloud-aws:ecsAutoInstanceType":       "t2.medium",
				"cloud-aws:ecsAutoClusterMinSize":     "20",
				"cloud-aws:ecsAutoClusterUseEFS":      "false",
				"containers:redisPassword":            "SECRETPASSWORD",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: containersRuntimeValidator(region),
		},
	}

	// Only include the long examples on non-Short test runs
	if !testing.Short() {
		examples = append(examples, longExamples...)
	}

	for _, ex := range examples {
		example := ex.With(integration.ProgramTestOptions{
			ReportStats: integration.NewS3Reporter("us-west-2", "eng.pulumi.com", "testreports"),
			Tracing:     "https://tracing.pulumi-engineering.com/collector/api/v1/spans",
		})

		t.Run(example.Dir, func(t *testing.T) {
			integration.ProgramTest(t, &example)
		})
	}
}

func getLogs(t *testing.T, region string, stackInfo integration.RuntimeValidationStackInfo,
	query operations.LogQuery) *[]operations.LogEntry {

	var states []*resource.State
	for _, res := range stackInfo.Deployment.Resources {
		state, err := stack.DeserializeResource(res)
		if !assert.NoError(t, err) {
			return nil
		}
		states = append(states, state)
	}

	tree := operations.NewResourceTree(states)
	if !assert.NotNil(t, tree) {
		return nil
	}
	cfg := map[config.Key]string{
		config.MustMakeKey("aws", "region"): region,
	}
	ops := tree.OperationsProvider(cfg)

	// Validate logs from example
	logs, err := ops.GetLogs(query)
	if !assert.NoError(t, err) {
		return nil
	}
	return logs
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

func hitUnitTestsEndpoint(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
	const urlPortion = "/unittests"

	baseURL, ok := stackInfo.Outputs["url"].(string)
	if !assert.True(t, ok, fmt.Sprintf("expected a `url` output property of type string")) {
		return
	}

	// Validate the GET /unittests endpoint.  We allow this to potentially fail once with a 504 to avoid cold-start
	// issues.
	// TODO[pulumi/pulumi-cloud#440] Remove this workaround once we structure the unit tests to be resilient to this.
	var resp *http.Response
	var err error
	for i := 0; i < 2; i++ {
		resp, err = http.Get(baseURL + urlPortion)
		if !assert.NoError(t, err, "expected to be able to GET "+baseURL+urlPortion) {
			return
		}
		if resp.StatusCode != 504 {
			break
		}
	}

	contentType := resp.Header.Get("Content-Type")
	assert.Equal(t, "application/json", contentType)

	bytes, err := ioutil.ReadAll(resp.Body)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
	t.Logf("GET %v [%v/%v]: %v", baseURL+urlPortion, resp.StatusCode, contentType, string(bytes))
}

func getAllMessageText(logs []operations.LogEntry) string {
	allMessageText := ""
	for _, logEntry := range logs {
		allMessageText = allMessageText + logEntry.Message + "\n"
	}
	return allMessageText
}

func containersRuntimeValidator(region string) func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
	return func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
		baseURL, ok := stackInfo.Outputs["frontendURL"].(string)
		assert.True(t, ok, "expected a `frontendURL` output property of type string")

		// Validate the GET /test endpoint
		{
			resp, err := http.Get(baseURL + "test")
			assert.NoError(t, err, "expected to be able to GET /test")
			assert.Equal(t, 200, resp.StatusCode, "expected 200")
			contentType := resp.Header.Get("Content-Type")
			assert.Equal(t, "application/json", contentType)
			bytes, err := ioutil.ReadAll(resp.Body)
			assert.NoError(t, err)
			var endpoints map[string]map[string]interface{}
			err = json.Unmarshal(bytes, &endpoints)
			assert.NoError(t, err)
			t.Logf("GET %v [%v/%v]: %v - %v", baseURL+"test", resp.StatusCode, contentType, string(bytes), endpoints)
		}

		// Validate the GET / endpoint
		{
			// Call the endpoint twice so that things have time to warm up.
			http.Get(baseURL)
			resp, err := http.Get(baseURL)
			assert.NoError(t, err, "expected to be able to GET /")
			assert.Equal(t, 200, resp.StatusCode, "expected 200")
			contentType := resp.Header.Get("Content-Type")
			assert.Equal(t, "application/json", contentType)
			bytes, err := ioutil.ReadAll(resp.Body)
			assert.NoError(t, err)
			t.Logf("GET %v [%v/%v]: %v", baseURL, resp.StatusCode, contentType, string(bytes))
		}

		// Validate the GET /nginx endpoint
		{
			{
				resp, err := http.Get(baseURL + "nginx")
				assert.NoError(t, err, "expected to be able to GET /nginx")
				assert.Equal(t, 200, resp.StatusCode, "expected 200")
				contentType := resp.Header.Get("Content-Type")
				assert.Equal(t, "text/html", contentType)
				bytes, err := ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				t.Logf("GET %v [%v/%v]: %v", baseURL+"nginx", resp.StatusCode, contentType, string(bytes))
			}
			{
				resp, err := http.Get(baseURL + "nginx/doesnotexist")
				assert.NoError(t, err, "expected to be able to GET /nginx/doesnotexist")
				assert.Equal(t, 404, resp.StatusCode, "expected 404")
				contentType := resp.Header.Get("Content-Type")
				assert.Equal(t, "text/html", contentType)
				bytes, err := ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				t.Logf("GET %v [%v/%v]: %v", baseURL+"nginx/doesnotexist", resp.StatusCode, contentType, string(bytes))
			}
		}

		// Validate the GET /run endpoint
		{
			resp, err := http.Get(baseURL + "run")
			assert.NoError(t, err, "expected to be able to GET /run")
			assert.Equal(t, 200, resp.StatusCode, "expected 200")
			contentType := resp.Header.Get("Content-Type")
			assert.Equal(t, "application/json", contentType)
			bytes, err := ioutil.ReadAll(resp.Body)
			assert.NoError(t, err)
			var data map[string]bool
			err = json.Unmarshal(bytes, &data)
			assert.NoError(t, err)
			success, ok := data["success"]
			assert.Equal(t, true, ok)
			assert.Equal(t, true, success)
			t.Logf("GET %v [%v/%v]: %v - %v", baseURL+"run", resp.StatusCode, contentType, string(bytes), data)
		}

		// Validate the GET /custom endpoint
		{
			resp, err := http.Get(baseURL + "custom")
			assert.NoError(t, err, "expected to be able to GET /custom")
			assert.Equal(t, 200, resp.StatusCode, "expected 200")
			contentType := resp.Header.Get("Content-Type")
			assert.Equal(t, "application/json", contentType)
			bytes, err := ioutil.ReadAll(resp.Body)
			assert.NoError(t, err)
			assert.True(t, strings.HasPrefix(string(bytes), "Hello, world"))
			t.Logf("GET %v [%v/%v]: %v", baseURL+"custom", resp.StatusCode, contentType, string(bytes))
		}

		// Wait for five minutes before getting logs.
		time.Sleep(5 * time.Minute)

		// Validate logs from example
		logs := getLogs(t, region, stackInfo, operations.LogQuery{})
		if !assert.NotNil(t, logs, "expected logs to be produced") {
			return
		}
		if !assert.True(t, len(*logs) > 10) {
			return
		}
		logsByResource := map[string][]operations.LogEntry{}
		for _, l := range *logs {
			cur, _ := logsByResource[l.ID]
			logsByResource[l.ID] = append(cur, l)
		}

		// NGINX logs
		//  {examples-nginx 1512871243078 18.217.247.198 - - [10/Dec/2017:02:00:43 +0000] "GET / HTTP/1.1" ...
		{
			nginxLogs, exists := logsByResource["examples-nginx"]
			if !assert.True(t, exists) {
				return
			}
			if !assert.True(t, len(nginxLogs) > 0) {
				return
			}
			assert.Contains(t, getAllMessageText(nginxLogs), "GET /")
		}

		// Hello World container Task logs
		//  {examples-hello-world 1512871250458 Hello from Docker!}
		{
			hellowWorldLogs, exists := logsByResource["examples-hello-world"]
			if !assert.True(t, exists) {
				return
			}
			if !assert.True(t, len(hellowWorldLogs) > 3) {
				return
			}
			assert.Contains(t, getAllMessageText(hellowWorldLogs), "Hello from Docker!")
		}

		// Cache Redis container  logs
		//  {examples-mycache 1512870479441 1:C 10 Dec 01:47:59.440 # oO0OoO0OoO0Oo Redis is starting ...
		{
			redisLogs, exists := logsByResource["examples-mycache"]
			if !assert.True(t, exists) {
				return
			}
			if !assert.True(t, len(redisLogs) > 5) {
				return
			}
			assert.Contains(t, getAllMessageText(redisLogs), "Redis is starting")
		}
	}
}

func addRandomSuffix(s string) string {
	b := make([]byte, 4)
	_, err := rand.Read(b)
	contract.AssertNoError(err)
	return s + "-" + hex.EncodeToString(b)
}
