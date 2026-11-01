package connection

import (
	"fmt"
)

type StreamKeyParams struct {
	ClusterID    string
	Namespace    string
	PodUID       string
	Container    string
	Previous     bool
	SinceSeconds int64
}

func GenerateStreamKey(p StreamKeyParams) string {
	return fmt.Sprintf("%s:%s:%s:%s:prev=%t:since=%d", p.ClusterID, p.Namespace, p.PodUID, p.Container, p.Previous, p.SinceSeconds)
}
