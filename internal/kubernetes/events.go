package kubernetes

import (
	"context"
	"fmt"
	"sort"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

type PodEvent struct {
	Type            string    `json:"type"`             // "Normal", "Warning"
	Reason          string    `json:"reason"`           // "Failed", "OOMKilled", "BackOff", etc.
	Message         string    `json:"message"`          // Detailed event message
	Count           int32     `json:"count"`            // Occurrence count
	FirstTimestamp  time.Time `json:"first_timestamp"`
	LastTimestamp   time.Time `json:"last_timestamp"`
	SourceComponent string    `json:"source_component"` // e.g. "kubelet"
}

// ListPodEvents retrieves Kubernetes events associated with a specific pod in a namespace.
func ListPodEvents(ctx context.Context, client kubernetes.Interface, namespace, podName string) ([]PodEvent, error) {
	if client == nil {
		return nil, fmt.Errorf("kubernetes client is not initialized")
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// Field selector for events whose involved object is this pod
	opts := metav1.ListOptions{
		FieldSelector: fmt.Sprintf("involvedObject.name=%s,involvedObject.kind=Pod", podName),
	}

	eventList, err := client.CoreV1().Events(namespace).List(timeoutCtx, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to list pod events for %s/%s: %w", namespace, podName, err)
	}

	events := make([]PodEvent, 0, len(eventList.Items))
	for _, item := range eventList.Items {
		firstTime := item.FirstTimestamp.Time
		if firstTime.IsZero() && !item.EventTime.IsZero() {
			firstTime = item.EventTime.Time
		}

		lastTime := item.LastTimestamp.Time
		if lastTime.IsZero() {
			lastTime = firstTime
		}

		count := item.Count
		if count == 0 {
			count = 1
		}

		events = append(events, PodEvent{
			Type:            item.Type,
			Reason:          item.Reason,
			Message:         item.Message,
			Count:           count,
			FirstTimestamp:  firstTime,
			LastTimestamp:   lastTime,
			SourceComponent: item.Source.Component,
		})
	}

	// Sort events descending by LastTimestamp (most recent first)
	sort.Slice(events, func(i, j int) bool {
		return events[i].LastTimestamp.After(events[j].LastTimestamp)
	})

	return events, nil
}

