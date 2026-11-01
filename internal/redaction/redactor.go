package redaction

import (
	"regexp"
	"sync"

	"lora/internal/config"
)

type compiledRule struct {
	id      string
	name    string
	pattern string
	mask    string
	enabled bool
	regex   *regexp.Regexp
}

type Redactor struct {
	mu      sync.RWMutex
	enabled bool
	rules   []compiledRule
}

func NewRedactor(cfg config.RedactionConfig) *Redactor {
	r := &Redactor{
		enabled: cfg.Enabled,
	}
	r.UpdateRules(cfg.Enabled, cfg.Rules)
	return r
}

func (r *Redactor) UpdateRules(enabled bool, rules []config.RedactionRule) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.enabled = enabled
	compiled := make([]compiledRule, 0, len(rules))

	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}
		re, err := regexp.Compile(rule.Pattern)
		if err != nil {
			continue
		}
		compiled = append(compiled, compiledRule{
			id:      rule.ID,
			name:    rule.Name,
			pattern: rule.Pattern,
			mask:    rule.Mask,
			enabled: rule.Enabled,
			regex:   re,
		})
	}

	r.rules = compiled
}

func (r *Redactor) Redact(text string) string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if !r.enabled || len(r.rules) == 0 || text == "" {
		return text
	}

	result := text
	for _, rule := range r.rules {
		result = rule.regex.ReplaceAllString(result, rule.mask)
	}

	return result
}

type MatchDetail struct {
	RuleID  string `json:"rule_id"`
	RuleName string `json:"rule_name"`
	Matched string `json:"matched"`
}

type TestResult struct {
	Original string        `json:"original"`
	Redacted string        `json:"redacted"`
	Matches  []MatchDetail `json:"matches"`
}

// TestRedaction allows testing arbitrary rules against a text sample without modifying the engine state.
func TestRedaction(sample string, rules []config.RedactionRule) TestResult {
	result := sample
	var matches []MatchDetail

	for _, rule := range rules {
		if !rule.Enabled || rule.Pattern == "" {
			continue
		}
		re, err := regexp.Compile(rule.Pattern)
		if err != nil {
			continue
		}

		found := re.FindAllString(sample, -1)
		for _, m := range found {
			matches = append(matches, MatchDetail{
				RuleID:   rule.ID,
				RuleName: rule.Name,
				Matched:  m,
			})
		}

		result = re.ReplaceAllString(result, rule.Mask)
	}

	return TestResult{
		Original: sample,
		Redacted: result,
		Matches:  matches,
	}
}

