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
	"micaps-web/mock"
)

func decodeNDJSON(t *testing.T, body string) (progress []map[string]interface{}, result map[string]interface{}) {
	t.Helper()
	sc := bufio.NewScanner(strings.NewReader(body))
	sc.Buffer(make([]byte, 1024*1024), 1024*1024*8)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var g map[string]interface{}
		if err := json.Unmarshal([]byte(line), &g); err != nil {
			t.Fatalf("parse NDJSON: %v line=%s", err, line)
		}
		typ, _ := g["type"].(string)
		if typ == "progress" {
			progress = append(progress, g)
		} else if typ == "result" {
			result = g
		}
	}
	return progress, result
}

func TestLineHeight_Validation(t *testing.T) {
	h := &handler.LineHeightHandler{MockMode: true}
	tests := []struct {
		name  string
		query string
		want  int
	}{
		{"missing cycle", "lead=24&levels=850,500&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"bad cycle", "cycle=123&lead=24&levels=850,500&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"missing lead", "cycle=26091808&levels=850,500&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"lead out of range", "cycle=26091808&lead=300&levels=850,500&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"lead list rejected", "cycle=26091808&lead=0,12&levels=850,500&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"missing levels", "cycle=26091808&lead=24&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"levels too many", "cycle=26091808&lead=24&levels=1000,925,850,700,600,500,400,300,250,200,100&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"bad lon", "cycle=26091808&lead=24&levels=850&lon0=500&lat0=28&lon1=125&lat1=38", 400},
		{"bad npoints", "cycle=26091808&lead=24&levels=850&lon0=115&lat0=28&lon1=125&lat1=38&npoints=200", 400},
		{"degenerate A==B", "cycle=26091808&lead=24&levels=850&lon0=115&lat0=28&lon1=115.01&lat1=28.01", 400},
		{"traversal", "cycle=26091808&lead=24&levels=850&lon0=115&lat0=28&lon1=125&lat1=38&x=..", 400},
		{"fully out of domain", "cycle=26091808&lead=24&levels=850&lon0=-150&lat0=-60&lon1=-140&lat1=-50", 400},
		{"bad model", "model=../../etc&cycle=26091808&lead=24&levels=850&lon0=115&lat0=28&lon1=125&lat1=38", 400},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/data/lineheight/profile?"+tt.query, nil)
			w := httptest.NewRecorder()
			h.Handler(w, req)
			if w.Code != tt.want {
				t.Errorf("want %d got %d body=%s", tt.want, w.Code, w.Body.String())
			}
		})
	}
}

func TestLineHeight_MockStream(t *testing.T) {
	h := &handler.LineHeightHandler{MockMode: true}
	// levels=850,500 & lead=24 & npoints=5 -> 2*4=8 progress + result[2][5]
	req := httptest.NewRequest("GET", "/api/data/lineheight/profile?cycle=26091808&lead=24&levels=850,500&lon0=100&lat0=25&lon1=120&lat1=35&npoints=5", nil)
	w := httptest.NewRecorder()
	h.Handler(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("want 200 got %d %s", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "application/x-ndjson") {
		t.Errorf("content-type %s", ct)
	}
	prog, res := decodeNDJSON(t, w.Body.String())
	if len(prog) != 8 {
		t.Errorf("want 8 progress got %d", len(prog))
	}
	for i, p := range prog {
		if int(p["loaded"].(float64)) != i+1 {
			t.Errorf("loaded want %d got %v", i+1, p["loaded"])
		}
		if int(p["total"].(float64)) != 8 {
			t.Errorf("total want 8 got %v", p["total"])
		}
		if p["lastSource"] != "mock" {
			t.Errorf("source want mock got %v", p["lastSource"])
		}
	}
	if res == nil {
		t.Fatalf("missing result")
	}
	rh, _ := res["rh"].([]interface{})
	if len(rh) != 2 {
		t.Fatalf("rh rows want 2 got %d", len(rh))
	}
	if len(rh[0].([]interface{})) != 5 {
		t.Errorf("rh cols want 5 got %d", len(rh[0].([]interface{})))
	}
	if _, ok := res["pointA"]; !ok {
		t.Errorf("missing pointA")
	}
	if _, ok := res["pointB"]; !ok {
		t.Errorf("missing pointB")
	}
	if _, ok := res["distKm"]; !ok {
		t.Errorf("missing distKm")
	}
	if int(res["lead"].(float64)) != 24 {
		t.Errorf("lead want 24 got %v", res["lead"])
	}
}

func TestHovmoller_Validation(t *testing.T) {
	h := &handler.HovmollerHandler{MockMode: true}
	tests := []struct {
		name  string
		query string
		want  int
	}{
		{"missing cycle", "leads=0,12&level=850&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"bad cycle", "cycle=1&leads=0,12&level=850&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"missing leads", "cycle=26091808&level=850&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"lead out of range", "cycle=26091808&leads=0,999&level=850&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"missing level", "cycle=26091808&leads=0,12&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"level list rejected", "cycle=26091808&leads=0,12&level=850,500&lon0=115&lat0=28&lon1=125&lat1=38", 400},
		{"bad lonlat", "cycle=26091808&leads=0,12&level=850&lon0=999&lat0=28&lon1=125&lat1=38", 400},
		{"bad npoints", "cycle=26091808&leads=0,12&level=850&lon0=115&lat0=28&lon1=125&lat1=38&npoints=1", 400},
		{"degenerate", "cycle=26091808&leads=0,12&level=850&lon0=115&lat0=28&lon1=115.01&lat1=28.01", 400},
		{"fully out", "cycle=26091808&leads=0,12&level=850&lon0=-150&lat0=-60&lon1=-140&lat1=-50", 400},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/data/hovmoller/profile?"+tt.query, nil)
			w := httptest.NewRecorder()
			h.Handler(w, req)
			if w.Code != tt.want {
				t.Errorf("want %d got %d body=%s", tt.want, w.Code, w.Body.String())
			}
		})
	}
}

