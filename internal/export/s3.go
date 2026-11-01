package export

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"lora/internal/config"
)

type S3Exporter struct {
	cfg config.S3ExportConfig
}

func NewS3Exporter(cfg config.S3ExportConfig) *S3Exporter {
	return &S3Exporter{cfg: cfg}
}

type S3ExportResult struct {
	S3URI        string    `json:"s3_uri"`
	Bucket       string    `json:"bucket"`
	Key          string    `json:"key"`
	BytesWritten int64     `json:"bytes_written"`
	UploadedAt   time.Time `json:"uploaded_at"`
}

// ExportLog exports raw log text to S3 as a gzipped object.
func (e *S3Exporter) ExportLog(
	ctx context.Context,
	clusterID, namespace, podName, container string,
	logContent string,
) (*S3ExportResult, error) {
	if !e.cfg.Enabled {
		return nil, fmt.Errorf("s3 export is currently disabled in lora configuration")
	}
	if e.cfg.Bucket == "" {
		return nil, fmt.Errorf("s3 bucket is not configured")
	}

	region := e.cfg.Region
	if region == "" {
		region = "us-east-1"
	}

	// Prepare timestamp and filename
	now := time.Now().UTC()
	timestampStr := now.Format("20060102-150405")
	fileName := fmt.Sprintf("%s-%s-%s.log.gz", podName, container, timestampStr)

	prefix := strings.Trim(e.cfg.Prefix, "/")
	var key string
	if prefix != "" {
		key = fmt.Sprintf("%s/%s/%s/%s", prefix, clusterID, namespace, fileName)
	} else {
		key = fmt.Sprintf("lora-exports/%s/%s/%s", clusterID, namespace, fileName)
	}

	// Compress log content to gzip
	var gzBuffer bytes.Buffer
	gw := gzip.NewWriter(&gzBuffer)
	if _, err := gw.Write([]byte(logContent)); err != nil {
		return nil, fmt.Errorf("failed to gzip log content: %w", err)
	}
	if err := gw.Close(); err != nil {
		return nil, fmt.Errorf("failed to finish gzip compression: %w", err)
	}

	payloadBytes := gzBuffer.Bytes()
	payloadLen := int64(len(payloadBytes))

	// Resolve AWS credentials (explicit or from environment)
	accessKey := e.cfg.AccessKeyID
	if accessKey == "" {
		accessKey = os.Getenv("AWS_ACCESS_KEY_ID")
	}
	secretKey := e.cfg.SecretAccessKey
	if secretKey == "" {
		secretKey = os.Getenv("AWS_SECRET_ACCESS_KEY")
	}
	sessionToken := os.Getenv("AWS_SESSION_TOKEN")

	// Form endpoint URL
	var host, uploadURL string
	if e.cfg.Endpoint != "" {
		endpoint := strings.TrimRight(e.cfg.Endpoint, "/")
		host = strings.TrimPrefix(strings.TrimPrefix(endpoint, "https://"), "http://")
		uploadURL = fmt.Sprintf("%s/%s/%s", endpoint, e.cfg.Bucket, key)
	} else {
		host = fmt.Sprintf("%s.s3.%s.amazonaws.com", e.cfg.Bucket, region)
		if region == "us-east-1" {
			host = fmt.Sprintf("%s.s3.amazonaws.com", e.cfg.Bucket)
		}
		uploadURL = fmt.Sprintf("https://%s/%s", host, key)
	}

	// Build HTTP PUT request
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, uploadURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create upload request: %w", err)
	}

	req.Header.Set("Content-Type", "application/gzip")
	req.Header.Set("Content-Length", fmt.Sprintf("%d", payloadLen))

	if accessKey != "" && secretKey != "" {
		signAWSv4(req, payloadBytes, accessKey, secretKey, sessionToken, region, "s3", now)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute s3 put request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("s3 upload failed with status %d: %s", resp.StatusCode, string(body))
	}

	return &S3ExportResult{
		S3URI:        fmt.Sprintf("s3://%s/%s", e.cfg.Bucket, key),
		Bucket:       e.cfg.Bucket,
		Key:          key,
		BytesWritten: payloadLen,
		UploadedAt:   now,
	}, nil
}

// AWS SigV4 signer
func signAWSv4(
	req *http.Request,
	payload []byte,
	accessKey, secretKey, sessionToken, region, service string,
	t time.Time,
) {
	dateStamp := t.Format("20060102")
	amzDate := t.Format("20060102T150405Z")

	payloadHash := sha256Hex(payload)
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", payloadHash)
	if sessionToken != "" {
		req.Header.Set("x-amz-security-token", sessionToken)
	}

	canonicalURI := path.Clean("/" + req.URL.Path)
	if !strings.HasPrefix(canonicalURI, "/") {
		canonicalURI = "/" + canonicalURI
	}

	canonicalHeaders := fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n",
		req.Host, payloadHash, amzDate)
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"

	if sessionToken != "" {
		canonicalHeaders = fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\nx-amz-security-token:%s\n",
			req.Host, payloadHash, amzDate, sessionToken)
		signedHeaders = "host;x-amz-content-sha256;x-amz-date;x-amz-security-token"
	}

	canonicalRequest := fmt.Sprintf("%s\n%s\n%s\n%s\n%s\n%s",
		req.Method, canonicalURI, req.URL.RawQuery, canonicalHeaders, signedHeaders, payloadHash)

	credentialScope := fmt.Sprintf("%s/%s/%s/aws4_request", dateStamp, region, service)
	stringToSign := fmt.Sprintf("AWS4-HMAC-SHA256\n%s\n%s\n%s",
		amzDate, credentialScope, sha256Hex([]byte(canonicalRequest)))

	signingKey := getSignatureKey(secretKey, dateStamp, region, service)
	signature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	authHeader := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		accessKey, credentialScope, signedHeaders, signature)
	req.Header.Set("Authorization", authHeader)
}

func sha256Hex(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

func getSignatureKey(key, dateStamp, regionName, serviceName string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+key), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte(regionName))
	kService := hmacSHA256(kRegion, []byte(serviceName))
	kSigning := hmacSHA256(kService, []byte("aws4_request"))
	return kSigning
}

