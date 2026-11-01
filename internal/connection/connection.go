package connection

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
)

type ConnectionState string

const (
	StateStarting     ConnectionState = "STARTING"
	StateRunning      ConnectionState = "RUNNING"
	StateReconnecting ConnectionState = "RECONNECTING"
	StateStopping     ConnectionState = "STOPPING"
	StateStopped      ConnectionState = "STOPPED"
	StateFailed       ConnectionState = "FAILED"
)

type Subscriber struct {
	ID        string
	ViewerID  string
	Queue     chan LogEntry
	Dropped   uint64
	IsPaused  bool
	closeOnce sync.Once
	closed    bool
	mu        sync.Mutex
}

func NewSubscriber(id, viewerID string, queueSize int) *Subscriber {
	if queueSize <= 0 {
		queueSize = 500
	}
	return &Subscriber{
		ID:       id,
		ViewerID: viewerID,
		Queue:    make(chan LogEntry, queueSize),
	}
}

func (s *Subscriber) TrySend(entry LogEntry) bool {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return false
	}
	s.mu.Unlock()

	select {
	case s.Queue <- entry:
		return true
	default:
		atomic.AddUint64(&s.Dropped, 1)
		return false
	}
}

func (s *Subscriber) Close() {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closed = true
		s.mu.Unlock()
		close(s.Queue)
	})
}

type PodConnection struct {
	mu          sync.RWMutex
	Key         string
	ClusterID   string
	Namespace   string
	PodName     string
	PodUID      string
	Container   string
	Previous    bool
	State       ConnectionState

	Subscribers map[string]*Subscriber
	Buffer      *LogRingBuffer
	CancelFunc  context.CancelFunc
	CreatedAt   time.Time

	// Rate metrics
	totalLines  uint64
	totalBytes  uint64
	linesPerSec float64
	bytesPerSec int64
}

func NewPodConnection(key, clusterID, ns, podName, podUID, container string, prev bool, maxEntries, maxBytes int, cancelFn context.CancelFunc) *PodConnection {
	return &PodConnection{
		Key:         key,
		ClusterID:   clusterID,
		Namespace:   ns,
		PodName:     podName,
		PodUID:      podUID,
		Container:   container,
		Previous:    prev,
		State:       StateStarting,
		Subscribers: make(map[string]*Subscriber),
		Buffer:      NewLogRingBuffer(maxEntries, maxBytes),
		CancelFunc:  cancelFn,
		CreatedAt:   time.Now(),
	}
}

func (pc *PodConnection) AddSubscriber(sub *Subscriber) {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	pc.Subscribers[sub.ID] = sub
}

func (pc *PodConnection) RemoveSubscriber(subID string) int {
	pc.mu.Lock()
	defer pc.mu.Unlock()

	if sub, exists := pc.Subscribers[subID]; exists {
		sub.Close()
		delete(pc.Subscribers, subID)
	}
	return len(pc.Subscribers)
}

func (pc *PodConnection) SubscriberCount() int {
	pc.mu.RLock()
	defer pc.mu.RUnlock()
	return len(pc.Subscribers)
}

func (pc *PodConnection) Broadcast(entry LogEntry) {
	pc.Buffer.Push(entry)

	atomic.AddUint64(&pc.totalLines, 1)
	atomic.AddUint64(&pc.totalBytes, uint64(len(entry.Message)))

	pc.mu.RLock()
	subs := make([]*Subscriber, 0, len(pc.Subscribers))
	for _, s := range pc.Subscribers {
		subs = append(subs, s)
	}
	pc.mu.RUnlock()

	for _, sub := range subs {
		sub.TrySend(entry)
	}
}

func (pc *PodConnection) SetState(state ConnectionState) {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	pc.State = state
}

func (pc *PodConnection) Stop() {
	pc.SetState(StateStopping)
	if pc.CancelFunc != nil {
		pc.CancelFunc()
	}

	pc.mu.Lock()
	defer pc.mu.Unlock()
	for _, s := range pc.Subscribers {
		s.Close()
	}
	pc.Subscribers = make(map[string]*Subscriber)
	pc.State = StateStopped
}

