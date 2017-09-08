package component

import (
	"github.com/pulumi/pulumi-fabric/pkg/resource"
	"github.com/pulumi/pulumi-fabric/pkg/tokens"
)

// Components is a map of URN to component
type Components map[resource.URN]*Component

// Component is a serializable vitrual node in a resource graph
type Component struct {
	Type       tokens.Type                `json:"type"`                // this components's full type token.
	Properties resource.PropertyMap       `json:"props,omitempty"`     // the properties of this component.
	Resources  map[string]*resource.State `json:"resources,omitempty"` // the resources owned by this component.
}

// LogEntry is a row in the logs for a running compute service
type LogEntry struct {
	ID        string
	Timestamp int64
	Message   string
}

// MetricName is a handle to a metric supported by a Pulumi Framework resources
type MetricName string

// OperationsProvider is the interface for making operational requests about the
// state of a Component (or Components)
type OperationsProvider interface {
	// GetLogs returns logs for the component
	GetLogs() *[]LogEntry
	// ListMetrics returns the list of supported metrics for the requested component type.
	ListMetrics() []MetricName

	// TBD:
	// QueryLogs(component *Component, query *LogQuery) []LogEntry
	// GetMetricStatistics(component *Component, metric MetricRequest) []MetricData
}
