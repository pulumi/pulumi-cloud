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

package azuretests

import (
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

	"github.com/pulumi/pulumi-cloud/examples"
)

func getRequiredEnvValue(t *testing.T, key string) string {
	value := os.Getenv(key)
	if value == "" {
		t.Skipf("Skipping test due to missing %v variable", key)
	}
	fmt.Printf("%v: %v\n", key, value)
	return value
}

func RunAzureTests(t *testing.T) {
	cwd, err := os.Getwd()
	cwd = path.Join(cwd, "azure")
	if !assert.NoError(t, err, "expected a valid working directory: %v", err) {
		return
	}

	environ := getRequiredEnvValue(t, "ARM_ENVIRONMENT")
	location := getRequiredEnvValue(t, "ARM_LOCATION")
	subscriptionID := getRequiredEnvValue(t, "ARM_SUBSCRIPTION_ID")
	clientID := getRequiredEnvValue(t, "ARM_CLIENT_ID")
	clientSecret := getRequiredEnvValue(t, "ARM_CLIENT_SECRET")
	tenantID := getRequiredEnvValue(t, "ARM_TENANT_ID")

	commonConfig := map[string]string{
		"cloud:provider":             "azure",
		"azure:environment":          environ,
		"cloud-azure:location":       location,
		"cloud-azure:subscriptionId": subscriptionID,
		"cloud-azure:clientId":       clientID,
		"cloud-azure:tenantId":       tenantID,
		"containers:redisPassword":   "REDIS_PASSWORD",
	}

	secrets := map[string]string{
		"cloud-azure:clientSecret": clientSecret,
	}

	examples.RunExamples(t, "azure", path.Join(cwd, "../examples"), secrets, func(config map[string]string) map[string]string {
		for k, v := range commonConfig {
			config[k] = v
		}

		return config
	})

	examples := []integration.ProgramTestOptions{
		{
			Dir:     path.Join(cwd, "./examples/bucket"),
			Config:  commonConfig,
			Secrets: secrets,
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-azure",
			},
		},
		{
			Dir:     path.Join(cwd, "./examples/table"),
			Config:  commonConfig,
			Secrets: secrets,
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-azure",
			},
		},
		{
			Dir:     path.Join(cwd, "./examples/cloud-ts-thumbnailer"),
			Config:  commonConfig,
			Secrets: secrets,
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-azure",
			},
		},
		{
			Dir:     path.Join(cwd, "./examples/containers"),
			Config:  commonConfig,
			Secrets: secrets,
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-azure",
			},
		},
		{
			Dir:     path.Join(cwd, "./examples/topic"),
			Config:  commonConfig,
			Secrets: secrets,
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-azure",
			},
		},
	}

	longExamples := []integration.ProgramTestOptions{}

	// Only include the long examples on non-Short test runs
	if !testing.Short() || true {
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
	cfg := map[config.Key]string{}
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
			{
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
