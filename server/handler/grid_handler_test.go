package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"micaps-web/handler"
	"micaps-web/model"
)

func TestGridHandlerMockMode_VVEL(t *testing.T) {
	h := &handler.GridHandler{
		Client:   nil,
		MockMode: true,
	}

	req := httptest.NewRequest("GET", "/api/data/grid?path=ECMWF_HR/VVEL/500&file=26091808.024", nil)
	w := httptest.NewRecorder()
	h.JSONHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}

	var resp model.GridResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}

	if resp.Header.Element != "VVEL" {
		t.Errorf("expected Element VVEL, got %s", resp.Header.Element)
	}
	if resp.Header.Level != 500 {
		t.Errorf("expected Level 500, got %f", resp.Header.Level)
	}
	if resp.Header.Period != 24 {
		t.Errorf("expected Period 24, got %d", resp.Header.Period)
	}
	if resp.Stats.Min >= 0 || resp.Stats.Max <= 0 {
		t.Errorf("expected signed range for VVEL, got min=%f, max=%f", resp.Stats.Min, resp.Stats.Max)
	}
}

func TestGridHandlerMockMode_RH(t *testing.T) {
	h := &handler.GridHandler{
		Client:   nil,
		MockMode: true,
	}

	req := httptest.NewRequest("GET", "/api/data/grid?path=ECMWF_HR/RH/850&file=26091808.012", nil)
	w := httptest.NewRecorder()
	h.JSONHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}

	var resp model.GridResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}

	if resp.Header.Element != "RH" {
		t.Errorf("expected Element RH, got %s", resp.Header.Element)
	}
	if resp.Header.Level != 850 {
		t.Errorf("expected Level 850, got %f", resp.Header.Level)
	}
	if resp.Header.Period != 12 {
		t.Errorf("expected Period 12, got %d", resp.Header.Period)
	}
	if resp.Stats.Min < 0 || resp.Stats.Max > 100 {
		t.Errorf("expected RH in [0, 100], got min=%f, max=%f", resp.Stats.Min, resp.Stats.Max)
	}
}

func TestGridHandlerMockMode_RAIN12_SanitizesNull(t *testing.T) {
	h := &handler.GridHandler{
		Client:   nil,
		MockMode: true,
	}

	for _, p := range []string{"ECMWF_HR/RAIN12", "ECMWF_HR/RAIN12/null", "ECMWF_HR/RAIN12/null/null", "ECMWF_HR/RAIN12/undefined"} {
		req := httptest.NewRequest("GET", "/api/data/grid?path="+p+"&file=26092608.024", nil)
		w := httptest.NewRecorder()
		h.JSONHandler(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for %s, got %d", p, w.Code)
		}

		var resp model.GridResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode JSON response for %s: %v", p, err)
		}

		if resp.Header.Element != "RAIN" {
			t.Errorf("expected Element RAIN for %s, got %s", p, resp.Header.Element)
		}
		if resp.Header.Level != 0 {
			t.Errorf("expected Level 0 for %s, got %f", p, resp.Header.Level)
		}
	}
}

func TestSanitizeGridPath_Cases(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"ECMWF_HR/RAIN12", "ECMWF_HR/RAIN12"},
		{"ECMWF_HR/RAIN12/null", "ECMWF_HR/RAIN12"},
		{"ECMWF_HR/RAIN12/NULL", "ECMWF_HR/RAIN12"},
		{"ECMWF_HR/null/RAIN12", "ECMWF_HR/RAIN12"},
		{"ECMWF_HR/UNDEFINED/RAIN12", "ECMWF_HR/RAIN12"},
		{"null", ""},
		{"NULL", ""},
		{"undefined", ""},
		{"UNDEFINED", ""},
		{"/null/ECMWF_HR/null/RAIN12/null/", "ECMWF_HR/RAIN12"},
		{"../ECMWF_HR/../RAIN12", "ECMWF_HR/RAIN12"},
		{"ECMWF_HR\x00/RAIN12", "ECMWF_HR/RAIN12"},
		{"", ""},
	}

	for _, tc := range tests {
		got := handler.SanitizeGridPath(tc.input)
		if got != tc.expected {
			t.Errorf("SanitizeGridPath(%q) = %q; want %q", tc.input, got, tc.expected)
		}
	}
}

