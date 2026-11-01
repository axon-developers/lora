package config

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server    ServerConfig    `yaml:"server" json:"server"`
	Database  DatabaseConfig  `yaml:"database" json:"database"`
	Clusters  []ClusterConfig `yaml:"clusters" json:"clusters"`
	Streaming StreamingConfig `yaml:"streaming" json:"streaming"`
	WebSocket WebSocketConfig `yaml:"websocket" json:"websocket"`
	Viewer    ViewerConfig    `yaml:"viewer" json:"viewer"`
	Display   DisplayConfig   `yaml:"display" json:"display"`
	// Version 2 (Optional Platform Capabilities)
	Auth      AuthConfig      `yaml:"auth" json:"auth"`
	S3Export  S3ExportConfig  `yaml:"s3_export" json:"s3_export"`
	Redaction RedactionConfig `yaml:"redaction" json:"redaction"`
	Features  FeaturesConfig  `yaml:"features" json:"features"`
}

type ServerConfig struct {
	Host        string   `yaml:"host"`
	Port        int      `yaml:"port"`
	CorsOrigins []string `yaml:"cors_origins"`
}

type DatabaseConfig struct {
	Path string `yaml:"path"`
}

type ClusterConfig struct {
	ID                  string           `yaml:"id"`
	Name                string           `yaml:"name"`
	Environment         string           `yaml:"environment"`
	ManagedKubeconfig   bool             `yaml:"managed_kubeconfig"`
	Kubeconfig          KubeconfigConfig `yaml:"kubeconfig"`
	Kconnect            KconnectConfig   `yaml:"kconnect"`
	HealthCheckInterval string           `yaml:"health_check_interval"`
	Enabled             bool             `yaml:"enabled"`
}

type KconnectConfig struct {
	Enabled     bool              `yaml:"enabled"`
	Command     string            `yaml:"command"`
	Args        []string          `yaml:"args"`
	AutoRefresh bool              `yaml:"auto_refresh"`
	Env         map[string]string `yaml:"env"`
}

func (c ClusterConfig) GetEffectiveKubeconfigPath() string {
	if c.ManagedKubeconfig && c.Kubeconfig.Path == "" {
		return filepath.Join(".", "data", "kubeconfigs", fmt.Sprintf("%s.config", c.ID))
	}
	return c.Kubeconfig.Path
}

func (c ClusterConfig) ParseHealthCheckInterval() time.Duration {
	if c.HealthCheckInterval == "" {
		return 30 * time.Second
	}
	d, err := time.ParseDuration(c.HealthCheckInterval)
	if err != nil {
		return 30 * time.Second
	}
	return d
}

type KubeconfigConfig struct {
	Path    string `yaml:"path"`
	Context string `yaml:"context"`
}

type StreamingConfig struct {
	DefaultTailLines        int64 `yaml:"default_tail_lines"`
	RingBufferMaxEntries    int   `yaml:"ring_buffer_max_entries"`
	RingBufferMaxBytes      int   `yaml:"ring_buffer_max_bytes"`
	TotalMemoryBudget       int64 `yaml:"total_memory_budget"`
	SubscriberQueueSize     int   `yaml:"subscriber_queue_size"`
	MaxStreamsPerUser       int   `yaml:"max_streams_per_user"`
	MaxSubscribersPerStream int   `yaml:"max_subscribers_per_stream"`
}

type WebSocketConfig struct {
	BatchIntervalMs    int   `yaml:"batch_interval_ms"`
	MaxMessageSize     int64 `yaml:"max_message_size"`
	HeartbeatIntervalS int   `yaml:"heartbeat_interval_s"`
}

type ViewerConfig struct {
	MaxTabsSoftLimit     int `yaml:"max_tabs_soft_limit"`
	MaxTabsHardLimit     int `yaml:"max_tabs_hard_limit"`
	PauseQueueMaxEntries int `yaml:"pause_queue_max_entries"`
	PauseQueueMaxBytes   int `yaml:"pause_queue_max_bytes"`
	ClientMaxLogLines    int `yaml:"client_max_log_lines"`
}

type DisplayConfig struct {
	DefaultTheme           string `yaml:"default_theme" json:"default_theme"`
	DefaultTimestampFormat string `yaml:"default_timestamp_format" json:"default_timestamp_format"`
}

