package examples

import (
	"fmt"
	"os"
	"path"
	"testing"

	"github.com/stretchr/testify/assert"

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
	examples := []string{
		path.Join(cwd, "crawler"),
		path.Join(cwd, "todo"),
		// Leaving out of integration tests until we have shareable credentials for testing these integrations.
		// path.Join(cwd, "integration"),
	}
	options := integration.LumiProgramTestOptions{
		Config: map[string]string{
			"platform:config:region": pulumiPlatformRegion,
		},
		Dependencies: []string{
			"@lumi/platform",
		},
	}
	for _, ex := range examples {
		example := ex
		t.Run(example, func(t *testing.T) {
			integration.LumiProgramTest(t, example, options)
		})
	}
}
