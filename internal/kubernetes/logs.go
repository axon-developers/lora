package kubernetes

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"strings"
	"sync"
	"sync/atomic"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"lora/internal/connection"
)

// StreamPodLogs streams logs for one or multiple pods (comma-separated podName) and containers.
func StreamPodLogs(
	ctx context.Context,
	cs kubernetes.Interface,
	namespace, podName, container string,
	tailLines int64,
	sinceSeconds int64,
	previous bool,
	pc *connection.PodConnection,
) error {
	// Multi-pod streaming support: if podName is comma-separated, stream each pod concurrently into pc
	if strings.Contains(podName, ",") {
		rawPods := strings.Split(podName, ",")
		var podsToStream []string
		for _, p := range rawPods {
			p = strings.TrimSpace(p)
			if p != "" {
				podsToStream = append(podsToStream, p)
			}
		}

		if len(podsToStream) == 0 {
			pc.SetState(connection.StateFailed)
			return fmt.Errorf("no valid pod names provided: %s", podName)
		}

		if len(podsToStream) == 1 {
			return streamSinglePod(ctx, cs, namespace, podsToStream[0], container, tailLines, sinceSeconds, previous, pc, nil)
		}

		// Multi-pod concurrent streaming with shared sequence counter
		pc.SetState(connection.StateRunning)
		var sequence uint64 = 0
		var wg sync.WaitGroup

		for _, p := range podsToStream {
			wg.Add(1)
			go func(currentPod string) {
				defer wg.Done()
				_ = streamSinglePod(ctx, cs, namespace, currentPod, container, tailLines, sinceSeconds, previous, pc, &sequence)
			}(p)
		}

		wg.Wait()
		return nil
	}

	return streamSinglePod(ctx, cs, namespace, podName, container, tailLines, sinceSeconds, previous, pc, nil)
}

func streamSinglePod(
	ctx context.Context,
	cs kubernetes.Interface,
	namespace, podName, container string,
	tailLines int64,
	sinceSeconds int64,
	previous bool,
	pc *connection.PodConnection,
	sharedSeq *uint64,
) error {
	// If container is "_all_" or comma-separated, stream all containers concurrently
	if container == "_all_" || strings.Contains(container, ",") {
		var containersToStream []string

		if container == "_all_" {
			pod, err := cs.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
			if err != nil {
				if sharedSeq == nil {
					pc.SetState(connection.StateFailed)
				}
				return fmt.Errorf("failed to get pod for multi-container streaming: %w", err)
			}
			for _, c := range pod.Spec.Containers {
				containersToStream = append(containersToStream, c.Name)
			}
		} else {
			parts := strings.Split(container, ",")
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if p != "" {
					containersToStream = append(containersToStream, p)
				}
			}
		}

		if len(containersToStream) == 0 {
			if sharedSeq == nil {
				pc.SetState(connection.StateFailed)
			}
			return fmt.Errorf("no containers found to stream for pod %s/%s", namespace, podName)
		}

		if len(containersToStream) == 1 {
			return streamSingleContainerLogs(ctx, cs, namespace, podName, containersToStream[0], tailLines, sinceSeconds, previous, pc, sharedSeq)
		}

		var seqPtr = sharedSeq
		if seqPtr == nil {
			var localSeq uint64 = 0
			seqPtr = &localSeq
			pc.SetState(connection.StateRunning)
		}

		var wg sync.WaitGroup
		for _, cName := range containersToStream {
			wg.Add(1)
			go func(c string) {
				defer wg.Done()
				_ = streamSingleContainerLogs(ctx, cs, namespace, podName, c, tailLines, sinceSeconds, previous, pc, seqPtr)
			}(cName)
		}

		wg.Wait()
		return nil
	}

	return streamSingleContainerLogs(ctx, cs, namespace, podName, container, tailLines, sinceSeconds, previous, pc, sharedSeq)
}

func streamSingleContainerLogs(
	ctx context.Context,
	cs kubernetes.Interface,
	namespace, podName, container string,
	tailLines int64,
	sinceSeconds int64,
	previous bool,
	pc *connection.PodConnection,
	sharedSeq *uint64,
) error {
	opts := &corev1.PodLogOptions{
		Container:  container,
		Follow:     true,
		Timestamps: true,
		Previous:   previous,
	}

	if tailLines > 0 {
		opts.TailLines = &tailLines
	}
	if sinceSeconds > 0 {
		opts.SinceSeconds = &sinceSeconds
	}

	req := cs.CoreV1().Pods(namespace).GetLogs(podName, opts)
	stream, err := req.Stream(ctx)
	if err != nil {
		if sharedSeq == nil {
			pc.SetState(connection.StateFailed)
		}
		return fmt.Errorf("failed to open log stream for pod %s/%s container %s: %w", namespace, podName, container, err)
	}
	defer stream.Close()

	if sharedSeq == nil {
		pc.SetState(connection.StateRunning)
	}

	reader := bufio.NewReaderSize(stream, 64*1024)
	var localSeq uint64 = 0

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			line, err := reader.ReadString('\n')
			if len(line) > 0 {
				var seq uint64
				if sharedSeq != nil {
					seq = atomic.AddUint64(sharedSeq, 1)
				} else {
					seq = atomic.AddUint64(&localSeq, 1)
				}

				// Trim trailing newline
				if len(line) > 0 && line[len(line)-1] == '\n' {
					line = line[:len(line)-1]
				}
				if len(line) > 0 && line[len(line)-1] == '\r' {
					line = line[:len(line)-1]
				}

				entry := connection.ParseKubernetesLogLine(line, podName, container, seq)
				pc.Broadcast(entry)
			}

			if err != nil {
				if err == io.EOF {
					return nil
				}
				return err
			}
		}
	}
}
