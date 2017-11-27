package examples

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

	"github.com/pulumi/pulumi/pkg/pulumiframework"
	"github.com/pulumi/pulumi/pkg/resource"
	"github.com/pulumi/pulumi/pkg/resource/stack"
	"github.com/pulumi/pulumi/pkg/testing/integration"
	"github.com/pulumi/pulumi/pkg/tokens"
)

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
			Dir: cwd + "/tests/unit",
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
					Dir: cwd + "/tests/unit/variants/update1",
					ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
						hitUnitTestsEndpoint(t, checkpoint)
					},
				},
				{
					Dir: cwd + "/tests/unit/variants/update2",
					ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
						hitUnitTestsEndpoint(t, checkpoint)
					},
				},
			},
		},

		{
			Dir: cwd + "/tests/performance",
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
				pulumiResources := pulumiframework.GetComponents(snapshot.Resources)
				urn := resource.NewURN(checkpoint.Target, "performance", "pulumi:framework:Endpoint", "tests-performance")
				endpoint := pulumiResources[urn]
				if !assert.NotNil(t, endpoint, "expected to find endpoint") {
					return
				}
				baseURL := endpoint.Properties["url"].StringValue()
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

		{
			Dir: path.Join(cwd, "examples/crawler"),
			Config: map[string]string{
				"aws:config:region":     region,
				"cloud:config:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
		},
		{
			Dir: path.Join(cwd, "examples/countdown"),
			Config: map[string]string{
				"aws:config:region": region,
				// TODO[pulumi/pulumi-cloud#138]: Would love to use this example to test private networking for
				// lambdas, but we are blocked on doing this in CI due to the inability to automatically delete
				// the VPC used for hosting Lambda within a day of running a Lambda in it.
				// "cloud-aws:config:usePrivateNetwork": "true",
			},
			Dependencies: []string{
				"@pulumi/cloud",
			},
		},
		{
			Dir: path.Join(cwd, "examples/containers"),
			Config: map[string]string{
				"aws:config:region":               region,
				"cloud-aws:config:ecsAutoCluster": "true",
			},
			Dependencies: []string{
				"@pulumi/cloud",
			},
			ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
				_, _, snapshot, err := stack.DeserializeCheckpoint(&checkpoint)
				if !assert.Nil(t, err, "expected checkpoint deserialization to succeed") {
					return
				}
				pulumiResources := pulumiframework.GetComponents(snapshot.Resources)
				urn := resource.NewURN(checkpoint.Target, "containers", "pulumi:framework:Endpoint", "examples-containers")
				endpoint := pulumiResources[urn]
				if !assert.NotNil(t, endpoint, "expected to find endpoint") {
					return
				}
				baseURL := endpoint.Properties["url"].StringValue()
				assert.NotEmpty(t, baseURL, "expected a `containers` endpoint")

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
					resp, err := http.Get(baseURL)
					assert.NoError(t, err, "expected to be able to GET /")
					assert.Equal(t, 200, resp.StatusCode, "expected 200")
					contentType := resp.Header.Get("Content-Type")
					assert.Equal(t, "application/json", contentType)
					bytes, err := ioutil.ReadAll(resp.Body)
					assert.NoError(t, err)
					t.Logf("GET %v [%v/%v]: %v", baseURL, resp.StatusCode, contentType, string(bytes))
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

			},
		},
		{
			Dir: path.Join(cwd, "examples/todo"),

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
				pulumiResources := pulumiframework.GetComponents(snapshot.Resources)
				urn := resource.NewURN(checkpoint.Target, "todo", "pulumi:framework:Endpoint", "examples-todo")
				endpoint := pulumiResources[urn]
				if !assert.NotNil(t, endpoint, "expected to find endpoint") {
					return
				}
				baseURL := endpoint.Properties["url"].StringValue()
				assert.NotEmpty(t, baseURL, "expected a `todo` endpoint")

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
		{
			Dir: path.Join(cwd, "examples/timers"),
			Config: map[string]string{
				"aws:config:region":     region,
				"cloud:config:provider": "aws",
				"timers:config:message": "Hello, Pulumi Timers!",
			},
			Dependencies: []string{
				"pulumi",
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
		},
		{
			Dir: path.Join(cwd, "examples/httpEndpoint"),

			Config: map[string]string{
				"aws:config:region":     region,
				"cloud:config:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
				testURLGet(t, checkpoint, "test1.txt", "You got test1")
			},
			// EditDirs: []integration.EditDir{
			// 	// Validate that if we change an httpendpoint url that updating works and that we
			// 	// can retrieve the new content and the new endpoint.
			// 	integration.EditDir{
			// 		Dir: path.Join(cwd, "../../examples/httpEndpoint/variants/updateGetEndpoint"),
			// 		ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
			// 			testURLGet(t, checkpoint, "test2.txt", "You got test2")
			// 		},
			// 	},
			// },
		},
		// Leaving out of integration tests until we have shareable credentials for testing these integrations.
	}
	for _, ex := range examples {
		example := ex.With(integration.ProgramTestOptions{
			ReportStats: integration.NewS3Reporter("us-west-2", "eng.pulumi.com", "testreports"),
		})
		t.Run(example.Dir, func(t *testing.T) {
			integration.ProgramTest(t, example)
		})
	}
}

func testURLGet(t *testing.T, checkpoint stack.Checkpoint, path string, contents string) {
	_, _, snapshot, err := stack.DeserializeCheckpoint(&checkpoint)
	if !assert.Nil(t, err, "expected checkpoint deserialization to succeed") {
		return
	}
	pulumiResources := pulumiframework.GetComponents(snapshot.Resources)
	urn := resource.NewURN(checkpoint.Target, "httpEndpoint", "pulumi:framework:Endpoint", "examples-test")
	endpoint := pulumiResources[urn]
	if !assert.NotNil(t, endpoint, "expected to find 'test' endpoint") {
		return
	}
	baseURL := endpoint.Properties["url"].StringValue()
	assert.NotEmpty(t, baseURL, "expected an `test` endpoint")

	// Validate the GET /test1.txt endpoint
	resp, err := http.Get(baseURL + path)
	assert.NoError(t, err, "expected to be able to GET /"+path)
	contentType := resp.Header.Get("Content-Type")
	assert.Equal(t, "text/html", contentType)
	bytes, err := ioutil.ReadAll(resp.Body)
	assert.NoError(t, err)
	t.Logf("GET %v [%v/%v]: %v", baseURL+path, resp.StatusCode, contentType, string(bytes))
	assert.Equal(t, contents, string(bytes))
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
	pulumiResources := pulumiframework.GetComponents(snapshot.Resources)
	urn := resource.NewURN(checkpoint.Target, packageName, "pulumi:framework:Endpoint", endpointName)
	endpoint := pulumiResources[urn]
	if !assert.NotNil(t, endpoint, "expected to find endpoint") {
		return
	}
	baseURL := endpoint.Properties["url"].StringValue()
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
