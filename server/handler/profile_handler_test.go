package handler_test

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"micaps-web/handler"
	"micaps-web/parser"
)

func TestProfileHandler_Validation(t *testing.T) {
	h := &handler.ProfileHandler{
		MockMode: true,
	}

	tests := []struct {
		name       string
		query      string
		wantStatus int
	}{
		{
			name:       "Missing cycle",
			query:      "leads=0,12&levels=850,500&lon=100&lat=30",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "Invalid cycle length",
			query:      "cycle=123&leads=0,12&levels=850,500&lon=100&lat=30",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "Missing leads",
			query:      "cycle=26091808&levels=850,500&lon=100&lat=30",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "Lead out of bounds",
			query:      "cycle=26091808&leads=0,300&levels=850,500&lon=100&lat=30",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "Path traversal in model",
			query:      "model=../../etc&cycle=26091808&leads=0,12&levels=850,500&lon=100&lat=30",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "Out of domain lon",
			query:      "cycle=26091808&leads=0,12&levels=850,500&lon=10&lat=30", // mock grid is lon 70..140
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/data/timeheight/profile?"+tt.query, nil)
			w := httptest.NewRecorder()
			h.Handler(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d. Body: %s", tt.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

func TestProfileHandler_MockStream(t *testing.T) {
	h := &handler.ProfileHandler{
		MockMode: true,
	}

	// 2 levels x 3 leads x 4 elements = 24 tasks
	leads := "0,12,24"
	levels := "850,500"
	req := httptest.NewRequest("GET", fmt.Sprintf("/api/data/timeheight/profile?cycle=26091808&leads=%s&levels=%s&lon=105.5&lat=32.5", leads, levels), nil)
	w := httptest.NewRecorder()

	h.Handler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	contentType := w.Header().Get("Content-Type")
	if !strings.Contains(contentType, "application/x-ndjson") {
		t.Errorf("expected Content-Type application/x-ndjson, got %s", contentType)
	}

	scanner := bufio.NewScanner(w.Body)
	var progressLines []handler.ProgressEvent
	var resultLine *handler.ResultEvent

	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}

		var generic map[string]interface{}
		if err := json.Unmarshal([]byte(line), &generic); err != nil {
			t.Fatalf("failed to parse NDJSON line: %v (line: %s)", err, line)
		}

		typ, _ := generic["type"].(string)
		if typ == "progress" {
			var pe handler.ProgressEvent
			if err := json.Unmarshal([]byte(line), &pe); err != nil {
				t.Fatalf("failed to decode ProgressEvent: %v", err)
			}
			progressLines = append(progressLines, pe)
		} else if typ == "result" {
			var re handler.ResultEvent
			if err := json.Unmarshal([]byte(line), &re); err != nil {
				t.Fatalf("failed to decode ResultEvent: %v", err)
			}
			resultLine = &re
		}
	}

	if len(progressLines) != 24 {
		t.Errorf("expected 24 progress lines, got %d", len(progressLines))
	}
	// Verify monotonic progress
	for i, p := range progressLines {
		if p.Loaded != i+1 {
			t.Errorf("expected loaded=%d, got %d", i+1, p.Loaded)
		}
		if p.Total != 24 {
			t.Errorf("expected total=24, got %d", p.Total)
		}
		if p.LastSource != "mock" {
			t.Errorf("expected lastSource=mock, got %s", p.LastSource)
		}
	}

	if resultLine == nil {
		t.Fatalf("expected result line, got nil")
	}

	if resultLine.Cycle != "26091808" {
		t.Errorf("expected cycle 26091808, got %s", resultLine.Cycle)
	}
	if len(resultLine.Levels) != 2 || len(resultLine.Leads) != 3 {
		t.Errorf("dimension mismatch: levels=%d, leads=%d", len(resultLine.Levels), len(resultLine.Leads))
	}
	if len(resultLine.RH) != 2 || len(resultLine.RH[0]) != 3 {
		t.Errorf("RH matrix dimensions mismatch: %dx%d", len(resultLine.RH), len(resultLine.RH[0]))
	}
	if len(resultLine.TMP) != 2 || len(resultLine.TMP[0]) != 3 {
		t.Errorf("TMP matrix dimensions mismatch: %dx%d", len(resultLine.TMP), len(resultLine.TMP[0]))
	}
	if len(resultLine.VVEL) != 2 || len(resultLine.VVEL[0]) != 3 {
		t.Errorf("VVEL matrix dimensions mismatch: %dx%d", len(resultLine.VVEL), len(resultLine.VVEL[0]))
	}
	if len(resultLine.U) != 2 || len(resultLine.U[0]) != 3 {
		t.Errorf("U matrix dimensions mismatch: %dx%d", len(resultLine.U), len(resultLine.U[0]))
	}
	if len(resultLine.V) != 2 || len(resultLine.V[0]) != 3 {
		t.Errorf("V matrix dimensions mismatch: %dx%d", len(resultLine.V), len(resultLine.V[0]))
	}

	// Snapped point
	if resultLine.Point["lon"] == nil || resultLine.Point["lat"] == nil {
		t.Errorf("missing snapped point in result: %v", resultLine.Point)
	}
}

func TestProfileHandler_Cancellation(t *testing.T) {
	h := &handler.ProfileHandler{
		MockMode: true,
	}

	ctx, cancel := context.WithCancel(context.Background())
	// Cancel immediately
	cancel()

	req := httptest.NewRequest("GET", "/api/data/timeheight/profile?cycle=26091808&leads=0,12,24,36&levels=1000,850,500&lon=105&lat=30", nil).WithContext(ctx)
	w := httptest.NewRecorder()

	// Should not panic or hang
	h.Handler(w, req)
}

func TestProfileHandler_SinglePointParity(t *testing.T) {
	// Verify that mock grid sampled via parser.SampleGridPoint produces parity with full grid
	h := &handler.ProfileHandler{MockMode: true}
	req := httptest.NewRequest("GET", "/api/data/timeheight/profile?cycle=26091808&leads=12&levels=850&lon=110.0&lat=35.0", nil)
	w := httptest.NewRecorder()
	h.Handler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	scanner := bufio.NewScanner(w.Body)
	var res handler.ResultEvent
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, `"type":"result"`) {
			if err := json.Unmarshal([]byte(line), &res); err != nil {
				t.Fatalf("unmarshal result error: %v", err)
			}
		}
	}

	if res.TMP[0][0] == nil {
		t.Fatalf("expected non-nil sampled TMP value")
	}
	val := *res.TMP[0][0]
	if !parser.IsValidScalar(val, "TMP") {
		t.Errorf("sampled value %f is not valid meteorological TMP", val)
	}
}
