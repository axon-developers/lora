package connection

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestLogRingBuffer_OrderAndBounds(t *testing.T) {
	buf := NewLogRingBuffer(5, 1024)

	for i := 1; i <= 8; i++ {
		buf.Push(LogEntry{
			Sequence:  uint64(i),
			Timestamp: time.Now(),
			Message:   fmt.Sprintf("line %d", i),
		})
	}

	snapshot := buf.Snapshot()
	if len(snapshot) != 5 {
		t.Fatalf("expected 5 entries in snapshot, got %d", len(snapshot))
	}

	// Should contain lines 4, 5, 6, 7, 8
	expectedFirstSeq := uint64(4)
	if snapshot[0].Sequence != expectedFirstSeq {
		t.Errorf("expected first snapshot sequence to be %d, got %d", expectedFirstSeq, snapshot[0].Sequence)
	}

	expectedLastSeq := uint64(8)
	if snapshot[4].Sequence != expectedLastSeq {
		t.Errorf("expected last snapshot sequence to be %d, got %d", expectedLastSeq, snapshot[4].Sequence)
	}

	_, _, overwrites := buf.Stats()
	if overwrites != 3 {
		t.Errorf("expected 3 overwrites, got %d", overwrites)
	}
}

func TestLogRingBuffer_ConcurrentAccess(t *testing.T) {
	buf := NewLogRingBuffer(100, 1024*1024)
	var wg sync.WaitGroup

	// 10 concurrent writers
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				buf.Push(LogEntry{
					Sequence:  uint64(workerID*100 + j),
					Timestamp: time.Now(),
					Message:   fmt.Sprintf("worker %d message %d", workerID, j),
				})
			}
		}(i)
	}

	// 5 concurrent snapshot readers
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				_ = buf.Snapshot()
				time.Sleep(time.Millisecond)
			}
		}()
	}

	wg.Wait()
	count, _, _ := buf.Stats()
	if count != 100 {
		t.Errorf("expected buffer to be full at 100 entries, got %d", count)
	}
}

