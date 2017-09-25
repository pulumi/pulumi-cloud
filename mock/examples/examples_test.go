package examples

import (
	"fmt"
	"os"
	"os/exec"
	"path"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi/pkg/testing/integration"
	"github.com/pulumi/pulumi/pkg/util/contract"
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
				"pulumi",
				"@pulumi/cloud",
				"@pulumi/cloud-mock",
			},
		},
		// {
		// 	Dir: path.Join(cwd, "../../examples/todo"),
		// 	Config: map[string]string{
		// 		"cloud:config:provider": "mock",
		// 	},
		// 	Dependencies: []string{
		// 		"@pulumi/cloud",
		// 		"@pulumi/cloud-mock",
		// 	},
		// },
		// Leaving out of integration tests until we have shareable credentials for testing these integrations.
	}
	for _, ex := range examples {
		example := ex
		t.Run(example.Dir, func(t *testing.T) {
			runExample(t, example)
		})
	}
}

func runExample(t *testing.T, opts integration.LumiProgramTestOptions) {
	// // Ensure the required programs are present.
	// if opts.LumiBin == "" {
	// 	lumi, err := exec.LookPath("pulumi")
	// 	if !assert.NoError(t, err, "Expected to find `pulumi` binary on $PATH: %v", err) {
	// 		return
	// 	}
	// 	opts.LumiBin = lumi
	// }
	if opts.YarnBin == "" {
		yarn, err := exec.LookPath("yarn")
		if !assert.NoError(t, err, "Expected to find `yarn` binary on $PATH: %v", err) {
			return
		}
		opts.YarnBin = yarn
	}

	// Set up a prefix so that all output has the test directory name in it.  This is important for debugging
	// because we run tests in parallel, and so all output will be interleaved and difficult to follow otherwise.
	dir := opts.Dir
	prefix := fmt.Sprintf("[ %30.30s ] ", dir[len(dir)-30:])
	stdout := opts.Stdout
	if stdout == nil {
		stdout = integration.NewPrefixer(os.Stdout, prefix)
		opts.Stdout = stdout
	}
	stderr := opts.Stderr
	if stderr == nil {
		stderr = integration.NewPrefixer(os.Stderr, prefix)
		opts.Stderr = stderr
	}

	var err error
	_, err = fmt.Fprintf(opts.Stdout, "sample: %v\n", dir)
	contract.IgnoreError(err)
	_, err = fmt.Fprintf(opts.Stdout, "yarn: %v\n", opts.YarnBin)
	contract.IgnoreError(err)

	// Now copy the source project, excluding the .pulumi directory.
	dir, err = integration.PrepareProject(t, dir, "", opts)
	if !assert.NoError(t, err, "Failed to copy source project %v to a new temp dir: %v", dir, err) {
		return
	}
	_, err = fmt.Fprintf(stdout, "projdir: %v\n", dir)
	contract.IgnoreError(err)

	// Ensure all links are present, the environment is created, and all configs are applied.
	_, err = fmt.Fprintf(opts.Stdout, "Initializing project\n")
	contract.IgnoreError(err)

	// integration.RunCommand(t, []string{"node", "index.js"}, dir, opts)
	integration.RunCommand(t, []string{opts.YarnBin, "run", "test"}, dir, opts)

	// runCmd(t, []string{opts.LumiBin, "env", "init", testEnvironmentName}, dir, opts)
	// for key, value := range opts.Config {
	// 	runCmd(t, []string{opts.LumiBin, "config", key, value}, dir, opts)
	// }

	// // Now plan and deploy the real changes.
	// _, err = fmt.Fprintf(opts.Stdout, "Performing primary plan and deploy\n")
	// contract.IgnoreError(err)
	// planAndDeploy := func(d string) {
	// 	runCmd(t, []string{opts.LumiBin, "plan"}, d, opts)
	// 	runCmd(t, []string{opts.LumiBin, "deploy"}, d, opts)
	// }
	// planAndDeploy(dir)

	// // Perform an empty plan and deploy; nothing is expected to happen here.
	// _, err = fmt.Fprintf(opts.Stdout, "Performing empty plan and deploy (no changes expected)\n")
	// contract.IgnoreError(err)
	// planAndDeploy(dir)

	// // Run additional validation provided by the test options, passing in the
	// if opts.ExtraRuntimeValidation != nil {
	// 	checkpointFile := path.Join(dir, ".pulumi", "env", testEnvironmentName+".json")
	// 	var byts []byte
	// 	byts, err = ioutil.ReadFile(path.Join(dir, ".pulumi", "env", testEnvironmentName+".json"))
	// 	if !assert.NoError(t, err, "Expected to be able to read checkpoint file at %v: %v", checkpointFile, err) {
	// 		return
	// 	}
	// 	var checkpoint environment.Checkpoint
	// 	err = json.Unmarshal(byts, &checkpoint)
	// 	if !assert.NoError(t, err, "Expected to be able to deserialize checkpoint file at %v: %v", checkpointFile, err) {
	// 		return
	// 	}
	// 	opts.ExtraRuntimeValidation(t, checkpoint)
	// }

	// // If there are any edits, apply them and run a plan and deploy for each one.
	// for _, edit := range opts.EditDirs {
	// 	_, err = fmt.Fprintf(opts.Stdout, "Applying edit '%v' and rerunning plan and deploy\n", edit)
	// 	contract.IgnoreError(err)
	// 	dir, err = prepareProject(t, edit, dir, opts)
	// 	if !assert.NoError(t, err, "Expected to apply edit %v atop %v, but got an error %v", edit, dir, err) {
	// 		return
	// 	}
	// 	planAndDeploy(dir)
	// }

	// // Finally, tear down the environment, and clean up the environment.
	// _, err = fmt.Fprintf(opts.Stdout, "Destroying environment\n")
	// contract.IgnoreError(err)
	// runCmd(t, []string{opts.LumiBin, "destroy", "--yes"}, dir, opts)
	// runCmd(t, []string{opts.LumiBin, "env", "rm", "--yes", testEnvironmentName}, dir, opts)
}
