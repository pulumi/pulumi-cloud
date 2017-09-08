package component

import (
	"github.com/pulumi/pulumi-fabric/pkg/resource"
	"github.com/pulumi/pulumi-fabric/pkg/tokens"
)

// Components is a map of URN to resource
type Components map[resource.URN]*Component

// Component is a serializable vitrual node in a resource graph, specifically for resource snapshots.
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

// OperationsProvider is the interface for making operational requests about the
// state of a Component or Resource
type OperationsProvider interface {
	GetLogs(component *Component) *[]LogEntry
	// QueryLogs(component *Component, query *LogQuery) []LogEntry
	// GetMetricStatistics(component *Component, metric MetricRequest) []MetricData
	// ListMetrics(component *Component) []string
}
