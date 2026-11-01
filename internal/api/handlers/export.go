package handlers

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"lora/internal/config"
	"lora/internal/connection"
	"lora/internal/export"
)

type ExportHandler struct {
	cfg     *config.Config
	connMgr *connection.Manager
}

func NewExportHandler(cfg *config.Config, connMgr *connection.Manager) *ExportHandler {
	return &ExportHandler{
		cfg:     cfg,
		connMgr: connMgr,
	}
}

type S3ExportRequest struct {
	Container  string `json:"container"`
	LogContent string `json:"log_content"`
}

func (h *ExportHandler) ExportToS3(w http.ResponseWriter, r *http.Request) {
	clusterID := chi.URLParam(r, "id")
	namespace := chi.URLParam(r, "ns")
	podName := chi.URLParam(r, "pod")

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error": "failed to read request body"}`, http.StatusBadRequest)
		return
	}

	var req S3ExportRequest
	if len(body) > 0 {
		_ = json.Unmarshal(body, &req)
	}

	if req.Container == "" {
		req.Container = "app"
	}

	exporter := export.NewS3Exporter(h.cfg.S3Export)
	result, err := exporter.ExportLog(r.Context(), clusterID, namespace, podName, req.Container, req.LogContent)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

