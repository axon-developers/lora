# LORA --- Kubernetes Log Viewer

## Product, Architecture, Technical Design and Delivery Plan

**Document status:** Proposed implementation baseline\
**Version:** 1.0\
**Date:** 1 November 2026\
**Project name:** LORA

------------------------------------------------------------------------

# 1. Executive summary

LORA is a self-hosted, multi-cluster Kubernetes log streaming
application. It is intended to give engineers a fast way to inspect live
application logs from pods running in Amazon EKS, particularly when an
external observability platform samples or limits the logs visible to
users.

The first release will focus on live troubleshooting rather than
long-term log retention. Users will select an EKS cluster, namespace,
pod or pod group, and container, then view logs in a browser. Multiple
users can subscribe to the same compatible pod/container log stream.
LORA will create one Kubernetes log stream and distribute its messages
to independent subscribers instead of opening a separate Kubernetes
stream for every viewer.

The initial deployment will be a modular Go monolith with one backend
instance, an in-memory connection registry, a React/TypeScript frontend,
REST APIs for discovery and configuration, and WebSockets for live
delivery. The design will keep clear interfaces around cluster access,
stream management, log processing and storage so that distributed
messaging and historical storage can be introduced later without
replacing the core application.

**Important scope boundary:** Kubernetes pod logs are not a durable
historical archive. LORA's MVP will provide live streaming and a bounded
recent-log buffer. If complete historical coverage is required later, a
separate continuously running collector and durable storage pipeline
will be needed.

# 2. Problem statement

The current logging workflow relies on Datadog, but log sampling means
that only a fraction of application log events may be visible in the
interface. Engineers need a way to inspect the logs directly from
workloads running in EKS.

LORA addresses this by: - Connecting to multiple configured EKS
clusters. - Discovering namespaces, pods, containers and pod labels. -
Streaming logs through the Kubernetes API. - Sharing compatible streams
among multiple users and viewers. - Grouping pods by Kubernetes labels,
name prefix or substring. - Combining logs from multiple pods into one
viewer. - Providing search, filtering, pause, resume, auto-scroll and
export features. - Exposing operational metrics so the team can measure
stream health, delivery gaps and resource usage.

LORA should not be described as a complete Datadog replacement in its
first release. It is initially a live Kubernetes log viewer and
troubleshooting tool.

# 3. Goals and non-goals

## 3.1 MVP goals

1.  Support multiple EKS clusters, such as development, staging and
    production.
2.  List clusters, namespaces, pods and containers.
3.  Stream logs from an individual pod/container.
4.  Display logs in a browser in near real time.
5.  Share one compatible Kubernetes stream among multiple subscribers.
6.  Keep each viewer's filters, pause state and display buffer
    independent.
7.  Support multiple viewers and browser tabs.
8.  Support selecting several pods and displaying their logs together.
9.  Provide safe connection cleanup, bounded buffers and explicit
    delivery-gap reporting.
10. Apply authentication, authorization and Kubernetes least-privilege
    permissions before production use.

## 3.2 Later goals

-   Dynamic pod-group membership using Kubernetes watches.
-   Distributed backend instances.
-   Cross-instance stream ownership and message routing.
-   Persistent log storage and historical search.
-   Advanced query language, saved searches and dashboards.
-   Fine-grained audit and data-redaction policies.

## 3.3 Non-goals for the MVP

-   Durable storage of every log line.
-   Guaranteed recovery of logs missed while LORA or a pod is
    unavailable.
-   Full metrics, tracing or APM functionality.
-   Replacing Kubernetes log rotation or node-level log collection.
-   Building a general-purpose terminal emulator.
-   Introducing Kafka, NATS, Redis or OpenSearch before there is a
    demonstrated requirement.

# 4. Confirmed architecture decisions

  -----------------------------------------------------------------------
  Area                                Decision
  ----------------------------------- -----------------------------------
  Kubernetes environments             Multiple EKS clusters

  Cluster examples                    Dev, staging, production

  Kubernetes integration              Go `client-go`

  Connection sharing                  One stream per compatible
                                      pod/container/log configuration

  Subscribers                         Multiple independent subscribers
                                      per shared stream

  Processing                          Hybrid: backend selection and
                                      stream processing; frontend
                                      interactive search

  Log storage                         No persistent storage in MVP;
                                      design extension points now

  Backend deployment                  One instance initially

  Connection registry                 In-memory for MVP

  API                                 REST for discovery and management

  Live delivery                       WebSocket

  Frontend                            React + TypeScript

  Log rendering                       Virtualized structured log list

  Future distributed messaging        Evaluate NATS

  Future coordination                 Evaluate Redis only if needed

  Future historical storage           Evaluate S3 and/or OpenSearch
  -----------------------------------------------------------------------

# 5. High-level architecture

``` text
                         LORA Web UI
                    React + TypeScript
       +---------------------------------------------+
       | Cluster/namespace/pod explorer              |
       | Multiple independent viewer tabs            |
       | Search, filters, pause, resume, export       |
       | Virtualized combined log viewer              |
       +----------------------+----------------------+
                              |
                       HTTPS / WebSocket
                              |
       +----------------------v----------------------+
       |                LORA Go Backend               |
       |                                              |
       | REST API             WebSocket Manager       |
       | Authentication       Viewer/Subscription    |
       | Authorization        Lifecycle               |
       |                                              |
       |              Core streaming engine           |
       | +------------------------------------------+ |
       | | Cluster Manager                          | |
       | | Pod Connection Manager                   | |
       | | Kubernetes Log Reader                    | |
       | | Log Broadcaster                          | |
       | | Per-subscriber queues and filters         | |
       | | Bounded recent-log ring buffers           | |
       | | Pod Group / Watch Manager                 | |
       | +------------------------------------------+ |
       |                                              |
       | In-memory registry (single instance MVP)     |
       +----------------------+-----------------------+
                              |
                 Kubernetes API / client-go
               +--------------+--------------+
               |              |              |
           Dev EKS        Staging EKS     Prod EKS

       Future extension points:
       Log processor -> durable storage sink
       Backend instances -> NATS / distributed routing
       Coordination -> Redis, if required
```

