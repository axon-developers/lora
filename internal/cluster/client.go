package cluster

import (
	"context"
	"fmt"
	"sync"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

type Status string

const (
	StatusHealthy     Status = "HEALTHY"
	StatusAuthExpired Status = "AUTH_EXPIRED"
	StatusUnreachable Status = "UNREACHABLE"
	StatusDisabled    Status = "DISABLED"
	StatusError       Status = "ERROR"
)

type ClusterInfo struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Environment  string    `json:"environment"`
	Status       Status    `json:"status"`
	LastChecked  time.Time `json:"last_checked"`
	ErrorMessage string    `json:"error_message,omitempty"`
	Enabled      bool      `json:"enabled"`
}

type Client struct {
	mu           sync.RWMutex
	ID           string
	Name         string
	Environment  string
	ConfigPath   string
	Context      string
	Enabled      bool
	Status       Status
	LastChecked  time.Time
	ErrorMessage string

	RestConfig *rest.Config
	Clientset  kubernetes.Interface
}

func (c *Client) GetStatus() ClusterInfo {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return ClusterInfo{
		ID:           c.ID,
		Name:         c.Name,
		Environment:  c.Environment,
		Status:       c.Status,
		LastChecked:  c.LastChecked,
		ErrorMessage: c.ErrorMessage,
		Enabled:      c.Enabled,
	}
}

func (c *Client) SetStatus(status Status, errMsg string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.Status = status
	c.ErrorMessage = errMsg
	c.LastChecked = time.Now()
}

func (c *Client) CheckHealth(ctx context.Context) error {
	if !c.Enabled {
		c.SetStatus(StatusDisabled, "Cluster is disabled")
		return nil
	}

	c.mu.RLock()
	cs := c.Clientset
	c.mu.RUnlock()

	if cs == nil {
		c.SetStatus(StatusError, "Kubernetes client not initialized")
		return fmt.Errorf("kubernetes client not initialized")
	}

	checkCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_ = checkCtx

	_, err := cs.Discovery().ServerVersion()
	if err != nil {
		errStr := err.Error()
		if isUnauthorized(err) {
			c.SetStatus(StatusAuthExpired, "Token expired or unauthorized. Please re-run kconnect and click Reconnect.")
		} else {
			c.SetStatus(StatusUnreachable, fmt.Sprintf("Cluster unreachable: %s", errStr))
		}
		return err
	}

	c.SetStatus(StatusHealthy, "")
	return nil
}

func isUnauthorized(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return containsAny(s, "Unauthorized", "401", "token expired", "certificate has expired")
}

func containsAny(s string, substrs ...string) bool {
	for _, sub := range substrs {
		if sub != "" && contains(s, sub) {
			return true
		}
	}
	return false
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || (len(substr) > 0 && searchSubstr(s, substr)))
}

func searchSubstr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

