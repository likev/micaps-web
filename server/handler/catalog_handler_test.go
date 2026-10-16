package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"micaps-web/handler"
)

func TestCatalogHandler_LevelsHandler(t *testing.T) {
	h := &handler.CatalogHandler{
		Client:   nil,
		MockMode: true,
	}

	tests := []struct {
		name          string
		path          string
		expectLevels  []int
		mustNotLevels []int
	}{
		{
			name:          "SHANGHAI_MR has all synoptic levels including 500",
			path:          "SHANGHAI_MR/RH",
			expectLevels:  []int{1000, 925, 850, 700, 500, 400, 300, 250, 200, 100},
			mustNotLevels: nil,
		},
		{
			name:          "GRAPES_3KM has all synoptic levels including 500",
			path:          "GRAPES_3KM/HGT",
			expectLevels:  []int{1000, 925, 850, 700, 500, 400, 300, 250, 200, 100},
			mustNotLevels: nil,
		},
		{
			name:          "ECMWF_HR has all synoptic levels including 500 and 700",
			path:          "ECMWF_HR/TMP",
			expectLevels:  []int{1000, 925, 850, 700, 500, 400, 300, 250, 200, 100},
			mustNotLevels: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/catalog/levels?path="+tc.path, nil)
			w := httptest.NewRecorder()
			h.LevelsHandler(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("expected 200 OK, got %d", w.Code)
			}

			var levels []int
			if err := json.Unmarshal(w.Body.Bytes(), &levels); err != nil {
				t.Fatalf("failed to decode JSON response: %v", err)
			}

			for _, el := range tc.expectLevels {
				found := false
				for _, l := range levels {
					if l == el {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("path %s expected to contain level %d, got %v", tc.path, el, levels)
				}
			}

			for _, notLvl := range tc.mustNotLevels {
				for _, l := range levels {
					if l == notLvl {
						t.Errorf("path %s must NOT contain level %d, but found in %v", tc.path, notLvl, levels)
					}
				}
			}
		})
	}
}

func TestCatalogHandler_TreeHandler_HistoryMode(t *testing.T) {
	h := &handler.CatalogHandler{
		Client:   nil,
		MockMode: true,
	}

	// 1. Valid observation history date
	req := httptest.NewRequest("GET", "/api/catalog/tree?path=SURFACE/PLOT_10MIN&date=2026-09-10", nil)
	w := httptest.NewRecorder()
	h.TreeHandler(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}
	var obsFiles []map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &obsFiles); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}
	if len(obsFiles) == 0 {
		t.Fatalf("expected non-empty files for history mode")
	}
	for _, f := range obsFiles {
		name := f["name"].(string)
		if len(name) < 8 || name[:8] > "20260910" {
			t.Errorf("expected observation file on or before 2026-09-10, got %s", name)
		}
	}

	// 2. Valid NWP history date
	reqNwp := httptest.NewRequest("GET", "/api/catalog/tree?path=ECMWF_HR/TMP/500&date=2026-09-10", nil)
	wNwp := httptest.NewRecorder()
	h.TreeHandler(wNwp, reqNwp)
	if wNwp.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", wNwp.Code)
	}
	var nwpFiles []map[string]interface{}
	if err := json.Unmarshal(wNwp.Body.Bytes(), &nwpFiles); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}
	for _, f := range nwpFiles {
		name := f["name"].(string)
		if len(name) < 6 || name[:6] > "260910" {
			t.Errorf("expected NWP file on or before 260910, got %s", name)
		}
	}

	// 3. Invalid date -> 400 Bad Request
	reqInvalid := httptest.NewRequest("GET", "/api/catalog/tree?path=SURFACE/PLOT_10MIN&date=not-a-date", nil)
	wInvalid := httptest.NewRecorder()
	h.TreeHandler(wInvalid, reqInvalid)
	if wInvalid.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for malformed date, got %d", wInvalid.Code)
	}
}

func TestCatalogHandler_LatestHandler_HistoryMode(t *testing.T) {
	h := &handler.CatalogHandler{
		Client:   nil,
		MockMode: true,
	}

	// 1. Valid NWP history date
	req := httptest.NewRequest("GET", "/api/catalog/latest?path=ECMWF_HR/TMP/500&date=2026-09-10", nil)
	w := httptest.NewRecorder()
	h.LatestHandler(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}
	var res map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}
	if res["latest"] != "26091020.024" {
		t.Errorf("expected latest cycle 26091020.024, got %s", res["latest"])
	}

	// 2. Valid Observation history date
	reqObs := httptest.NewRequest("GET", "/api/catalog/latest?path=SURFACE/PLOT_10MIN&date=2026-09-10", nil)
	wObs := httptest.NewRecorder()
	h.LatestHandler(wObs, reqObs)
	if wObs.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", wObs.Code)
	}
	var resObs map[string]string
	if err := json.Unmarshal(wObs.Body.Bytes(), &resObs); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}
	if resObs["latest"] != "20260910200000.000" {
		t.Errorf("expected observation latest timestamp 20260910200000.000, got %s", resObs["latest"])
	}

	// 3. Valid Satellite history date
	reqSat := httptest.NewRequest("GET", "/api/catalog/latest?path=SATELLITE/FY4B/L1/CHINA/C006&date=2026-09-10", nil)
	wSat := httptest.NewRecorder()
	h.LatestHandler(wSat, reqSat)
	if wSat.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", wSat.Code)
	}
	var resSat map[string]string
	if err := json.Unmarshal(wSat.Body.Bytes(), &resSat); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}
	if resSat["latest"] != "20260910200000.AWX" {
		t.Errorf("expected satellite latest timestamp 20260910200000.AWX, got %s", resSat["latest"])
	}

	// 4. Invalid date -> 400 Bad Request
	reqInvalid := httptest.NewRequest("GET", "/api/catalog/latest?path=ECMWF_HR/TMP/500&date=bad_date", nil)
	wInvalid := httptest.NewRecorder()
	h.LatestHandler(wInvalid, reqInvalid)
	if wInvalid.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for malformed date, got %d", wInvalid.Code)
	}
}

