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
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"path"
	"testing"
	"time"

	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
	"github.com/stretchr/testify/assert"
)

func TestAccAwsCrawler(t *testing.T) {
	t.Skip("Skipped as commented out in old code")
	test := getAwsBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: path.Join(getCwd(t), "crawler"),
		})

	integration.ProgramTest(t, &test)
}

func TestAccAwsTimers(t *testing.T) {
	t.Skip("Skipped as commented out in old code")
	test := getAwsBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: path.Join(getCwd(t), "timers"),
			Config: map[string]string{
				"timers:message": "Hello, Pulumi Timers!",
			},
		})

	integration.ProgramTest(t, &test)
}

func TestAccAwsSimpleContainers(t *testing.T) {
	test := getAwsBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: path.Join(getCwd(t), "simplecontainers"),
			Config: map[string]string{
				"cloud-aws:useFargate": "true",
			},
			ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
				nginxEndpoint, ok := stackInfo.Outputs["nginxEndpoint"].(string)
				if !assert.True(t, ok, "expected a `nginxEndpoint` output string property") {
					return
				}
				fmt.Printf("nginxEndpoint: %v", nginxEndpoint)
				testURLGet(t, nginxEndpoint, "", "<h1> Hi from Pulumi </h1>")
			},
		})

	integration.ProgramTest(t, &test)
}

func TestAccAzureCrawler(t *testing.T) {
	test := getAzureBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: path.Join(getCwd(t), "crawler"),
		})

	integration.ProgramTest(t, &test)
}

func TestAccAzureTimers(t *testing.T) {
	test := getAzureBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: path.Join(getCwd(t), "timers"),
			Config: map[string]string{
				"timers:message": "Hello, Pulumi Timers!",
			},
		})

	integration.ProgramTest(t, &test)
}

func TestAccAzureBucket(t *testing.T) {
	test := getAzureBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: path.Join(getCwd(t), "..", "azure", "examples", "bucket"),
		})

	integration.ProgramTest(t, &test)
}

func TestAccAzureCloudTsThumbnailer(t *testing.T) {
	test := getAzureBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: path.Join(getCwd(t), "..", "azure", "examples", "cloud-ts-thumbnailer"),
		})

	integration.ProgramTest(t, &test)
}

func TestAccAzureContainers(t *testing.T) {
	test := getAzureBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: path.Join(getCwd(t), "..", "azure", "examples", "containers"),
		})

	integration.ProgramTest(t, &test)
}

func TestAccAzureTopic(t *testing.T) {
	test := getAzureBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: path.Join(getCwd(t), "..", "azure", "examples", "topic"),
		})

	integration.ProgramTest(t, &test)
}

func getAzureBaseOptions(t *testing.T) integration.ProgramTestOptions {
	environ := getRequiredEnvValue(t, "ARM_ENVIRONMENT")
	location := getRequiredEnvValue(t, "ARM_LOCATION")
	subscriptionID := getRequiredEnvValue(t, "ARM_SUBSCRIPTION_ID")
	clientID := getRequiredEnvValue(t, "ARM_CLIENT_ID")
	clientSecret := getRequiredEnvValue(t, "ARM_CLIENT_SECRET")
	tenantID := getRequiredEnvValue(t, "ARM_TENANT_ID")
	base := integration.ProgramTestOptions{
		ReportStats:          integration.NewS3Reporter("us-west-2", "eng.pulumi.com", "testreports"),
		Tracing:              "https://tracing.pulumi-engineering.com/collector/api/v1/spans",
		ExpectRefreshChanges: true,
		SkipRefresh:          true,
		Quick:                true,
		Config: map[string]string{
			"cloud:provider":             "azure",
			"azure:environment":          environ,
			"cloud-azure:location":       location,
			"cloud-azure:subscriptionId": subscriptionID,
			"cloud-azure:clientId":       clientID,
			"cloud-azure:tenantId":       tenantID,
			"containers:redisPassword":   "REDIS_PASSWORD",
		},
		Secrets: map[string]string{
			"cloud-azure:clientSecret": clientSecret,
		},
		Dependencies: []string{
			"@pulumi/cloud",
			"@pulumi/cloud-azure",
		},
	}

	return base
}

func getRequiredEnvValue(t *testing.T, key string) string {
	value := os.Getenv(key)
	if value == "" {
		t.Skipf("Skipping test due to missing %v variable", key)
	}
	return value
}

func getAwsRegion(t *testing.T) string {
	awsRegion := os.Getenv("AWS_REGION")
	if awsRegion == "" {
		t.Skipf("Skipping test due to missing AWS_REGION environment variable")
	}

	return awsRegion
}

func getCwd(t *testing.T) string {
	cwd, err := os.Getwd()
	if err != nil {
		t.FailNow()
	}

	return cwd
}

func getAwsBaseOptions(t *testing.T) integration.ProgramTestOptions {
	region := getAwsRegion(t)
	base := integration.ProgramTestOptions{
		ReportStats:          integration.NewS3Reporter("us-west-2", "eng.pulumi.com", "testreports"),
		Tracing:              "https://tracing.pulumi-engineering.com/collector/api/v1/spans",
		ExpectRefreshChanges: true,
		SkipRefresh:          true,
		Quick:                true,
		Config: map[string]string{
			"aws:region":     region,
			"cloud:provider": "aws",
		},
		Dependencies: []string{
			"@pulumi/cloud",
			"@pulumi/cloud-aws",
		},
	}

	return base
}

func testURLGet(t *testing.T, baseURL string, path string, contents string) {
	// Validate the GET /test1.txt endpoint
	resp := GetHTTP(t, baseURL+path, 200)

	contentType := resp.Header.Get("Content-Type")
	assert.Equal(t, "text/html", contentType)
	bytes, err := ioutil.ReadAll(resp.Body)
	assert.NoError(t, err)
	t.Logf("GET %v [%v/%v]: %v", baseURL+path, resp.StatusCode, contentType, string(bytes))
	assert.Equal(t, contents, string(bytes))
}

func GetHTTP(t *testing.T, url string, statusCode int) *http.Response {
	var resp *http.Response
	var err error
	for i := 0; i <= 10; i++ {
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
