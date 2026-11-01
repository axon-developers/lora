package cluster

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"lora/internal/config"
)

type KconnectResult struct {
	ClusterID  string `json:"cluster_id"`
	Command    string `json:"command"`
	Success    bool   `json:"success"`
	Output     string `json:"output"`
	DurationMs int64  `json:"duration_ms"`
	Error      string `json:"error,omitempty"`
}

func RunKconnect(ctx context.Context, c config.ClusterConfig, inputPassword, inputMFA, targetRegion string) (*KconnectResult, error) {
	if !c.Kconnect.Enabled {
		return nil, fmt.Errorf("kconnect is not enabled for cluster %s", c.ID)
	}

	cmdName := c.Kconnect.Command
	if cmdName == "" {
		cmdName = "kconnect"
	}

	effectiveKubeconfig := c.GetEffectiveKubeconfigPath()
	dir := filepath.Dir(effectiveKubeconfig)
	if dir != "" && dir != "." {
		_ = os.MkdirAll(dir, 0755)
	}

	// Prepare arguments: append --kubeconfig if not already present
	args := make([]string, len(c.Kconnect.Args))
	copy(args, c.Kconnect.Args)

	hasKubeconfigArg := false
	for _, a := range args {
		if strings.HasPrefix(a, "--kubeconfig") {
			hasKubeconfigArg = true
			break
		}
	}
	if !hasKubeconfigArg {
		args = append(args, "--kubeconfig", effectiveKubeconfig)
	}

	// Dynamic target region injection (e.g. us-east-1 vs us-east-2)
	if targetRegion != "" {
		regionUpdated := false
		for i := 0; i < len(args); i++ {
			if args[i] == "--region" || args[i] == "-r" {
				if i+1 < len(args) {
					args[i+1] = targetRegion
					regionUpdated = true
					break
				}
			} else if strings.HasPrefix(args[i], "--region=") {
				args[i] = fmt.Sprintf("--region=%s", targetRegion)
				regionUpdated = true
				break
			}
		}
		if !regionUpdated {
			args = append(args, "--region", targetRegion)
		}
	}

	if inputPassword != "" {
		args = append(args, "--password", inputPassword)
	}
	if inputMFA != "" {
		args = append(args, "--token", inputMFA)
	}

	execCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	cmd := exec.CommandContext(execCtx, cmdName, args...)
	cmd.Env = os.Environ()
	for k, v := range c.Kconnect.Env {
		cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", k, v))
	}
	if targetRegion != "" {
		cmd.Env = append(cmd.Env,
			fmt.Sprintf("AWS_DEFAULT_REGION=%s", targetRegion),
			fmt.Sprintf("AWS_REGION=%s", targetRegion),
			fmt.Sprintf("KCONNECT_REGION=%s", targetRegion),
		)
	}

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start).Milliseconds()

	combinedOutput := strings.TrimSpace(stdoutBuf.String())
	if stderrBuf.Len() > 0 {
		if combinedOutput != "" {
			combinedOutput += "\n"
		}
		combinedOutput += strings.TrimSpace(stderrBuf.String())
	}

	res := &KconnectResult{
		ClusterID:  c.ID,
		Command:    fmt.Sprintf("%s %s", cmdName, strings.Join(args, " ")),
		Success:    err == nil,
		Output:     combinedOutput,
		DurationMs: duration,
	}

	if err != nil {
		res.Error = fmt.Sprintf("execution failed: %v", err)
		return res, err
	}

	return res, nil
}

