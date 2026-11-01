package connection

import (
	"fmt"
)

type StreamKeyParams struct {
	ClusterID string
	Namespace string
	PodUID    string
	Container string
	Previous  bool
}

func GenerateStreamKey(p StreamKeyParams) string {
	return fmt.Sprintf("%s:%s:%s:%s:prev=%t", p.ClusterID, p.Namespace, p.PodUID, p.Container, p.Previous)
}

