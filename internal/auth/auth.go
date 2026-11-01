package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"lora/internal/config"
)

type contextKey string

const UserContextKey = contextKey("lora_user")

type UserSession struct {
	Subject   string   `json:"sub"`
	Email     string   `json:"email"`
	Name      string   `json:"name"`
	Roles     []string `json:"roles"`
	IsAdmin   bool     `json:"is_admin"`
	ExpiresAt int64    `json:"exp"`
}

var DefaultLocalAdmin = &UserSession{
	Subject:   "local-admin",
	Email:     "admin@local.host",
	Name:      "Local Administrator",
	Roles:     []string{"admin", "lora-admin"},
	IsAdmin:   true,
	ExpiresAt: time.Now().Add(365 * 24 * time.Hour).Unix(),
}

type AuthService struct {
	cfg config.AuthConfig
}

func NewAuthService(cfg config.AuthConfig) *AuthService {
	return &AuthService{cfg: cfg}
}

func (s *AuthService) IsEnabled() bool {
	return s.cfg.Enabled
}

func (s *AuthService) GetUser(r *http.Request) *UserSession {
	if !s.cfg.Enabled {
		return DefaultLocalAdmin
	}

	u, ok := r.Context().Value(UserContextKey).(*UserSession)
	if ok && u != nil {
		return u
	}
	return nil
}

// GenerateJWT creates an HMAC-SHA256 signed JWT for the user session
func (s *AuthService) GenerateJWT(session *UserSession) (string, error) {
	headerJSON := `{"alg":"HS256","typ":"JWT"}`
	headerB64 := base64.RawURLEncoding.EncodeToString([]byte(headerJSON))

	payloadBytes, err := json.Marshal(session)
	if err != nil {
		return "", err
	}
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadBytes)

	toSign := fmt.Sprintf("%s.%s", headerB64, payloadB64)
	secret := []byte(s.cfg.JWTSecret)
	if len(secret) == 0 {
		secret = []byte("lora-fallback-secret-2026")
	}

	h := hmac.New(sha256.New, secret)
	h.Write([]byte(toSign))
	sigB64 := base64.RawURLEncoding.EncodeToString(h.Sum(nil))

	return fmt.Sprintf("%s.%s", toSign, sigB64), nil
}

// ValidateJWT verifies the signature and expiration of a JWT
func (s *AuthService) ValidateJWT(tokenStr string) (*UserSession, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid jwt format")
	}

	toSign := fmt.Sprintf("%s.%s", parts[0], parts[1])
	secret := []byte(s.cfg.JWTSecret)
	if len(secret) == 0 {
		secret = []byte("lora-fallback-secret-2026")
	}

	h := hmac.New(sha256.New, secret)
	h.Write([]byte(toSign))
	expectedSig := base64.RawURLEncoding.EncodeToString(h.Sum(nil))

	if !hmac.Equal([]byte(parts[2]), []byte(expectedSig)) {
		return nil, errors.New("invalid jwt signature")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("failed to decode jwt payload: %w", err)
	}

	var session UserSession
	if err := json.Unmarshal(payloadBytes, &session); err != nil {
		return nil, fmt.Errorf("failed to parse jwt claims: %w", err)
	}

	if session.ExpiresAt > 0 && time.Now().Unix() > session.ExpiresAt {
		return nil, errors.New("jwt token has expired")
	}

	return &session, nil
}

// Middleware injects the authenticated user into request context or returns 401
func (s *AuthService) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.cfg.Enabled {
			ctx := context.WithValue(r.Context(), UserContextKey, DefaultLocalAdmin)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		var tokenStr string

		// Check Authorization Header
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		}

		// Check Cookie
		if tokenStr == "" {
			cookie, err := r.Cookie("lora_session")
			if err == nil && cookie.Value != "" {
				tokenStr = cookie.Value
			}
		}

		if tokenStr == "" {
			http.Error(w, `{"error": "unauthorized", "message": "authentication required"}`, http.StatusUnauthorized)
			return
		}

		session, err := s.ValidateJWT(tokenStr)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error": "unauthorized", "message": "%s"}`, err.Error()), http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, session)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetAzureADLoginURL creates the authorization URL for Azure AD
func (s *AuthService) GetAzureADLoginURL() string {
	tenant := s.cfg.AzureAD.TenantID
	if tenant == "" {
		tenant = "common"
	}
	clientID := s.cfg.AzureAD.ClientID
	redirectURI := s.cfg.AzureAD.RedirectURL

	scopes := strings.Join(s.cfg.AzureAD.Scopes, " ")
	if scopes == "" {
		scopes = "openid profile email"
	}

	params := url.Values{}
	params.Set("client_id", clientID)
	params.Set("response_type", "code")
	params.Set("redirect_uri", redirectURI)
	params.Set("response_mode", "query")
	params.Set("scope", scopes)
	params.Set("state", "lora_auth_state")

	return fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/authorize?%s", tenant, params.Encode())
}

// ExchangeAzureADCode exchanges an authorization code for an ID token and creates a session
func (s *AuthService) ExchangeAzureADCode(ctx context.Context, code string) (*UserSession, error) {
	tenant := s.cfg.AzureAD.TenantID
	if tenant == "" {
		tenant = "common"
	}

	tokenEndpoint := fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/token", tenant)

	data := url.Values{}
	data.Set("client_id", s.cfg.AzureAD.ClientID)
	data.Set("client_secret", s.cfg.AzureAD.ClientSecret)
	data.Set("code", code)
	data.Set("grant_type", "authorization_code")
	data.Set("redirect_uri", s.cfg.AzureAD.RedirectURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenEndpoint, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token exchange request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("azure ad token exchange failed with status %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		IDToken     string `json:"id_token"`
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, err
	}

	// Parse unverified claims from id_token
	parts := strings.Split(tokenResp.IDToken, ".")
	if len(parts) < 2 {
		return nil, errors.New("invalid id_token returned from azure ad")
	}

	claimsBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}

	var claims struct {
		Sub   string   `json:"sub"`
		Email string   `json:"email"`
		Name  string   `json:"name"`
		Upn   string   `json:"upn"`
		Roles []string `json:"roles"`
	}
	_ = json.Unmarshal(claimsBytes, &claims)

	email := claims.Email
	if email == "" {
		email = claims.Upn
	}
	if email == "" {
		email = claims.Sub
	}

	name := claims.Name
	if name == "" {
		name = email
	}

	isAdmin := false
	for _, role := range claims.Roles {
		for _, adminRole := range s.cfg.AdminRoles {
			if strings.EqualFold(role, adminRole) {
				isAdmin = true
				break
			}
		}
	}

	return &UserSession{
		Subject:   claims.Sub,
		Email:     email,
		Name:      name,
		Roles:     claims.Roles,
		IsAdmin:   isAdmin,
		ExpiresAt: time.Now().Add(24 * time.Hour).Unix(),
	}, nil
}

