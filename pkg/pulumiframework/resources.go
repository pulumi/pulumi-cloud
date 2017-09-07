package pulumiframework

import (
	"bytes"
	"fmt"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go/aws/session"

	"github.com/pulumi/pulumi-fabric/pkg/resource"
	"github.com/pulumi/pulumi-fabric/pkg/tokens"
)

// This file contains the implementation of the PulumiResources interface for the
// AWS implementation of the Pulumi Framework defined in this repo.

type pulumiResources struct {
	awsConnection *awsConnection
	endpoints     map[string]Endpoint
	timers        map[string]Timer
	tables        map[string]Table
	topics        map[string]Topic
	functions     map[string]Function
}

var _ PulumiResources = (*pulumiResources)(nil)

func (p *pulumiResources) Endpoints() map[string]Endpoint { return p.endpoints }
func (p *pulumiResources) Timers() map[string]Timer       { return p.timers }
func (p *pulumiResources) Tables() map[string]Table       { return p.tables }
func (p *pulumiResources) Topics() map[string]Topic       { return p.topics }
func (p *pulumiResources) Functions() map[string]Function { return p.functions }

func newPulumiResources(sess *session.Session) *pulumiResources {
	return &pulumiResources{
		endpoints:     make(map[string]Endpoint),
		timers:        make(map[string]Timer),
		tables:        make(map[string]Table),
		topics:        make(map[string]Topic),
		functions:     make(map[string]Function),
		awsConnection: newAWSConnection(sess),
	}
}

func (p *pulumiResources) GetLogs() []LogEntry {
	var functionNames []string
	for _, fn := range p.functions {
		f := fn.(*function)
		functionNames = append(functionNames, f.id)
	}
	logResult := p.awsConnection.getLogsForFunctionsConcurrently(p.functions)
	sort.SliceStable(logResult, func(i, j int) bool { return logResult[i].Timestamp < logResult[j].Timestamp })
	return logResult
}

func (p *pulumiResources) String() string {
	var buffer bytes.Buffer
	buffer.WriteString(fmt.Sprintf("Functions (%d)\n", len(p.Functions())))
	for k := range p.Functions() {
		buffer.WriteString(fmt.Sprintf("\t%s\n", k))
	}
	buffer.WriteString(fmt.Sprintf("Endpoints (%d)\n", len(p.Endpoints())))
	for k, v := range p.Endpoints() {
		buffer.WriteString(fmt.Sprintf("\t%s: %s\n", k, v.URL()))
	}
	buffer.WriteString(fmt.Sprintf("Timers    (%d)\n", len(p.Timers())))
	for k, v := range p.Timers() {
		buffer.WriteString(fmt.Sprintf("\t%s: %s\n", k, v.Schedule()))
	}
	buffer.WriteString(fmt.Sprintf("Tables    (%d)\n", len(p.Tables())))
	for k := range p.Tables() {
		buffer.WriteString(fmt.Sprintf("\t%s\n", k))
	}
	buffer.WriteString(fmt.Sprintf("Topics    (%d)\n", len(p.Topics())))
	for k := range p.Topics() {
		buffer.WriteString(fmt.Sprintf("\t%s\n", k))
	}
	return buffer.String()
}

type endpoint struct {
	awsConnection *awsConnection
	url           string
}

var _ Endpoint = (*endpoint)(nil)

func (e *endpoint) URL() string { return e.url }

type timer struct {
	awsConnection *awsConnection
	arn           string
	schedule      string
}

var _ Timer = (*timer)(nil)

func (t *timer) Schedule() string { return t.schedule }

type table struct {
	awsConnection  *awsConnection
	primaryKey     string
	primaryKeyType string
}

var _ Table = (*table)(nil)

func (t *table) PrimaryKey() string     { return t.primaryKey }
func (t *table) PrimaryKeyType() string { return t.primaryKeyType }

type topic struct {
	awsConnection *awsConnection
}

var _ Topic = (*topic)(nil)

type function struct {
	awsConnection *awsConnection
	id            string
}

var _ Function = (*function)(nil)

func (f *function) GetLogs() []LogEntry {
	logResult := f.awsConnection.getLogsForFunction(f)
	sort.SliceStable(logResult, func(i, j int) bool { return logResult[i].Timestamp < logResult[j].Timestamp })
	return logResult
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
	functionType   = "aws:lambda/function:Function"
)

// GetPulumiResources translates a Lumi resources checkpoint with AWS reosources into a collection
// of Pulumi Framework abstractions.
func GetPulumiResources(source []*resource.State, sess *session.Session) PulumiResources {
	sourceMap := makeIDLookup(source)
	pulumiResources := newPulumiResources(sess)
	for _, res := range source {
		name := res.Inputs["urnName"].StringValue()
		if res.Type() == stageType {
			stage := res
			deployment := lookup(sourceMap, deploymentType, stage.Inputs["deployment"].StringValue())
			restAPI := lookup(sourceMap, restAPIType, stage.Inputs["restApi"].StringValue())
			baseURL := deployment.Outputs["invokeUrl"].StringValue() + stage.Inputs["stageName"].StringValue() + "/"
			pulumiResources.endpoints[restAPI.Inputs["urnName"].StringValue()] = &endpoint{
				awsConnection: pulumiResources.awsConnection,
				url:           baseURL,
			}
		} else if res.Type() == eventRuleType {
			pulumiResources.timers[name] = &timer{
				awsConnection: pulumiResources.awsConnection,
				schedule:      res.Inputs["scheduleExpression"].StringValue(),
			}
		} else if res.Type() == tableType {
			pulumiResources.tables[name] = &table{
				awsConnection: pulumiResources.awsConnection,
				primaryKey:    res.Outputs["hashKey"].StringValue(),
			}
		} else if res.Type() == topicType {
			pulumiResources.topics[name] = &topic{
				awsConnection: pulumiResources.awsConnection,
			}
		} else if res.Type() == functionType {
			if !strings.HasSuffix(name, "pulumi-app-log-collector") {
				pulumiResources.functions[name] = &function{
					awsConnection: pulumiResources.awsConnection,
					id:            res.Outputs["id"].StringValue(),
				}
			}
		}
	}
	return pulumiResources
}
