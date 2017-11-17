package examples

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi/pkg/operations"
	"github.com/pulumi/pulumi/pkg/resource"
	"github.com/pulumi/pulumi/pkg/resource/stack"
	"github.com/pulumi/pulumi/pkg/testing/integration"
	"github.com/pulumi/pulumi/pkg/tokens"
)

func Test_Performance(t *testing.T) {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		t.Skipf("Skipping test due to missing AWS_REGION environment variable")
	}
	fmt.Printf("AWS Region: %v\n", region)

	cwd, err := os.Getwd()
	if !assert.NoError(t, err, "expected a valid working directory: %v", err) {
		return
	}

	tests := []integration.ProgramTestOptions{
		{
			Dir: cwd + "/unit",
			Config: map[string]string{
				"aws:config:region":     region,
				"cloud:config:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
				hitUnitTestsEndpoint(t, checkpoint)
			},
			EditDirs: []integration.EditDir{
				{
					Dir: cwd + "/unit/variants/update1",
					ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
						hitUnitTestsEndpoint(t, checkpoint)
					},
				},
				{
					Dir: cwd + "/unit/variants/update2",
					ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
						hitUnitTestsEndpoint(t, checkpoint)
					},
				},
			},
		},

		{
			Dir: cwd + "/performance",
			Config: map[string]string{
				"aws:config:region":     region,
				"cloud:config:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
				_, _, snapshot, err := stack.DeserializeCheckpoint(&checkpoint)
				if !assert.Nil(t, err, "expected checkpoint deserialization to succeed") {
					return
				}
				pulumiResources := operations.NewResourceMap(snapshot.Resources)
				urn := resource.NewURN(checkpoint.Target, "performance", "cloud:http:HttpEndpoint", "tests-performance")
				endpoint := pulumiResources[urn]
				if !assert.NotNil(t, endpoint, "expected to find endpoint") {
					return
				}
				baseURL := endpoint.State.Outputs["url"].StringValue()
				assert.NotEmpty(t, baseURL, "expected a `todo` endpoint")

				// Validate the GET /perf endpoint
				//values url.Values := {}

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
	}
	for _, ex := range tests {
		test := ex
		t.Run(test.Dir, func(t *testing.T) {
			integration.ProgramTest(t, test)
		})
	}
}

func hitUnitTestsEndpoint(
	t *testing.T,
	checkpoint stack.Checkpoint) {

	var packageName tokens.PackageName = "unittests"
	var endpointName tokens.QName = "tests-unittests"
	var urlPortion = "/unittests"

	_, _, snapshot, err := stack.DeserializeCheckpoint(&checkpoint)
	if !assert.Nil(t, err, "expected checkpoint deserialization to succeed") {
		return
	}
	pulumiResources := operations.NewResourceMap(snapshot.Resources)
	urn := resource.NewURN(checkpoint.Target, packageName, "cloud:http:HttpEndpoint", endpointName)
	endpoint := pulumiResources[urn]
	if !assert.NotNil(t, endpoint, "expected to find endpoint") {
		return
	}
	baseURL := endpoint.State.Outputs["url"].StringValue()
	assert.NotEmpty(t, baseURL, fmt.Sprintf("expected a `%v` endpoint", endpointName))

	// Validate the GET /unittests endpoint

	resp, err := http.Get(baseURL + urlPortion)
	assert.NoError(t, err, "expected to be able to GET "+baseURL+urlPortion)

	contentType := resp.Header.Get("Content-Type")
	assert.Equal(t, "application/json", contentType)

	bytes, err := ioutil.ReadAll(resp.Body)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
	t.Logf("GET %v [%v/%v]: %v", baseURL+urlPortion, resp.StatusCode, contentType, string(bytes))
}
