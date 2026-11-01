package connection

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"k8s.io/client-go/kubernetes"
)

func TestConnectionManager_FanOutAndCleanup(t *testing.T) {
	mgr := NewManager(100, 1024*1024, 50, 100)

	var streamStarted uint64
	var streamStopped uint64

	mgr.SetStreamFunc(func(ctx context.Context, cs kubernetes.Interface, ns, pod, container string, tail int64, sinceSeconds int64, prev bool, pc *PodConnection) error {
		atomic.AddUint64(&streamStarted, 1)
		ticker := time.NewTicker(10 * time.Millisecond)
		defer ticker.Stop()

		var seq uint64 = 0
		for {
			select {
			case <-ctx.Done():
				atomic.AddUint64(&streamStopped, 1)
				return ctx.Err()
			case <-ticker.C:
				s := atomic.AddUint64(&seq, 1)
				pc.Broadcast(LogEntry{
					Sequence:  s,
					Timestamp: time.Now(),
					PodName:   pod,
					Container: container,
					Message:   fmt.Sprintf("log line %d", s),
				})
			}
		}
	})

	ctx := context.Background()

	// Subscriber A connects
	subA, _, streamKeyA, err := mgr.Subscribe(ctx, nil, "test-cluster", "default", "pod-1", "uid-101", "main", false, 100, 900, "viewer-A")
	if err != nil {
		t.Fatalf("subA failed: %v", err)
	}

	// Subscriber B connects to the same pod/container/UID
	subB, _, streamKeyB, err := mgr.Subscribe(ctx, nil, "test-cluster", "default", "pod-1", "uid-101", "main", false, 100, 900, "viewer-B")
	if err != nil {
		t.Fatalf("subB failed: %v", err)
	}

	if streamKeyA != streamKeyB {
		t.Errorf("expected stream keys to match: %s != %s", streamKeyA, streamKeyB)
	}

	// Wait for a few messages
	time.Sleep(50 * time.Millisecond)

	// Verify only 1 stream was opened
	if atomic.LoadUint64(&streamStarted) != 1 {
		t.Errorf("expected exactly 1 K8s stream opened, got %d", atomic.LoadUint64(&streamStarted))
	}

	// Verify both subscribers received messages
	var countA, countB int
	drainA := true
	for drainA {
		select {
		case <-subA.Queue:
			countA++
		default:
			drainA = false
		}
	}

	drainB := true
	for drainB {
		select {
		case <-subB.Queue:
			countB++
		default:
			drainB = false
		}
	}

	if countA == 0 || countB == 0 {
		t.Errorf("expected both subscribers to receive logs, got countA=%d, countB=%d", countA, countB)
	}

	// Unsubscribe A: B should continue, stream should NOT stop
	mgr.Unsubscribe(streamKeyA, "viewer-A")
	time.Sleep(30 * time.Millisecond)

	if atomic.LoadUint64(&streamStopped) != 0 {
		t.Errorf("stream should still be active when subscriber B remains")
	}

	// Unsubscribe B: final subscriber leaves, stream should cancel and stop
	mgr.Unsubscribe(streamKeyB, "viewer-B")
	time.Sleep(30 * time.Millisecond)

	if atomic.LoadUint64(&streamStopped) != 1 {
		t.Errorf("expected stream to be stopped after all subscribers disconnect")
	}

	// Active streams count should be 0
	streams, subs, _ := mgr.GetStats()
	if streams != 0 || subs != 0 {
		t.Errorf("expected 0 active streams and 0 subs in registry, got streams=%d, subs=%d", streams, subs)
	}
}
