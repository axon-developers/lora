# LORA — Complete Technical Implementation Plan & Progress Tracker

> **Document Status:** Master Implementation Blueprint (Locked)  
> **Target Audience:** Developers, DevOps Engineers, and Autonomous AI Coding Agents  
> **Primary Rule for AI Agents:** Every task is broken down with file targets, types, APIs, and verification steps. Do not alter data contracts or remove safety buffers without explicit permission.

---

## Table of Contents
1. [System Overview & Architecture Decisions](#1-system-overview--architecture-decisions)
2. [Complete Technology Stack & Dependencies](#2-complete-technology-stack--dependencies)
3. [Configuration Schema & Environment Setup](#3-configuration-schema--environment-setup)
4. [Master Progress Tracker (Phase-by-Phase Checklist)](#4-master-progress-tracker-phase-by-phase-checklist)
5. [Detailed REST API Specifications](#5-detailed-rest-api-specifications)
6. [WebSocket Protocol Specification](#6-websocket-protocol-specification)
7. [Core Backend Components & Data Structures](#7-core-backend-components--data-structures)
8. [Kconnect & Kubeconfig Authentication Lifecycle](#8-kconnect--kubeconfig-authentication-lifecycle)
9. [Frontend Component & State Architecture](#9-frontend-component--state-architecture)
10. [Step-by-Step AI Agent Execution Guide](#10-step-by-step-ai-agent-execution-guide)
11. [Verification, Edge Cases & Acceptance Criteria](#11-verification-edge-cases--acceptance-criteria)

---

## 1. System Overview & Architecture Decisions

### 1.1 Core Mission
LORA is a self-hosted Kubernetes log streaming tool designed to provide engineers with immediate, low-latency log inspection directly from Amazon EKS clusters without being subjected to sampling or ingest limits imposed by external SaaS platforms.

### 1.2 Two-Stage Phased Roadmap
* **Version 1 (V1 - Base MVP):** Local Windows/Linux execution, multiple EKS clusters connected via user-supplied `kubeconfig` files (generated via `kconnect`), shared K8s streaming fan-out, virtualized React log viewer, independent tabs, search/pause/export, and in-memory connection monitoring.
* **Version 2 (V2 - Platform Release):** Multi-container merge, dynamic pod groups with K8s watch, Azure AD (Entra ID) OIDC SSO, admin permission workflow, log redaction patterns, pod events panel, and on-demand S3 export.

### 1.3 Core Invariant (The Fan-Out Principle)
```text
  1 Target Pod/Container Stream (Kubernetes API via client-go)
                            │
                            ▼
          1 Shared Backend Connection (PodConnection)
         ┌──────────────────┴──────────────────┐
         ▼                                     ▼
Subscriber Queue A (User 1 - Tab 1)   Subscriber Queue B (User 2 - Tab 3)
         │                                     │
         ▼ (WebSocket)                         ▼ (WebSocket)
    Browser Tab 1                         Browser Tab 2
  [Filter: ERROR only]                 [Filter: No filter]
```
* **Never** open multiple Kubernetes API log streams for the same target pod, container, and configuration.
* **Never** block the shared stream reader if a single subscriber is slow or paused.
* **Key Pods by Pod UID**, never pod name alone, to prevent pod recreation race conditions.

---

## 2. Complete Technology Stack & Dependencies

### 2.1 Backend (Go 1.22+)
* **Runtime:** Standard Go toolchain (Windows amd64 / Linux amd64)
* **HTTP Router:** `github.com/go-chi/chi/v5` (v5.0.12+) — lightweight, standard `net/http` compatible.
* **WebSocket:** `nhooyr.io/websocket` (v1.8.11+) — context-aware, native cancellation, zero goroutine leaks.
* **Kubernetes Client:** `k8s.io/client-go` (v0.30.0+) and `k8s.io/apimachinery` — native API interactions.
* **Deduplication:** `golang.org/x/sync/singleflight` — race-free connection initialization.
* **Database (Settings & Metadata):** `modernc.org/sqlite` (v1.29.0+) — pure Go SQLite driver (no CGO required).
* **Configuration:** `gopkg.in/yaml.v3` — strict YAML parsing.
* **Structured Logging:** Go standard library `log/slog`.
* **CORS:** `github.com/go-chi/cors`.

### 2.2 Frontend (React 18+ / TypeScript 5+)
* **Build System:** Vite (`vite` 5.x)
* **Language:** TypeScript 5.4+ with strict mode enabled
* **Virtualization:** `@tanstack/react-virtual` (v3.5.0+) — handles 50,000+ log lines with variable row heights.
* **State Management:** `zustand` (v4.5.0+) — micro-stores for viewer tabs, connection status, settings.
* **Styling:** `tailwindcss` (v3.4.0+), `clsx`, `tailwind-merge`
* **Icons:** `lucide-react`
* **Date Utilities:** `date-fns` (v3.6.0+)
* **UI Component Primitives:** Radix UI primitives via Shadcn UI patterns (dialog, dropdown, tooltip, tabs).

---

## 3. Configuration Schema & Environment Setup

### 3.1 File Location
Default configuration path: `./configs/lora-config.yaml` (overridable via `LORA_CONFIG_PATH` env var).

### 3.2 Canonical `lora-config.yaml`
```yaml
server:
  host: "0.0.0.0"
  port: 8080
  cors_origins:
    - "http://localhost:5173"
    - "http://127.0.0.1:5173"

database:
  path: "./data/lora.db"

clusters:
  - id: "dev"
    name: "Development Cluster"
    environment: "development"
    kubeconfig:
      path: "C:/Users/siva1/.kube/dev-config"
      context: "" # Empty means use default context
    health_check_interval: "30s"
    enabled: true

  - id: "staging"
    name: "Staging Cluster"
    environment: "staging"
    kubeconfig:
      path: "C:/Users/siva1/.kube/staging-config"
      context: ""
    health_check_interval: "30s"
    enabled: true

  - id: "prod"
    name: "Production Cluster"
    environment: "production"
    kubeconfig:
      path: "C:/Users/siva1/.kube/prod-config"
      context: ""
    health_check_interval: "60s"
    enabled: true

streaming:
  default_tail_lines: 500
  ring_buffer_max_entries: 1000
  ring_buffer_max_bytes: 2097152 # 2 MB per stream
  total_memory_budget: 209715200 # 200 MB global buffer limit
  subscriber_queue_size: 500
  max_streams_per_user: 5
  max_subscribers_per_stream: 50

websocket:
  batch_interval_ms: 200
  max_message_size: 262144 # 256 KB
  heartbeat_interval_s: 30

viewer:
  max_tabs_soft_limit: 10
  max_tabs_hard_limit: 20
  pause_queue_max_entries: 5000
  pause_queue_max_bytes: 5242880 # 5 MB
  client_max_log_lines: 50000

display:
  default_theme: "dark"
  default_timestamp_format: "local_absolute"
```

---

## 4. Master Progress Tracker (Phase-by-Phase Checklist)

Any autonomous agent or developer working on this project must check off tasks in this list as they are completed.

### Phase 1: Project Scaffolding & Configuration
- [ ] Initialize Go module (`go mod init lora`)
- [ ] Configure directory structure (`cmd/lora`, `internal/...`, `frontend/...`, `configs/...`, `data/`)
- [ ] Implement `internal/config/config.go` (YAML parsing, validation, path normalization)
- [ ] Implement `internal/logging/logger.go` with structured `log/slog` output
- [ ] Implement `internal/database/db.go` with pure-Go SQLite initialization, WAL mode, migrations
- [ ] Create `internal/database/migrations/001_initial.sql` for `app_settings`
- [ ] Implement basic HTTP server in `cmd/lora/main.go` with Chi router, CORS, and health endpoints (`/healthz`, `/readyz`)
- [ ] Verify Go compilation and local health check response on Windows

### Phase 2: Kubeconfig Loading & Cluster Client Manager
- [ ] Implement `internal/cluster/kubeconfig.go` (safe path resolution, validation of kubeconfig on Windows)
- [ ] Implement `internal/cluster/client.go` (wrapping `client-go/kubernetes`, `clientcmd.BuildConfigFromFlags`)
- [ ] Implement `internal/cluster/health.go` (background periodic ping `discoveryClient.ServerVersion()`)
- [ ] Implement `internal/cluster/manager.go` (lifecycle, cluster map, thread-safe reload)
- [ ] Implement `POST /api/v1/clusters/{id}/reconnect` to reload updated kubeconfigs on the fly
- [ ] Unit tests for multi-cluster configuration and safe reloading

### Phase 3: Kubernetes Resource Discovery API
- [ ] Implement `internal/kubernetes/namespaces.go` (list namespaces with context timeout)
- [ ] Implement `internal/kubernetes/pods.go` (list pods, extract status, phase, restart counts, age, Pod UID)
- [ ] Implement `internal/kubernetes/containers.go` (list regular, init, and previous container states)
- [ ] Implement REST handlers in `internal/api/handlers/`:
  - [ ] `GET /api/v1/clusters`
  - [ ] `GET /api/v1/clusters/{id}/namespaces`
  - [ ] `GET /api/v1/clusters/{id}/namespaces/{ns}/pods`
  - [ ] `GET /api/v1/clusters/{id}/namespaces/{ns}/pods/{pod}/containers`
- [ ] Handle Kubernetes 401 Unauthorized errors and map to `CLUSTER_AUTH_EXPIRED` structured error

### Phase 4: Single-Pod Log Streaming (WebSocket)
- [ ] Implement `internal/kubernetes/logs.go` using `corev1.PodLogOptions` (`Follow: true`, `TailLines: 500`, `Timestamps: true`)
- [ ] Support `Previous: true` container logs
- [ ] Implement `internal/streaming/protocol.go` (JSON payloads for WS messages)
- [ ] Implement `internal/streaming/websocket.go` (`nhooyr.io/websocket` upgrader, read/write loops, ping/pong heartbeat)
- [ ] Create basic direct streaming pipeline from pod reader to WebSocket client
- [ ] Test end-to-end streaming against a live pod using a CLI test client or Postman

### Phase 5: Shared Connection Manager & Fan-Out Engine
- [ ] Implement `internal/connection/key.go` with normalized stream key generation:
  `Key = fmt.Sprintf("%s:%s:%s:%s:prev=%t", clusterID, ns, podUID, container, previous)`
- [ ] Implement `internal/connection/buffer.go` (circular ring buffer capped by 1,000 entries and 2MB)
- [ ] Implement `internal/connection/subscriber.go` (subscriber representation, bounded channel `chan LogEntry`, drop detection)
- [ ] Implement `internal/connection/broadcaster.go` (fan-out loop with non-blocking sends and drop counter)
- [ ] Implement `internal/connection/manager.go` using `singleflight.Group` to prevent duplicate concurrent K8s requests
- [ ] Implement safe teardown: when subscribers reach 0, cancel K8s context and release resources
- [ ] Concurrency unit tests with Go race detector (`go test -race ./internal/connection/...`)

### Phase 6: Frontend Shell & Resource Explorer
- [ ] Initialize React + TypeScript project with Vite in `./frontend`
- [ ] Configure Tailwind CSS and dark/light theme provider
- [ ] Create layout: Header (cluster badge, theme toggle), Sidebar (explorer), Main Pane (viewer/admin)
- [ ] Implement `ClusterSelector.tsx` with live status indicator (🟢 Running / 🔴 Auth Expired / 🟡 Unreachable)
- [ ] Implement `NamespaceSelector.tsx` with quick filter search
- [ ] Implement `PodList.tsx` displaying:
  - Pod Name
  - Status badge (Running, CrashLoop, Pending)
  - Restart count (highlighting non-zero)
  - Age / creation timestamp
- [ ] Implement `ContainerList.tsx` with container selector and "Previous logs" toggle
- [ ] Wire up REST API client with Axios or native `fetch` in `src/lib/api.ts`

### Phase 7: Virtualized Log Viewer & Control Toolbar
- [ ] Integrate `@tanstack/react-virtual` in `LogViewer.tsx` for row virtualization
- [ ] Implement batch rendering accumulator (flushing incoming WS lines on a 100-250ms cadence)
- [ ] Implement `LogLine.tsx` with syntax highlighting (ERROR = red, WARN = yellow, INFO = blue/green)
- [ ] Implement Auto-scroll toggle:
  - If user is pinned to bottom, keep auto-scrolling
  - If user scrolls up, disable auto-scroll and render "↓ N new lines" indicator
- [ ] Implement `LogToolbar.tsx`:
  - Instant client-side text search with match counter
  - Pause / Resume toggle button
  - Clear local display buffer button
  - Copy all / selected lines
  - Export to `.log` file
- [ ] Implement Pause Local Queue: buffer up to 5,000 lines during pause; show warning if overflow occurs

### Phase 8: Multi-Tab Viewer System
- [ ] Implement Zustand `viewerStore.ts`:
  - Manage active tab array: `id`, `title`, `clusterId`, `namespace`, `podName`, `container`, `isPrevious`, `filterQuery`, `isPaused`
  - Active tab pointer
- [ ] Implement `TabBar.tsx` with tab switching, closing, and new tab creation
- [ ] Multiplex subscriptions over single WebSocket connection using `viewer_id` routing
- [ ] Enforce soft limit (10 tabs warning banner) and hard limit (max 20 tabs)

### Phase 9: Admin Screens & Operational Polish
- [ ] Implement `ConnectionMonitor.tsx` (`/admin/connections`):
  - Table of active shared K8s streams
  - Subscriber count per stream
  - Current lines/sec and bytes/sec rate
  - Dropped entries per subscriber
  - Total memory consumption estimate
- [ ] Implement `SettingsPanel.tsx` (`/admin/settings`):
  - Form editing buffer limits, default tail lines, batch windows, max tabs
  - Persist updates to SQLite database via `PUT /api/v1/admin/settings`
- [ ] Implement Token Expiry Modal & Reconnect Trigger:
  - Banner warning: "Authentication expired for cluster [name]"
  - Action button: "Reconnect" (triggers `POST /api/v1/clusters/{id}/reconnect`)
- [ ] Keyboard shortcuts: `Ctrl+F` (search), `Space` (pause), `Ctrl+End` (bottom), `Ctrl+Shift+T` (new tab), `Ctrl+W` (close tab)
- [ ] Final end-to-end integration verification

---

## 5. Detailed REST API Specifications

All endpoints prefix: `/api/v1`

### 5.1 System Health
* **`GET /healthz`**  
  * **Response `200 OK`:** `{"status": "ok"}`
* **`GET /readyz`**  
  * **Response `200 OK`:** `{"ready": true, "clusters_online": 3, "clusters_total": 3}`  
  * **Response `503 Service Unavailable`:** `{"ready": false, "reason": "No clusters available"}`

### 5.2 Clusters
* **`GET /api/v1/clusters`**
  * **Response `200 OK`:**
    ```json
    [
      {
        "id": "dev",
        "name": "Development Cluster",
        "environment": "development",
        "status": "HEALTHY",
        "last_checked": "2026-11-01T01:50:00Z",
        "error_message": null
      },
      {
        "id": "prod",
        "name": "Production Cluster",
        "environment": "production",
        "status": "AUTH_EXPIRED",
        "last_checked": "2026-11-01T01:50:00Z",
        "error_message": "Unauthorized: kconnect token expired"
      }
    ]
    ```

* **`POST /api/v1/clusters/{id}/reconnect`**
  * **Description:** Forces backend to reload the specified cluster's kubeconfig file from disk and refresh client.
  * **Response `200 OK`:**
    ```json
    {
      "success": true,
      "cluster_id": "prod",
      "status": "HEALTHY",
      "message": "Kubeconfig reloaded and connectivity verified"
    }
    ```
  * **Response `401 Unauthorized`:**
    ```json
    {
      "success": false,
      "cluster_id": "prod",
      "status": "AUTH_EXPIRED",
      "error": "Token is still invalid or expired. Please re-run kconnect."
    }
    ```

### 5.3 Namespaces
* **`GET /api/v1/clusters/{id}/namespaces`**
  * **Response `200 OK`:**
    ```json
    {
      "cluster_id": "dev",
      "namespaces": ["default", "kube-system", "payments", "auth-service", "frontend"]
    }
    ```

### 5.4 Pods
* **`GET /api/v1/clusters/{id}/namespaces/{ns}/pods`**
  * **Response `200 OK`:**
    ```json
    {
      "cluster_id": "dev",
      "namespace": "payments",
      "pods": [
        {
          "name": "payment-api-79b8c6f669-x1y2z",
          "uid": "c3d4e5f6-789a-bcde-f012-3456789abcde",
          "phase": "Running",
          "ready": true,
          "restart_count": 0,
          "created_at": "2026-10-30T10:15:00Z",
          "containers": ["payment-server", "envoy-proxy"]
        },
        {
          "name": "worker-queue-5f6d7c8b9a-9z8y7",
          "uid": "12345678-abcd-ef01-2345-6789abcdef01",
          "phase": "CrashLoopBackOff",
          "ready": false,
          "restart_count": 14,
          "created_at": "2026-10-31T22:00:00Z",
          "containers": ["worker"]
        }
      ]
    }
    ```

### 5.5 Containers
* **`GET /api/v1/clusters/{id}/namespaces/{ns}/pods/{pod}/containers`**
  * **Response `200 OK`:**
    ```json
    {
      "pod_name": "payment-api-79b8c6f669-x1y2z",
      "containers": [
        {
          "name": "payment-server",
          "state": "running",
          "restarts": 0,
          "has_previous": false
        },
        {
          "name": "envoy-proxy",
          "state": "running",
          "restarts": 1,
          "has_previous": true
        }
      ]
    }
    ```

### 5.6 Admin Connection Monitor
* **`GET /api/v1/admin/connections`**
  * **Response `200 OK`:**
    ```json
    {
      "total_active_streams": 2,
      "total_subscribers": 3,
      "memory_usage_bytes": 4512000,
      "streams": [
        {
          "key": "prod:payments:c3d4e5f6...:payment-server:prev=false",
          "cluster_id": "prod",
          "namespace": "payments",
          "pod_name": "payment-api-79b8c6f669-x1y2z",
          "container": "payment-server",
          "subscribers_count": 2,
          "lines_per_second": 45.2,
          "bytes_per_second": 18240,
          "buffer_entries": 1000,
          "state": "RUNNING",
          "created_at": "2026-11-01T01:30:00Z"
        }
      ]
    }
    ```

### 5.7 Admin Settings
* **`GET /api/v1/admin/settings`** & **`PUT /api/v1/admin/settings`**
  * Request/Response JSON mirrors the `streaming`, `websocket`, `viewer`, and `display` configuration fields.

---

## 6. WebSocket Protocol Specification

* **Endpoint:** `ws://<host>:8080/ws/v1/logs`
* **Transport:** JSON-encoded UTF-8 text frames.

### 6.1 Client -> Server Messages

#### Subscribe to Pod Container Stream
```json
{
  "type": "subscribe",
  "request_id": "req-101",
  "viewer_id": "tab-uuid-1234",
  "cluster_id": "dev",
  "namespace": "payments",
  "pod_name": "payment-api-79b8c6f669-x1y2z",
  "container": "payment-server",
  "previous": false,
  "tail_lines": 500,
  "timestamps": true
}
```

#### Unsubscribe
```json
{
  "type": "unsubscribe",
  "request_id": "req-102",
  "viewer_id": "tab-uuid-1234"
}
```

#### Client Ping
```json
{
  "type": "ping",
  "timestamp": 1730425800000
}
```

### 6.2 Server -> Client Messages

#### Subscription Acknowledged
```json
{
  "type": "subscription.created",
  "request_id": "req-101",
  "viewer_id": "tab-uuid-1234",
  "pod_uid": "c3d4e5f6-789a-bcde-f012-3456789abcde",
  "status": "RUNNING",
  "replay_count": 350
}
```

#### Batched Log Entries
```json
{
  "type": "logs",
  "viewer_id": "tab-uuid-1234",
  "entries": [
    {
      "seq": 1001,
      "timestamp": "2026-11-01T01:52:10.124Z",
      "pod_name": "payment-api-79b8c6f669-x1y2z",
      "container": "payment-server",
      "message": "INFO [com.pay.Service] Transaction approved: id=tx-9921",
      "stream": "stdout"
    },
    {
      "seq": 1002,
      "timestamp": "2026-11-01T01:52:10.125Z",
      "pod_name": "payment-api-79b8c6f669-x1y2z",
      "container": "payment-server",
      "message": "ERROR [com.pay.Webhook] Webhook endpoint timeout to merchant=m-44",
      "stream": "stderr"
    }
  ]
}
```

#### Subscription Error / Failure
```json
{
  "type": "subscription.error",
  "viewer_id": "tab-uuid-1234",
  "code": "POD_NOT_FOUND",
  "message": "Pod payment-api-79b8c6f669-x1y2z has terminated"
}
```

#### Buffer Gap / Truncation Warning
```json
{
  "type": "logs.gap",
  "viewer_id": "tab-uuid-1234",
  "dropped_entries": 420,
  "reason": "Client queue overflow while paused or slow consumer"
}
```

#### Server Pong / Heartbeat
```json
{
  "type": "pong",
  "timestamp": 1730425800000
}
```

---

## 7. Core Backend Components & Data Structures

### 7.1 Stream Key Normalization (`internal/connection/key.go`)
```go
package connection

import (
	"fmt"
)

type StreamKeyParams struct {
	ClusterID string
	Namespace string
	PodUID    string
	Container string
	Previous  bool
}

func GenerateStreamKey(p StreamKeyParams) string {
	return fmt.Sprintf("%s:%s:%s:%s:prev=%t", p.ClusterID, p.Namespace, p.PodUID, p.Container, p.Previous)
}
```

### 7.2 Log Ring Buffer (`internal/connection/buffer.go`)
```go
package connection

import (
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
	return &LogRingBuffer{
		entries:    make([]LogEntry, maxEntries),
		maxEntries: maxEntries,
		maxBytes:   maxBytes,
	}
}

func (b *LogRingBuffer) Push(entry LogEntry) {
	b.mu.Lock()
	defer b.mu.Unlock()

	entryBytes := len(entry.Message) + 64 // Approximate overhead
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
```

### 7.3 Shared Pod Connection (`internal/connection/connection.go`)
```go
package connection

import (
	"context"
	"sync"
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
	ViewerID  string
	Queue     chan LogEntry
	Dropped   uint64
	IsPaused  bool
	CloseOnce sync.Once
}

type PodConnection struct {
	Key         string
	ClusterID   string
	Namespace   string
	PodName     string
	PodUID      string
	Container   string
	Previous    bool

	mu          sync.RWMutex
	subscribers map[string]*Subscriber
	buffer      *LogRingBuffer
	state       ConnectionState

	cancelFunc  context.CancelFunc
	createdAt   time.Time
}
```

---

## 8. Kconnect & Kubeconfig Authentication Lifecycle

```text
       [ User runs kconnect in terminal ]
                       │
                       ▼
         ~/.kube/dev-config is updated
                       │
    ┌──────────────────┴──────────────────┐
    │                                     │
    ▼ (API returns 401 Unauthorized)      ▼ (User clicks Reconnect in UI)
Cluster status becomes AUTH_EXPIRED   POST /api/v1/clusters/dev/reconnect
    │                                     │
    ▼                                     ▼
UI displays red banner:              Backend reads ~/.kube/dev-config
"Token expired. Re-run kconnect"     Verifies discoveryClient.ServerVersion()
                                          │
                                          ▼
                                     Status -> HEALTHY
                                     Resumes active streams automatically!
```

---

## 9. Frontend Component & State Architecture

### 9.1 Zustand Store: `viewerStore.ts`
```typescript
export interface ViewerTab {
  id: string;
  clusterId: string;
  namespace: string;
  podName: string;
  container: string;
  isPrevious: boolean;
  filterText: string;
  isPaused: boolean;
  autoScroll: boolean;
  unreadCount: number;
  logs: LogEntry[];
  droppedCount: number;
}

interface ViewerState {
  tabs: ViewerTab[];
  activeTabId: string | null;
  addTab: (tab: Omit<ViewerTab, 'id' | 'logs' | 'unreadCount' | 'droppedCount'>) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  appendLogs: (tabId: string, entries: LogEntry[]) => void;
  setPaused: (tabId: string, paused: boolean) => void;
  setAutoScroll: (tabId: string, enabled: boolean) => void;
  setFilter: (tabId: string, text: string) => void;
  clearLogs: (tabId: string) => void;
}
```

### 9.2 Virtualized Rendering Strategy
* Use `@tanstack/react-virtual`'s `useVirtualizer`.
* Render fixed or estimated height rows (`24px`).
* Only `~40` DOM nodes mounted at any time regardless of 50,000 log entries in memory.
* Highlighting:
  * Regular expressions for `(ERROR|FATAL|Exception)` -> Red foreground
  * `(WARN|WARNING)` -> Yellow foreground
  * `(INFO)` -> Green / Blue foreground
  * `(DEBUG|TRACE)` -> Gray foreground

---

## 10. Step-by-Step AI Agent Execution Guide

When prompted to build LORA, an autonomous coding agent must proceed in this exact sequence:

1. **Step 1: Check environment & tools**
   * Run `go version` and `node -v` to ensure prerequisites are satisfied.
   * Run `git status` to ensure clean baseline.

2. **Step 2: Generate directory structure**
   * Create all folders outlined in Section 2.

3. **Step 3: Implement Configuration & Logging**
   * Build `internal/config/config.go` with YAML unmarshaling and validation.
   * Write sample `configs/lora-config.yaml`.
   * Create `internal/logging/logger.go` using `slog.New(slog.NewTextHandler(...))`.

4. **Step 4: Implement Cluster Manager**
   * Code `internal/cluster/kubeconfig.go` and `internal/cluster/client.go`.
   * Ensure `clientcmd.NewNonInteractiveDeferredLoadingClientConfig` is used properly so Windows paths work seamlessly.

5. **Step 5: Build Discovery APIs**
   * Implement handlers in `internal/api/handlers/` for clusters, namespaces, pods, and containers.
   * Connect routes in `internal/api/router.go`.
   * Test with `curl` or PowerShell `Invoke-RestMethod`.

6. **Step 6: Build Shared Connection Manager**
   * Implement `key.go`, `buffer.go`, `subscriber.go`, and `manager.go`.
   * Implement log reading using `client.CoreV1().Pods(ns).GetLogs(...)`.
   * Hook up `singleflight.Group` around connection creation.

7. **Step 7: Build WebSocket Layer**
   * Implement `internal/streaming/websocket.go` with `nhooyr.io/websocket`.
   * Implement batch dispatcher collecting entries in a ticker (200ms) before sending frames.

8. **Step 8: Scaffold React App**
   * Run `npm create vite@latest frontend -- --template react-ts`.
   * Install Tailwind CSS, Lucide React, `@tanstack/react-virtual`, `zustand`.

9. **Step 9: Implement Frontend Components**
   * Explorer sidebar -> Tab manager -> Virtualized viewer -> Settings & Monitor panels.

10. **Step 10: Verify End-to-End**
    * Launch backend (`go run ./cmd/lora`).
    * Launch frontend (`npm run dev`).
    * Select cluster -> namespace -> pod -> verify live log output.

---

## 11. Verification, Edge Cases & Acceptance Criteria

### 11.1 Critical Edge Cases to Validate
1. **Pod Recreation:** Delete a running pod with `kubectl delete pod <name>`. Kubernetes recreates it with a new UID. The old connection must close, and subsequent subscribe requests must resolve the new UID without hanging.
2. **Expired Kconnect Token:** Simulate an expired token by passing an invalid token in kubeconfig. Backend must transition cluster to `AUTH_EXPIRED`, emit `subscription.error` with code `CLUSTER_AUTH_EXPIRED`, and successfully recover when `POST /reconnect` is issued.
3. **Paused Viewer Queue Overflow:** Pause a viewer while high-throughput logs arrive (1,000 lines/sec). Ensure the local paused queue stops buffering at 5,000 entries and issues a visible drop warning banner without crashing the browser.
4. **Slow Consumer:** If one browser tab is bogged down, other subscribers to the same pod must continue receiving logs in real-time without delay.

### 11.2 Acceptance Criteria Checklist
- [ ] Backend runs on Windows without requiring CGO or external C libraries.
- [ ] Discovery API lists all clusters, namespaces, pods, and containers accurately.
- [ ] Exactly **one** K8s log stream is opened even when 2+ browser tabs view the same pod.
- [ ] Disconnecting one user leaves the other user's stream unaffected.
- [ ] Closing all viewers for a pod closes the underlying Kubernetes stream within 2 seconds.
- [ ] Virtualized UI renders 50,000 lines smoothly at 60 FPS without DOM slowdown.
- [ ] Dark and light themes switch cleanly without unstyled content flashes.
