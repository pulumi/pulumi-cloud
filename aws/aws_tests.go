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

package awstests

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

	"github.com/pulumi/pulumi-cloud/examples"
)

func RunAwsTests(t *testing.T) {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		t.Skipf("Skipping test due to missing AWS_REGION environment variable")
	}
	fmt.Printf("AWS Region: %v\n", region)

	cwd, err := os.Getwd()
	cwd = path.Join(cwd, "aws")
	if !assert.NoError(t, err, "expected a valid working directory: %v", err) {
		return
	}

	var secrets map[string]string
	examples.RunExamples(t, "aws", path.Join(cwd, "../examples"), secrets, func(config map[string]string) map[string]string {
		config["aws:region"] = region
		return config
	})

	shortTests := []integration.ProgramTestOptions{
		{
			Dir: path.Join(cwd, "tests/topic"),
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

				logLength := len(*logs)
				t.Logf("Got %v logs", logLength)
				if !assert.True(t, logLength >= 26, "expected at least 26 logs entries from countdown, got %v", logLength) {
					return
				}
				assert.Equal(t, "examples-countDown_watcher", (*logs)[0].ID,
					"expected ID of logs to match the topic+subscription name")
				assert.Equal(t, "25", (*logs)[0].Message)
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
		// {
		// 	Dir:       path.Join(cwd, "../examples/containers"),
		// 	StackName: addRandomSuffix("containers-ec2"),
		// 	Config: map[string]string{
		// 		"aws:region":                          region,
		// 		"cloud:provider":                      "aws",
		// 		"cloud-aws:ecsAutoCluster":            "true",
		// 		"cloud-aws:ecsAutoClusterNumberOfAZs": "2",
		// 		"cloud-aws:ecsAutoInstanceType":       "t2.medium",
		// 		"cloud-aws:ecsAutoClusterMinSize":     "20",
		// 		"cloud-aws:ecsAutoClusterUseEFS":      "false",
		// 		"containers:redisPassword":            "SECRETPASSWORD",
		// 	},
		// 	Dependencies: []string{
		// 		"@pulumi/cloud",
		// 		"@pulumi/cloud-aws",
		// 	},
		// 	ExtraRuntimeValidation: containersRuntimeValidator(region, false /*isFargate*/),
		// },
	}

	longTests := []integration.ProgramTestOptions{
		{
			Dir:       path.Join(cwd, "../examples/containers"),
			StackName: addRandomSuffix("containers-fargate"),
			Config: map[string]string{
				"aws:region":               region,
				"cloud:provider":           "aws",
				"cloud-aws:useFargate":     "true",
				"containers:redisPassword": "SECRETPASSWORD",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: containersRuntimeValidator(region, true /*isFargate:*/),
		},
		{
			Dir: path.Join(cwd, "tests/unit"),
			Config: map[string]string{
				"aws:region":                  region,
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
	}

	// Run the short or long tests depending on the config.  Note that we only run long tests on
	// travis after already running short tests.  So no need to actually run both at the same time
	// ever.
	var tests []integration.ProgramTestOptions
	if testing.Short() {
		tests = shortTests
	} else {
		tests = longTests
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
	resp := examples.GetHTTP(t, baseURL+path, 200)

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
	resp := examples.GetHTTP(t, baseURL+urlPortion, 200)

	contentType := resp.Header.Get("Content-Type")
	assert.Equal(t, "application/json", contentType)

	bytes, err := ioutil.ReadAll(resp.Body)
	assert.NoError(t, err)
	t.Logf("GET %v [%v/%v]: %v", baseURL+urlPortion, resp.StatusCode, contentType, string(bytes))
}

func getAllMessageText(logs []operations.LogEntry) string {
	allMessageText := ""
	for _, logEntry := range logs {
		allMessageText = allMessageText + logEntry.Message + "\n"
	}
	return allMessageText
}

func containersRuntimeValidator(region string, isFargate bool) func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
	return func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
		baseURL, ok := stackInfo.Outputs["frontendURL"].(string)
		assert.True(t, ok, "expected a `frontendURL` output property of type string")

		// Validate the GET /test endpoint
		{
			resp := examples.GetHTTP(t, baseURL+"test", 200)
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
			resp := examples.GetHTTP(t, baseURL, 200)
			contentType := resp.Header.Get("Content-Type")
			assert.Equal(t, "application/json", contentType)
			bytes, err := ioutil.ReadAll(resp.Body)
			assert.NoError(t, err)
			t.Logf("GET %v [%v/%v]: %v", baseURL, resp.StatusCode, contentType, string(bytes))
		}

		// Validate the GET /nginx endpoint
		{
			// https://github.com/pulumi/pulumi-cloud/issues/666
			// We are only making the proxy route in fargate testing.
			if isFargate {
				resp := examples.GetHTTP(t, baseURL+"nginx", 200)
				contentType := resp.Header.Get("Content-Type")
				assert.Equal(t, "text/html", contentType)
				bytes, err := ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				t.Logf("GET %v [%v/%v]: %v", baseURL+"nginx", resp.StatusCode, contentType, string(bytes))
			}
			{
				resp := examples.GetHTTP(t, baseURL+"nginx/doesnotexist", 404)
				contentType := resp.Header.Get("Content-Type")
				assert.Equal(t, "text/html", contentType)
				bytes, err := ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				t.Logf("GET %v [%v/%v]: %v", baseURL+"nginx/doesnotexist", resp.StatusCode, contentType, string(bytes))
			}
		}

		// Validate the GET /run endpoint
		{
			resp := examples.GetHTTP(t, baseURL+"run", 200)
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
			resp := examples.GetHTTP(t, baseURL+"custom", 200)
			contentType := resp.Header.Get("Content-Type")
			assert.Equal(t, "application/json", contentType)
			bytes, err := ioutil.ReadAll(resp.Body)
			assert.NoError(t, err)
			assert.True(t, strings.HasPrefix(string(bytes), "Hello, world"))
			t.Logf("GET %v [%v/%v]: %v", baseURL+"custom", resp.StatusCode, contentType, string(bytes))
		}

		// Validate we have the logs we expect.
		checkLogs(t, stackInfo, region, isFargate)
	}
}

func checkLogs(
	t *testing.T, stackInfo integration.RuntimeValidationStackInfo,
	region string, isFargate bool) {

	// validate logs.  Note: logs may take a while to appear.  So try several times, waitin one minute
	// between each try
	var lastLogs *[]operations.LogEntry
	var ok bool

	max := 6
	for i := 0; i <= max; i++ {
		if lastLogs, ok = checkLogsOnce(t, stackInfo, region, isFargate); ok {
			return
		}

		t.Logf("Did not get expected logs.  Waiting 1 minute")
		time.Sleep(1 * time.Minute)
	}

	if lastLogs == nil {
		t.Logf("No logs ever produced after %v minutes", max)
	} else {
		t.Logf("Did not get expected logs after %v minutes.  Logs produced were:", max)
		logsByResource := getLogsByResource(*lastLogs)

		for resource, arr := range logsByResource {
			t.Logf("  %v", resource)
			for _, entry := range arr {
				t.Logf("    %v: %v", entry.Timestamp, entry.Message)
			}
		}
	}

	t.FailNow()
}

func getLogsByResource(logs []operations.LogEntry) map[string][]operations.LogEntry {
	logsByResource := map[string][]operations.LogEntry{}
	for _, l := range logs {
		cur, _ := logsByResource[l.ID]
		logsByResource[l.ID] = append(cur, l)
	}

	return logsByResource
}

func checkLogsOnce(
	t *testing.T, stackInfo integration.RuntimeValidationStackInfo,
	region string, isFargate bool) (*[]operations.LogEntry, bool) {

	// Validate logs from example
	logs := getLogs(t, region, stackInfo, operations.LogQuery{})
	if logs == nil {
		return nil, false
	}

	if len(*logs) <= 10 {
		t.Logf("Expected at least 10 logs")
		return logs, false
	}

	logsByResource := getLogsByResource(*logs)

	// NGINX logs
	//  {examples-nginx 1512871243078 18.217.247.198 - - [10/Dec/2017:02:00:43 +0000] "GET / HTTP/1.1" ...

	// https://github.com/pulumi/pulumi-cloud/issues/666
	// We are only making the proxy route in fargate testing.
	if isFargate {
		if !checkSpecificLogs(t, logsByResource, "examples-nginx", 0, "GET /") {
			return logs, false
		}
	}

	// Hello World container Task logs
	//  {examples-hello-world 1512871250458 Hello from Docker!}
	if !checkSpecificLogs(t, logsByResource, "examples-hello-world", 3, "Hello from Docker!") {
		return logs, false
	}

	// Cache Redis container  logs
	//  {examples-mycache 1512870479441 1:C 10 Dec 01:47:59.440 # oO0OoO0OoO0Oo Redis is starting ...
	if !checkSpecificLogs(t, logsByResource, "examples-mycache", 5, "Redis is starting") {
		return logs, false
	}

	return logs, true
}

func checkSpecificLogs(
	t *testing.T, logsByResource map[string][]operations.LogEntry,
	id string, minLogs int, expectedText string) bool {

	logs, exists := logsByResource[id]
	if !exists {
		t.Logf("Expected logs for %v, but there were none", id)
		return false
	}

	if len(logs) <= minLogs {
		t.Logf("Expected at least %v logs, but got %v", minLogs+1, len(logs))
		return false
	}

	if !strings.Contains(getAllMessageText(logs), expectedText) {
		t.Logf("All logs text did not contain expected text: %v", expectedText)
		return false
	}

	return true
}

func addRandomSuffix(s string) string {
	b := make([]byte, 4)
	_, err := rand.Read(b)
	contract.AssertNoError(err)
	return s + "-" + hex.EncodeToString(b)
}
