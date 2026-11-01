package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"lora/internal/api"
	"lora/internal/cluster"
	"lora/internal/config"
	"lora/internal/connection"
	"lora/internal/database"
	"lora/internal/kubernetes"
	"lora/internal/logging"
	"lora/internal/streaming"
)

func main() {
	// Initialize logger
	logger := logging.InitLogger(false, slog.LevelInfo)
	logger.Info("starting LORA - Kubernetes Log Viewer")

	// Load configuration
	cfg, err := config.LoadConfig("")
	if err != nil {
		logger.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	logger.Info("configuration loaded successfully",
		"port", cfg.Server.Port,
		"clusters_count", len(cfg.Clusters),
		"db_path", cfg.Database.Path,
	)

	// Initialize SQLite database
	db, err := database.Open(cfg.Database.Path)
	if err != nil {
		logger.Error("failed to initialize sqlite database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	// Ensure data and kubeconfigs directories exist
	_ = os.MkdirAll("./data/kubeconfigs", 0755)

	// Initialize Cluster Manager
	clusterMgr := cluster.NewManager(cfg)
	clusterMgr.StartHealthChecks(context.Background(), 30*time.Second)
	defer clusterMgr.Stop()

	// Initialize Connection Manager
	connMgr := connection.NewManager(
		cfg.Streaming.RingBufferMaxEntries,
		cfg.Streaming.RingBufferMaxBytes,
		cfg.Streaming.SubscriberQueueSize,
		cfg.Streaming.DefaultTailLines,
	)
	connMgr.SetStreamFunc(kubernetes.StreamPodLogs)

	// Initialize WebSocket Hub
	wsHub := streaming.NewHub(
		clusterMgr,
		connMgr,
		cfg.WebSocket.BatchIntervalMs,
		cfg.WebSocket.MaxMessageSize,
		cfg.WebSocket.HeartbeatIntervalS,
	)

	// Initialize HTTP Router
	router := api.NewRouter(cfg, clusterMgr, connMgr, db, wsHub)

	serverAddr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	srv := &http.Server{
		Addr:         serverAddr,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Server runner
	serverErrCh := make(chan error, 1)
	go func() {
		logger.Info("HTTP and WebSocket server listening", "address", serverAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErrCh <- err
		}
	}()

	// Graceful shutdown handling
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErrCh:
		logger.Error("server failed unexpectedly", "error", err)
		os.Exit(1)
	case sig := <-sigCh:
		logger.Info("received shutdown signal", "signal", sig.String())
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("server forced to shutdown", "error", err)
	} else {
		logger.Info("server exited cleanly")
	}
}

