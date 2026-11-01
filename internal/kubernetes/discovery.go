package kubernetes

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

type PodItem struct {
	Name         string    `json:"name"`
	UID          string    `json:"uid"`
	Namespace    string    `json:"namespace"`
	Phase        string    `json:"phase"`
	Ready        bool      `json:"ready"`
	RestartCount int32     `json:"restart_count"`
	CreatedAt    time.Time `json:"created_at"`
	Containers   []string  `json:"containers"`
}

type ContainerItem struct {
	Name        string `json:"name"`
	State       string `json:"state"`
	Restarts    int32  `json:"restarts"`
	HasPrevious bool   `json:"has_previous"`
	IsInit      bool   `json:"is_init"`
}

func ListNamespaces(ctx context.Context, cs kubernetes.Interface) ([]string, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	nsList, err := cs.CoreV1().Namespaces().List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list namespaces: %w", err)
	}

	result := make([]string, 0, len(nsList.Items))
	for _, item := range nsList.Items {
		result = append(result, item.Name)
	}
	return result, nil
}

func ListPods(ctx context.Context, cs kubernetes.Interface, namespace string) ([]PodItem, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	podList, err := cs.CoreV1().Pods(namespace).List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list pods in namespace %s: %w", namespace, err)
	}

	result := make([]PodItem, 0, len(podList.Items))
	for _, p := range podList.Items {
		var totalRestarts int32 = 0
		allReady := true
		containerNames := make([]string, 0, len(p.Spec.Containers))

		for _, c := range p.Spec.Containers {
			containerNames = append(containerNames, c.Name)
		}

		for _, status := range p.Status.ContainerStatuses {
			totalRestarts += status.RestartCount
			if !status.Ready {
				allReady = false
			}
		}

		// If no containers or pod is completed
		if len(p.Status.ContainerStatuses) == 0 {
			allReady = false
		}

		phase := string(p.Status.Phase)
		// Check for specific crash states
		for _, status := range p.Status.ContainerStatuses {
			if status.State.Waiting != nil && status.State.Waiting.Reason != "" {
				phase = status.State.Waiting.Reason
				break
			}
		}

		result = append(result, PodItem{
			Name:         p.Name,
			UID:          string(p.UID),
			Namespace:    p.Namespace,
			Phase:        phase,
			Ready:        allReady,
			RestartCount: totalRestarts,
			CreatedAt:    p.CreationTimestamp.Time,
			Containers:   containerNames,
		})
	}

	return result, nil
}

func ListContainers(ctx context.Context, cs kubernetes.Interface, namespace, podName string) ([]ContainerItem, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	pod, err := cs.CoreV1().Pods(namespace).Get(timeoutCtx, podName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get pod %s in namespace %s: %w", podName, namespace, err)
	}

	statusMap := make(map[string]corev1.ContainerStatus)
	for _, s := range pod.Status.ContainerStatuses {
		statusMap[s.Name] = s
	}

	initStatusMap := make(map[string]corev1.ContainerStatus)
	for _, s := range pod.Status.InitContainerStatuses {
		initStatusMap[s.Name] = s
	}

	result := make([]ContainerItem, 0, len(pod.Spec.Containers)+len(pod.Spec.InitContainers))

	// Regular containers
	for _, c := range pod.Spec.Containers {
		s, exists := statusMap[c.Name]
		state := "unknown"
		var restarts int32 = 0
		hasPrev := false

		if exists {
			restarts = s.RestartCount
			if s.State.Running != nil {
				state = "running"
			} else if s.State.Waiting != nil {
				state = fmt.Sprintf("waiting (%s)", s.State.Waiting.Reason)
			} else if s.State.Terminated != nil {
				state = fmt.Sprintf("terminated (%s)", s.State.Terminated.Reason)
			}

			if s.LastTerminationState.Terminated != nil {
				hasPrev = true
			}
		}

		result = append(result, ContainerItem{
			Name:        c.Name,
			State:       state,
			Restarts:    restarts,
			HasPrevious: hasPrev,
			IsInit:      false,
		})
	}

	// Init containers
	for _, c := range pod.Spec.InitContainers {
		s, exists := initStatusMap[c.Name]
		state := "unknown"
		var restarts int32 = 0
		hasPrev := false

		if exists {
			restarts = s.RestartCount
			if s.State.Running != nil {
				state = "running"
			} else if s.State.Waiting != nil {
				state = fmt.Sprintf("waiting (%s)", s.State.Waiting.Reason)
			} else if s.State.Terminated != nil {
				state = fmt.Sprintf("terminated (%s)", s.State.Terminated.Reason)
			}

			if s.LastTerminationState.Terminated != nil {
				hasPrev = true
			}
		}

		result = append(result, ContainerItem{
			Name:        c.Name,
			State:       state,
			Restarts:    restarts,
			HasPrevious: hasPrev,
			IsInit:      true,
		})
	}

	return result, nil
}