The initial system is a modular monolith: one deployable backend process
with separate internal packages. Logical separation is required even
though the modules are deployed together.

# 6. Multi-cluster connectivity

## 6.1 Cluster configuration

Each cluster should have an internal stable identifier and
human-readable name. Do not place AWS secrets, bearer tokens, private
keys or kubeconfig contents in frontend configuration or source control.

Example configuration shape:

``` yaml
clusters:
  - id: dev
    name: Development
    environment: development
    region: ap-south-1
    auth:
      mode: workload_identity
      role_arn_secret_ref: lora/dev-cluster-role

  - id: staging
    name: Staging
    environment: staging
    region: ap-south-1
    auth:
      mode: workload_identity
      role_arn_secret_ref: lora/staging-cluster-role

  - id: production
    name: Production
    environment: production
    region: ap-south-1
    auth:
      mode: workload_identity
      role_arn_secret_ref: lora/production-cluster-role
```

This is an illustrative configuration contract, not a ready-to-use
credential file. The exact AWS authentication mechanism depends on where
LORA runs and how each EKS cluster is configured.

## 6.2 Cluster manager responsibilities

-   Load and validate enabled cluster configurations at startup.
-   Create and reuse Kubernetes clients per cluster.
-   Expose cluster metadata to authorized users.
-   Resolve cluster ID to the correct Kubernetes client.
-   Report health and connectivity errors.
-   Refresh short-lived credentials through the supported AWS credential
    chain.
-   Avoid creating a new Kubernetes client for every API request or pod
    stream.

## 6.3 Cross-account access

If clusters live in different AWS accounts, use narrowly scoped IAM role
assumption or an equivalent approved identity design. Each target EKS
cluster must authorize the LORA workload identity. Do not solve access
problems by granting cluster-admin.

# 6A. SQLite application database

## 6A.1 Decision and purpose

LORA will use SQLite as its initial application database. SQLite is compatible with Go and is suitable for the MVP because LORA initially runs as a single backend instance and needs a lightweight persistent store for application metadata.

SQLite will store LORA-managed data, not act as the live log transport.

**SQLite is for application state; Kubernetes is for live log data.**

Use SQLite for:
- User profile and identity-provider mapping.
- Cluster metadata and non-secret connection configuration.
- User-to-cluster and user-to-namespace permissions.
- Saved pod-group definitions and selectors.
- Saved viewer configurations and user preferences.
- Application settings and feature configuration.
- Audit events and administrative activity.
- Schema migration/version information.

Do not store AWS credentials, kubeconfig files, private keys, access tokens or other secrets as ordinary database values. Store secret references in SQLite and keep the actual secret material in an approved secret manager or workload identity system.

Do not store every live log line in SQLite in the MVP. High-volume append workloads, retention, indexing and concurrent readers/writers are a different workload from LORA's metadata database.

## 6A.2 Go integration

SQLite works with Go through database drivers. A practical starting point is:
- `database/sql` as Go's standard database abstraction.
- A maintained SQLite driver such as `modernc.org/sqlite` (pure Go) or `github.com/mattn/go-sqlite3` (uses CGO).

Choose one driver deliberately, pin its version, review its maintenance/security posture, and test it in the exact Docker build environment. The `mattn/go-sqlite3` option requires CGO and a suitable C toolchain; the pure-Go option avoids that build dependency. This is an implementation choice to confirm during the foundation phase.

Use a repository/data-access layer so application services do not issue SQL directly from HTTP handlers.

Example initialization shape:

```go
package database

import (
    "database/sql"
    _ "modernc.org/sqlite"
)

func Open(path string) (*sql.DB, error) {
    db, err := sql.Open("sqlite", path)
    if err != nil {
        return nil, err
    }

    // SQLite is a single-writer database. Keep the initial pool
    // conservative and tune after measuring actual usage.
    db.SetMaxOpenConns(1)
    db.SetMaxIdleConns(1)

    if _, err := db.Exec(`PRAGMA foreign_keys = ON`); err != nil {
        db.Close()
        return nil, err
    }
    if _, err := db.Exec(`PRAGMA journal_mode = WAL`); err != nil {
        db.Close()
        return nil, err
    }
    if _, err := db.Exec(`PRAGMA busy_timeout = 5000`); err != nil {
        db.Close()
        return nil, err
    }

    return db, nil
}
```

This is an illustrative starting point, not a complete production database package. Verify that the chosen driver applies connection-scoped PRAGMAs to every connection as intended. With a one-connection pool, connection-specific settings are easier to reason about.

## 6A.3 Initial logical data model

A proposed initial schema:

