# LORA Production Operations & Deployment Guide

This guide covers production deployment patterns, configuration options, security best practices, and operational runbooks for **LORA (Lightweight Observability & Real-time Analyzer)**.

---

## 1. Deployment Topologies

LORA supports four production deployment models:
1. **Kubernetes In-Cluster Deployment** (Recommended for cloud-native teams)
2. **Containerized Deployment** (Docker / Podman / Docker Compose)
3. **Linux Systemd Service** (VMs, EC2 instances, or Bastion hosts)
4. **Standalone Portable Binary** (Zero-dependency binary for dev/ops engineers)

---

### Option A: Kubernetes In-Cluster Deployment (Recommended)

When deployed inside a Kubernetes cluster, LORA automatically discovers the cluster using the in-cluster service account credentials (`/var/run/secrets/kubernetes.io/serviceaccount`).

Apply the production manifest located at `k8s/production-deployment.yaml`:

```bash
kubectl apply -f k8s/production-deployment.yaml
```

#### What gets created:
- **Namespace:** `lora-system`
- **ServiceAccount:** `lora-sa`
- **ClusterRole:** `lora-cluster-reader` (read-only access to `pods`, `pods/log`, `namespaces`)
- **ClusterRoleBinding:** `lora-cluster-reader-binding`
- **ConfigMap:** `lora-config`
- **Deployment:** `lora` (1 replica with health probes, non-root security context, read-only root filesystem, memory/CPU limits)
- **Service:** `lora-service` (Port 8080)
- **Ingress:** `lora-ingress` (Configured with WebSocket upgrade headers)

---

### Option B: Docker / Podman Deployment

Run directly via container:

```bash
# Using Docker
docker run -d \
  --name lora \
  -p 8080:8080 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/configs:/app/configs \
  -v ~/.kube:/root/.kube:ro \
  lora:latest

# Or using docker-compose
docker compose up -d
```

#### Using Podman (Rootless):
```bash
podman run -d \
  --name lora \
  -p 8080:8080 \
  -v ./data:/app/data:Z \
  -v ./configs:/app/configs:Z \
  -v $HOME/.kube:/root/.kube:Z,ro \
  lora:latest
```

---

### Option C: Linux Systemd Service (EC2 / Bare Metal)

1. Copy the compiled Linux binary to `/opt/lora/`:
   ```bash
   sudo mkdir -p /opt/lora/{bin,configs,data}
   sudo cp bin/lora-linux-amd64 /opt/lora/bin/lora
   sudo cp configs/lora-config.yaml /opt/lora/configs/lora-config.yaml
   sudo useradd -r -s /bin/false lora
   sudo chown -R lora:lora /opt/lora
   ```

2. Install the systemd unit file:
   ```bash
   sudo cp lora.service /etc/systemd/system/lora.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now lora
   sudo systemctl status lora
   ```

---

## 2. Configuration Reference (`lora-config.yaml`)

Configuration is loaded from `./configs/lora-config.yaml` or via the `--config <path>` command-line flag. Environment variables (prefixed with `LORA_`) can override any key.

```yaml
# ==========================================
# Server Configuration
# ==========================================
server:
  host: "0.0.0.0"                 # Listen IP (0.0.0.0 for public/ingress)
  port: 8080                      # Listen port
  cors_origins:                   # Allowed CORS origins
    - "http://localhost:5173"
    - "https://lora.company.internal"

# ==========================================
# SQLite Metadata Database
# ==========================================
database:
  path: "./data/lora.db"           # SQLite DB file path (uses WAL mode)

# ==========================================
# Registered Kubernetes Clusters
# ==========================================
clusters:
  - id: "prod-eks"
    name: "Production AWS EKS"
    environment: "production"     # "production", "staging", "development"
    regions:                      # Dual-region support
      - "us-east-1"
      - "us-east-2"
    managed_kubeconfig: true
    kubeconfig:
      path: "/root/.kube/config"  # Path to kubeconfig (or leave empty for in-cluster)
      context: "prod-eks-us-east-1"
    kconnect:
      enabled: false              # Set true if using kconnect
      command: "kconnect"
      args: ["use", "eks", "--cluster", "prod-eks-cluster"]
      auto_refresh: true
    health_check_interval: "30s"
    enabled: true

# ==========================================
# Streaming & Memory Management
# ==========================================
streaming:
  default_tail_lines: 500         # Lines fetched on initial tab open
  ring_buffer_max_entries: 5000   # Max lines retained in memory per stream
  ring_buffer_max_bytes: 5242880  # Max 5MB per stream buffer
  total_memory_budget: 209715200  # Max total streaming memory (200MB)
  subscriber_queue_size: 500      # Backpressure queue size per subscriber
  max_streams_per_user: 10        # Max concurrent streams per user
  max_subscribers_per_stream: 50  # Max users sharing same upstream stream

# ==========================================
# WebSocket Engine
# ==========================================
websocket:
  batch_interval_ms: 200          # Batch interval to minimize UI re-renders
  max_message_size: 262144        # Max frame size (256 KB)
  heartbeat_interval_s: 30        # WS ping/pong interval

# ==========================================
# Log Redaction & Security Masking
# ==========================================
redaction:
  enabled: true                   # Enable masking before logs reach clients
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
    - id: "ssn"
      name: "Social Security Number"
      pattern: '\b\d{3}-\d{2}-\d{4}\b'
      mask: "[REDACTED_SSN]"
      enabled: true
```

