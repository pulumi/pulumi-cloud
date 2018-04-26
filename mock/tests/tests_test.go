package examples

import (
	"os"
	"path"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi/pkg/testing/integration"
)

func Test_Examples(t *testing.T) {
	cwd, err := os.Getwd()
	if !assert.NoError(t, err, "expected a valid working directory: %v", err) {
		return
	}
	examples := []integration.LumiProgramTestOptions{
		{
			Dir: path.Join(cwd, "./table"),
			Config: map[string]string{
				"cloud:config:provider": "mock",
			},
			Dependencies: []string{
				"@pulumi/cloud",
				"@pulumi/cloud-mock",
			},
		},
	}
	for _, ex := range examples {
		example := ex
		t.Run(example.Dir, func(t *testing.T) {
			runTest(t, example)
		})
	}
}

func runTest(t *testing.T, opts integration.LumiProgramTestOptions) {
	dir, err := integration.CopyTestToTemporaryDirectory(t, &opts)
	if !assert.NoError(t, err) {
		return
	}

	integration.RunCommand(t, []string{opts.YarnBin, "run", "test"}, dir, opts)
}