| Table | Purpose | Example fields |
|---|---|---|
| `users` | LORA user records | `id`, `subject`, `email`, `display_name`, `status`, timestamps |
| `roles` | Application role definitions | `id`, `name`, `description` |
| `user_roles` | User-to-role mapping | `user_id`, `role_id` |
| `clusters` | Configured EKS cluster metadata | `id`, `name`, `environment`, `region`, `endpoint_ref`, `auth_mode`, `enabled` |
| `cluster_permissions` | User/team access to clusters | `id`, `user_id` or `team_id`, `cluster_id`, `permission` |
| `namespace_permissions` | Optional namespace-level access | `id`, `user_id` or `team_id`, `cluster_id`, `namespace`, `permission` |
| `pod_groups` | Saved dynamic group definitions | `id`, `cluster_id` or scope, `namespace_selector`, `label_selector`, `name`, `created_by` |
| `viewer_configs` | Saved viewer layouts/configuration | `id`, `user_id`, `name`, `config_json` |
| `user_preferences` | UI preferences | `user_id`, `preferences_json` |
| `app_settings` | Non-secret application settings | `key`, `value_json`, `updated_at` |
| `audit_events` | Administrative and access audit records | `id`, `actor_user_id`, `action`, `resource_type`, `resource_id`, `metadata_json`, `created_at` |
| `schema_migrations` | Applied database migrations | `version`, `applied_at` |

Use stable internal IDs (UUIDs or another consistently generated identifier). For SSO/OIDC, store the identity provider's stable `issuer + subject` mapping; do not use email as the permanent identity key because email addresses can change.

The schema above is a logical starting point. Normalize relationships where they need constraints and indexes. Use JSON columns only for flexible settings or metadata, not as a substitute for relational access-control relationships.

## 6A.4 Cluster configuration and secrets

SQLite may store:
- Cluster ID and display name.
- Environment and AWS region.
- Authentication mode.
- A reference/name identifying where the role or secret is managed.
- Non-secret operational settings.

SQLite should not store:
- AWS access key and secret key.
- Long-lived bearer tokens.
- Private keys.
- Raw kubeconfig credentials.
- Client certificates or other secret material unless a formal encrypted-secret design is separately approved.

Prefer workload identity, IAM role assumption and a secrets manager. The backend resolves the secret reference at runtime. The browser receives only the cluster fields the user is authorized to see.

## 6A.5 SQLite concurrency and deployment considerations

SQLite supports multiple readers but serializes writes. This is generally a good fit for LORA's metadata workload, but it is not a distributed database.

For the MVP:
- Run one LORA backend replica.
- Keep the SQLite database on a persistent volume with reliable local block storage semantics.
- Use WAL mode where supported by the chosen driver and filesystem.
- Keep write transactions short.
- Add indexes for common lookups such as user subject, cluster ID, permission lookups and audit timestamps.
- Configure a busy timeout and handle `SQLITE_BUSY` errors safely.
- Back up the database consistently and test restore procedures.
- Do not place the SQLite file on an arbitrary network filesystem unless its locking and durability behavior is explicitly supported and tested.
- Do not share one SQLite file between multiple backend replicas as a substitute for distributed coordination.

WAL mode improves reader/writer coexistence; it does not turn SQLite into a multi-writer database. A single writer at a time remains an important design constraint.

If LORA later requires multiple backend replicas, high write concurrency, multi-node access to shared application data or high availability across nodes, migrate the application database to PostgreSQL. Keep SQL access behind repository interfaces to reduce migration effort.

## 6A.6 Suggested Go package structure

```text
internal/
  database/
    db.go
    migrations/
      0001_initial_schema.sql
      0002_cluster_permissions.sql
  repository/
    users.go
    clusters.go
    permissions.go
    pod_groups.go
    viewers.go
    audit.go
  service/
    user_service.go
    cluster_service.go
    permission_service.go
```

Keep domain logic in services, SQL in repositories, and request/response handling in API handlers. Use transactions for operations that must update related records atomically, such as creating a user and assigning initial roles.

## 6A.7 Migration and backup plan

- Use versioned SQL migration files.
- Apply migrations at controlled startup or as a dedicated deployment step; prevent two processes from racing to migrate.
- Never rely on automatic destructive schema changes.
- Back up the database before schema upgrades.
- Test migration from the previous released schema.
- Test restore into a clean environment.
- Define retention for audit events.
- Keep the database file and its WAL/SHM sidecar handling in mind during backup; use a SQLite-aware backup method or a safe checkpoint/backup procedure rather than copying a live database file blindly.

## 6A.8 When to move from SQLite to PostgreSQL

Move when one or more of these become real requirements:
- Multiple active LORA backend replicas need shared application data.
- Sustained write contention appears in metrics.
- Multiple application instances must write concurrently.
- High availability and managed database failover are required.
- The database must be accessed by multiple hosts.
- Data volume or query workload outgrows the operational simplicity of SQLite.

Do not move to PostgreSQL merely because LORA streams many logs. Live log traffic should flow through the in-memory streaming pipeline, not through the metadata database.

# 7. Kubernetes discovery and pod grouping

## 7.1 Discovery hierarchy

``` text
Cluster
  └── Namespace
       └── Application group
            ├── Pod A
            │    ├── Container 1
            │    └── Container 2
            ├── Pod B
            │    └── Container 1
            └── Pod C
                 └── Container 1
```

## 7.2 Grouping methods

Use this priority:

1.  Kubernetes label selectors --- primary and most reliable.
2.  Pod-name prefix --- convenient fallback.
3.  Pod-name contains --- convenient search.
4.  Regular expressions --- consider later, with safe limits.

Examples:

``` text
Label selector: app=invoice-service
Prefix:         invoice-service-
Contains:       invoice-service
```

Labels are preferred because pod names are generated and can change. A
group should be a dynamic selection rule, not a permanent list of pod
names.

## 7.3 Dynamic groups

When a user opens a group viewer, LORA should: - Resolve the group's
selector. - List matching pods. - Subscribe to eligible pod/container
streams. - Watch relevant pod changes while the group viewer remains
active. - Add newly matching pods when appropriate. - Remove streams for
deleted or no-longer-matching pods. - Avoid duplicate subscriptions when
watch events repeat.

