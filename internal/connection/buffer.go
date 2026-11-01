package connection

import (
	"strings"
	"sync"
	"time"
)

type LogEntry struct {
	Sequence  uint64    `json:"seq"`
	Timestamp time.Time `json:"timestamp"`
	PodName   string    `json:"pod_name"`
	Container string    `json:"container"`
	Message   string    `json:"message"`
	Stream    string    `json:"stream"`
}

type LogRingBuffer struct {
	mu         sync.RWMutex
	entries    []LogEntry
	maxEntries int
	maxBytes   int
	totalBytes int
	head       int
	isFull     bool
	overwrites uint64
}

func NewLogRingBuffer(maxEntries, maxBytes int) *LogRingBuffer {
	if maxEntries <= 0 {
		maxEntries = 1000
	}
	if maxBytes <= 0 {
		maxBytes = 2 * 1024 * 1024
	}
	return &LogRingBuffer{
		entries:    make([]LogEntry, maxEntries),
		maxEntries: maxEntries,
		maxBytes:   maxBytes,
	}
}

func (b *LogRingBuffer) Push(entry LogEntry) {
	b.mu.Lock()
	defer b.mu.Unlock()

	entryBytes := len(entry.Message) + 64 // Approximate metadata overhead
	if b.isFull {
		oldEntry := b.entries[b.head]
		b.totalBytes -= len(oldEntry.Message) + 64
		b.overwrites++
	}

	b.entries[b.head] = entry
	b.totalBytes += entryBytes
	b.head = (b.head + 1) % b.maxEntries

	if b.head == 0 {
		b.isFull = true
	}
}

func (b *LogRingBuffer) Snapshot() []LogEntry {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if !b.isFull {
		result := make([]LogEntry, b.head)
		copy(result, b.entries[:b.head])
		return result
	}

	result := make([]LogEntry, b.maxEntries)
	copy(result, b.entries[b.head:])
	copy(result[b.maxEntries-b.head:], b.entries[:b.head])
	return result
}

func (b *LogRingBuffer) Stats() (entriesCount int, bytesCount int, overwrites uint64) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	count := b.head
	if b.isFull {
		count = b.maxEntries
	}
	return count, b.totalBytes, b.overwrites
}

func ParseKubernetesLogLine(rawLine string, podName, containerName string, seq uint64) LogEntry {
	// Kubernetes logs with Timestamps: true format: "2026-11-01T01:52:10.124567890Z actual message here"
	parts := strings.SplitN(rawLine, " ", 2)
	ts := time.Now()
	msg := rawLine

	if len(parts) == 2 {
		parsedTs, err := time.Parse(time.RFC3339Nano, parts[0])
		if err == nil {
			ts = parsedTs
			msg = parts[1]
		}
	}

	return LogEntry{
		Sequence:  seq,
		Timestamp: ts,
		PodName:   podName,
		Container: containerName,
		Message:   msg,
		Stream:    "stdout",
	}
}

