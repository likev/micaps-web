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