A group does not correspond to one Kubernetes log stream. It is a
collection of individual pod/container streams, each managed
independently and merged for display.

## 7.4 Pod identity

Never identify a live pod connection by pod name alone. Use the
Kubernetes Pod UID, because a pod can be deleted and recreated with the
same name.

# 8. Shared Pod Connection Manager

This is the most important LORA component and the first major technical
proof of concept.

## 8.1 Connection identity

A stream key should include:

``` text
cluster_id
+ namespace
+ pod_uid
+ container_name
+ normalized_stream_configuration
```

The normalized stream configuration must include all Kubernetes log
request options that affect compatibility, such as current versus
previous container logs, timestamps, and any other option that changes
the source stream.

Two viewers can share a stream only if their underlying Kubernetes
requests are compatible. Viewer-specific search terms, log-level
filters, pause state and display preferences must not be part of the
shared connection key.

## 8.2 Core lifecycle

``` text
Subscribe request
      |
      v
Authorize cluster/namespace access
      |
      v
Resolve pod UID and container
      |
      v
Build normalized stream key
      |
      v
Find or create shared connection
      |
      +---- Existing: attach subscriber
      |
      +---- New: create one Kubernetes stream
      |
      v
Replay bounded recent buffer
      |
      v
Deliver live entries to subscriber
      |
      v
Subscriber disconnects
      |
      v
Remove only that subscriber
      |
      +---- Other subscribers remain: keep stream
      |
      +---- No subscribers: cancel stream and clean up
```

## 8.3 Suggested Go types

``` go
type ConnectionManager struct {
    mu          sync.RWMutex
    connections map[string]*PodConnection
}

type PodConnection struct {
    Key         string
    ClusterID   string
    Namespace   string
    PodName     string
    PodUID      string
    Container   string

    Subscribers map[string]*Subscriber

    Cancel      context.CancelFunc
    State       ConnectionState
    Buffer      *LogRingBuffer

    CreatedAt   time.Time
}

type Subscriber struct {
    ID          string
    UserID      string
    ViewerID    string
    Filter      LogFilter
    Queue       chan LogEntry
}
```

The implementation must define ownership and synchronization rules
clearly. Avoid exposing mutable maps outside the manager.

## 8.4 Concurrency requirements

-   Protect registry operations with a mutex or a carefully designed
    concurrent structure.
-   Do not hold the global registry lock while making Kubernetes calls,
    reading streams or writing to WebSockets.
-   Deduplicate simultaneous connection creation for the same key. A
    lock around only the map lookup is not enough if two requests can
    both start streams before inserting.
-   Give each subscriber an independent bounded queue.
-   Ensure one slow subscriber cannot block delivery to other
    subscribers.
-   Use context cancellation for stream lifecycle.
-   Remove subscribers idempotently; duplicate disconnect events must be
    safe.
-   Close channels only from the component that owns them.
-   Define shutdown behavior for backend termination.
-   Use a race detector and concurrency tests.

A practical approach is to use a per-key creation mechanism (for
example, `singleflight` or an explicit STARTING entry) so concurrent
subscriptions share one startup operation.

## 8.5 Connection states

``` text
STARTING -> RUNNING -> STOPPING -> STOPPED
                 |
                 +-> RECONNECTING -> RUNNING
                 |
                 +-> FAILED
```

Each transition should be observable and reported to subscribers where
relevant.

## 8.6 Ring buffer

Maintain a bounded recent-log ring buffer per active shared stream.

Initial configurable defaults to test: - Maximum recent entries: 1,000
per stream. - Also enforce a byte limit per stream. - Configure a
maximum age if useful. - Track overwritten entries and buffer
truncation.

A new subscriber should receive a consistent snapshot of recent entries
and then live entries without avoidable gaps or duplicates. Design this
using sequence numbers and a synchronized replay/live handoff, rather
than copying the buffer and then independently subscribing to a channel
without coordination.

The ring buffer is a convenience for active viewers, not durable
storage.

# 9. Log processing and delivery

## 9.1 Three processing layers

  -----------------------------------------------------------------------
  Layer                               Responsibility
  ----------------------------------- -----------------------------------
  Kubernetes                          Cluster, namespace, pod, container
                                      and source stream options

  Backend                             Shared stream reading, metadata
                                      enrichment, optional redaction,
                                      per-subscriber filtering and
                                      delivery

  Frontend                            Interactive text search,
                                      highlighting, display filters,
                                      pause and auto-scroll
  -----------------------------------------------------------------------

## 9.2 Independent subscriber filters

Example:

``` text
                One Kubernetes stream
                         |
                    Broadcaster
                   /     |      \
                  /      |       \
             User A   User B   User C
             ERROR     ALL     WARN/ERROR
```

User A's filter must not change the data User B receives. A viewer's
pause or clear action must not pause or clear the shared source stream.

## 9.3 Log entry schema

``` go
type LogEntry struct {
    Sequence    uint64    `json:"sequence"`
    Timestamp   time.Time `json:"timestamp"`
    ClusterID   string    `json:"cluster_id"`
    Namespace   string    `json:"namespace"`
    PodName     string    `json:"pod_name"`
    PodUID      string    `json:"pod_uid"`
    Container   string    `json:"container"`
    Stream      string    `json:"stream"`
    Message     string    `json:"message"`
}
```

Preserve the original log message. Parsing a log level or JSON payload
should be best-effort because applications may use different formats. Do
not assume every line is valid JSON or has a standard severity field.

