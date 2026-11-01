# LORA - Lightweight Observability & Real-Time Analyzer

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go)](https://golang.org)
[![React Version](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css)](https://tailwindcss.com)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-1.24+-326CE5?logo=kubernetes)](https://kubernetes.io)

**LORA** is a cloud-native, high-throughput Kubernetes log streaming and observability platform engineered for multi-cluster, dual-region enterprise environments. Packaged as a single self-contained binary embedding both its Go streaming engine and modern React 18 UI, LORA delivers sub-millisecond log visibility, live multi-pod multiplexing, DOM virtualization, and forensic debugging tools without requiring heavy log indexing backends like Elasticsearch or Loki.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Clients["Clients & Browsers"]
        UI1["User Browser A (Chrome/Firefox/Edge)"]
        UI2["User Browser B (Chrome/Firefox/Edge)"]
    end

    subgraph LORAServer["LORA Standalone Server (:8080)"]
        subgraph FrontendLayer["Embedded Frontend (React 18 + Vite)"]
            SPA["Single Page App (Tailwind CSS, Zustand, React-Virtual)"]
        end

        subgraph APILayer["HTTP & WebSocket Router (Chi Engine)"]
            HTTPAPI["REST API (/api/clusters, /api/health)"]
            WSHub["WebSocket Hub (/ws/logs, /ws/workload)"]
            Batcher["Frame Batcher (200ms Jitter/Flush)"]
        end

        subgraph CoreEngine["Streaming & Concurrency Core"]
            StreamMgr["Stream Manager (Ref-Counted Multiplexer)"]
            RingBuf["Per-Stream Memory RingBuffer (Zero-Alloc Slices)"]
            RedactEngine["Log Masking & Redaction Engine"]
            FanOut["Subscriber Fan-Out Broadcast Queues"]
        end

        subgraph StorageLayer["Persistence & Metadata"]
            SQLite["Embedded SQLite (WAL Mode, cluster metadata & settings)"]
        end
    end

    subgraph K8sInfrastructure["Kubernetes Infrastructure"]
        subgraph Region1["Region: us-east-1"]
            EKS1["Cluster A (us-east-1) API Server"]
            Pod1A["Pod: payment-svc-7dfb8-x1"]
            Pod1B["Pod: payment-svc-7dfb8-y2"]
        end

        subgraph Region2["Region: us-east-2"]
            EKS2["Cluster B (us-east-2) API Server"]
            Pod2A["Pod: order-svc-5cf99-z3"]
            Pod2B["Pod: auth-svc-2ea11-w4"]
        end
    end

    UI1 <-->|HTTP GET / Assets| HTTPAPI
    UI1 <-->|Bi-directional WebSocket| WSHub
    UI2 <-->|Bi-directional WebSocket| WSHub

    HTTPAPI --- StorageLayer
    WSHub --- StreamMgr
    StreamMgr --- RingBuf
    RingBuf --- RedactEngine
    RedactEngine --- FanOut
    FanOut --- Batcher
    Batcher --> WSHub

    StreamMgr -->|client-go Log Stream (SPDY/HTTP2)| EKS1
    StreamMgr -->|client-go Log Stream (SPDY/HTTP2)| EKS2
    EKS1 -.->|Kubelet Stream| Pod1A
    EKS1 -.->|Kubelet Stream| Pod1B
    EKS2 -.->|Kubelet Stream| Pod2A
    EKS2 -.->|Kubelet Stream| Pod2B
```

---

## Key Features

### 🚀 High-Performance Log Streaming
- **Ref-Counted Multiplexing:** Multiple users inspecting the same pod share a single upstream Kubernetes stream with zero duplicate API overhead.
- **In-Memory Ring Buffers:** Bounded, thread-safe memory buffers with configurable tail depth (`default_tail_lines: 500`) and total memory caps.
- **Zero-Lag DOM Virtualization:** Powered by `@tanstack/react-virtual`. Browsers render only visible rows (30–40 DOM elements) regardless of whether 500 or 50,000 log lines are buffered.

### 🌐 Multi-Cluster & Dual-Region Support
- **Dynamic Dual-Region Switching:** Built for AWS EKS architectures where identical clusters run across `us-east-1` and `us-east-2`. Switch regions on the fly without losing tabs or restarting.
- **Workload & Replica Aggregation:** Group and stream all pods under a Deployment (e.g. `payment-service`) in a single interleaved, color-coded stream with per-pod badges.

### 🔍 Advanced Filtering & Forensics
- **Inverse (`grep -v`) & Regex Filtering:** Type `!healthz` to filter out heartbeats, or `order|payment` for multi-keyword regex matching.
- **Severity Counters & Pills:** Instant one-click filter pills for `[All]`, `[Errors (count)]`, and `[Warns (count)]`.
- **Stack Trace Beautifier:** Automatic unfurler for Go panics, Python tracebacks, Java exceptions, and Node.js call stacks.
- **JSON Inspector:** Parses embedded JSON log lines with syntax color-coding, nested tree inspection, and 1-click **Copy as PNG Image** adhering to dark/light themes.

### ⚡ Operator Productivity
- **Command Palette (`Ctrl + K` / `Cmd + K`):** Quick-jump across clusters, regions, namespaces, pods, and actions.
- **Side-by-Side Split View:** Compare two streams or pods simultaneously with independent virtualized scroll engines.
- **Direct Deep-Link Sharing:** 1-click URL permalink generation (`#pod=...&container=...&seq=...`) that restores teammate views to the exact log line.
- **Keyword Audio & Browser Alerts:** Set alert keywords (e.g., `Panic`, `OutOfMemory`) to trigger Web Audio synthesizer chimes and HTML5 desktop notifications.
- **Multi-Format Export:** Export filtered buffers to `.log`, `.json`, or `.csv`.
- **Namespace Bookmarks:** Star ⭐ favorite namespaces for 1-click access.

---

## Quick Start

### 1. Run the Precompiled Binary

#### Linux / macOS
```bash
# Download and extract the latest release
curl -LO https://github.com/your-org/lora/releases/latest/download/lora-linux-amd64
chmod +x lora-linux-amd64

# Run with your local kubeconfig
./lora-linux-amd64 --config configs/lora-config.yaml
```

#### Windows (PowerShell)
```powershell
.\bin\lora.exe --config configs\lora-config.yaml
```

Access the web interface at **`http://localhost:8080`**.

---

### 2. Run with Docker or Podman

```bash
docker run -d \
  --name lora \
  -p 8080:8080 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/configs:/app/configs \
  -v ~/.kube:/root/.kube:ro \
  lora:latest
```

---

### 3. Deploy In-Cluster (Kubernetes)

Deploy LORA directly into your Kubernetes cluster with read-only RBAC:

```bash
kubectl apply -f k8s/production-deployment.yaml
```

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + K` / `Cmd + K` | Open Command Palette (jump clusters, regions, pods, tabs) |
| `Space` | Pause / Resume active log stream (when search input is unfocused) |
| `Ctrl + L` | Clear active log buffer |
| `Alt + W` / `Ctrl + W` | Close active viewer tab |
| `Alt + 1` ... `Alt + 9` | Switch directly to tab 1 through 9 |
| `Escape` | Close active modal, detail panel, or command palette |

---

## Configuration Reference

Edit `configs/lora-config.yaml` or set environment variables prefixed with `LORA_`:

```yaml
server:
  host: "0.0.0.0"
  port: 8080
  cors_origins:
    - "*"

database:
  path: "./data/lora.db"

clusters:
  - id: "production-aws"
    name: "Production AWS EKS"
    environment: "production"
    regions:
      - "us-east-1"
      - "us-east-2"
    kubeconfig:
      path: "/root/.kube/config"
      context: "prod-eks-us-east-1"
    health_check_interval: "30s"
    enabled: true

streaming:
  default_tail_lines: 500
  ring_buffer_max_entries: 5000
  ring_buffer_max_bytes: 5242880       # 5MB per stream
  total_memory_budget: 209715200       # 200MB total streaming memory
  subscriber_queue_size: 500
  max_streams_per_user: 10
  max_subscribers_per_stream: 50

websocket:
  batch_interval_ms: 200
  max_message_size: 262144
  heartbeat_interval_s: 30

redaction:
  enabled: true
  rules:
    - id: "aws-key"
      name: "AWS Access Key"
      pattern: 'AKIA[0-9A-Z]{16}'
      mask: "[REDACTED_AWS_KEY]"
      enabled: true
    - id: "bearer-token"
      name: "Bearer Token"
      pattern: 'Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*'
      mask: "Bearer [REDACTED_TOKEN]"
      enabled: true
```

---

## Production Deployment & Operations

For complete guides on reverse proxy configuration (Nginx / Caddy), TLS setup, dual-region contexts, systemd automation, and troubleshooting:

👉 **[Read the Full Operations Guide](docs/OPERATIONS_GUIDE.md)**  
👉 **[Read the Deep-Dive Architecture Guide](docs/ARCHITECTURE.md)**

---

## Building from Source

### Prerequisites
- **Go 1.22+**
- **Node.js 20+** and **npm**

### Build Steps

```bash
# 1. Build Frontend
cd frontend
npm ci
npm run build
cd ..

# 2. Build Backend (Bundles frontend/dist via //go:embed)
# For Host OS:
go build -o bin/lora ./cmd/lora

# For Linux (Static AMD64 binary):
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/lora-linux-amd64 ./cmd/lora
```

---

## License

LORA is licensed under the **Apache License 2.0**. See `LICENSE` for details.

