package trustguard

import "encoding/base64"

// Direction is the traffic side being evaluated; rules are scoped per side.
type Direction string

// Valid directions; an empty Direction is treated as DirectionInput by the server.
const (
	DirectionInput  Direction = "input"
	DirectionOutput Direction = "output"
)

// Protocol is the traffic protocol the policy rules are scoped to.
type Protocol string

// Valid protocols; an empty Protocol is treated as ProtocolAll by the server.
const (
	ProtocolAll Protocol = "all"
	ProtocolLLM Protocol = "llm"
	ProtocolMCP Protocol = "mcp"
	ProtocolA2A Protocol = "a2a"
)

// Status values reported in GuardResponse.Status and on each Finding.Status.
const (
	StatusBlock     = "block"
	StatusTransform = "transform"
	StatusReport    = "report"
)

// Keys with server-side meaning.
const (
	// AttributesContentType overrides the payload content type (default application/json).
	AttributesContentType = "content_type"
	// PayloadAttachments is the payload key carrying base64-encoded documents for file-aware plugins.
	PayloadAttachments = "attachments"
)

// GuardRequest is the payload sent to POST /v1/guard.
type GuardRequest struct {
	// Payload is the content to evaluate: {"input": "..."} or provider-shaped
	// fields such as messages/tools. Attachments live under Payload["attachments"]
	// (use AddAttachment). Required.
	Payload map[string]any `json:"payload"`
	// Direction is the traffic side; the server defaults empty to input.
	Direction Direction `json:"direction,omitempty"`
	// Protocol is the traffic protocol; the server defaults empty to all.
	Protocol Protocol `json:"protocol,omitempty"`
	// SessionID groups multi-turn traffic; the server synthesises one when empty.
	SessionID string `json:"session_id,omitempty"`
	// ConsumerID identifies the end user on whose behalf the request runs.
	ConsumerID string `json:"consumer_id,omitempty"`
	// Attributes carries optional routing hints; see the Attributes* constants.
	Attributes map[string]any `json:"attributes,omitempty"`
}

// Attachment is a document evaluated alongside the payload by file-aware plugins.
type Attachment struct {
	Filename    string
	ContentType string
	// Data is the raw file content; it is base64-encoded on the wire. Provide
	// either Data or URL.
	Data []byte
	// URL points at a document for the server to fetch instead of inlining Data.
	URL string
}

// AddAttachment encodes the attachment into payload.attachments, initialising
// Payload when needed. Data is base64-encoded; URL is sent as-is.
func (r *GuardRequest) AddAttachment(a Attachment) {
	if r.Payload == nil {
		r.Payload = map[string]any{}
	}
	entry := map[string]string{
		"filename":     a.Filename,
		"content_type": a.ContentType,
	}
	if len(a.Data) > 0 {
		entry["data"] = base64.StdEncoding.EncodeToString(a.Data)
	}
	if a.URL != "" {
		entry["url"] = a.URL
	}
	existing, _ := r.Payload[PayloadAttachments].([]map[string]string)
	r.Payload[PayloadAttachments] = append(existing, entry)
}

// Finding is a single plugin's contribution to the guard response.
type Finding struct {
	DetectionType string  `json:"detection_type,omitempty"`
	Confidence    float64 `json:"confidence,omitempty"`
	RuleName      string  `json:"rule_name,omitempty"`
	// Status mirrors the action the matched rule applied: block, transform, or report.
	Status string `json:"status,omitempty"`
	// PolicyID and DetectorID attribute the finding to the policy and detector that produced it.
	PolicyID   string `json:"policy_id,omitempty"`
	DetectorID string `json:"detector_id,omitempty"`
	// Action is the configured rule action behind this finding.
	Action  string `json:"action,omitempty"`
	Details any    `json:"details,omitempty"`
}

// GuardResponse is the verdict returned by POST /v1/guard. TrustGuard detects;
// the caller enforces: block when Status is "block".
type GuardResponse struct {
	// Status is the most restrictive verdict across the findings and any
	// short-circuiting gate: "block", "transform", "report", or empty when
	// nothing matched.
	Status string `json:"status"`
	// TransformedPayload is the payload as rewritten by in-flight masking, nil when untouched.
	TransformedPayload map[string]any `json:"transformed_payload"`
	// Findings lists what every plugin in the policy chain reported.
	Findings []Finding `json:"findings"`
	// TraceID and RequestID correlate the call with TrustGuard telemetry.
	TraceID   string `json:"trace_id"`
	RequestID string `json:"request_id"`
}

// IsBlocked reports whether the policy blocked the payload (Status == "block").
func (r GuardResponse) IsBlocked() bool {
	return r.Status == StatusBlock
}
