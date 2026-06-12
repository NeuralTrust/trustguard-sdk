package trustguard

import "encoding/base64"

// Direction is the traffic side being evaluated; rules are scoped per side.
type Direction string

// Valid directions; an empty Direction is treated as DirectionInput by the server.
const (
	DirectionInput  Direction = "input"
	DirectionOutput Direction = "output"
)

// Metadata keys with server-side meaning.
const (
	// MetadataPolicyID selects the policy when the API key allows more than one.
	MetadataPolicyID = "policy_id"
	// MetadataContentType overrides the payload content type (default application/json).
	MetadataContentType = "content_type"
	// MetadataAttachments carries base64-encoded documents for file-aware plugins.
	MetadataAttachments = "attachments"
)

// GuardRequest is the payload sent to POST /v1/guard.
type GuardRequest struct {
	// Input is the payload to evaluate. Required.
	Input map[string]any `json:"input"`
	// Direction is the traffic side; the server defaults empty to input.
	Direction Direction `json:"direction,omitempty"`
	// SessionID groups multi-turn traffic; the server synthesises one when empty.
	SessionID string `json:"session_id,omitempty"`
	// ConsumerID identifies the end user on whose behalf the request runs.
	ConsumerID string `json:"consumer_id,omitempty"`
	// Metadata carries optional routing hints; see the Metadata* constants.
	Metadata map[string]any `json:"metadata,omitempty"`
}

// Attachment is a document evaluated alongside the payload by file-aware plugins.
type Attachment struct {
	Filename    string
	ContentType string
	// Data is the raw file content; it is base64-encoded on the wire.
	Data []byte
}

// AddAttachment base64-encodes the attachment into metadata.attachments,
// initialising Metadata when needed.
func (r *GuardRequest) AddAttachment(a Attachment) {
	if r.Metadata == nil {
		r.Metadata = map[string]any{}
	}
	existing, _ := r.Metadata[MetadataAttachments].([]map[string]string)
	r.Metadata[MetadataAttachments] = append(existing, map[string]string{
		"filename":     a.Filename,
		"content_type": a.ContentType,
		"data":         base64.StdEncoding.EncodeToString(a.Data),
	})
}

// Finding is a single plugin's contribution to the guard response.
type Finding struct {
	DetectionType string  `json:"detection_type,omitempty"`
	Confidence    float64 `json:"confidence,omitempty"`
	RuleName      string  `json:"rule_name,omitempty"`
	Details       any     `json:"details,omitempty"`
}

// GuardResponse is the verdict returned by POST /v1/guard. TrustGuard detects;
// the caller enforces: block when IsFlagged is true.
type GuardResponse struct {
	// IsFlagged is the enforcement signal: true when the policy flagged the payload.
	IsFlagged bool `json:"is_flagged"`
	// TransformedPayload is the payload as rewritten by in-flight masking, nil when untouched.
	TransformedPayload map[string]any `json:"transformed_payload"`
	// Findings lists what every plugin in the policy chain reported.
	Findings []Finding `json:"findings"`
	// TraceID and RequestID correlate the call with TrustGuard telemetry.
	TraceID   string `json:"trace_id"`
	RequestID string `json:"request_id"`
}