## 9.4 Backpressure and delivery gaps

Every subscriber has a bounded queue. If the queue fills: - Do not block
the shared stream reader. - Increment a dropped-entry counter. - Send an
explicit gap/overflow notification if the connection remains usable. -
Apply a documented policy, such as disconnecting the slow subscriber or
dropping entries with a visible warning. - Never silently claim that the
viewer has received every line.

The initial policy should favor protecting the shared stream and healthy
subscribers over preserving an indefinitely slow subscriber's queue.

# 10. REST API design

Use versioned REST endpoints for discovery and viewer management.

  ----------------------------------------------------------------------------------------------------------
  Method                  Endpoint                                                   Purpose
  ----------------------- ---------------------------------------------------------- -----------------------
  GET                     `/api/v1/clusters`                                         List authorized
                                                                                     configured clusters

  GET                     `/api/v1/clusters/{clusterID}/namespaces`                  List namespaces

  GET                     `/api/v1/clusters/{clusterID}/pods`                        List/filter pods

  GET                     `/api/v1/clusters/{clusterID}/pods/{podName}/containers`   List containers

  GET                     `/api/v1/clusters/{clusterID}/pod-groups`                  Discover groups or
                                                                                     group definitions

  POST                    `/api/v1/viewers`                                          Create viewer metadata

  GET                     `/api/v1/viewers/{viewerID}`                               Get viewer metadata

  DELETE                  `/api/v1/viewers/{viewerID}`                               Close viewer and
                                                                                     unsubscribe
  ----------------------------------------------------------------------------------------------------------

API requirements: - Validate all IDs and query parameters. - Enforce
authorization on every resource request. - Support pagination for large
pod lists. - Set request timeouts. - Return structured error codes. -
Avoid exposing Kubernetes credentials, internal endpoints or sensitive
error details. - Define OpenAPI documentation before frontend
integration.

# 11. WebSocket protocol

Use a versioned endpoint such as:

``` text
/ws/v1/logs
```

Authenticate the WebSocket handshake using the chosen secure session
mechanism. Avoid putting long-lived credentials in query strings.

## 11.1 Subscribe request

``` json
{
  "type": "subscribe",
  "request_id": "req-001",
  "viewer_id": "viewer-123",
  "cluster_id": "production",
  "namespace": "default",
  "pod_name": "invoice-service-abc12",
  "container": "invoice",
  "tail_lines": 500,
  "timestamps": true
}
```

The server must authorize the request and resolve the pod UID itself. Do
not trust a client-provided UID as proof of identity or access.

## 11.2 Subscription acknowledgement

``` json
{
  "type": "subscription.created",
  "request_id": "req-001",
  "viewer_id": "viewer-123",
  "connection_status": "RUNNING"
}
```

## 11.3 Batched log message

``` json
{
  "type": "logs",
  "viewer_id": "viewer-123",
  "entries": [
    {
      "sequence": 1024,
      "timestamp": "2026-11-01T00:30:10Z",
      "pod_name": "invoice-service-abc12",
      "container": "invoice",
      "message": "Invoice created successfully"
    }
  ]
}
```

Batch entries over a short configurable interval (initially test
approximately 100--250 ms) or until a size threshold is reached. Enforce
a maximum WebSocket message size.

## 11.4 Other message types

-   `subscription.error`
-   `subscription.status`
-   `subscription.closed`
-   `logs.gap`
-   `logs.truncated`
-   `heartbeat`
-   `pong`

## 11.5 Reconnection

-   Use exponential backoff with jitter.
-   Use request IDs to make subscription creation idempotent.
-   Re-authorize on reconnect.
-   Re-resolve the pod UID.
-   Reattach to an existing stream where possible.
-   Replay only the recent buffer that is still available.
-   Tell the user if a gap may have occurred during disconnection.

# 12. Frontend design

Use a three-part layout.

## 12.1 Resource explorer

Left panel: - Cluster selector. - Namespace selector. - Searchable pod
tree. - Application groups. - Expandable pods and containers. -
Multi-select pods and groups.

## 12.2 Viewer tabs

Each viewer tab has its own: - Viewer ID. - Selected cluster and
resources. - Search query. - Log-level and text filters. - Pause
state. - Auto-scroll state. - Display buffer. - Subscription status.

The same user may open multiple viewers, including multiple browser
tabs. A user ID is not a viewer ID. Each viewer must have its own
independent subscription identity.

## 12.3 Log viewer

Recommended capabilities: - Timestamp and source metadata. -
ERROR/WARN/INFO highlighting where parseable. - Search loaded log
lines. - Pod and container filtering. - Pause and resume display. -
Auto-scroll toggle. - Clear local display buffer. - Copy a line. -
Download visible/selected entries. - JSON formatting for valid JSON
messages. - Explicit overflow and gap indicators.

Use a virtualized list rather than rendering every log line into the
DOM. LORA is a structured log viewer, not primarily a terminal emulator.

## 12.4 Pause semantics

Pause should be viewer-local. It must not cancel or pause a shared
Kubernetes stream used by other subscribers.

Define what happens while paused: - Option A: keep a bounded local queue
and catch up on resume. - Option B: stop delivery to that viewer and
report the skipped range.

For the MVP, use a bounded local queue with a visible overflow warning.
Do not let a paused viewer accumulate unlimited memory.

# 13. Security and authorization

Security is a production prerequisite, not a final optional enhancement.

## 13.1 Kubernetes permissions

Grant only the permissions required by LORA. Typical read permissions
may include: - `get`, `list`, `watch` on pods as required. - `get`,
`list` on namespaces as required. - `get` on the `pods/log` subresource.

