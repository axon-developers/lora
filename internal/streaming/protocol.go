package streaming

import "lora/internal/connection"

// Client-to-server message types
const (
	MsgTypeSubscribe   = "subscribe"
	MsgTypeUnsubscribe = "unsubscribe"
	MsgTypePing        = "ping"
)

// Server-to-client message types
const (
	MsgTypeSubscriptionCreated = "subscription.created"
	MsgTypeLogs                = "logs"
	MsgTypeSubscriptionError   = "subscription.error"
	MsgTypeLogsGap             = "logs.gap"
	MsgTypePong                = "pong"
)

type ClientMessage struct {
	Type       string `json:"type"`
	RequestID  string `json:"request_id,omitempty"`
	ViewerID   string `json:"viewer_id,omitempty"`
	ClusterID  string `json:"cluster_id,omitempty"`
	Namespace  string `json:"namespace,omitempty"`
	PodName    string `json:"pod_name,omitempty"`
	Container  string `json:"container,omitempty"`
	Previous   bool   `json:"previous,omitempty"`
	TailLines  int64  `json:"tail_lines,omitempty"`
	Timestamps bool   `json:"timestamps,omitempty"`
	Timestamp  int64  `json:"timestamp,omitempty"`
}

type ServerMessage struct {
	Type           string                `json:"type"`
	RequestID      string                `json:"request_id,omitempty"`
	ViewerID       string                `json:"viewer_id,omitempty"`
	PodUID         string                `json:"pod_uid,omitempty"`
	Status         string                `json:"status,omitempty"`
	ReplayCount    int                   `json:"replay_count,omitempty"`
	Entries        []connection.LogEntry `json:"entries,omitempty"`
	Code           string                `json:"code,omitempty"`
	Message        string                `json:"message,omitempty"`
	DroppedEntries uint64                `json:"dropped_entries,omitempty"`
	Reason         string                `json:"reason,omitempty"`
	Timestamp      int64                 `json:"timestamp,omitempty"`
}

