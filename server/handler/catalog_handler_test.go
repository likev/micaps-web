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
			name:          "SHANGHAI_MR has only boundary levels (no <= 700)",
			path:          "SHANGHAI_MR/RH",
			expectLevels:  []int{1000, 925, 850},
			mustNotLevels: []int{700, 500, 200},
		},
		{
			name:          "GRAPES_3KM has only boundary levels (no <= 700)",
			path:          "GRAPES_3KM/HGT",
			expectLevels:  []int{1000, 925, 850},
			mustNotLevels: []int{700, 500, 200},
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