// V2: Authentication Configuration (Azure AD / OIDC)
type AuthConfig struct {
	Enabled     bool          `yaml:"enabled" json:"enabled"`
	Provider    string        `yaml:"provider" json:"provider"` // "azure_ad", "oidc", "none"
	AzureAD     AzureADConfig `yaml:"azure_ad" json:"azure_ad"`
	JWTSecret   string        `yaml:"jwt_secret" json:"jwt_secret"`
	SessionTTL  string        `yaml:"session_ttl" json:"session_ttl"`
	AdminRoles  []string      `yaml:"admin_roles" json:"admin_roles"`
}

type AzureADConfig struct {
	TenantID     string   `yaml:"tenant_id" json:"tenant_id"`
	ClientID     string   `yaml:"client_id" json:"client_id"`
	ClientSecret string   `yaml:"client_secret" json:"client_secret"`
	RedirectURL  string   `yaml:"redirect_url" json:"redirect_url"`
	Scopes       []string `yaml:"scopes" json:"scopes"`
}

// V2: S3 Export Configuration
type S3ExportConfig struct {
	Enabled         bool   `yaml:"enabled" json:"enabled"`
	Bucket          string `yaml:"bucket" json:"bucket"`
	Region          string `yaml:"region" json:"region"`
	Prefix          string `yaml:"prefix" json:"prefix"`
	Endpoint        string `yaml:"endpoint" json:"endpoint"` // For MinIO/LocalStack or custom S3
	AccessKeyID     string `yaml:"access_key_id" json:"access_key_id"`
	SecretAccessKey string `yaml:"secret_access_key" json:"secret_access_key"`
	UseIAMRole      bool   `yaml:"use_iam_role" json:"use_iam_role"`
}

// V2: Data Redaction / Masking Configuration
type RedactionRule struct {
	ID      string `yaml:"id" json:"id"`
	Name    string `yaml:"name" json:"name"`
	Pattern string `yaml:"pattern" json:"pattern"`
	Mask    string `yaml:"mask" json:"mask"`
	Enabled bool   `yaml:"enabled" json:"enabled"`
}

type RedactionConfig struct {
	Enabled bool            `yaml:"enabled" json:"enabled"`
	Rules   []RedactionRule `yaml:"rules" json:"rules"`
}

// V2: Platform Feature Toggles
type FeaturesConfig struct {
	MultiContainerMerge bool `yaml:"multi_container_merge" json:"multi_container_merge"`
	PodGroups           bool `yaml:"pod_groups" json:"pod_groups"`
	PodEvents           bool `yaml:"pod_events" json:"pod_events"`
}

func DefaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			Host:        "0.0.0.0",
			Port:        8080,
			CorsOrigins: []string{"http://localhost:5173", "http://127.0.0.1:5173"},
		},
		Database: DatabaseConfig{
			Path: "./data/lora.db",
		},
		Streaming: StreamingConfig{
			DefaultTailLines:        500,
			RingBufferMaxEntries:    1000,
			RingBufferMaxBytes:      2 * 1024 * 1024,
			TotalMemoryBudget:       200 * 1024 * 1024,
			SubscriberQueueSize:     500,
			MaxStreamsPerUser:       5,
			MaxSubscribersPerStream: 50,
		},
		WebSocket: WebSocketConfig{
			BatchIntervalMs:    200,
			MaxMessageSize:     256 * 1024,
			HeartbeatIntervalS: 30,
		},
		Viewer: ViewerConfig{
			MaxTabsSoftLimit:     10,
			MaxTabsHardLimit:     20,
			PauseQueueMaxEntries: 5000,
			PauseQueueMaxBytes:   5 * 1024 * 1024,
			ClientMaxLogLines:    50000,
		},
		Display: DisplayConfig{
			DefaultTheme:           "dark",
			DefaultTimestampFormat: "local_absolute",
		},
		Auth: AuthConfig{
			Enabled:    false,
			Provider:   "none",
			JWTSecret:  "lora-jwt-default-secret-key-change-in-prod",
			SessionTTL: "24h",
			AdminRoles: []string{"lora-admin", "admin"},
			AzureAD: AzureADConfig{
				Scopes: []string{"openid", "profile", "email"},
			},
		},
		S3Export: S3ExportConfig{
			Enabled:    false,
			Region:     "us-east-1",
			Prefix:     "lora-exports/",
			UseIAMRole: true,
		},
		Redaction: RedactionConfig{
			Enabled: false,
			Rules: []RedactionRule{
				{
					ID:      "aws-key",
					Name:    "AWS Access Key",
					Pattern: `AKIA[0-9A-Z]{16}`,
					Mask:    `[REDACTED_AWS_KEY]`,
					Enabled: true,
				},
				{
					ID:      "bearer-token",
					Name:    "Bearer Token / JWT",
					Pattern: `Bearer\s+[a-zA-Z0-9_\-\.]{20,}`,
					Mask:    `Bearer [REDACTED_TOKEN]`,
					Enabled: true,
				},
				{
					ID:      "password-key",
					Name:    "Password in KV",
					Pattern: `(?i)(password|passwd|secret|token)\s*[:=]\s*["']?([^"' \t\r\n]{4,})["']?`,
					Mask:    `$1=[REDACTED]`,
					Enabled: true,
				},
			},
		},
		Features: FeaturesConfig{
			MultiContainerMerge: true,
			PodGroups:           true,
			PodEvents:           true,
		},
	}
}

