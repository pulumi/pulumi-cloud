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

	"github.com/pulumi/pulumi-fabric/pkg/resource"
	"github.com/pulumi/pulumi-fabric/pkg/resource/environment"
	"github.com/pulumi/pulumi-fabric/pkg/testing/integration"
	"github.com/pulumi/pulumi-framework/pkg/pulumiframework"
)

func Test_Examples(t *testing.T) {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		t.Skipf("Skipping test due to missing AWS_REGION environment variable")
	}
	fmt.Printf("AWS Region: %v\n", region)
	var pulumiFrameworkRegion string
	switch region {
	case "us-west-2":
		pulumiFrameworkRegion = "WestUS"
	case "us-east-2":
		pulumiFrameworkRegion = "EastUS"
	case "eu-west-1":
		pulumiFrameworkRegion = "WestEU"
	default:
		assert.Fail(t, "Expected a valid Pulumi framework region: %v", region)
	}

	cwd, err := os.Getwd()
	if !assert.NoError(t, err, "expected a valid working directory: %v", err) {
		return
	}
	examples := []integration.LumiProgramTestOptions{
		{
			Dir: path.Join(cwd, "crawler"),
			Config: map[string]string{
				"pulumi:config:region": pulumiFrameworkRegion,
			},
			Dependencies: []string{
				"@pulumi/pulumi",
			},
		},
		{
			Dir: path.Join(cwd, "todo"),
			Config: map[string]string{
				"pulumi:config:region": pulumiFrameworkRegion,
			},
			Dependencies: []string{
				"@pulumi/pulumi",
			},
			ExtraRuntimeValidation: func(t *testing.T, checkpoint environment.Checkpoint) {
				_, snapshot := environment.DeserializeCheckpoint(&checkpoint)
				pulumiResources := pulumiframework.GetComponents(snapshot.Resources)
				endpoint, ok := pulumiResources[resource.URN("urn:lumi:test::todo:index::pulumi:framework:Endpoint::todo")]
				assert.True(t, ok)
				baseURL := endpoint.Properties["url"].StringValue()
				assert.NotEmpty(t, baseURL, "expected a `todo` endpoint")

				// Validate the GET / endpoint
				resp, err := http.Get(baseURL)
				assert.NoError(t, err, "expected to be able to GET /")
				contentType := resp.Header.Get("Content-Type")
				assert.Equal(t, "text/html", contentType)

				// Validate the GET /favico.ico endpoint
				resp, err = http.Get(baseURL + "/favicon.ico")
				assert.NoError(t, err, "expected to be able to GET /favicon.ico")
				assert.Equal(t, int64(1150), resp.ContentLength)

				// Validate the POST /todo/{id} endpoint
				resp, err = http.Post(baseURL+"/todo/abc", "application/x-www-form-urlencoded", strings.NewReader("xyz"))
				assert.NoError(t, err, "expected to be able to POST /todo/{id}")
				assert.Equal(t, 201, resp.StatusCode)

				// Validate the GET /todo/{id} endpoint
				resp, err = http.Get(baseURL + "/todo/abc")
				assert.NoError(t, err, "expected to be able to GET /todo/{id}")
				byts, err := ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				assert.Equal(t, 401, resp.StatusCode)
				assert.Equal(t, "Authorization header required", string(byts))

				// Validate the GET /todo endpoint
				resp, err = http.Get(baseURL + "/todo/")
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