func TestSanitizeFile_Cases(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"26091808.024", "26091808.024"},
		{"null", ""},
		{"NULL", ""},
		{"undefined", ""},
		{"UNDEFINED", ""},
		{"../26091808.024", "26091808.024"},
		{"../../26091808.024", "26091808.024"},
		{"26091808\x00.024", "26091808.024"},
		{"/26091808.024/", "26091808.024"},
		{"", ""},
	}

	for _, tc := range tests {
		got := handler.SanitizeFile(tc.input)
		if got != tc.expected {
			t.Errorf("SanitizeFile(%q) = %q; want %q", tc.input, got, tc.expected)
		}
	}
}

func TestGridHandlerNonMockMode_Error(t *testing.T) {
	h := &handler.GridHandler{
		Client:   nil,
		MockMode: false,
	}

	req := httptest.NewRequest("GET", "/api/data/grid?path=ECMWF_HR/TMP/500&file=26091808.024", nil)
	w := httptest.NewRecorder()
	h.JSONHandler(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 StatusNotFound when Client is nil and MockMode is false, got %d", w.Code)
	}
}

func TestGridHandlerMockMode_SatelliteFY4B(t *testing.T) {
	h := &handler.GridHandler{
		Client:   nil,
		MockMode: true,
	}

	req := httptest.NewRequest("GET", "/api/data/grid?path=SATELLITE/FY4B/L1/CHINA/C006&file=latest", nil)
	w := httptest.NewRecorder()
	h.JSONHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}

	var resp model.GridResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}

	if resp.Header.Discriminator != "AWX" {
		t.Errorf("expected Discriminator AWX, got %s", resp.Header.Discriminator)
	}
	if resp.Header.Element != "C006" {
		t.Errorf("expected Element C006, got %s", resp.Header.Element)
	}
	if len(resp.Values) == 0 {
		t.Errorf("expected non-empty values array")
	}
}

func TestGridHandlerMockMode_SatelliteDISK(t *testing.T) {
	h := &handler.GridHandler{
		Client:   nil,
		MockMode: true,
	}

	req := httptest.NewRequest("GET", "/api/data/grid?path=SATELLITE/FY4B/L1/DISK/C012&file=latest&step=4", nil)
	w := httptest.NewRecorder()
	h.JSONHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}

	var resp model.GridResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}

	if resp.Header.Element != "C012" {
		t.Errorf("expected Element C012, got %s", resp.Header.Element)
	}
	if resp.Stats.Min <= 0 || resp.Stats.Max <= 0 {
		t.Errorf("expected positive brightness temp in K, got min=%f, max=%f", resp.Stats.Min, resp.Stats.Max)
	}
}

func TestGridHandler_AGRIChannelResolution(t *testing.T) {
	h := &handler.GridHandler{
		Client:   nil,
		MockMode: true,
	}

	// 1. Channel specified via level query parameter
	req1 := httptest.NewRequest("GET", "/api/data/grid?path=SATELLITE/FY4B/L1/CHINA&level=4&file=latest", nil)
	w1 := httptest.NewRecorder()
	h.JSONHandler(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w1.Code)
	}
	var resp1 model.GridResponse
	if err := json.Unmarshal(w1.Body.Bytes(), &resp1); err != nil {
		t.Fatalf("decode JSON error: %v", err)
	}
	if resp1.Header.Element != "C004" {
		t.Errorf("expected Header.Element C004 from level=4, got %s", resp1.Header.Element)
	}

	// 2. Channel specified via filename prefix
	req2 := httptest.NewRequest("GET", "/api/data/grid?path=SATELLITE/FY4B/L1/CHINA&file=C006_20261028120000_FY4B.AWX", nil)
	w2 := httptest.NewRecorder()
	h.JSONHandler(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w2.Code)
	}
	var resp2 model.GridResponse
	if err := json.Unmarshal(w2.Body.Bytes(), &resp2); err != nil {
		t.Fatalf("decode JSON error: %v", err)
	}
	if resp2.Header.Element != "C006" {
		t.Errorf("expected Header.Element C006 from file=C006_..., got %s", resp2.Header.Element)
	}
}