The exact Role/ClusterRole and bindings depend on whether LORA needs
cluster-wide discovery or only approved namespaces. Avoid cluster-admin.

## 13.2 User roles

  Role        Initial permissions
  ----------- ---------------------------------------------
  Admin       Manage cluster configuration and users
  Developer   View logs in authorized clusters/namespaces
  Viewer      Read-only access to authorized logs

Authorization must be checked for every cluster, namespace, pod and
subscription operation. A user must not be able to bypass access rules
by sending a WebSocket message directly.

## 13.3 Additional controls

-   OIDC/SSO or the organization's approved identity provider.
-   TLS for browser-to-LORA and LORA-to-Kubernetes traffic.
-   Secure secret references and short-lived AWS credentials.
-   Audit who accessed which cluster, namespace and pod.
-   Rate limits and per-user active viewer/stream limits.
-   Configurable redaction of secrets and sensitive fields before
    broadcasting.
-   Avoid logging log contents into LORA's own application logs.
-   Define retention and access policy if persistence is introduced.

# 14. Performance design and initial targets

These are initial engineering targets to validate in load tests, not
guarantees.

  Area                      Initial design target
  ------------------------- -------------------------------------------
  Shared source stream      One per unique compatible stream key
  Initial history           500 lines configurable
  Active stream buffer      Bounded by entries and bytes
  Subscriber queue          Bounded and configurable
  WebSocket batching        Test 100--250 ms batches
  UI rendering              Virtualized
  Idle connection cleanup   Immediately after final subscriber leaves
  Heartbeat                 Approximately every 30 seconds
  Retry                     Exponential backoff with jitter
  Discovery                 Pagination and bounded concurrency

## 14.1 Key optimization techniques

1.  Reuse Kubernetes clients per cluster.
2.  Share compatible streams.
3.  Batch WebSocket messages.
4.  Bound every queue and buffer.
5.  Use non-blocking fan-out.
6.  Virtualize frontend rendering.
7.  Avoid unlimited initial log history.
8.  Limit concurrent streams and subscribers.
9.  Apply server-side selection and optional filters before data reaches
    browsers.
10. Measure throughput, latency, memory and delivery gaps before tuning.

## 14.2 Metrics

Expose at least:

``` text
lora_active_kubernetes_streams
lora_active_subscribers
lora_log_entries_received_total
lora_log_entries_delivered_total
lora_subscriber_dropped_entries_total
lora_websocket_connections
lora_stream_reconnects_total
lora_connection_startup_duration
lora_stream_bytes_received_total
lora_stream_bytes_delivered_total
lora_ring_buffer_overwrites_total
```

Use labels carefully. Do not put unbounded values such as pod UID, user
ID or arbitrary namespace names on high-cardinality metric labels. Use
structured logs or traces for detailed identities.

# 15. Error handling and recovery

  -----------------------------------------------------------------------
  Scenario                            Expected behavior
  ----------------------------------- -----------------------------------
  EKS unavailable                     Show cluster connectivity error;
                                      retry appropriately

  Pod deleted                         Stop old stream and notify
                                      subscribers

  Pod recreated with same name        Resolve new UID and create a new
                                      stream

  Container restarted                 Treat current and previous logs as
                                      distinct stream configurations

  WebSocket disconnected              Reconnect and restore subscription
                                      safely

  Kubernetes API throttling           Backoff with jitter; respect server
                                      responses

  RBAC denied                         Return a clear permission error

  No subscribers remain               Cancel stream and release resources

  Slow subscriber                     Bound queue; report gap or
                                      disconnect

  Backend restart                     In-memory streams are lost; clients
                                      reconnect

  Log buffer overwritten              Report that earlier recent history
                                      is unavailable
  -----------------------------------------------------------------------

Kubernetes log APIs are subject to kubelet log rotation and
pod/container lifecycle. `kubectl logs` is not a guarantee of complete
historical logs. LORA must state these limitations clearly.

# 16. Deployment design

## 16.1 MVP deployment

``` text
Browser
   |
   v
Ingress / Load Balancer (TLS)
   |
   +---- LORA frontend
   |
   +---- LORA Go backend (one replica)
              |
              +---- In-memory connection registry
              +---- WebSocket sessions
              +---- Kubernetes clients
                         |
                         +---- Dev EKS
                         +---- Staging EKS
                         +---- Production EKS
```

Deployment requirements: - One backend replica while the registry is
in-memory. - Graceful shutdown and stream cancellation. - Readiness and
liveness probes. - CPU and memory requests/limits. - TLS and appropriate
ingress timeouts for WebSockets. - IAM workload identity for AWS access
where supported. - Network policies and restricted egress where
practical. - Centralized LORA service logs and metrics.

Do not scale the backend to multiple replicas until stream ownership and
cross-instance subscriber routing are designed. Otherwise two replicas
can create duplicate Kubernetes streams for the same pod.

## 16.2 Future distributed deployment

``` text
                    Load Balancer
                    /           \
             Backend A        Backend B
                 |                |
                 +------ NATS ----+
                         |
                Stream ownership/routing
                         |
                   EKS clusters
```

NATS can distribute log messages between backend instances. Redis may be
added for distributed leases, ownership metadata or session coordination
if the chosen design needs it. Do not add both automatically; validate
the requirement first.

# 17. Future historical storage

The MVP uses SQLite for LORA application metadata, but should not persist every live log line there. Define a separate log-storage boundary now.

``` go
type LogSink interface {
    Write(ctx context.Context, entry LogEntry) error
}
```

Future architecture:

