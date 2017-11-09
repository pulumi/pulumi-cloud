package examples

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"testing"

	"github.com/pulumi/pulumi/pkg/tokens"

	"github.com/cleversoap/go-cp"
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

	testDirs := []string{
		cwd + "/table",
		cwd + "/table/variants/update1",
		cwd + "/table/variants/update2",
		cwd + "/httpEndpoint",
		cwd + "/httpEndpoint/variants/update1",
		cwd + "/httpEndpoint/variants/update2",
	}

	for _, dir := range testDirs {
		// fmt.Printf("Copying " + cwd + "/harness.ts to " + dir + "/harness.ts\n")
		err := cp.Copy(cwd+"/harness.ts", dir+"/harness.ts")
		if !assert.NoError(t, err, "could not copy file", err) {
			return
		}
	}

	tests := []integration.ProgramTestOptions{
		{
			Verbose: true,
			Dir:     cwd + "/table",
			Config: map[string]string{
				"aws:config:region":     region,
				"cloud:config:provider": "aws",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-aws",
			},
			ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
				hitUnitTestsEndpoint(t, checkpoint, cwd+"/table/harness.ts")
			},
			EditDirs: []integration.EditDir{
				{
					Dir: cwd + "/table/variants/update1",
					ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
						hitUnitTestsEndpoint(t, checkpoint, cwd+"/table/variants/update1/harness.ts")
					},
				},
				{
					Dir: cwd + "/table/variants/update2",
					ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
						hitUnitTestsEndpoint(t, checkpoint, cwd+"/table/variants/update2/harness.ts")
					},
				},
			},
		},
		// {
		// 	Dir: cwd + "/httpEndpoint",
		// 	Config: map[string]string{
		// 		"aws:config:region":     region,
		// 		"cloud:config:provider": "aws",
		// 	},
		// 	Dependencies: []string{
		// 		"@pulumi/cloud",
		// 		"@pulumi/cloud-aws",
		// 	},
		// 	ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
		// 		hitUnitTestsEndpoint(t, checkpoint, cwd+"/httpEndpoint/harness.ts")
		// 	},
		// 	EditDirs: []integration.EditDir{
		// 		{
		// 			Dir: cwd + "/httpEndpoint/variants/update1",
		// 			ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
		// 				hitUnitTestsEndpoint(t, checkpoint, cwd+"/httpEndpoint/variants/update1/harness.ts")
		// 			},
		// 		},
		// 		{
		// 			Dir: cwd + "/httpEndpoint/variants/update2",
		// 			ExtraRuntimeValidation: func(t *testing.T, checkpoint stack.Checkpoint) {
		// 				hitUnitTestsEndpoint(t, checkpoint, cwd+"/httpEndpoint/variants/update2/harness.ts")
		// 			},
		// 		},
		// 	},
		// },
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
	checkpoint stack.Checkpoint,
	harnessFile string) {

	defer func() {
		fmt.Printf("Removing " + harnessFile + "\n")
		os.Remove(harnessFile)
	}()

	var packageName tokens.PackageName = "unittests"
	var endpointName tokens.QName = "unittests"
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
