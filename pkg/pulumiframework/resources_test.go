package pulumiframework

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"testing"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi-fabric/pkg/resource"
	"github.com/pulumi/pulumi-fabric/pkg/resource/environment"
	"github.com/pulumi/pulumi-fabric/pkg/tokens"
	"github.com/pulumi/pulumi-framework/pkg/component"
)

var sess *session.Session

func init() {
	var err error
	config := aws.NewConfig()
	config.Region = aws.String("eu-west-1")
	sess, err = session.NewSession(config)
	if err != nil {
		panic("Could not create AWS session")
	}
}

func getPulumiResources(t *testing.T, path string) component.Components {
	var checkpoint environment.Checkpoint
	byts, err := ioutil.ReadFile(path)
	assert.NoError(t, err)
	json.Unmarshal(byts, &checkpoint)
	_, snapshot := environment.DeserializeCheckpoint(&checkpoint)

	resources := PulumiFrameworkComponents(snapshot.Resources)
	fmt.Printf("%s\n", resources)
	return resources
}

func TestTodo(t *testing.T) {
	components := getPulumiResources(t, "testdata/todo.json")
	assert.Equal(t, 5, len(components))

	// assert.Equal(t, 1, len(resources.Endpoints()), "expected 1 endpoint")
	// endpoint, ok := resources.Endpoints()["todo"]
	// assert.True(t, ok)
	// assert.NotEqual(t, 0, len(endpoint.URL()))
	// assert.Equal(t, 0, len(resources.Timers()), "expected 1 endpoint")
	// assert.Equal(t, 1, len(resources.Tables()), "expected 1 endpoint")
}

func TestCrawler(t *testing.T) {
	components := getPulumiResources(t, "testdata/crawler.json")
	assert.Equal(t, 4, len(components))

	rawURN := resource.URN("urn:lumi:test::todo:index::aws:sns/topic:Topic::countDown")

	countDownArn := newPulumiFrameworkURN(rawURN, tokens.Type(pulumiTopicType), tokens.QName("countDown"))
	countDown, ok := components[countDownArn]
	assert.True(t, ok)
	assert.Equal(t, 0, len(countDown.Properties))
	assert.Equal(t, 1, len(countDown.Resources))
	assert.Equal(t, pulumiTopicType, countDown.Type)

	heartbeatArn := newPulumiFrameworkURN(rawURN, tokens.Type(pulumiTimerType), tokens.QName("heartbeat"))
	heartbeat, ok := components[heartbeatArn]
	assert.True(t, ok)
	assert.Equal(t, 1, len(heartbeat.Properties))
	assert.Equal(t, "rate(5 minutes)", heartbeat.Properties[resource.PropertyKey("schedule")].StringValue())
	assert.Equal(t, 3, len(heartbeat.Resources))
	assert.Equal(t, pulumiTimerType, heartbeat.Type)
}
