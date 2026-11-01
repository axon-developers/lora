package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"lora/internal/cluster"
	"lora/internal/config"
)

type ClusterHandler struct {
	clusterMgr *cluster.Manager
	cfg        *config.Config
}

func NewClusterHandler(mgr *cluster.Manager, cfg *config.Config) *ClusterHandler {
	return &ClusterHandler{
		clusterMgr: mgr,
		cfg:        cfg,
	}
}

func (h *ClusterHandler) ListClusters(w http.ResponseWriter, r *http.Request) {
	clusters := h.clusterMgr.List()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(clusters)
}

func (h *ClusterHandler) ReconnectCluster(w http.ResponseWriter, r *http.Request) {
	clusterID := chi.URLParam(r, "id")
	if clusterID == "" {
		http.Error(w, `{"error": "cluster id is required"}`, http.StatusBadRequest)
		return
	}

	info, err := h.clusterMgr.Reload(r.Context(), clusterID)
	w.Header().Set("Content-Type", "application/json")

	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success":    false,
			"cluster_id": clusterID,
			"status":     info.Status,
			"error":      info.ErrorMessage,
		})
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"cluster_id": clusterID,
		"status":     info.Status,
		"message":    "Kubeconfig reloaded and connectivity verified",
	})
}

type KconnectRequest struct {
	Password string `json:"password,omitempty"`
	MFACode  string `json:"mfa_code,omitempty"`
	Region   string `json:"region,omitempty"`
}

type SwitchRegionRequest struct {
	Region string `json:"region"`
}

func (h *ClusterHandler) ExecuteKconnect(w http.ResponseWriter, r *http.Request) {
	clusterID := chi.URLParam(r, "id")
	var targetCluster *config.ClusterConfig
	for _, c := range h.cfg.Clusters {
		if c.ID == clusterID {
			targetCluster = &c
			break
		}
	}

	if targetCluster == nil {
		http.Error(w, fmt.Sprintf(`{"error": "cluster '%s' not found"}`, clusterID), http.StatusNotFound)
		return
	}

	var req KconnectRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	targetRegion := req.Region
	if targetRegion == "" {
		targetRegion = targetCluster.ActiveRegion
		if targetRegion == "" {
			targetRegion = targetCluster.Region
		}
	}

	result, err := cluster.RunKconnect(r.Context(), *targetCluster, req.Password, req.MFACode, targetRegion)
	w.Header().Set("Content-Type", "application/json")

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"result":  result,
			"error":   err.Error(),
		})
		return
	}

	if targetRegion != "" {
		targetCluster.ActiveRegion = targetRegion
		targetCluster.Region = targetRegion
		if targetCluster.RegionalContexts != nil && targetCluster.RegionalContexts[targetRegion] != "" {
			targetCluster.Kubeconfig.Context = targetCluster.RegionalContexts[targetRegion]
		}
		h.cfg.AddOrUpdateCluster(*targetCluster)
		_ = config.SaveConfig("", h.cfg)
	}

	// Successfully executed kconnect: reload cluster client
	info, reloadErr := h.clusterMgr.AddOrUpdate(r.Context(), *targetCluster)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       reloadErr == nil,
		"result":        result,
		"cluster":       info,
		"reload_err":    reloadErr,
		"status":        info.Status,
		"region":        targetRegion,
		"auto_reloaded": true,
	})
}

func (h *ClusterHandler) SwitchRegion(w http.ResponseWriter, r *http.Request) {
	clusterID := chi.URLParam(r, "id")
	var req SwitchRegionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Region == "" {
		http.Error(w, `{"error": "valid region is required"}`, http.StatusBadRequest)
		return
	}

	info, err := h.clusterMgr.SwitchRegion(r.Context(), clusterID, req.Region, h.cfg)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"cluster": info,
		})
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"cluster": info,
		"region":  req.Region,
		"message": fmt.Sprintf("Switched active connection to region %s", req.Region),
	})
}

func (h *ClusterHandler) GetClusterConfig(w http.ResponseWriter, r *http.Request) {
	clusterID := chi.URLParam(r, "id")
	for _, c := range h.cfg.Clusters {
		if c.ID == clusterID {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(c)
			return
		}
	}
	http.Error(w, `{"error": "cluster not found"}`, http.StatusNotFound)
}

func (h *ClusterHandler) AddCluster(w http.ResponseWriter, r *http.Request) {
	var c config.ClusterConfig
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, `{"error": "invalid json payload"}`, http.StatusBadRequest)
		return
	}

	if c.ID == "" || c.Name == "" {
		http.Error(w, `{"error": "cluster id and name are required"}`, http.StatusBadRequest)
		return
	}

	// Update config in memory
	h.cfg.AddOrUpdateCluster(c)
	// Persist to lora-config.yaml
	_ = config.SaveConfig("", h.cfg)

	// Dynamically register cluster with ClusterManager
	info, err := h.clusterMgr.AddOrUpdate(r.Context(), c)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusAccepted) // Created/updated but health check pending or errored
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"cluster": info,
			"warning": err.Error(),
		})
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"cluster": info,
	})
}

func (h *ClusterHandler) UpdateCluster(w http.ResponseWriter, r *http.Request) {
	clusterID := chi.URLParam(r, "id")
	var c config.ClusterConfig
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, `{"error": "invalid json payload"}`, http.StatusBadRequest)
		return
	}
	c.ID = clusterID

	h.cfg.AddOrUpdateCluster(c)
	_ = config.SaveConfig("", h.cfg)

	info, err := h.clusterMgr.AddOrUpdate(r.Context(), c)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"cluster": info,
			"warning": err.Error(),
		})
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"cluster": info,
	})
}

func (h *ClusterHandler) DeleteCluster(w http.ResponseWriter, r *http.Request) {
	clusterID := chi.URLParam(r, "id")
	if !h.cfg.RemoveCluster(clusterID) {
		http.Error(w, `{"error": "cluster not found"}`, http.StatusNotFound)
		return
	}

	_ = config.SaveConfig("", h.cfg)
	_ = h.clusterMgr.Delete(clusterID)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"cluster_id": clusterID,
		"message":    "Cluster deleted successfully",
	})
}

type DiscoverContextsRequest struct {
	KubeconfigPath string `json:"kubeconfig_path,omitempty"`
}

func (h *ClusterHandler) DiscoverContexts(w http.ResponseWriter, r *http.Request) {
	var req DiscoverContextsRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	contexts, err := cluster.DiscoverKubeconfigContexts(req.KubeconfigPath)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"contexts": contexts,
	})
}