func LoadConfig(path string) (*Config, error) {
	if path == "" {
		path = os.Getenv("LORA_CONFIG_PATH")
		if path == "" {
			path = "./configs/lora-config.yaml"
		}
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// Auto-create default config with zero clusters for first-time UI onboarding
			dir := filepath.Dir(path)
			if dir != "" && dir != "." {
				_ = os.MkdirAll(dir, 0755)
			}
			defaultCfg := DefaultConfig()
			_ = SaveConfig(path, defaultCfg)
			return defaultCfg, nil
		}
		return nil, fmt.Errorf("failed to read configuration file at %s: %w", path, err)
	}

	cfg := DefaultConfig()
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("failed to parse YAML configuration: %w", err)
	}

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return cfg, nil
}

func SaveConfig(path string, cfg *Config) error {
	if path == "" {
		path = os.Getenv("LORA_CONFIG_PATH")
		if path == "" {
			path = "./configs/lora-config.yaml"
		}
	}

	dir := filepath.Dir(path)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create config dir %s: %w", dir, err)
		}
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to serialize config to YAML: %w", err)
	}

	// Write to temporary file first, then rename for atomic file update
	tmpPath := fmt.Sprintf("%s.tmp", path)
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write temp config file %s: %w", tmpPath, err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		// On Windows, target might need removal if rename fails
		_ = os.Remove(path)
		if err := os.Rename(tmpPath, path); err != nil {
			return fmt.Errorf("failed to replace config file %s: %w", path, err)
		}
	}

	return nil
}

func (c *Config) AddOrUpdateCluster(cluster ClusterConfig) {
	for i, existing := range c.Clusters {
		if existing.ID == cluster.ID {
			c.Clusters[i] = cluster
			return
		}
	}
	c.Clusters = append(c.Clusters, cluster)
}

func (c *Config) RemoveCluster(clusterID string) bool {
	for i, existing := range c.Clusters {
		if existing.ID == clusterID {
			c.Clusters = append(c.Clusters[:i], c.Clusters[i+1:]...)
			return true
		}
	}
	return false
}

func (c *Config) Validate() error {
	if c.Server.Port <= 0 || c.Server.Port > 65535 {
		return fmt.Errorf("server.port must be between 1 and 65535")
	}

	if c.Database.Path == "" {
		c.Database.Path = "./data/lora.db"
	}

	clusterIDs := make(map[string]bool)
	for _, cluster := range c.Clusters {
		if cluster.ID == "" {
			return fmt.Errorf("all clusters must have a non-empty id")
		}
		if clusterIDs[cluster.ID] {
			return fmt.Errorf("duplicate cluster id: %s", cluster.ID)
		}
		clusterIDs[cluster.ID] = true

		if cluster.Kubeconfig.Path != "" {
			cleanPath := filepath.Clean(cluster.Kubeconfig.Path)
			_ = cleanPath
		}
	}

	if c.Streaming.DefaultTailLines <= 0 {
		c.Streaming.DefaultTailLines = 500
	}
	if c.Streaming.RingBufferMaxEntries <= 0 {
		c.Streaming.RingBufferMaxEntries = 1000
	}
	if c.Streaming.RingBufferMaxBytes <= 0 {
		c.Streaming.RingBufferMaxBytes = 2 * 1024 * 1024
	}
	if c.Streaming.SubscriberQueueSize <= 0 {
		c.Streaming.SubscriberQueueSize = 500
	}
	if c.WebSocket.BatchIntervalMs <= 0 {
		c.WebSocket.BatchIntervalMs = 200
	}
	if c.WebSocket.HeartbeatIntervalS <= 0 {
		c.WebSocket.HeartbeatIntervalS = 30
	}

	return nil
}

