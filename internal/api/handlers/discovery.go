package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"lora/internal/cluster"
	"lora/internal/kubernetes"
)

type DiscoveryHandler struct {
	clusterMgr *cluster.Manager
}

func NewDiscoveryHandler(mgr *cluster.Manager) *DiscoveryHandler {
	return &DiscoveryHandler{clusterMgr: mgr}
}

func (h *DiscoveryHandler) ListNamespaces(w http.ResponseWriter, r *http.Request) {
	clusterID := chi.URLParam(r, "id")
	client, err := h.clusterMgr.Get(clusterID)
	if err != nil {
		http.Error(w, `{"error": "cluster not found"}`, http.StatusNotFound)
		return
	}

	if client.Clientset == nil {
		http.Error(w, `{"error": "cluster client not initialized or token expired"}`, http.StatusUnauthorized)
		return
	}

	namespaces, err := kubernetes.ListNamespaces(r.Context(), client.Clientset)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"cluster_id": clusterID,
		"namespaces": namespaces,
	})
}

func (h *DiscoveryHandler) ListPods(w http.ResponseWriter, r *http.Request) {
	clusterID := chi.URLParam(r, "id")
	namespace := chi.URLParam(r, "ns")

	client, err := h.clusterMgr.Get(clusterID)
	if err != nil {
		http.Error(w, `{"error": "cluster not found"}`, http.StatusNotFound)
		return
	}

	if client.Clientset == nil {
		http.Error(w, `{"error": "cluster client not initialized or token expired"}`, http.StatusUnauthorized)
		return
	}

	pods, err := kubernetes.ListPods(r.Context(), client.Clientset, namespace)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"cluster_id": clusterID,
		"namespace":  namespace,
		"pods":       pods,
	})
}

func (h *DiscoveryHandler) ListContainers(w http.ResponseWriter, r *http.Request) {
	clusterID := chi.URLParam(r, "id")
	namespace := chi.URLParam(r, "ns")
	podName := chi.URLParam(r, "pod")

	client, err := h.clusterMgr.Get(clusterID)
	if err != nil {
		http.Error(w, `{"error": "cluster not found"}`, http.StatusNotFound)
		return
	}

	if client.Clientset == nil {
		http.Error(w, `{"error": "cluster client not initialized or token expired"}`, http.StatusUnauthorized)
		return
	}

	containers, err := kubernetes.ListContainers(r.Context(), client.Clientset, namespace, podName)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"pod_name":   podName,
		"containers": containers,
	})
}

func (h *DiscoveryHandler) GetPodEvents(w http.ResponseWriter, r *http.Request) {
	clusterID := chi.URLParam(r, "id")
	namespace := chi.URLParam(r, "ns")
	podName := chi.URLParam(r, "pod")

	client, err := h.clusterMgr.Get(clusterID)
	if err != nil {
		http.Error(w, `{"error": "cluster not found"}`, http.StatusNotFound)
		return
	}

	if client.Clientset == nil {
		http.Error(w, `{"error": "cluster client not initialized or token expired"}`, http.StatusUnauthorized)
		return
	}

	events, err := kubernetes.ListPodEvents(r.Context(), client.Clientset, namespace, podName)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"pod_name":  podName,
		"namespace": namespace,
		"events":    events,
	})
}


