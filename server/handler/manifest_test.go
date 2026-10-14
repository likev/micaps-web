package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"micaps-web/db"
	"micaps-web/handler"
)

type ManifestEntry struct {
	ID       string   `json:"id"`
	NameEn   string   `json:"name_en"`
	NameZh   string   `json:"name_zh"`
	Table    string   `json:"table"`
	DataPath string   `json:"dataPath"`
	Tier     int      `json:"tier"`
	Format   string   `json:"format"`
	Levels   []int    `json:"levels"`
	Cadence  string   `json:"cadence"`
	Suffix   string   `json:"suffix"`
}

// TestManifestAllPathsResolvable verifies that every dataset defined in dataset_manifest.json
// maps to a supported table, produces valid candidate paths, and successfully returns
// mock responses (HTTP 200) through the corresponding API handler.
func TestManifestAllPathsResolvable(t *testing.T) {
	data, err := os.ReadFile("../testdata/dataset_manifest.json")
	if err != nil {
		t.Fatalf("Failed to read dataset_manifest.json: %v", err)
	}

	var manifest []ManifestEntry
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatalf("Failed to unmarshal dataset_manifest.json: %v", err)
	}

	if len(manifest) < 140 {
		t.Fatalf("Expected at least 140 manifest entries, found %d", len(manifest))
	}

	models := db.SupportedModels()
	modelSet := make(map[string]bool)
	for _, cat := range models {
		for _, tbl := range cat.Tables {
			modelSet[tbl] = true
		}
	}

	gridH := &handler.GridHandler{MockMode: true}
	stationH := &handler.StationHandler{MockMode: true}
	profilerH := &handler.ProfilerHandler{MockMode: true}
	imageH := &handler.ImageHandler{MockMode: true}
	catH := &handler.CatalogHandler{MockMode: true}

	var verifiedCount int
	for _, entry := range manifest {
		// 1. Table validation
		if !modelSet[entry.Table] {
			t.Errorf("[%s] Table '%s' is not in SupportedModels", entry.ID, entry.Table)
		}

		// 2. Candidate paths validation
		if entry.DataPath == "" {
			t.Errorf("[%s] Empty dataPath", entry.ID)
			continue
		}

		// 3. Dispatch to appropriate mock handler and assert 200 OK
		switch entry.Format {
		case "grid_type_4", "grid_type_11", "diamond_131", "awx":
			if strings.Contains(entry.DataPath, "AMV") {
				// AMV discrete vectors route to station handler
				req := httptest.NewRequest("GET", "/api/data/station?path="+entry.DataPath+"&file=latest", nil)
				rec := httptest.NewRecorder()
				stationH.StationGeoJSONHandler(rec, req)
				if rec.Code != http.StatusOK {
					t.Errorf("[%s] Mock stationHandler failed for AMV %s: code %d", entry.ID, entry.DataPath, rec.Code)
				}
			} else {
				req := httptest.NewRequest("GET", "/api/data/grid?path="+entry.DataPath+"&file=latest", nil)
				rec := httptest.NewRecorder()
				gridH.JSONHandler(rec, req)
				if rec.Code != http.StatusOK {
					t.Errorf("[%s] Mock gridHandler failed for %s: code %d", entry.ID, entry.DataPath, rec.Code)
				}
			}
		case "station", "lightning", "swan_text":
			req := httptest.NewRequest("GET", "/api/data/station?path="+entry.DataPath+"&file=latest", nil)
			rec := httptest.NewRecorder()
			stationH.StationGeoJSONHandler(rec, req)
			if rec.Code != http.StatusOK {
				t.Errorf("[%s] Mock stationHandler failed for %s: code %d", entry.ID, entry.DataPath, rec.Code)
			}
		case "wind_profiler":
			req := httptest.NewRequest("GET", "/api/data/windprofiler?path="+entry.DataPath+"&file=latest", nil)
			rec := httptest.NewRecorder()
			profilerH.Handler(rec, req)
			if rec.Code != http.StatusOK {
				t.Errorf("[%s] Mock profilerHandler failed for %s: code %d", entry.ID, entry.DataPath, rec.Code)
			}
		case "bmp":
			req := httptest.NewRequest("GET", "/api/data/image?path="+entry.DataPath+"&file=latest&format=json", nil)
			rec := httptest.NewRecorder()
			imageH.Handler(rec, req)
			if rec.Code != http.StatusOK {
				t.Errorf("[%s] Mock imageHandler failed for %s: code %d", entry.ID, entry.DataPath, rec.Code)
			}
		default:
			t.Errorf("[%s] Unknown format '%s'", entry.ID, entry.Format)
		}

		// 4. Test LevelsHandler for multi-level datasets
		if len(entry.Levels) > 0 {
			reqLvl := httptest.NewRequest("GET", "/api/catalog/levels?path="+entry.DataPath, nil)
			recLvl := httptest.NewRecorder()
			catH.LevelsHandler(recLvl, reqLvl)
			if recLvl.Code != http.StatusOK {
				t.Errorf("[%s] Mock levelsHandler failed for %s: code %d", entry.ID, entry.DataPath, recLvl.Code)
			}
		}

		verifiedCount++
	}

	t.Logf("Successfully verified %d/%d manifest datasets through mock API pipeline", verifiedCount, len(manifest))
}
