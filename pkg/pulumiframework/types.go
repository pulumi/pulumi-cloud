package pulumiframework

// PulumiResources represents the resources in a running Pulumi Framework application
type PulumiResources interface {
	Endpoints() map[string]Endpoint
	Timers() map[string]Timer
	Tables() map[string]Table
	Topics() map[string]Topic

	GetLogs() []LogEntry
}

// Endpoint is an internet visible HTTP endpoint exposed from a Pulumi application
type Endpoint interface {
	URL() string
}

// Timer is a scheduled task that will execute within a Pulumi application
type Timer interface {
	Schedule() string
}

// Table is a document store available within a Pulumi application
type Table interface {
	PrimaryKey() string
	PrimaryKeyType() string
}

// Topic is a pub-sub topic for distributing work within a Pulumi application
type Topic interface {
}

// Function represents a component of compute that can run in response to cloud events
type Function interface {
	GetLogs() []LogEntry
}

// LogEntry is a row in the logs for a running compute service
type LogEntry struct {
	ID        string
	Timestamp int64
	Message   string
}