``` text
EKS workloads
      |
      v
Continuous collector (Fluent Bit / Vector)
      |
      v
Durable log pipeline
      |
      +---- S3
      |
      +---- OpenSearch

LORA live stream remains a separate live troubleshooting path.
```

A future storage sink can also consume normalized entries from LORA, but
on-demand LORA streams alone cannot guarantee complete collection
because pods may run when nobody is watching. If the requirement is
complete log capture, use a continuously running node-level or workload
log collector.

# 18. Go repository structure

``` text
lora/
├── cmd/
│   └── lora/
│       └── main.go
├── internal/
│   ├── api/
│   │   ├── handlers/
│   │   ├── middleware/
│   │   └── routes.go
│   ├── auth/
│   │   ├── authentication.go
│   │   └── authorization.go
│   ├── cluster/
│   │   ├── manager.go
│   │   ├── config.go
│   │   └── client.go
│   ├── kubernetes/
│   │   ├── namespaces.go
│   │   ├── pods.go
│   │   ├── containers.go
│   │   └── logs.go
│   ├── connection/
│   │   ├── manager.go
│   │   ├── connection.go
│   │   ├── subscriber.go
│   │   ├── broadcaster.go
│   │   └── lifecycle.go
│   ├── streaming/
│   │   ├── websocket.go
│   │   ├── protocol.go
│   │   └── heartbeat.go
│   ├── logs/
│   │   ├── entry.go
│   │   ├── filter.go
│   │   └── buffer.go
│   ├── grouping/
│   │   ├── selector.go
│   │   └── watcher.go
│   └── config/
│       └── config.go
├── frontend/
│   └── src/
│       ├── components/
│       ├── viewers/
│       ├── clusters/
│       ├── pods/
│       ├── websocket/
│       └── hooks/
├── deployments/
│   ├── Dockerfile
│   └── kubernetes/
├── configs/
├── tests/
├── go.mod
└── README.md
```

# 19. Testing strategy

## 19.1 Unit tests

-   Connection key normalization.
-   Concurrent subscription to the same stream.
-   Connection startup deduplication.
-   Subscriber add/remove lifecycle.
-   Ring buffer ordering and overwrite behavior.
-   Replay/live handoff without duplicates.
-   Per-subscriber filtering.
-   Queue overflow behavior.
-   Idempotent cleanup.
-   Pod UID changes.

## 19.2 Integration tests

Use a test Kubernetes environment or a local cluster for: - Namespace
and pod discovery. - Current container log streaming. - Previous
container logs. - Pod deletion and recreation. - Kubernetes API errors
and throttling. - Multi-pod group discovery. - WebSocket
subscribe/unsubscribe.

## 19.3 Multi-user proof of concept

Required acceptance test:

1.  User A subscribes to one pod/container.
2.  User B subscribes to the same compatible stream.
3.  Assert exactly one Kubernetes log stream is opened.
4.  Assert both subscribers receive the same source entries.
5.  User A disconnects.
6.  Assert User B continues receiving logs.
7.  User B disconnects.
8.  Assert the source stream is cancelled.
9.  Repeat with simultaneous subscription requests to expose races.
10. Run tests with Go's race detector.

## 19.4 Load and resilience tests

-   Many subscribers to one pod.
-   Many unique pod streams.
-   High log throughput.
-   Large log messages.
-   Slow and disconnected browsers.
-   Backend restart.
-   Kubernetes API outage.
-   Pod churn and group membership changes.

# 20. Delivery roadmap

## Release 0 --- Project foundation

Deliverables: - Repository and Go module. - React/TypeScript application
shell. - Configuration loading and validation. - Structured application
logging. - Health and readiness endpoints. - CI pipeline, formatting,
linting and unit-test setup.

Exit criteria: - Application builds and runs locally. - Configuration
errors are clear. - Health endpoints work.

## Release 1 --- Multi-cluster discovery

Deliverables: - Cluster configuration. - Kubernetes client manager. -
Namespace listing. - Pod listing and pagination. - Container
discovery. - Basic cluster connectivity status.

Exit criteria: - Authorized users can select each configured cluster and
discover its resources. - Credentials are not exposed to the browser. -
RBAC is least privilege.

## Release 2 --- Single pod live streaming

Deliverables: - Kubernetes log reader using `client-go`. - Initial tail
history. - WebSocket connection. - Subscribe and unsubscribe protocol. -
Basic structured log viewer.

Exit criteria: - A user can select a pod/container and see live logs. -
Disconnect cleans up resources. - Errors are visible and actionable.

## Release 3 --- Shared connection manager

Deliverables: - Normalized stream key. - In-memory connection
registry. - Startup deduplication. - Subscriber lifecycle. -
Per-subscriber bounded queues. - Bounded ring buffer. - Replay/live
handoff. - Connection state notifications.

Exit criteria: - Two users share one Kubernetes stream. - One user's
disconnect does not interrupt another. - Final subscriber disconnect
cancels the stream. - Race tests pass. - Queue overflow is visible.

## Release 4 --- Multi-pod and group viewers

Deliverables: - Multi-pod selection. - Combined log viewer. - Label
selector grouping. - Prefix and contains grouping. - Pod metadata in
every log entry. - Dynamic group watch, if stable within scope.

Exit criteria: - A user can select a group and view logs from its pods
together. - New/deleted pods are handled correctly if dynamic watching
is enabled. - Source identity is visible for each entry.

## Release 5 --- Multiple viewers and frontend experience

Deliverables: - Independent viewer IDs. - Multiple application tabs. -
Independent search and filters. - Viewer-local pause/resume. -
Auto-scroll. - Clear and copy. - Download visible logs. - Virtualized
rendering.

