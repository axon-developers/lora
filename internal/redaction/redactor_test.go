package redaction

import (
	"testing"

	"lora/internal/config"
)

func TestRedactor_Basic(t *testing.T) {
	rules := []config.RedactionRule{
		{
			ID:      "aws-key",
			Name:    "AWS Key",
			Pattern: `AKIA[0-9A-Z]{16}`,
			Mask:    `[REDACTED_AWS_KEY]`,
			Enabled: true,
		},
		{
			ID:      "disabled-rule",
			Name:    "Disabled",
			Pattern: `secret`,
			Mask:    `[HIDDEN]`,
			Enabled: false,
		},
	}

	r := NewRedactor(config.RedactionConfig{
		Enabled: true,
		Rules:   rules,
	})

	input := "Connecting with AKIAIOSFODNN7EXAMPLE and secret token"
	got := r.Redact(input)
	expected := "Connecting with [REDACTED_AWS_KEY] and secret token"

	if got != expected {
		t.Fatalf("expected %q, got %q", expected, got)
	}

	// Disable redactor
	r.UpdateRules(false, rules)
	gotDisabled := r.Redact(input)
	if gotDisabled != input {
		t.Fatalf("expected unmodified text when disabled, got %q", gotDisabled)
	}
}

func TestRedaction_TestRedaction(t *testing.T) {
	sample := "User login password=mySecretPassword123 session started"
	rules := []config.RedactionRule{
		{
			ID:      "password",
			Name:    "Password Pattern",
			Pattern: `password=\S+`,
			Mask:    `password=[REDACTED]`,
			Enabled: true,
		},
	}

	res := TestRedaction(sample, rules)
	if res.Redacted != "User login password=[REDACTED] session started" {
		t.Fatalf("unexpected redacted result: %s", res.Redacted)
	}
	if len(res.Matches) != 1 {
		t.Fatalf("expected 1 match, got %d", len(res.Matches))
	}
}

