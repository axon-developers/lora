export type ClusterStatus = 'HEALTHY' | 'AUTH_EXPIRED' | 'UNREACHABLE' | 'DISABLED' | 'ERROR';

export interface ClusterInfo {
  id: string;
  name: string;
  environment: string;
  region?: string;
  regions?: string[];
  active_region?: string;
  regional_contexts?: Record<string, string>;
  context?: string;
  status: ClusterStatus;
  last_checked: string;
  error_message?: string;
  enabled: boolean;
}

export interface DiscoveredContext {
  name: string;
  cluster: string;
  user: string;
  region?: string;
  server?: string;
}

export interface PodItem {
  name: string;
  uid: string;
  namespace: string;
  phase: string;
  ready: boolean;
  restart_count: number;
  created_at: string;
  containers: string[];
}

export interface ContainerItem {
  name: string;
  state: string;
  restarts: number;
  has_previous: boolean;
  is_init: boolean;
}

export interface LogEntry {
  seq: number;
  timestamp: string;
  pod_name: string;
  container: string;
  message: string;
  stream: string;
}

export interface ViewerTab {
  id: string;
  title: string;
  clusterId: string;
  namespace: string;
  podName: string;
  container: string;
  previous: boolean;
  sinceSeconds?: number;
  isPaused: boolean;
  autoScroll: boolean;
  filterText: string;
  severityFilter?: 'ALL' | 'ERROR' | 'WARN' | 'INFO';
  alertKeyword?: string;
  highlightedSeq?: number | null;
  unreadCount: number;
  logs: LogEntry[];
  pausedQueue: LogEntry[];
  droppedCount: number;
  status: 'CONNECTING' | 'STREAMING' | 'PAUSED' | 'DISCONNECTED' | 'ERROR';
  errorMessage?: string;
  selectedLog?: LogEntry | null;
}

export interface ConnectionInfo {
  key: string;
  cluster_id: string;
  namespace: string;
  pod_name: string;
  container: string;
  subscribers_count: number;
  lines_per_second: number;
  bytes_per_second: number;
  buffer_entries: number;
  state: string;
  created_at: string;
}

export interface AdminConnectionStats {
  total_active_streams: number;
  total_subscribers: number;
  memory_alloc_bytes: number;
  memory_sys_bytes: number;
  streams: ConnectionInfo[];
}

// ==========================================
// Version 2 Platform Capabilities Types
// ==========================================

export interface PodEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  first_timestamp: string;
  last_timestamp: string;
  source_component: string;
}

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  roles: string[];
  is_admin: boolean;
}

export interface AuthStatus {
  enabled: boolean;
  user?: AuthUser;
  anonymous: boolean;
}

export interface RedactionRule {
  id: string;
  name: string;
  pattern: string;
  mask: string;
  enabled: boolean;
}

export interface RedactionTestMatch {
  rule_id: string;
  rule_name: string;
  matched: string;
}

export interface RedactionTestResult {
  original: string;
  redacted: string;
  matches: RedactionTestMatch[];
}

export interface S3ExportResult {
  s3_uri: string;
  bucket: string;
  key: string;
  bytes_written: number;
  uploaded_at: string;
}

export interface AppSettings {
  server?: {
    host: string;
    port: number;
    cors_origins: string[];
  };
  streaming?: {
    default_tail_lines: number;
    ring_buffer_max_entries: number;
    ring_buffer_max_bytes: number;
    subscriber_queue_size: number;
    max_streams_per_user: number;
  };
  websocket?: {
    batch_interval_ms: number;
    heartbeat_interval_s: number;
  };
  viewer?: {
    max_tabs_soft_limit: number;
    max_tabs_hard_limit: number;
    pause_queue_max_entries: number;
    client_max_log_lines: number;
  };
  auth?: {
    enabled: boolean;
    provider: string;
    jwt_secret?: string;
    session_ttl?: string;
    admin_roles?: string[];
    azure_ad?: {
      tenant_id: string;
      client_id: string;
      client_secret: string;
      redirect_url: string;
      scopes: string[];
    };
  };
  s3_export?: {
    enabled: boolean;
    bucket: string;
    region: string;
    prefix: string;
    endpoint?: string;
    access_key_id?: string;
    secret_access_key?: string;
    use_iam_role: boolean;
  };
  redaction?: {
    enabled: boolean;
    rules: RedactionRule[];
  };
  features?: {
    multi_container_merge: boolean;
    pod_groups: boolean;
    pod_events: boolean;
  };
}

