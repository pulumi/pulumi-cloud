package pulumiframework

import (
	"github.com/pulumi/pulumi-fabric/pkg/resource"
	"github.com/pulumi/pulumi-fabric/pkg/tokens"
)

// PulumiResources represents the resources in a running Pulumi Framework application
type PulumiResources struct {
	Endpoints map[string]*Endpoint
	Timers    map[string]*Timer
	Tables    map[string]*Table
	Topics    map[string]*Topic
}

func newPulumiResources() *PulumiResources {
	return &PulumiResources{
		Endpoints: make(map[string]*Endpoint),
		Timers:    make(map[string]*Timer),
		Tables:    make(map[string]*Table),
		Topics:    make(map[string]*Topic),
	}
}

// Endpoint is an internet visible HTTP endpoint exposed from a Pulumi application
type Endpoint struct {
	URL string
}

// Timer is a scheduled task that will execute within a Pulumi application
type Timer struct {
	Schedule string
}

// Table is a document store available within a Pulumi application
type Table struct {
	PrimaryKey     string
	PrimaryKeyType string
}

// Topic is a pub-sub topic for distributing work within a Pulumi application
type Topic struct {
}

type typeid struct {
	Type tokens.Type
	ID   resource.ID
}

func makeIDLookup(source []*resource.State) map[typeid]*resource.State {
	ret := make(map[typeid]*resource.State)
	for _, state := range source {
		tid := typeid{Type: state.T, ID: state.ID}
		ret[tid] = state
	}
	return ret
}

func lookup(m map[typeid]*resource.State, t string, id string) *resource.State {
	return m[typeid{Type: tokens.Type(t), ID: resource.ID(id)}]
}

const (
	stageType      = "aws:apigateway/stage:Stage"
	deploymentType = "aws:apigateway/deployment:Deployment"
	restAPIType    = "aws:apigateway/restApi:RestApi"
	eventRuleType  = "aws:cloudwatch/eventRule:EventRule"
	tableType      = "aws:dynamodb/table:Table"
	topicType      = "aws:sns/topic:Topic"
)

// GetPulumiResources translates a Lumi resources checkpoint with AWS reosources into a collection
// of Pulumi Framework abstractions.
func GetPulumiResources(source []*resource.State) *PulumiResources {
	sourceMap := makeIDLookup(source)
	pulumiResources := newPulumiResources()
	for _, res := range source {
		if res.Type() == stageType {
			stage := res
			deployment := lookup(sourceMap, deploymentType, stage.Inputs["deployment"].StringValue())
			restAPI := lookup(sourceMap, restAPIType, stage.Inputs["restApi"].StringValue())
			baseURL := deployment.Outputs["invokeUrl"].StringValue() + stage.Inputs["stageName"].StringValue() + "/"
			pulumiResources.Endpoints[restAPI.Inputs["urnName"].StringValue()] = &Endpoint{
				URL: baseURL,
			}
		} else if res.Type() == eventRuleType {
			pulumiResources.Timers[res.Inputs["urnName"].StringValue()] = &Timer{
				Schedule: res.Inputs["scheduleExpression"].StringValue(),
			}
		} else if res.Type() == tableType {
			pulumiResources.Tables[res.Inputs["urnName"].StringValue()] = &Table{
				PrimaryKey: res.Outputs["hashKey"].StringValue(),
			}
		} else if res.Type() == topicType {
			pulumiResources.Topics[res.Inputs["urnName"].StringValue()] = &Topic{}
		}
	}
	return pulumiResources
}
