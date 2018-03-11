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

	"github.com/pulumi/pulumi/pkg/operations"
	"github.com/pulumi/pulumi/pkg/resource/config"
	"github.com/pulumi/pulumi/pkg/testing/integration"
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
			Dir: path.Join(cwd, "tests/unit"),
			Config: map[string]string{
				"aws:config:region":                     region,
				"cloud:config:provider":                 "aws",
				"cloud-aws:config:ecsAutoCluster":       "true",
				"cloud-aws:config:ecsAutoClusterUseEFS": "false",
				"cloud-aws:config:usePrivateNetwork":    "true",
			},
			Dependencies: []string{
				"@pulumi/pulumi",
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
			Dir: path.Join(cwd, "./examples/cluster"),
			Config: map[string]string{
				"aws:config:region":     region,
				"cloud:config:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/pulumi",
				"@pulumi/cloud-aws",
			},
		},

		{
			Dir: path.Join(cwd, "/tests/performance"),
			Config: map[string]string{
				"aws:config:region":     region,
				"cloud:config:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/pulumi",
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
				"aws:config:region":     region,
				"cloud:config:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/pulumi",
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
		},
		{
			Dir: path.Join(cwd, "../examples/countdown"),
			Config: map[string]string{
				"aws:config:region":                  region,
				"cloud:config:provider":              "aws",
				"cloud-aws:config:usePrivateNetwork": "true",
			},
			Dependencies: []string{
				"@pulumi/pulumi",
				"@pulumi/cloud",
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
			Dir: path.Join(cwd, "../examples/containers"),
			Config: map[string]string{
				"aws:config:region":                                            region,
				"cloud:config:provider":                                        "aws",
				"cloud-aws:config:ecsAutoCluster":                              "true",
				"cloud-aws:config:ecsAutoClusterNumberOfAZs":                   "2",
				"cloud-aws:config:ecsAutoClusterInstanceRootVolumeSize":        "80",
				"cloud-aws:config:ecsAutoClusterInstanceDockerImageVolumeSize": "100",
				"cloud-aws:config:ecsAutoClusterInstanceSwapVolumeSize":        "1",
				"containers:config:redisPassword":                              "SECRETPASSWORD",
			},
			Dependencies: []string{
				"@pulumi/pulumi",
				"@pulumi/cloud",
			},
			ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
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

				// Wait for a minute before getting logs
				time.Sleep(1 * time.Minute)

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
					assert.Contains(t, nginxLogs[0].Message, "GET /")
				}

				// Hello World container Task logs
				//  {examples-hello-world 1512871250458 Hello from Docker!}
				{
					hellowWorldLogs, exists := logsByResource["examples-hello-world"]
					if !assert.True(t, exists) {
						return
					}
					if !assert.True(t, len(hellowWorldLogs) > 16) {
						return
					}
					assert.Contains(t, hellowWorldLogs[0].Message, "Hello from Docker!")
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
					assert.Contains(t, redisLogs[0].Message, "Redis is starting")
				}
			},
		},
		{
			Dir: path.Join(cwd, "../examples/todo"),

			Config: map[string]string{
				"aws:config:region":     region,
				"cloud:config:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/pulumi",
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
				"aws:config:region":     region,
				"cloud:config:provider": "aws",
				"timers:config:message": "Hello, Pulumi Timers!",
			},
			Dependencies: []string{
				"@pulumi/pulumi",
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
		},
		{
			Dir: path.Join(cwd, "../examples/httpEndpoint"),

			Config: map[string]string{
				"aws:config:region":     region,
				"cloud:config:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/pulumi",
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: func(t *testing.T, stackInfo integration.RuntimeValidationStackInfo) {
				baseURL, ok := stackInfo.Outputs["url"].(string)
				assert.True(t, ok, "expected a `url` output string property")
				testURLGet(t, baseURL, "test1.txt", "You got test1")
			},
		},
	}
	for _, ex := range examples {
		example := ex.With(integration.ProgramTestOptions{
			ReportStats: integration.NewS3Reporter("us-west-2", "eng.pulumi.com", "testreports"),
		})
		t.Run(example.Dir, func(t *testing.T) {
			integration.ProgramTest(t, &example)
		})
	}
}

func getLogs(t *testing.T, region string, stackInfo integration.RuntimeValidationStackInfo,
	query operations.LogQuery) *[]operations.LogEntry {

	tree := operations.NewResourceTree(stackInfo.Snapshot.Resources)
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

	// Validate the GET /unittests endpoint

	resp, err := http.Get(baseURL + urlPortion)
	if !assert.NoError(t, err, "expected to be able to GET "+baseURL+urlPortion) {
		return
	}

	contentType := resp.Header.Get("Content-Type")
	assert.Equal(t, "application/json", contentType)

	bytes, err := ioutil.ReadAll(resp.Body)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
	t.Logf("GET %v [%v/%v]: %v", baseURL+urlPortion, resp.StatusCode, contentType, string(bytes))
}
