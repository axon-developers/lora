package connection

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
	"k8s.io/client-go/kubernetes"
)

type ConnectionInfo struct {
	Key              string    `json:"key"`
	ClusterID        string    `json:"cluster_id"`
	Namespace        string    `json:"namespace"`
	PodName          string    `json:"pod_name"`
	Container        string    `json:"container"`
	SubscribersCount int       `json:"subscribers_count"`
	LinesPerSecond   float64   `json:"lines_per_second"`
	BytesPerSecond   int64     `json:"bytes_per_second"`
	BufferEntries    int       `json:"buffer_entries"`
	State            string    `json:"state"`
	CreatedAt        time.Time `json:"created_at"`
}

type Manager struct {
	mu          sync.RWMutex
	connections map[string]*PodConnection
	flight      singleflight.Group

	maxEntries  int
	maxBytes    int
	queueSize   int
	defaultTail int64

	streamFunc func(ctx context.Context, cs kubernetes.Interface, ns, pod, container string, tail int64, prev bool, pc *PodConnection) error
}

func NewManager(maxEntries, maxBytes, queueSize int, defaultTail int64) *Manager {
	if maxEntries <= 0 {
		maxEntries = 1000
	}
	if maxBytes <= 0 {
		maxBytes = 2 * 1024 * 1024
	}
	if queueSize <= 0 {
		queueSize = 500
	}
	if defaultTail <= 0 {
		defaultTail = 500
	}

	return &Manager{
		connections: make(map[string]*PodConnection),
		maxEntries:  maxEntries,
		maxBytes:    maxBytes,
		queueSize:   queueSize,
		defaultTail: defaultTail,
	}
}

func (m *Manager) SetStreamFunc(fn func(ctx context.Context, cs kubernetes.Interface, ns, pod, container string, tail int64, prev bool, pc *PodConnection) error) {
	m.streamFunc = fn
}

func (m *Manager) Subscribe(
	ctx context.Context,
	cs kubernetes.Interface,
	clusterID, ns, podName, podUID, container string,
	previous bool,
	viewerID string,
) (*Subscriber, []LogEntry, string, error) {
	key := GenerateStreamKey(StreamKeyParams{
		ClusterID: clusterID,
		Namespace: ns,
		PodUID:    podUID,
		Container: container,
		Previous:  previous,
	})

	m.mu.RLock()
	pc, exists := m.connections[key]
	m.mu.RUnlock()

	if !exists {
		// Use singleflight to prevent duplicate stream creation for identical stream key
		val, err, _ := m.flight.Do(key, func() (interface{}, error) {
			m.mu.RLock()
			existingPC, alreadyCreated := m.connections[key]
			m.mu.RUnlock()
			if alreadyCreated {
				return existingPC, nil
			}

			streamCtx, cancelFn := context.WithCancel(context.Background())
			newPC := NewPodConnection(key, clusterID, ns, podName, podUID, container, previous, m.maxEntries, m.maxBytes, cancelFn)

			m.mu.Lock()
			m.connections[key] = newPC
			m.mu.Unlock()

			// Launch background K8s stream consumer
			go func() {
				slog.Info("starting Kubernetes log stream", "key", key, "pod", podName, "container", container)
				if m.streamFunc != nil {
					err := m.streamFunc(streamCtx, cs, ns, podName, container, m.defaultTail, previous, newPC)
					if err != nil && err != context.Canceled {
						slog.Error("kubernetes log stream encountered error", "key", key, "error", err)
						newPC.SetState(StateFailed)
					}
				}
				slog.Info("kubernetes log stream terminated", "key", key)
			}()

			return newPC, nil
		})

		if err != nil {
			return nil, nil, "", err
		}
		pc = val.(*PodConnection)
	}

	subID := fmt.Sprintf("%s:%s", viewerID, time.Now().Format(time.RFC3339Nano))
	sub := NewSubscriber(subID, viewerID, m.queueSize)

	// Fetch recent history replay before attaching live stream
	snapshot := pc.Buffer.Snapshot()
	pc.AddSubscriber(sub)

	slog.Info("subscriber attached to shared connection", "key", key, "viewer_id", viewerID, "active_subs", pc.SubscriberCount())
	return sub, snapshot, key, nil
}

func (m *Manager) Unsubscribe(key, viewerID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	pc, exists := m.connections[key]
	if !exists {
		return
	}

	// Remove all subscribers matching this viewerID
	pc.mu.Lock()
	var toRemove []string
	for id, s := range pc.Subscribers {
		if s.ViewerID == viewerID {
			toRemove = append(toRemove, id)
		}
	}
	for _, id := range toRemove {
		if s, ok := pc.Subscribers[id]; ok {
			s.Close()
			delete(pc.Subscribers, id)
		}
	}
	remaining := len(pc.Subscribers)
	pc.mu.Unlock()

	slog.Info("subscriber removed from shared connection", "key", key, "viewer_id", viewerID, "remaining", remaining)

	// Invariant: If no subscribers remain, cancel stream and release memory
	if remaining == 0 {
		slog.Info("no subscribers left on stream, closing connection", "key", key)
		pc.Stop()
		delete(m.connections, key)
	}
}

func (m *Manager) GetStats() (totalStreams, totalSubs int, list []ConnectionInfo) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	list = make([]ConnectionInfo, 0, len(m.connections))
	for key, pc := range m.connections {
		pc.mu.RLock()
		subCount := len(pc.Subscribers)
		bufCount, _, _ := pc.Buffer.Stats()
		state := string(pc.State)
		clusterID := pc.ClusterID
		ns := pc.Namespace
		podName := pc.PodName
		container := pc.Container
		createdAt := pc.CreatedAt
		pc.mu.RUnlock()

		totalStreams++
		totalSubs += subCount

		list = append(list, ConnectionInfo{
			Key:              key,
			ClusterID:        clusterID,
			Namespace:        ns,
			PodName:          podName,
			Container:        container,
			SubscribersCount: subCount,
			LinesPerSecond:   0.0,
			BytesPerSecond:   0,
			BufferEntries:    bufCount,
			State:            state,
			CreatedAt:        createdAt,
		})
	}

	return totalStreams, totalSubs, list
}

