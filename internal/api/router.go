package api

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"lora/frontend"
	"lora/internal/api/handlers"
	"lora/internal/auth"
	"lora/internal/cluster"
	"lora/internal/config"
	"lora/internal/connection"
	"lora/internal/database"
	"lora/internal/streaming"
)

func NewRouter(
	cfg *config.Config,
	clusterMgr *cluster.Manager,
	connMgr *connection.Manager,
	db *database.DB,
	wsHub *streaming.Hub,
) http.Handler {
	r := chi.NewRouter()

	// Base middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// CORS setup
	corsOrigins := cfg.Server.CorsOrigins
	if len(corsOrigins) == 0 {
		corsOrigins = []string{"*"}
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   corsOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health and readiness probes
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		clusters := clusterMgr.List()
		online := 0
		for _, c := range clusters {
			if c.Status == cluster.StatusHealthy {
				online++
			}
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ready":           true,
			"clusters_online": online,
			"clusters_total":  len(clusters),
		})
	})

	// Handlers
	authSvc := auth.NewAuthService(cfg.Auth)
	authHandler := handlers.NewAuthHandler(authSvc)
	clusterHandler := handlers.NewClusterHandler(clusterMgr, cfg)
	discoveryHandler := handlers.NewDiscoveryHandler(clusterMgr)
	exportHandler := handlers.NewExportHandler(cfg, connMgr)
	adminHandler := handlers.NewAdminHandler(connMgr, db, cfg)

	// API v1 routes
	r.Route("/api/v1", func(r chi.Router) {
		// Auth & User Session (V2)
		r.Get("/auth/status", authHandler.GetStatus)
		r.Get("/auth/login", authHandler.Login)
		r.Get("/auth/callback", authHandler.Callback)
		r.Post("/auth/logout", authHandler.Logout)

		// Optional Auth Middleware for protected endpoints
		r.Group(func(r chi.Router) {
			r.Use(authSvc.Middleware)

			// Clusters & Kconnect
			r.Get("/clusters", clusterHandler.ListClusters)
			r.Post("/clusters", clusterHandler.AddCluster)
			r.Post("/clusters/discover-contexts", clusterHandler.DiscoverContexts)
			r.Get("/clusters/{id}/config", clusterHandler.GetClusterConfig)
			r.Put("/clusters/{id}", clusterHandler.UpdateCluster)
			r.Delete("/clusters/{id}", clusterHandler.DeleteCluster)
			r.Post("/clusters/{id}/reconnect", clusterHandler.ReconnectCluster)
			r.Post("/clusters/{id}/kconnect/execute", clusterHandler.ExecuteKconnect)
			r.Post("/clusters/{id}/switch-region", clusterHandler.SwitchRegion)

			// Discovery & Events
			r.Get("/clusters/{id}/namespaces", discoveryHandler.ListNamespaces)
			r.Get("/clusters/{id}/namespaces/{ns}/pods", discoveryHandler.ListPods)
			r.Get("/clusters/{id}/namespaces/{ns}/pods/{pod}/containers", discoveryHandler.ListContainers)
			r.Get("/clusters/{id}/namespaces/{ns}/pods/{pod}/events", discoveryHandler.GetPodEvents)

			// S3 Log Export (V2)
			r.Post("/clusters/{id}/namespaces/{ns}/pods/{pod}/export-s3", exportHandler.ExportToS3)

			// Admin
			r.Get("/admin/connections", adminHandler.GetConnections)
			r.Get("/admin/settings", adminHandler.GetSettings)
			r.Put("/admin/settings", adminHandler.UpdateSettings)
			r.Post("/admin/restart", adminHandler.RestartServer)
			r.Post("/admin/redaction/test", adminHandler.TestRedaction)
		})
	})

	// WebSocket log streaming endpoint
	r.Get("/ws/v1/logs", wsHub.ServeWS)

	// Serve Frontend Single-Page App directly from embedded FS
	embeddedFS, err := frontend.GetFS()
	if err == nil {
		fileServer := http.FileServer(http.FS(embeddedFS))

		serveSPA := func(w http.ResponseWriter, r *http.Request) {
			cleanPath := strings.TrimPrefix(r.URL.Path, "/")
			if cleanPath == "" || cleanPath == "/" {
				cleanPath = "index.html"
			}

			// Try to open the requested static asset
			f, err := embeddedFS.Open(cleanPath)
			if err != nil {
				// Not a direct static asset file -> serve index.html for SPA routing
				indexData, err := fs.ReadFile(embeddedFS, "index.html")
				if err != nil {
					http.NotFound(w, r)
					return
				}
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write(indexData)
				return
			}
			defer f.Close()

			stat, err := f.Stat()
			if err != nil || stat.IsDir() {
				indexData, err := fs.ReadFile(embeddedFS, "index.html")
				if err != nil {
					http.NotFound(w, r)
					return
				}
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write(indexData)
				return
			}

			// File exists and is a regular static asset (e.g. js, css)
			fileServer.ServeHTTP(w, r)
		}

		r.Get("/", serveSPA)
		r.Get("/*", serveSPA)
	}

	return r
}

