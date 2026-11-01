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

func StreamPodLogs(
	ctx context.Context,
	cs kubernetes.Interface,
	namespace, podName, container string,
	tailLines int64,
	previous bool,
	pc *connection.PodConnection,
) error {
	// V2 Multi-container merging: if container is "_all_" or comma-separated, stream all containers concurrently
	if container == "_all_" || strings.Contains(container, ",") {
		var containersToStream []string

		if container == "_all_" {
			pod, err := cs.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
			if err != nil {
				pc.SetState(connection.StateFailed)
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
			pc.SetState(connection.StateFailed)
			return fmt.Errorf("no containers found to stream for pod %s/%s", namespace, podName)
		}

		if len(containersToStream) == 1 {
			return streamSingleContainerLogs(ctx, cs, namespace, podName, containersToStream[0], tailLines, previous, pc, nil)
		}

		// Multi-container concurrent streaming
		pc.SetState(connection.StateRunning)
		var sequence uint64 = 0
		var wg sync.WaitGroup

		for _, cName := range containersToStream {
			wg.Add(1)
			go func(c string) {
				defer wg.Done()
				_ = streamSingleContainerLogs(ctx, cs, namespace, podName, c, tailLines, previous, pc, &sequence)
			}(cName)
		}

		wg.Wait()
		return nil
	}

	return streamSingleContainerLogs(ctx, cs, namespace, podName, container, tailLines, previous, pc, nil)
}

func streamSingleContainerLogs(
	ctx context.Context,
	cs kubernetes.Interface,
	namespace, podName, container string,
	tailLines int64,
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

