package trustguard

import "fmt"

// APIError is a non-2xx response from the TrustGuard API, carrying the status
// code and the correlation ids needed to chase the request in telemetry.
// Transport-level failures are returned as regular wrapped errors instead.
type APIError struct {
	StatusCode int
	Message    string
	TraceID    string
	RequestID  string
}

// Error implements the error interface.
func (e *APIError) Error() string {
	return fmt.Sprintf("trustguard: API error %d: %s (trace_id=%s, request_id=%s)",
		e.StatusCode, e.Message, e.TraceID, e.RequestID)
}