---

## 3. Reverse Proxy Configuration

When hosting LORA behind an enterprise reverse proxy (Nginx, Caddy, Traefik, or AWS ALB), **WebSocket upgrade headers must be explicitly configured**.

### Nginx Configuration
```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name lora.yourcompany.internal;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name lora.yourcompany.internal;

    ssl_certificate /etc/ssl/certs/lora.crt;
    ssl_certificate_key /etc/ssl/private/lora.key;

    # Standard API and Web assets
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        
        # WebSocket support (Crucial for streaming logs)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable proxy buffering for low-latency streaming
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### Caddyfile
```caddy
lora.yourcompany.internal {
    reverse_proxy 127.0.0.1:8080 {
        # Caddy automatically handles WebSocket upgrade headers
        flush_interval -1
    }
}
```

---

## 4. Dual-Region Setup (e.g. AWS EKS us-east-1 & us-east-2)

If your architecture uses identical cluster names across AWS regions:

1. In your local or server `~/.kube/config`, ensure contexts exist for both regions:
   ```bash
   aws eks update-kubeconfig --region us-east-1 --name prod-cluster --alias prod-cluster-us-east-1
   aws eks update-kubeconfig --region us-east-2 --name prod-cluster --alias prod-cluster-us-east-2
   ```

2. Configure `lora-config.yaml`:
   ```yaml
   clusters:
     - id: "prod-cluster"
       name: "Production Cluster (Dual-Region)"
       regions:
         - "us-east-1"
         - "us-east-2"
       kubeconfig:
         path: "/home/ubuntu/.kube/config"
         context: "prod-cluster-us-east-1"
   ```

3. In the LORA UI:
   - Click the region selector dropdown next to the cluster title (or press `Ctrl + K` and search for `us-east-1` or `us-east-2`).
   - LORA dynamically switches API context without dropping other active tabs or requiring a daemon restart.

---

## 5. Monitoring & Health Checks

LORA provides lightweight endpoints for container orchestrators and load balancers:

| Endpoint | Method | Purpose | Response |
| :--- | :--- | :--- | :--- |
| `/api/health` | `GET` | Liveness & Readiness check | `200 OK` (`{"status":"healthy","uptime":...}`) |
| `/api/clusters` | `GET` | Cluster connectivity check | `200 OK` (List of active clusters and ping status) |

### Kubernetes Health Probe Spec:
```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 15
readinessProbe:
  httpGet:
    path: /api/health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
```

---

## 6. Operational Troubleshooting Runbook

### Issue: "WebSocket disconnected / Reconnecting in 3s"
- **Cause:** Upstream reverse proxy closed the connection due to an idle timeout, or the WebSocket `Upgrade` header was stripped.
- **Resolution:**
  1. Ensure `proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection $connection_upgrade;` are active in Nginx.
  2. Increase `proxy_read_timeout` to at least `3600s` or `86400s`.
  3. Ensure LORA server's `websocket.heartbeat_interval_s` is enabled (default `30s`).

### Issue: "Pods listed, but stream displays no logs"
- **Cause:** The selected container may be quiet, or the pod restarted and old logs rotated.
- **Resolution:**
  1. Check if the pod has multiple containers (e.g., sidecars like `istio-proxy`, `vault-agent`). Click the container dropdown to choose the primary application container.
  2. Use the **Time Filter** dropdown on the toolbar to request logs from the last 15m, 1h, or all history.

### Issue: High Memory Consumption Under Load
- **Cause:** Too many simultaneous high-velocity streams exceeding default limits.
- **Resolution:**
  - Adjust `streaming.total_memory_budget` and `streaming.ring_buffer_max_entries` in `lora-config.yaml`.
  - LORA automatically uses FIFO drop policies when buffers reach capacity to prevent process OOM.