func TestHovmoller_MockStream(t *testing.T) {
	h := &handler.HovmollerHandler{MockMode: true}
	// leads=0,12,24 & level=850 & npoints=5 -> 3*4=12 progress + result[3][5]
	req := httptest.NewRequest("GET", "/api/data/hovmoller/profile?cycle=26091808&leads=0,12,24&level=850&lon0=100&lat0=25&lon1=120&lat1=35&npoints=5", nil)
	w := httptest.NewRecorder()
	h.Handler(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("want 200 got %d %s", w.Code, w.Body.String())
	}
	prog, res := decodeNDJSON(t, w.Body.String())
	if len(prog) != 12 {
		t.Errorf("want 12 progress got %d", len(prog))
	}
	for i, p := range prog {
		if int(p["loaded"].(float64)) != i+1 {
			t.Errorf("loaded want %d got %v", i+1, p["loaded"])
		}
	}
	if res == nil {
		t.Fatalf("missing result")
	}
	rh, _ := res["rh"].([]interface{})
	if len(rh) != 3 || len(rh[0].([]interface{})) != 5 {
		t.Errorf("rh dims want 3x5 got %dx%d", len(rh), len(rh[0].([]interface{})))
	}
	leads, _ := res["leads"].([]interface{})
	if len(leads) != 3 {
		t.Errorf("leads want 3 got %d", len(leads))
	}
	if int(res["level"].(float64)) != 850 {
		t.Errorf("level want 850 got %v", res["level"])
	}
}

func TestLineProfile_CancelNoHang(t *testing.T) {
	lh := &handler.LineHeightHandler{MockMode: true}
	hh := &handler.HovmollerHandler{MockMode: true}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest("GET", "/api/data/lineheight/profile?cycle=26091808&lead=24&levels=1000,850,500&lon0=100&lat0=25&lon1=120&lat1=35&npoints=5", nil).WithContext(ctx)
	w := httptest.NewRecorder()
	lh.Handler(w, req)
	req2 := httptest.NewRequest("GET", "/api/data/hovmoller/profile?cycle=26091808&leads=0,12,24,36&level=850&lon0=100&lat0=25&lon1=120&lat1=35&npoints=5", nil).WithContext(ctx)
	w2 := httptest.NewRecorder()
	hh.Handler(w2, req2)
	_ = fmt.Sprint("")
}

func TestLineProfile_Parity(t *testing.T) {
	// 1-node transect sample equals SampleGridPoint direct within 1e-4
	lh := &handler.LineHeightHandler{MockMode: true}
	lon0, lat0 := 110.0, 35.0
	lon1, lat1 := 110.25, 35.0 // ~0.25deg apart to pass degenerate guard
	req := httptest.NewRequest("GET", fmt.Sprintf("/api/data/lineheight/profile?cycle=26091808&lead=12&levels=850&lon0=%v&lat0=%v&lon1=%v&lat1=%v&npoints=2", lon0, lat0, lon1, lat1), nil)
	w := httptest.NewRecorder()
	lh.Handler(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("want 200 got %d %s", w.Code, w.Body.String())
	}
	_, res := decodeNDJSON(t, w.Body.String())
	if res == nil {
		t.Fatalf("missing result")
	}
	tmpRows, _ := res["tmp"].([]interface{})
	v0, _ := tmpRows[0].([]interface{})[0].(float64)
	// Direct sample
	mr := mock.GenerateMockGrid("TMP", 850, 12)
	dec := parser.EncodeMICAPSDecompressed(mr)
	sp, err := parser.SampleGridPoint(dec, lon0, lat0, "TMP")
	if err != nil {
		t.Fatalf("direct sample err %v", err)
	}
	diff := v0 - sp.Scalar
	if diff < 0 {
		diff = -diff
	}
	if diff > 1e-4 {
		t.Errorf("parity diff %v > 1e-4 (wire %v direct %v)", diff, v0, sp.Scalar)
	}
}
