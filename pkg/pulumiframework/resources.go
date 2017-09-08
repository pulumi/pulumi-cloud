package pulumiframework

import (
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go/aws/session"

	"github.com/pulumi/pulumi-fabric/pkg/resource"
	"github.com/pulumi/pulumi-fabric/pkg/tokens"
	"github.com/pulumi/pulumi-framework/pkg/component"
)

// This file contains the implementation of the component.Components interface for the
// AWS implementation of the Pulumi Framework defined in this repo.

// PulumiFrameworkComponents exrtacts the Pulumi Framework components from a checkpoint
// file, based on the raw resources created by the implementation of the Pulumi Framework
// in this repo.
func PulumiFrameworkComponents(source []*resource.State) component.Components {
	sourceMap := makeIDLookup(source)
	components := make(component.Components)
	for _, res := range source {
		name := res.Inputs["urnName"].StringValue()
		if res.Type() == stageType {
			stage := res
			deployment := lookup(sourceMap, deploymentType, stage.Inputs["deployment"].StringValue())
			restAPI := lookup(sourceMap, restAPIType, stage.Inputs["restApi"].StringValue())
			baseURL := deployment.Outputs["invokeUrl"].StringValue() + stage.Inputs["stageName"].StringValue() + "/"
			restAPIName := restAPI.Inputs["urnName"].StringValue()
			urn := newPulumiFrameworkURN(res.URN(), tokens.Type(pulumiEndpointType), tokens.QName(restAPIName))
			components[urn] = &component.Component{
				Type: pulumiEndpointType,
				Properties: resource.NewPropertyMapFromMap(map[string]interface{}{
					"url": baseURL,
				}),
				Resources: map[string]*resource.State{
					"restapi":    restAPI,
					"deployment": deployment,
					"stage":      stage,
				},
			}
		} else if res.Type() == eventRuleType {
			urn := newPulumiFrameworkURN(res.URN(), tokens.Type(pulumiTimerType), tokens.QName(name))
			components[urn] = &component.Component{
				Type: pulumiTimerType,
				Properties: resource.NewPropertyMapFromMap(map[string]interface{}{
					"schedule": res.Inputs["scheduleExpression"].StringValue(),
				}),
				Resources: map[string]*resource.State{
					"rule":       res,
					"target":     nil,
					"permission": nil,
				},
			}
		} else if res.Type() == tableType {
			urn := newPulumiFrameworkURN(res.URN(), tokens.Type(pulumiTableType), tokens.QName(name))
			components[urn] = &component.Component{
				Type: pulumiTableType,
				Properties: resource.NewPropertyMapFromMap(map[string]interface{}{
					"primaryKey": res.Inputs["hashKey"].StringValue(),
				}),
				Resources: map[string]*resource.State{
					"table": res,
				},
			}
		} else if res.Type() == topicType {
			if !strings.HasSuffix(name, "unhandled-error-topic") {
				urn := newPulumiFrameworkURN(res.URN(), tokens.Type(pulumiTopicType), tokens.QName(name))
				components[urn] = &component.Component{
					Type:       pulumiTopicType,
					Properties: resource.NewPropertyMapFromMap(map[string]interface{}{}),
					Resources: map[string]*resource.State{
						"topic": res,
					},
				}
			}
		} else if res.Type() == functionType {
			if !strings.HasSuffix(name, "pulumi-app-log-collector") {
				urn := newPulumiFrameworkURN(res.URN(), tokens.Type(pulumiFunctionType), tokens.QName(name))
				components[urn] = &component.Component{
					Type:       pulumiFunctionType,
					Properties: resource.NewPropertyMapFromMap(map[string]interface{}{}),
					Resources: map[string]*resource.State{
						"function":              res,
						"role":                  nil,
						"roleAttachment":        nil,
						"logGroup":              nil,
						"logSubscriptionFilter": nil,
						"permission":            nil,
					},
				}
			}
		}
	}
	return components
}

// PulumiFrameworkOperationsProvider creates an OperationsProvider capable of answering
// operational queries based on the underlying resources of the AWS  Pulumi Framework implementation.
func PulumiFrameworkOperationsProvider(sess *session.Session) component.OperationsProvider {
	return &pulumiFrameworkOperationsProvider{
		awsConnection: newAWSConnection(sess),
	}
}

type pulumiFrameworkOperationsProvider struct {
	awsConnection *awsConnection
}

var _ component.OperationsProvider = (*pulumiFrameworkOperationsProvider)(nil)

const (
	stageType      = "aws:apigateway/stage:Stage"
	deploymentType = "aws:apigateway/deployment:Deployment"
	restAPIType    = "aws:apigateway/restApi:RestApi"
	eventRuleType  = "aws:cloudwatch/eventRule:EventRule"
	tableType      = "aws:dynamodb/table:Table"
	topicType      = "aws:sns/topic:Topic"
	functionType   = "aws:lambda/function:Function"

	pulumiEndpointType = tokens.Type("pulumi:framework:Endpoint")
	pulumiTopicType    = tokens.Type("pulumi:framework:Topic")
	pulumiTimerType    = tokens.Type("pulumi:framework:Timer")
	pulumiTableType    = tokens.Type("pulumi:framework:Table")
	pulumiFunctionType = tokens.Type("pulumi:framework:Function")
)

func (ops *pulumiFrameworkOperationsProvider) GetLogs(component *component.Component) *[]component.LogEntry {
	switch component.Type {
	case pulumiFunctionType:
		functionName := component.Resources["function"].Outputs["name"].StringValue()
		logResult := ops.awsConnection.getLogsForFunction(functionName)
		sort.SliceStable(logResult, func(i, j int) bool { return logResult[i].Timestamp < logResult[j].Timestamp })
		return &logResult
	default:
		return nil

	}
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

func newPulumiFrameworkURN(resourceURN resource.URN, t tokens.Type, name tokens.QName) resource.URN {
	namespace := resourceURN.Namespace()
	return resource.NewURN(namespace, resourceURN.Alloc(), t, name)
}
