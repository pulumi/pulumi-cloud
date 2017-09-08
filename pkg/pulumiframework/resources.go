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

// GetComponents exrtacts the Pulumi Framework components from a checkpoint
// file, based on the raw resources created by the implementation of the Pulumi Framework
// in this repo.
func GetComponents(source []*resource.State) component.Components {
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

// OperationsProviderForComponent creates an OperationsProvider capable of answering
// operational queries based on the underlying resources of the AWS  Pulumi Framework implementation.
func OperationsProviderForComponent(sess *session.Session, component *component.Component) component.OperationsProvider {
	return &pulumiFrameworkOperationsProvider{
		awsConnection: newAWSConnection(sess),
		component:     component,
	}
}

type pulumiFrameworkOperationsProvider struct {
	awsConnection *awsConnection
	component     *component.Component
}

var _ component.OperationsProvider = (*pulumiFrameworkOperationsProvider)(nil)

const (
	// AWS Resource Types
	stageType      = "aws:apigateway/stage:Stage"
	deploymentType = "aws:apigateway/deployment:Deployment"
	restAPIType    = "aws:apigateway/restApi:RestApi"
	eventRuleType  = "aws:cloudwatch/eventRule:EventRule"
	tableType      = "aws:dynamodb/table:Table"
	topicType      = "aws:sns/topic:Topic"
	functionType   = "aws:lambda/function:Function"

	// Pulumi Framework "virtual" types
	pulumiEndpointType = tokens.Type("pulumi:framework:Endpoint")
	pulumiTopicType    = tokens.Type("pulumi:framework:Topic")
	pulumiTimerType    = tokens.Type("pulumi:framework:Timer")
	pulumiTableType    = tokens.Type("pulumi:framework:Table")
	pulumiFunctionType = tokens.Type("pulumi:framework:Function")

	// Operational metric names for Pulumi Framework components
	functionInvocations        component.MetricName = "invocations"
	functionDuration           component.MetricName = "duration"
	functionErrors             component.MetricName = "errors"
	functionThrottles          component.MetricName = "throttles"
	endpoint4xxError           component.MetricName = "4xxerror"
	endpoint5xxError           component.MetricName = "5xxerror"
	endpointCount              component.MetricName = "count"
	endpointLatency            component.MetricName = "latency"
	topicPulished              component.MetricName = "published"
	topicPublishSize           component.MetricName = "publishsize"
	topicDelivered             component.MetricName = "delivered"
	topicFailed                component.MetricName = "failed"
	timerInvocations           component.MetricName = "invocations"
	timerFailedInvocations     component.MetricName = "failedinvocations"
	tableConsumedReadCapacity  component.MetricName = "consumedreadcapacity"
	tableConsumedWriteCapacity component.MetricName = "consumerwritecapacity"
	tableThrottles             component.MetricName = "throttles"
)

func (ops *pulumiFrameworkOperationsProvider) GetLogs() *[]component.LogEntry {
	switch ops.component.Type {
	case pulumiFunctionType:
		functionName := ops.component.Resources["function"].Outputs["name"].StringValue()
		logResult := ops.awsConnection.getLogsForFunction(functionName)
		sort.SliceStable(logResult, func(i, j int) bool { return logResult[i].Timestamp < logResult[j].Timestamp })
		return &logResult
	default:
		return nil

	}
}

func (ops *pulumiFrameworkOperationsProvider) ListMetrics() []component.MetricName {
	switch ops.component.Type {
	case pulumiFunctionType:
		// Don't include these which are internal implementation metrics: DLQ delivery errors
		return []component.MetricName{functionInvocations, functionDuration, functionErrors, functionThrottles}
		// return []string{"invocations", "duration", "errors", "throttles" /*?*/}
	case pulumiEndpointType:
		return []component.MetricName{endpoint4xxError, endpoint5xxError, endpointCount, endpointLatency}
	case pulumiTopicType:
		return []component.MetricName{topicPulished, topicPublishSize, topicDelivered, topicFailed}
	case pulumiTimerType:
		return []component.MetricName{timerInvocations, timerFailedInvocations}
	case pulumiTableType:
		// Internal only: "provisionedreadcapacity", "provisionedwritecapacity", "usererrors", "timetolivedeleted",
		// "systemerrors", "succesfulrequestlatency", "returnedrecordscount", "returenditemcount", "returnedbytes",
		// "onlineindex*", "conditionalcheckfailed"
		return []component.MetricName{tableConsumedReadCapacity, tableConsumedWriteCapacity, tableThrottles}
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
