package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"lora/internal/auth"
)

type AuthHandler struct {
	authSvc *auth.AuthService
}

func NewAuthHandler(authSvc *auth.AuthService) *AuthHandler {
	return &AuthHandler{authSvc: authSvc}
}

func (h *AuthHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	user := h.authSvc.GetUser(r)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"enabled":   h.authSvc.IsEnabled(),
		"user":      user,
		"anonymous": !h.authSvc.IsEnabled(),
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.authSvc.IsEnabled() {
		http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
		return
	}
	loginURL := h.authSvc.GetAzureADLoginURL()
	http.Redirect(w, r, loginURL, http.StatusTemporaryRedirect)
}

func (h *AuthHandler) Callback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, `{"error": "missing authorization code from identity provider"}`, http.StatusBadRequest)
		return
	}

	session, err := h.authSvc.ExchangeAzureADCode(r.Context(), code)
	if err != nil {
		http.Error(w, `{"error": "failed to exchange code: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	token, err := h.authSvc.GenerateJWT(session)
	if err != nil {
		http.Error(w, `{"error": "failed to generate session token"}`, http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "lora_session",
		Value:    token,
		Path:     "/",
		Expires:  time.Unix(session.ExpiresAt, 0),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "lora_session",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

