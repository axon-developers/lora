package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"lora/internal/config"
)

func TestAuthService_DisabledByDefault(t *testing.T) {
	svc := NewAuthService(config.AuthConfig{Enabled: false})

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()

	var called bool
	handler := svc.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		u := svc.GetUser(r)
		if u == nil {
			t.Fatal("expected default local user when auth disabled, got nil")
		}
		if !u.IsAdmin {
			t.Fatal("expected local user to have admin rights")
		}
	}))

	handler.ServeHTTP(w, req)

	if !called {
		t.Fatal("expected handler to be invoked")
	}
}

func TestAuthService_JWTGenerationAndValidation(t *testing.T) {
	svc := NewAuthService(config.AuthConfig{
		Enabled:   true,
		JWTSecret: "super-secret-test-key-32-bytes!!",
	})

	session := &UserSession{
		Subject:   "test-user-123",
		Email:     "engineer@corp.com",
		Name:      "Test Engineer",
		Roles:     []string{"admin"},
		IsAdmin:   true,
		ExpiresAt: time.Now().Add(1 * time.Hour).Unix(),
	}

	token, err := svc.GenerateJWT(session)
	if err != nil {
		t.Fatalf("failed to generate jwt: %v", err)
	}

	parsed, err := svc.ValidateJWT(token)
	if err != nil {
		t.Fatalf("failed to validate jwt: %v", err)
	}

	if parsed.Email != "engineer@corp.com" || parsed.Subject != "test-user-123" {
		t.Fatalf("claims mismatch, got %+v", parsed)
	}

	// Test expired token
	session.ExpiresAt = time.Now().Add(-1 * time.Hour).Unix()
	expiredToken, _ := svc.GenerateJWT(session)
	_, err = svc.ValidateJWT(expiredToken)
	if err == nil {
		t.Fatal("expected error for expired token, got nil")
	}
}

