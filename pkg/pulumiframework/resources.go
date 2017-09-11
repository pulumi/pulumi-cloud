package pulumiframework

import (
	"fmt"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/cloudwatch"

	"github.com/pulumi/pulumi-fabric/pkg/resource"
	"github.com/pulumi/pulumi-fabric/pkg/tokens"
	"github.com/pulumi/pulumi-fabric/pkg/util/contract"
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
		name := string(res.URN.Name())
		if res.Type == stageType {
			stage := res
			deployment := lookup(sourceMap, deploymentType, stage.Inputs["deployment"].StringValue())
			restAPI := lookup(sourceMap, restAPIType, stage.Inputs["restApi"].StringValue())
			baseURL := deployment.Outputs["invokeUrl"].StringValue() + stage.Inputs["stageName"].StringValue() + "/"
			restAPIName := restAPI.URN.Name()
			urn := newPulumiFrameworkURN(res.URN, tokens.Type(pulumiEndpointType), tokens.QName(restAPIName))
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
		} else if res.Type == eventRuleType {
			urn := newPulumiFrameworkURN(res.URN, tokens.Type(pulumiTimerType), tokens.QName(name))
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
		} else if res.Type == tableType {
			urn := newPulumiFrameworkURN(res.URN, tokens.Type(pulumiTableType), tokens.QName(name))
			components[urn] = &component.Component{
				Type: pulumiTableType,
				Properties: resource.NewPropertyMapFromMap(map[string]interface{}{
					"primaryKey": res.Inputs["hashKey"].StringValue(),
				}),
				Resources: map[string]*resource.State{
					"table": res,
				},
			}
		} else if res.Type == topicType {
			if !strings.HasSuffix(name, "unhandled-error-topic") {
				urn := newPulumiFrameworkURN(res.URN, tokens.Type(pulumiTopicType), tokens.QName(name))
				components[urn] = &component.Component{
					Type:       pulumiTopicType,
					Properties: resource.NewPropertyMapFromMap(map[string]interface{}{}),
					Resources: map[string]*resource.State{
						"topic": res,
					},
				}
			}
		} else if res.Type == functionType {
			if !strings.HasSuffix(name, "pulumi-app-log-collector") {
				urn := newPulumiFrameworkURN(res.URN, tokens.Type(pulumiFunctionType), tokens.QName(name))
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
	return &opsProvider{
		awsConnection: newAWSConnection(sess),
		component:     component,
	}
}

type opsProvider struct {
	awsConnection *awsConnection
	component     *component.Component
}

var _ component.OperationsProvider = (*opsProvider)(nil)

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
	functionInvocations        component.MetricName = "Invocation"
	functionDuration           component.MetricName = "Duration"
	functionErrors             component.MetricName = "Errors"
	functionThrottles          component.MetricName = "Throttles"
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

func (ops *opsProvider) GetLogs(query *component.LogQuery) ([]component.LogEntry, error) {
	if query.StartTime != nil || query.EndTime != nil || query.Query != nil {
		contract.Failf("not yet implemented - StartTime, Endtime, Query")
	}
	switch ops.component.Type {
	case pulumiFunctionType:
		functionName := ops.component.Resources["function"].Outputs["name"].StringValue()
		logResult := ops.awsConnection.getLogsForFunction(functionName)
		sort.SliceStable(logResult, func(i, j int) bool { return logResult[i].Timestamp < logResult[j].Timestamp })
		return logResult, nil
	default:
		return nil, fmt.Errorf("Logs not supported for component type: %s", ops.component.Type)
	}
}

func (ops *opsProvider) ListMetrics() []component.MetricName {
	switch ops.component.Type {
	case pulumiFunctionType:
		// Don't include these which are internal implementation metrics: DLQ delivery errors
		return []component.MetricName{functionInvocations, functionDuration, functionErrors, functionThrottles}
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
		contract.Failf("invalid component type")
		return nil
	}
}

func (ops *opsProvider) GetMetricStatistics(metric component.MetricRequest) ([]component.MetricDataPoint, error) {

	var dimensions []*cloudwatch.Dimension
	var namespace string

	switch ops.component.Type {
	case pulumiFunctionType:
		dimensions = append(dimensions, &cloudwatch.Dimension{
			Name:  aws.String("FunctionName"),
			Value: aws.String(string(ops.component.Resources["function"].ID)),
		})
		namespace = "AWS/Lambda"
	case pulumiEndpointType:
		contract.Failf("not yet implemented")
	case pulumiTopicType:
		contract.Failf("not yet implemented")
	case pulumiTimerType:
		contract.Failf("not yet implemented")
	case pulumiTableType:
		contract.Failf("not yet implemented")
	default:
		contract.Failf("invalid component type")
	}

	resp, err := ops.awsConnection.metricSvc.GetMetricStatistics(&cloudwatch.GetMetricStatisticsInput{
		Namespace:  aws.String(namespace),
		MetricName: aws.String(metric.Name),
		Dimensions: dimensions,
		Statistics: []*string{
			aws.String("Sum"), aws.String("SampleCount"), aws.String("Average"),
			aws.String("Maximum"), aws.String("Minimum"),
		},
	})
	if err != nil {
		return nil, err
	}

	var metrics []component.MetricDataPoint
	for _, datapoint := range resp.Datapoints {
		metrics = append(metrics, component.MetricDataPoint{
			Timestamp:   aws.TimeValue(datapoint.Timestamp),
			Unit:        aws.StringValue(datapoint.Unit),
			Sum:         aws.Float64Value(datapoint.Sum),
			SampleCount: aws.Float64Value(datapoint.SampleCount),
			Average:     aws.Float64Value(datapoint.Average),
			Maximum:     aws.Float64Value(datapoint.Maximum),
			Minimum:     aws.Float64Value(datapoint.Minimum),
		})
	}
	return metrics, nil
}

type typeid struct {
	Type tokens.Type
	ID   resource.ID
}

func makeIDLookup(source []*resource.State) map[typeid]*resource.State {
	ret := make(map[typeid]*resource.State)
	for _, state := range source {
		tid := typeid{Type: state.Type, ID: state.ID}
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
