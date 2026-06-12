package trustguard

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestNew_Validation(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		baseURL string
		apiKey  string
		wantErr bool
	}{
		{name: "valid", baseURL: "https://guard.example.com", apiKey: "key", wantErr: false},
		{name: "trailing slash trimmed", baseURL: "https://guard.example.com/", apiKey: "key", wantErr: false},
		{name: "missing base url", baseURL: "  ", apiKey: "key", wantErr: true},
		{name: "missing api key", baseURL: "https://guard.example.com", apiKey: "", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			c, err := New(tt.baseURL, tt.apiKey)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if c.baseURL != "https://guard.example.com" {
				t.Fatalf("baseURL not normalized: %q", c.baseURL)
			}
		})
	}
}

func TestGuard_SendsExpectedRequest(t *testing.T) {
	t.Parallel()
	var got struct {
		path    string
		auth    string
		ct      string
		payload map[string]any
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.path = r.URL.Path
		got.auth = r.Header.Get("Authorization")
		got.ct = r.Header.Get("Content-Type")
		if err := json.NewDecoder(r.Body).Decode(&got.payload); err != nil {
			t.Errorf("decoding request body: %v", err)
		}
		_ = json.NewEncoder(w).Encode(GuardResponse{})
	}))
	defer srv.Close()

	c, err := New(srv.URL, "secret-key")
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	req := GuardRequest{
		Input:      map[string]any{"prompt": "hello"},
		Direction:  DirectionOutput,
		SessionID:  "s-1",
		ConsumerID: "u-1",
		Metadata:   map[string]any{"policy_id": "11111111-1111-1111-1111-111111111111"},
	}
	if _, err := c.Guard(context.Background(), req); err != nil {
		t.Fatalf("Guard: %v", err)
	}

	if got.path != "/v1/guard" {
		t.Errorf("path = %q, want /v1/guard", got.path)
	}
	if got.auth != "Bearer secret-key" {
		t.Errorf("auth header = %q", got.auth)
	}
	if got.ct != "application/json" {
		t.Errorf("content type = %q", got.ct)
	}
	want := map[string]any{
		"input":       map[string]any{"prompt": "hello"},
		"direction":   "output",
		"session_id":  "s-1",
		"consumer_id": "u-1",
		"metadata":    map[string]any{"policy_id": "11111111-1111-1111-1111-111111111111"},
	}
	if !reflect.DeepEqual(got.payload, want) {
		t.Errorf("payload = %#v, want %#v", got.payload, want)
	}
}

func TestGuard_OmitsEmptyOptionalFields(t *testing.T) {
	t.Parallel()
	var payload map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Errorf("decoding request body: %v", err)
		}
		_ = json.NewEncoder(w).Encode(GuardResponse{})
	}))
	defer srv.Close()

	c, _ := New(srv.URL, "key")
	if _, err := c.Guard(context.Background(), GuardRequest{Input: map[string]any{"prompt": "hi"}}); err != nil {
		t.Fatalf("Guard: %v", err)
	}

	// The server rejects unknown top-level fields, so empty optionals must be absent.
	for _, field := range []string{"direction", "session_id", "consumer_id", "metadata", "protocol"} {
		if _, ok := payload[field]; ok {
			t.Errorf("field %q should be omitted when empty", field)
		}
	}
}

func TestGuard_DecodesResponse(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		body string
		want GuardResponse
	}{
		{
			name: "flagged with findings",
			body: `{"is_flagged":true,"transformed_payload":null,"findings":[{"detection_type":"jailbreak","confidence":0.97,"rule_name":"jb-1","details":{"plugin":"jailbreak"}}],"trace_id":"t-1","request_id":"r-1"}`,
			want: GuardResponse{
				IsFlagged: true,
				Findings: []Finding{{
					DetectionType: "jailbreak",
					Confidence:    0.97,
					RuleName:      "jb-1",
					Details:       map[string]any{"plugin": "jailbreak"},
				}},
				TraceID:   "t-1",
				RequestID: "r-1",
			},
		},
		{
			name: "clean with transformed payload",
			body: `{"is_flagged":false,"transformed_payload":{"prompt":"[MASKED]"},"findings":[],"trace_id":"t-2","request_id":"r-2"}`,
			want: GuardResponse{
				TransformedPayload: map[string]any{"prompt": "[MASKED]"},
				Findings:           []Finding{},
				TraceID:            "t-2",
				RequestID:          "r-2",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tt.body))
			}))
			defer srv.Close()

			c, _ := New(srv.URL, "key")
			got, err := c.Guard(context.Background(), GuardRequest{Input: map[string]any{"prompt": "hi"}})
			if err != nil {
				t.Fatalf("Guard: %v", err)
			}
			if !reflect.DeepEqual(*got, tt.want) {
				t.Errorf("response = %#v, want %#v", *got, tt.want)
			}
		})
	}
}

func TestGuard_APIErrors(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name        string
		status      int
		body        string
		wantMessage string
	}{
		{name: "unauthorized", status: 401, body: `{"error":"invalid API key","trace_id":"t","request_id":"r"}`, wantMessage: "invalid API key"},
		{name: "forbidden", status: 403, body: `{"error":"policy not allowed for this api key","trace_id":"t","request_id":"r"}`, wantMessage: "policy not allowed for this api key"},
		{name: "non-json body", status: 502, body: "bad gateway", wantMessage: "bad gateway"},
		{name: "empty body", status: 500, body: "", wantMessage: "Internal Server Error"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tt.status)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer srv.Close()

			c, _ := New(srv.URL, "key")
			_, err := c.Guard(context.Background(), GuardRequest{Input: map[string]any{"prompt": "hi"}})

			var apiErr *APIError
			if !errors.As(err, &apiErr) {
				t.Fatalf("expected *APIError, got %v", err)
			}
			if apiErr.StatusCode != tt.status {
				t.Errorf("status = %d, want %d", apiErr.StatusCode, tt.status)
			}
			if apiErr.Message != tt.wantMessage {
				t.Errorf("message = %q, want %q", apiErr.Message, tt.wantMessage)
			}
		})
	}
}

func TestGuard_MissingInput(t *testing.T) {
	t.Parallel()
	c, _ := New("https://guard.example.com", "key")
	if _, err := c.Guard(context.Background(), GuardRequest{}); err == nil {
		t.Fatal("expected error for missing input")
	}
}

func TestAddAttachment_EncodesBase64(t *testing.T) {
	t.Parallel()
	req := GuardRequest{Input: map[string]any{"prompt": "hi"}}
	req.AddAttachment(Attachment{Filename: "doc.pdf", ContentType: "application/pdf", Data: []byte("hello")})
	req.AddAttachment(Attachment{Filename: "img.png", ContentType: "image/png", Data: []byte{0x89, 0x50}})

	atts, ok := req.Metadata[MetadataAttachments].([]map[string]string)
	if !ok {
		t.Fatalf("metadata.attachments has wrong type: %T", req.Metadata[MetadataAttachments])
	}
	if len(atts) != 2 {
		t.Fatalf("len = %d, want 2", len(atts))
	}
	want := map[string]string{"filename": "doc.pdf", "content_type": "application/pdf", "data": "aGVsbG8="}
	if !reflect.DeepEqual(atts[0], want) {
		t.Errorf("attachment[0] = %#v, want %#v", atts[0], want)
	}
}
