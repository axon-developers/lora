package export

import (
	"context"
	"testing"

	"lora/internal/config"
)

func TestS3Exporter_Disabled(t *testing.T) {
	exp := NewS3Exporter(config.S3ExportConfig{
		Enabled: false,
		Bucket:  "test-bucket",
	})

	_, err := exp.ExportLog(context.Background(), "dev", "default", "mypod", "app", "log line 1\nlog line 2")
	if err == nil {
		t.Fatal("expected error when S3 export is disabled, got nil")
	}
}

func TestS3Exporter_SigningHelpers(t *testing.T) {
	dateStamp := "20261101"
	region := "us-east-1"
	service := "s3"
	secret := "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

	key := getSignatureKey(secret, dateStamp, region, service)
	if len(key) != 32 {
		t.Fatalf("expected 32-byte signing key, got %d", len(key))
	}
}
