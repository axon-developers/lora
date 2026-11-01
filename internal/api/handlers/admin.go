package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"runtime"
	"time"

	"lora/internal/config"
	"lora/internal/connection"
	"lora/internal/database"
	"lora/internal/redaction"
)

type AdminHandler struct {
	connMgr *connection.Manager
	db      *database.DB
	cfg     *config.Config
}

func NewAdminHandler(connMgr *connection.Manager, db *database.DB, cfg *config.Config) *AdminHandler {
	return &AdminHandler{
		connMgr: connMgr,
		db:      db,
		cfg:     cfg,
	}
}

func (h *AdminHandler) GetConnections(w http.ResponseWriter, r *http.Request) {
	totalStreams, totalSubs, streams := h.connMgr.GetStats()

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"total_active_streams": totalStreams,
		"total_subscribers":    totalSubs,
		"memory_alloc_bytes":   m.Alloc,
		"memory_sys_bytes":     m.Sys,
		"streams":              streams,
	})
}

func (h *AdminHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	// Try loading from SQLite first, fallback to in-memory config
	var valueJSON string
	err := h.db.QueryRowContext(r.Context(), "SELECT value_json FROM app_settings WHERE key = 'app_config'").Scan(&valueJSON)
	w.Header().Set("Content-Type", "application/json")

	if err == nil && valueJSON != "" {
		w.Write([]byte(valueJSON))
		return
	}

	_ = json.NewEncoder(w).Encode(h.cfg)
}

func (h *AdminHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error": "failed to read request body"}`, http.StatusBadRequest)
		return
	}

	var newCfg config.Config
	if err := json.Unmarshal(body, &newCfg); err != nil {
		http.Error(w, `{"error": "invalid json payload"}`, http.StatusBadRequest)
		return
	}

	// Keep existing clusters if payload didn't include them
	if len(newCfg.Clusters) == 0 && len(h.cfg.Clusters) > 0 {
		newCfg.Clusters = h.cfg.Clusters
	}

	// Update in-memory config
	*h.cfg = newCfg

	// Persist to lora-config.yaml
	_ = config.SaveConfig("", &newCfg)

	// Persist to SQLite
	query := `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('app_config', ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`
	_, _ = h.db.ExecContext(r.Context(), query, string(body))

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

type TestRedactionRequest struct {
	SampleText string                 `json:"sample_text"`
	Rules      []config.RedactionRule `json:"rules"`
}

func (h *AdminHandler) TestRedaction(w http.ResponseWriter, r *http.Request) {
	var req TestRedactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid json payload"}`, http.StatusBadRequest)
		return
	}

	result := redaction.TestRedaction(req.SampleText, req.Rules)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func (h *AdminHandler) RestartServer(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Server restart initiated. Reconnecting in 3 seconds...",
	})

	// Trigger restart in background
	go func() {
		time.Sleep(500 * time.Millisecond)
		// On Windows/Linux, triggering os.Exit(0) under a process supervisor or self-exec
		os.Exit(0)
	}()
}

