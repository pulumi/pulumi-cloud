package pulumiframework

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi-fabric/pkg/resource/environment"
)

func getPulumiResources(t *testing.T, path string) *PulumiResources {
	var checkpoint environment.Checkpoint
	byts, err := ioutil.ReadFile(path)
	assert.NoError(t, err)
	json.Unmarshal(byts, &checkpoint)
	_, snapshot := environment.DeserializeCheckpoint(&checkpoint)

	resources := GetPulumiResources(snapshot.Resources)
	outByts, err := json.MarshalIndent(resources, "", "  ")
	fmt.Printf("%s\n", outByts)
	return resources
}

func TestTodo(t *testing.T) {
	resources := getPulumiResources(t, "testdata/todo.json")
	assert.Equal(t, 1, len(resources.Endpoints), "expected 1 endpoint")
	endpoint, ok := resources.Endpoints["todo"]
	assert.True(t, ok)
	assert.NotEqual(t, 0, len(endpoint.URL))
	assert.Equal(t, 0, len(resources.Timers), "expected 1 endpoint")
	assert.Equal(t, 1, len(resources.Tables), "expected 1 endpoint")
}

func TestCrawler(t *testing.T) {
	resources := getPulumiResources(t, "testdata/crawler.json")
	assert.Equal(t, 0, len(resources.Endpoints), "expected 1 endpoint")
	assert.Equal(t, 1, len(resources.Timers), "expected 1 endpoint")
	timer, ok := resources.Timers["heartbeat"]
	assert.True(t, ok)
	assert.Equal(t, "rate(5 minutes)", timer.Schedule)
	assert.Equal(t, 0, len(resources.Tables), "expected 1 endpoint")
}
