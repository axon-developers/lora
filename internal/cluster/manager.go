package cluster

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"lora/internal/config"
)

type Manager struct {
	mu       sync.RWMutex
	clusters map[string]*Client
	stopCh   chan struct{}
}

func NewManager(cfg *config.Config) *Manager {
	m := &Manager{
		clusters: make(map[string]*Client),
		stopCh:   make(chan struct{}),
	}

	for _, c := range cfg.Clusters {
		c.NormalizeRegions()
		effectivePath := c.GetEffectiveKubeconfigPath()
		client := &Client{
			ID:               c.ID,
			Name:             c.Name,
			Environment:      c.Environment,
			Region:           c.Region,
			Regions:          c.Regions,
			ActiveRegion:     c.ActiveRegion,
			RegionalContexts: c.RegionalContexts,
			ConfigPath:       effectivePath,
			Context:          c.Kubeconfig.Context,
			Enabled:          c.Enabled,
			Status:           StatusDisabled,
		}

		if c.Enabled {
			restCfg, cs, err := BuildClientFromKubeconfig(effectivePath, c.Kubeconfig.Context)
			if err != nil {
				client.Status = StatusError
				client.ErrorMessage = err.Error()
				slog.Warn("failed to initialize cluster on startup", "cluster_id", c.ID, "error", err)
			} else {
				client.RestConfig = restCfg
				client.Clientset = cs
				client.Status = StatusHealthy
			}
		}

		m.clusters[c.ID] = client
	}

	return m
}

func (m *Manager) StartHealthChecks(ctx context.Context, defaultInterval time.Duration) {
	if defaultInterval <= 0 {
		defaultInterval = 30 * time.Second
	}

	ticker := time.NewTicker(defaultInterval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-m.stopCh:
				return
			case <-ticker.C:
				m.checkAll(ctx)
			}
		}
	}()

	// Trigger initial check immediately in background
	go m.checkAll(ctx)
}

func (m *Manager) checkAll(ctx context.Context) {
	m.mu.RLock()
	clients := make([]*Client, 0, len(m.clusters))
	for _, c := range m.clusters {
		clients = append(clients, c)
	}
	m.mu.RUnlock()

	for _, c := range clients {
		_ = c.CheckHealth(ctx)
	}
}

func (m *Manager) Get(clusterID string) (*Client, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	client, ok := m.clusters[clusterID]
	if !ok {
		return nil, fmt.Errorf("cluster '%s' not found", clusterID)
	}
	return client, nil
}

func (m *Manager) List() []ClusterInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	list := make([]ClusterInfo, 0, len(m.clusters))
	for _, c := range m.clusters {
		list = append(list, c.GetStatus())
	}
	return list
}

func (m *Manager) Reload(ctx context.Context, clusterID string) (*ClusterInfo, error) {
	m.mu.Lock()
	client, ok := m.clusters[clusterID]
	if !ok {
		m.mu.Unlock()
		return nil, fmt.Errorf("cluster '%s' not found", clusterID)
	}
	m.mu.Unlock()

	client.mu.Lock()
	defer client.mu.Unlock()

	slog.Info("reloading cluster configuration and client", "cluster_id", clusterID, "path", client.ConfigPath)

	restCfg, cs, err := BuildClientFromKubeconfig(client.ConfigPath, client.Context)
	if err != nil {
		client.Status = StatusError
		client.ErrorMessage = fmt.Sprintf("Reload failed: %v", err)
		client.LastChecked = time.Now()
		info := client.GetStatus()
		return &info, err
	}

	client.RestConfig = restCfg
	client.Clientset = cs
	client.mu.Unlock()

	// Verify health immediately
	err = client.CheckHealth(ctx)
	client.mu.Lock()

	info := client.GetStatus()
	return &info, err
}

