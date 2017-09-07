package pulumiframework

import (
	"regexp"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/cloudwatchlogs"
	"github.com/golang/glog"
)

type awsConnection struct {
	sess   *session.Session
	logSvc *cloudwatchlogs.CloudWatchLogs
}

func newAWSConnection(sess *session.Session) *awsConnection {
	return &awsConnection{
		sess:   sess,
		logSvc: cloudwatchlogs.New(sess),
	}
}

var logRegexp = regexp.MustCompile(".*Z\t[a-g0-9\\-]*\t(.*)")

func (p *awsConnection) getLogsForFunctionsConcurrently(functions map[string]Function) []LogEntry {
	var logs []LogEntry
	ch := make(chan []LogEntry)
	for _, fn := range functions {
		go func(fn Function) {
			f := fn.(*function)
			ch <- p.getLogsForFunction(f)
		}(fn)
	}
	for i := 0; i < len(functions); i++ {
		logs = append(logs, <-ch...)
	}
	return logs
}

func (p *awsConnection) getLogsForFunction(fn *function) []LogEntry {
	logGroupName := "/aws/lambda/" + fn.id
	resp, err := p.logSvc.DescribeLogStreams(&cloudwatchlogs.DescribeLogStreamsInput{
		LogGroupName: aws.String(logGroupName),
	})
	if err != nil {
		glog.V(5).Infof("[getLogs] Error getting logs: %v %v\n", logGroupName, err)
	}
	glog.V(5).Infof("[getLogs] Log streams: %v\n", resp)
	logResult := p.getLogsForFunctionNameStreamsConcurrently(fn.id, resp.LogStreams)
	return logResult
}

func (p *awsConnection) getLogsForFunctionNameStreamsConcurrently(functionName string,
	logStreams []*cloudwatchlogs.LogStream) []LogEntry {
	var logs []LogEntry
	ch := make(chan []LogEntry)
	for _, logStream := range logStreams {
		go func(logStreamName *string) {
			ch <- p.getLogsForFunctionNameStream(functionName, logStreamName)
		}(logStream.LogStreamName)
	}
	for i := 0; i < len(logStreams); i++ {
		logs = append(logs, <-ch...)
	}
	return logs
}

func (p *awsConnection) getLogsForFunctionNameStream(functionName string, logStreamName *string) []LogEntry {
	var logResult []LogEntry
	logGroupName := "/aws/lambda/" + functionName
	logsResp, err := p.logSvc.GetLogEvents(&cloudwatchlogs.GetLogEventsInput{
		LogGroupName:  aws.String(logGroupName),
		LogStreamName: logStreamName,
		StartFromHead: aws.Bool(true),
	})
	if err != nil {
		glog.V(5).Infof("[getLogs] Error getting logs: %v %v\n", logStreamName, err)
	}
	glog.V(5).Infof("[getLogs] Log events: %v\n", logsResp)
	for _, event := range logsResp.Events {
		innerMatches := logRegexp.FindAllStringSubmatch(aws.StringValue(event.Message), -1)
		glog.V(5).Infof("[getLogs] Inner matches: %v\n", innerMatches)
		if len(innerMatches) > 0 {
			logResult = append(logResult, LogEntry{
				ID:        functionName,
				Message:   innerMatches[0][1],
				Timestamp: aws.Int64Value(event.Timestamp),
			})
		}
	}
	return logResult
}
