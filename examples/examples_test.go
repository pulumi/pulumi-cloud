package examples

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"path"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi-fabric/pkg/resource/environment"
	"github.com/pulumi/pulumi-fabric/pkg/testing/integration"
)

func Test_Examples(t *testing.T) {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		t.Skipf("Skipping test due to missing AWS_REGION environment variable")
	}
	fmt.Printf("AWS Region: %v\n", region)
	var pulumiPlatformRegion string
	switch region {
	case "us-west-2":
		pulumiPlatformRegion = "WestUS"
	case "us-east-2":
		pulumiPlatformRegion = "EastUS"
	case "eu-west-1":
		pulumiPlatformRegion = "WestEU"
	default:
		assert.Fail(t, "Expected a valid Pulumi platform region: %v", region)
	}

	cwd, err := os.Getwd()
	if !assert.NoError(t, err, "expected a valid working directory: %v", err) {
		return
	}
	examples := []integration.LumiProgramTestOptions{
		{
			Dir: path.Join(cwd, "crawler"),
			Config: map[string]string{
				"platform:config:region": pulumiPlatformRegion,
			},
			Dependencies: []string{
				"@lumi/platform",
			},
		},
		{
			Dir: path.Join(cwd, "todo"),
			Config: map[string]string{
				"platform:config:region": pulumiPlatformRegion,
			},
			Dependencies: []string{
				"@lumi/platform",
			},
			ExtraRuntimeValidation: func(t *testing.T, checkpoint environment.Checkpoint) {
				var baseUrl string
				for _, kv := range checkpoint.Latest.Resources.Iter() {
					urn := kv.Key
					res := kv.Value
					if res.Type == "aws:apigateway/deployment:Deployment" && strings.HasPrefix(string(urn.Name()), "todo") {
						baseUrl = res.Outputs["invokeUrl"].(string) + "stage/"

					}
				}
				assert.NotNil(t, baseUrl, "expected to find a RestAPI Deployment with an `invokeURL`")

				// Validate the GET / endpoint
				resp, err := http.Get(baseUrl)
				assert.NoError(t, err, "expected to be able to GET /")
				contentType := resp.Header.Get("Content-Type")
				assert.Equal(t, "text/html", contentType)

				// Validate the GET /favico.ico endpoint
				resp, err = http.Get(baseUrl + "/favicon.ico")
				assert.NoError(t, err, "expected to be able to GET /favicon.ico")
				assert.Equal(t, int64(1150), resp.ContentLength)

				// Validate the POST /todo/{id} endpoint
				resp, err = http.Post(baseUrl+"/todo/abc", "application/x-www-form-urlencoded", strings.NewReader("xyz"))
				assert.NoError(t, err, "expected to be able to POST /todo/{id}")
				assert.Equal(t, 201, resp.StatusCode)

				// Validate the GET /todo/{id} endpoint
				resp, err = http.Get(baseUrl + "/todo/abc")
				assert.NoError(t, err, "expected to be able to GET /todo/{id}")
				byts, err := ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				assert.Equal(t, `"xyz"`, string(byts))

				// Validate the GET /todo endpoint
				resp, err = http.Get(baseUrl + "/todo/")
				assert.NoError(t, err, "expected to be able to GET /todo")
				assert.Equal(t, int64(28), resp.ContentLength)
			},
		},
		// Leaving out of integration tests until we have shareable credentials for testing these integrations.
	}
	for _, ex := range examples {
		example := ex
		t.Run(example.Dir, func(t *testing.T) {
			integration.LumiProgramTest(t, example)
		})
	}
}