func (m *Manager) AddOrUpdate(ctx context.Context, c config.ClusterConfig) (*ClusterInfo, error) {
	c.NormalizeRegions()
	effectivePath := c.GetEffectiveKubeconfigPath()

	m.mu.Lock()
	client, exists := m.clusters[c.ID]
	if !exists {
		client = &Client{
			ID:               c.ID,
			Name:             c.Name,
			Environment:      c.Environment,
			Region:           c.Region,
			Regions:          c.Regions,
			ActiveRegion:     c.ActiveRegion,
			RegionalContexts: c.RegionalContexts,
			ConfigPath:       effectivePath,
			Context:          c.Kubeconfig.Context,
			Enabled:          c.Enabled,
			Status:           StatusDisabled,
		}
		m.clusters[c.ID] = client
	} else {
		client.mu.Lock()
		client.Name = c.Name
		client.Environment = c.Environment
		client.Region = c.Region
		client.Regions = c.Regions
		client.ActiveRegion = c.ActiveRegion
		client.RegionalContexts = c.RegionalContexts
		client.ConfigPath = effectivePath
		client.Context = c.Kubeconfig.Context
		client.Enabled = c.Enabled
		client.mu.Unlock()
	}
	m.mu.Unlock()

	if !c.Enabled {
		client.SetStatus(StatusDisabled, "Cluster is disabled")
		info := client.GetStatus()
		return &info, nil
	}

	restCfg, cs, err := BuildClientFromKubeconfig(effectivePath, c.Kubeconfig.Context)
	client.mu.Lock()
	if err != nil {
		client.Status = StatusError
		client.ErrorMessage = err.Error()
		client.mu.Unlock()
		info := client.GetStatus()
		return &info, err
	}
	client.RestConfig = restCfg
	client.Clientset = cs
	client.mu.Unlock()

	_ = client.CheckHealth(ctx)
	info := client.GetStatus()
	return &info, nil
}

func (m *Manager) SwitchRegion(ctx context.Context, clusterID, targetRegion string, cfg *config.Config) (*ClusterInfo, error) {
	if targetRegion == "" {
		return nil, fmt.Errorf("target region cannot be empty")
	}

	m.mu.RLock()
	client, exists := m.clusters[clusterID]
	m.mu.RUnlock()
	if !exists {
		return nil, fmt.Errorf("cluster '%s' not found", clusterID)
	}

	client.mu.Lock()
	client.ActiveRegion = targetRegion
	client.Region = targetRegion

	// Determine matching context for targetRegion
	var matchedContext string
	if client.RegionalContexts != nil && client.RegionalContexts[targetRegion] != "" {
		matchedContext = client.RegionalContexts[targetRegion]
	} else {
		// Discover contexts from kubeconfig
		discovered, err := DiscoverKubeconfigContexts(client.ConfigPath)
		if err == nil {
			for _, dc := range discovered {
				if dc.Region == targetRegion || strings.Contains(strings.ToLower(dc.Name), strings.ToLower(targetRegion)) || strings.Contains(strings.ToLower(dc.Server), strings.ToLower(targetRegion)) {
					matchedContext = dc.Name
					break
				}
			}
		}
	}

	if matchedContext != "" {
		client.Context = matchedContext
		if client.RegionalContexts == nil {
			client.RegionalContexts = make(map[string]string)
		}
		client.RegionalContexts[targetRegion] = matchedContext
	}

	configPath := client.ConfigPath
	activeContext := client.Context
	client.mu.Unlock()

	// Update cfg in memory and persist
	if cfg != nil {
		for i := range cfg.Clusters {
			if cfg.Clusters[i].ID == clusterID {
				cfg.Clusters[i].ActiveRegion = targetRegion
				cfg.Clusters[i].Region = targetRegion
				if matchedContext != "" {
					cfg.Clusters[i].Kubeconfig.Context = matchedContext
					if cfg.Clusters[i].RegionalContexts == nil {
						cfg.Clusters[i].RegionalContexts = make(map[string]string)
					}
					cfg.Clusters[i].RegionalContexts[targetRegion] = matchedContext
				}
				break
			}
		}
		_ = config.SaveConfig("", cfg)
	}

	// Rebuild client-go connection for this context
	restCfg, cs, err := BuildClientFromKubeconfig(configPath, activeContext)
	client.mu.Lock()
	if err != nil {
		client.Status = StatusError
		client.ErrorMessage = fmt.Sprintf("Failed to connect to region %s: %v", targetRegion, err)
		client.mu.Unlock()
		info := client.GetStatus()
		return &info, err
	}
	client.RestConfig = restCfg
	client.Clientset = cs
	client.mu.Unlock()

	_ = client.CheckHealth(ctx)
	info := client.GetStatus()
	return &info, nil
}

func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.clusters[id]; !exists {
		return fmt.Errorf("cluster '%s' not found", id)
	}

	delete(m.clusters, id)
	return nil
}

func (m *Manager) Stop() {
	close(m.stopCh)
}

