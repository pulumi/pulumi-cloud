package examples

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi-cloud/pkg/pulumiframework"
	"github.com/pulumi/pulumi/pkg/resource"
	"github.com/pulumi/pulumi/pkg/resource/stack"
	"github.com/pulumi/pulumi/pkg/testing/integration"
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
			Dir: cwd,
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
				urn := resource.NewURN(checkpoint.Target, "performance", "pulumi:framework:Endpoint", "performance")
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

				resp, err := http.Get(baseURL + "/performance?DATADOG_API_KEY=" + dataDogAPIKey + "&DATADOG_APP_KEY=" + dataDogAppKey)
				assert.NoError(t, err, "expected to be able to GET /performance")

				contentType := resp.Header.Get("Content-Type")
				assert.Equal(t, "text/json", contentType)

				bytes, err := ioutil.ReadAll(resp.Body)
				assert.NoError(t, err)
				t.Logf("GET %v [%v/%v]: %v", baseURL+"/performance", resp.StatusCode, contentType, string(bytes))
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
