package streaming

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"

	"lora/internal/cluster"
	"lora/internal/connection"
)

type Hub struct {
	clusterMgr *cluster.Manager
	connMgr    *connection.Manager

	batchInterval time.Duration
	maxMsgSize    int64
	heartbeatTime time.Duration
}

func NewHub(
	clusterMgr *cluster.Manager,
	connMgr *connection.Manager,
	batchIntervalMs int,
	maxMsgSize int64,
	heartbeatSec int,
) *Hub {
	if batchIntervalMs <= 0 {
		batchIntervalMs = 200
	}
	if maxMsgSize <= 0 {
		maxMsgSize = 256 * 1024
	}
	if heartbeatSec <= 0 {
		heartbeatSec = 30
	}

	return &Hub{
		clusterMgr:    clusterMgr,
		connMgr:       connMgr,
		batchInterval: time.Duration(batchIntervalMs) * time.Millisecond,
		maxMsgSize:    maxMsgSize,
		heartbeatTime: time.Duration(heartbeatSec) * time.Second,
	}
}

type activeSub struct {
	streamKey string
	viewerID  string
	cancelFn  context.CancelFunc
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	opts := &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Internal/local dev behind proxy
	}

	wsConn, err := websocket.Accept(w, r, opts)
	if err != nil {
		slog.Error("failed to accept websocket connection", "error", err)
		return
	}
	defer wsConn.Close(websocket.StatusInternalError, "closing connection")

	wsConn.SetReadLimit(h.maxMsgSize)
	ctx := r.Context()

	var writeMu sync.Mutex
	writeJSON := func(msg ServerMessage) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		return wsjson.Write(writeCtx, wsConn, msg)
	}

	// Track all viewer subscriptions managed on this WebSocket connection
	var subsMu sync.Mutex
	subscriptions := make(map[string]activeSub)

	// Cleanup all subscriptions when WebSocket connection terminates
	defer func() {
		subsMu.Lock()
		for _, sub := range subscriptions {
			if sub.cancelFn != nil {
				sub.cancelFn()
			}
			h.connMgr.Unsubscribe(sub.streamKey, sub.viewerID)
		}
		subsMu.Unlock()
		slog.Info("websocket connection closed, cleaned up all attached subscriptions")
	}()

	// Heartbeat ticker
	go func() {
		ticker := time.NewTicker(h.heartbeatTime)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				err := writeJSON(ServerMessage{
					Type:      MsgTypePong,
					Timestamp: time.Now().UnixMilli(),
				})
				if err != nil {
					return
				}
			}
		}
	}()

	// Main message read loop
	for {
		var req ClientMessage
		err := wsjson.Read(ctx, wsConn, &req)
		if err != nil {
			if websocket.CloseStatus(err) == websocket.StatusNormalClosure ||
				websocket.CloseStatus(err) == websocket.StatusGoingAway {
				return
			}
			slog.Debug("websocket read terminated", "error", err)
			return
		}

		switch req.Type {
		case MsgTypePing:
			_ = writeJSON(ServerMessage{
				Type:      MsgTypePong,
				Timestamp: time.Now().UnixMilli(),
			})

		case MsgTypeUnsubscribe:
			subsMu.Lock()
			if sub, exists := subscriptions[req.ViewerID]; exists {
				if sub.cancelFn != nil {
					sub.cancelFn()
				}
				h.connMgr.Unsubscribe(sub.streamKey, sub.viewerID)
				delete(subscriptions, req.ViewerID)
			}
			subsMu.Unlock()

		case MsgTypeSubscribe:
			if req.ViewerID == "" || req.ClusterID == "" || req.Namespace == "" || req.PodName == "" || req.Container == "" {
				_ = writeJSON(ServerMessage{
					Type:      MsgTypeSubscriptionError,
					RequestID: req.RequestID,
					ViewerID:  req.ViewerID,
					Code:      "INVALID_PARAMS",
					Message:   "cluster_id, namespace, pod_name, container and viewer_id are required",
				})
				continue
			}

			// Clean up previous subscription for this tab if one existed
			subsMu.Lock()
			if oldSub, exists := subscriptions[req.ViewerID]; exists {
				if oldSub.cancelFn != nil {
					oldSub.cancelFn()
				}
				h.connMgr.Unsubscribe(oldSub.streamKey, oldSub.viewerID)
				delete(subscriptions, req.ViewerID)
			}
			subsMu.Unlock()

			// Resolve cluster client
			clusterClient, err := h.clusterMgr.Get(req.ClusterID)
			if err != nil {
				_ = writeJSON(ServerMessage{
					Type:      MsgTypeSubscriptionError,
					RequestID: req.RequestID,
					ViewerID:  req.ViewerID,
					Code:      "CLUSTER_NOT_FOUND",
					Message:   err.Error(),
				})
				continue
			}

			if clusterClient.Clientset == nil {
				_ = writeJSON(ServerMessage{
					Type:      MsgTypeSubscriptionError,
					RequestID: req.RequestID,
					ViewerID:  req.ViewerID,
					Code:      "CLUSTER_AUTH_EXPIRED",
					Message:   fmt.Sprintf("Cluster %s client not available. Please reconnect.", req.ClusterID),
				})
				continue
			}

			// Resolve Pod UID
			podMetaCtx, cancelPodMeta := context.WithTimeout(ctx, 10*time.Second)
			podObj, err := clusterClient.Clientset.CoreV1().Pods(req.Namespace).Get(podMetaCtx, req.PodName, metav1.GetOptions{})
			cancelPodMeta()
			if err != nil {
				_ = writeJSON(ServerMessage{
					Type:      MsgTypeSubscriptionError,
					RequestID: req.RequestID,
					ViewerID:  req.ViewerID,
					Code:      "POD_NOT_FOUND",
					Message:   fmt.Sprintf("Failed to resolve pod %s in namespace %s: %v", req.PodName, req.Namespace, err),
				})
				continue
			}

			podUID := string(podObj.UID)

			// Subscribe to shared connection
			sub, replay, streamKey, err := h.connMgr.Subscribe(
				ctx,
				clusterClient.Clientset,
				req.ClusterID,
				req.Namespace,
				req.PodName,
				podUID,
				req.Container,
				req.Previous,
				req.ViewerID,
			)

			if err != nil {
				_ = writeJSON(ServerMessage{
					Type:      MsgTypeSubscriptionError,
					RequestID: req.RequestID,
					ViewerID:  req.ViewerID,
					Code:      "STREAM_ERROR",
					Message:   err.Error(),
				})
				continue
			}

			subCtx, cancelSub := context.WithCancel(ctx)
			subsMu.Lock()
			subscriptions[req.ViewerID] = activeSub{
				streamKey: streamKey,
				viewerID:  req.ViewerID,
				cancelFn:  cancelSub,
			}
			subsMu.Unlock()

			// Acknowledge subscription
			_ = writeJSON(ServerMessage{
				Type:        MsgTypeSubscriptionCreated,
				RequestID:   req.RequestID,
				ViewerID:    req.ViewerID,
				PodUID:      podUID,
				Status:      "RUNNING",
				ReplayCount: len(replay),
			})

			// Deliver replay buffer if any exists
			if len(replay) > 0 {
				_ = writeJSON(ServerMessage{
					Type:     MsgTypeLogs,
					ViewerID: req.ViewerID,
					Entries:  replay,
				})
			}

			// Launch batched delivery goroutine for this subscriber
			go h.runSubscriberDelivery(subCtx, sub, req.ViewerID, writeJSON)
		}
	}
}

func (h *Hub) runSubscriberDelivery(
	ctx context.Context,
	sub *connection.Subscriber,
	viewerID string,
	writeFn func(ServerMessage) error,
) {
	ticker := time.NewTicker(h.batchInterval)
	defer ticker.Stop()

	var batch []connection.LogEntry
	flush := func() {
		if len(batch) == 0 {
			return
		}
		_ = writeFn(ServerMessage{
			Type:     MsgTypeLogs,
			ViewerID: viewerID,
			Entries:  batch,
		})
		batch = nil
	}

	for {
		select {
		case <-ctx.Done():
			flush()
			return

		case <-ticker.C:
			flush()

		case entry, ok := <-sub.Queue:
			if !ok {
				flush()
				return
			}
			batch = append(batch, entry)
			if len(batch) >= 100 {
				flush()
			}
		}
	}
}