Exit criteria: - One user can open several viewers without state
leakage. - A viewer's pause/clear/filter actions do not affect other
viewers. - Large log volumes do not cause unbounded DOM growth.

## Release 6 --- Production hardening

Deliverables: - OIDC/SSO integration. - Application RBAC. - Audit
events. - Redaction policy. - Rate limits and quotas. - Metrics and
dashboards. - Graceful shutdown. - Security review. - Load and
resilience tests.

Exit criteria: - Production access is authorized and auditable. -
Resource limits and overload behavior are tested. - Operational metrics
expose dropped entries and stream health.

## Release 7 --- Distributed scaling and historical storage (future)

Deliverables, subject to measured need: - NATS-based cross-instance log
distribution. - Distributed stream ownership. - Redis coordination if
required. - Multi-replica backend. - Continuous collector for complete
log capture. - S3/OpenSearch historical storage. - Historical search UI.

Exit criteria: - Stream ownership remains unique across backend
replicas. - Subscriber routing works across instances. - Historical
completeness and retention guarantees are documented.

# 21. MVP acceptance criteria

The MVP is ready for controlled internal use when all of the following
are true:

-   [ ] LORA connects to more than one configured EKS cluster.
-   [ ] Authorized users can list namespaces, pods and containers.
-   [ ] A user can stream logs from a selected pod/container.
-   [ ] Two users viewing the same compatible stream share one
    Kubernetes log stream.
-   [ ] Multiple viewers belonging to one user remain independent.
-   [ ] One subscriber disconnecting does not interrupt other
    subscribers.
-   [ ] The final subscriber leaving closes the source stream.
-   [ ] New subscribers can receive bounded recent history.
-   [ ] Pod recreation is detected using Pod UID.
-   [ ] Multiple pods can be combined in one viewer.
-   [ ] Slow subscribers cannot block healthy subscribers.
-   [ ] Delivery gaps and buffer truncation are visible.
-   [ ] Search, pause, resume and auto-scroll work per viewer.
-   [ ] Backend permissions are least privilege.
-   [ ] User authorization is enforced for REST and WebSocket
    operations.
-   [ ] Metrics expose stream counts, subscribers, throughput and
    dropped entries.
-   [ ] The application documents that Kubernetes logs are not durable
    historical storage.

# 22. Key risks and mitigations

  -----------------------------------------------------------------------
  Risk                                Mitigation
  ----------------------------------- -----------------------------------
  Kubernetes log rotation causes      State limitations; add continuous
  missing history                     collection for durable capture

  Duplicate streams from concurrent   Per-key startup deduplication and
  subscriptions                       concurrency tests

  Slow browser causes memory growth   Bounded queues, byte limits and
                                      visible gap policy

  Pod recreated with same name        Key by Pod UID

  Group pod churn                     Kubernetes watch and idempotent
                                      membership reconciliation

  Backend restart loses in-memory     Reconnect clients; later
  streams                             distributed ownership

  Cross-cluster permissions are too   Per-cluster IAM and least-privilege
  broad                               RBAC

  Sensitive data in logs              Redaction, authorization and audit

  Too many streams overwhelm API      Per-user and global limits,
  server or backend                   concurrency caps and metrics

  Frontend freezes on high volume     Batching and virtualized rendering
  -----------------------------------------------------------------------

# 23. Recommended implementation sequence

Do not begin by implementing every feature simultaneously. The most
efficient sequence is:

1.  Create the repository, configuration and application shell.
2.  Implement one cluster client and pod discovery.
3.  Implement a single pod/container log reader.
4.  Deliver logs to one browser over WebSocket.
5.  Add the shared connection manager and prove the two-user scenario.
6.  Add concurrency, queue and buffer correctness tests.
7.  Add multiple pod selection and combined viewer.
8.  Add group discovery and dynamic membership.
9.  Add independent viewer tabs and filters.
10. Complete security, metrics, load tests and production deployment.

The shared connection manager should be proven early, before building a
large frontend around an unvalidated streaming design.

# 24. Open questions to resolve during implementation

These questions do not block the initial architecture, but must be
settled before the corresponding features are shipped:

1.  Where will LORA run: in one of the target EKS clusters, in a
    dedicated management cluster, or outside EKS?
2.  Are the EKS clusters in one AWS account or multiple accounts?
3.  Which identity provider should LORA use for user login?
4.  Should namespace access be the same for all developers or restricted
    by team/environment?
5.  What are the expected maximum concurrent users, viewers, unique pod
    streams and peak log throughput?
6.  What is the required behavior when a user pauses: bounded local
    catch-up or intentional skip with a gap indicator?
7.  What log redaction rules are required?
8.  Should group viewers automatically attach to newly created pods?
9.  What is the desired maximum recent-log buffer in bytes and time?
10. Is the long-term requirement simply live troubleshooting, or
    complete searchable log retention?

# 25. Final architecture recommendation

Approve a modular Go monolith for the MVP, with: - Multiple EKS cluster
support. - `client-go` for Kubernetes API access. - One shared stream
per compatible pod/container/log configuration. - Independent subscriber
queues and viewer state. - Bounded recent-log buffers. - REST for
discovery and WebSockets for streaming. - React/TypeScript with
virtualized log rendering. - In-memory stream ownership while running
one backend replica. - Explicit security, delivery-gap reporting and
observability.

The central LORA design principle is:

**One Kubernetes stream → one shared connection → multiple independent
subscribers → multiple independent log viewers.**

Build and test this flow first. Once it is correct under concurrent
subscriptions, disconnections, slow consumers and pod recreation, the
remaining features can be added incrementally without changing the
fundamental architecture.
