// Package trustguard is the official Go client for the TrustGuard runtime
// guard API (POST /v1/guard): configure a base URL and an API key, send the
// payload to evaluate, and act on the returned verdict.
package trustguard

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	guardPath      = "/v1/guard"
	defaultTimeout = 10 * time.Second
)

// Client calls the TrustGuard guard endpoint. Create it with New.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// Option customises a Client created by New.
type Option func(*Client)

// WithHTTPClient replaces the underlying *http.Client (proxies, custom
// transports, test doubles). It overrides WithTimeout.
func WithHTTPClient(hc *http.Client) Option {
	return func(c *Client) { c.httpClient = hc }
}

// WithTimeout sets the per-request timeout on the default HTTP client (10s when unset).
func WithTimeout(d time.Duration) Option {
	return func(c *Client) { c.httpClient.Timeout = d }
}

// New builds a Client for the TrustGuard deployment at baseURL authenticating
// with apiKey. It errors on missing configuration rather than failing at call time.
func New(baseURL, apiKey string, opts ...Option) (*Client, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return nil, errors.New("trustguard: baseURL is required")
	}
	if strings.TrimSpace(apiKey) == "" {
		return nil, errors.New("trustguard: apiKey is required")
	}
	c := &Client{
		baseURL:    baseURL,
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: defaultTimeout},
	}
	for _, opt := range opts {
		opt(c)
	}
	return c, nil
}

// Guard evaluates the request against the policy attached to the API key and
// returns the verdict. Non-2xx responses surface as *APIError; transport
// failures as wrapped errors.
func (c *Client) Guard(ctx context.Context, req GuardRequest) (*GuardResponse, error) {
	if req.Payload == nil {
		return nil, errors.New("trustguard: request payload is required")
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("trustguard: encoding request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+guardPath, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("trustguard: building request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("trustguard: calling %s: %w", guardPath, err)
	}
	defer func() { _ = resp.Body.Close() }() // nothing actionable on close failure

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("trustguard: reading response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, apiError(resp.StatusCode, respBody)
	}

	var out GuardResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, fmt.Errorf("trustguard: decoding response: %w", err)
	}
	return &out, nil
}

// apiError maps a non-2xx body onto *APIError, tolerating non-JSON bodies.
func apiError(status int, body []byte) *APIError {
	var payload struct {
		Error     string `json:"error"`
		TraceID   string `json:"trace_id"`
		RequestID string `json:"request_id"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || payload.Error == "" {
		payload.Error = strings.TrimSpace(string(body))
		if payload.Error == "" {
			payload.Error = http.StatusText(status)
		}
	}
	return &APIError{
		StatusCode: status,
		Message:    payload.Error,
		TraceID:    payload.TraceID,
		RequestID:  payload.RequestID,
	}
}
