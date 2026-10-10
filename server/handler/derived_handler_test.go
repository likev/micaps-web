package handler_test

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"micaps-web/config"
	"micaps-web/db"
	"micaps-web/handler"
	"micaps-web/model"
)

func TestParseDerivedPath(t *testing.T) {
	tests := []struct {
		name        string
		path        string
		file        string
		expectDer   bool
		expectStn   bool
		expectModel string
		expectElem  string
		expectType  string
		expectL1    string
		expectL2    string
		expectFile  string
	}{
		{
			name:        "Upper air station TMP 850-500 with file in URL",
			path:        "/api/derived/UPPER_AIR/PLOT/TMP/850-500/20261010080000.000",
			file:        "",
			expectDer:   true,
			expectStn:   true,
			expectModel: "UPPER_AIR",
			expectElem:  "TMP",
			expectType:  "DIFF",
			expectL1:    "850",
			expectL2:    "500",
			expectFile:  "20261010080000.000",
		},
		{
			name:        "ECMWF_HR TMP 850-500 with file in URL",
			path:        "/api/derived/ECMWF_HR/TMP/850-500/26100920.012",
			file:        "",
			expectDer:   true,
			expectStn:   false,
			expectModel: "ECMWF_HR",
			expectElem:  "TMP",
			expectType:  "DIFF",
			expectL1:    "850",
			expectL2:    "500",
			expectFile:  "26100920.012",
		},
		{
			name:        "JAPAN_MR TMP 850-500 with file in query",
			path:        "/api/derived/JAPAN_MR/TMP/850-500",
			file:        "26100708.012",
			expectDer:   true,
			expectStn:   false,
			expectModel: "JAPAN_MR",
			expectElem:  "TMP",
			expectType:  "DIFF",
			expectL1:    "850",
			expectL2:    "500",
			expectFile:  "26100708.012",
		},
		{
			name:        "ECMWF_HR K-Index",
			path:        "/api/derived/ECMWF_HR/K-INDEX",
			file:        "26100920.012",
			expectDer:   true,
			expectStn:   false,
			expectModel: "ECMWF_HR",
			expectElem:  "K-INDEX",
			expectType:  "K-INDEX",
			expectL1:    "850",
			expectL2:    "500",
			expectFile:  "26100920.012",
		},
		{
			name:        "ECMWF_HR Showalter Index",
			path:        "/api/derived/ECMWF_HR/SHOWALTER/26100920.012",
			file:        "",
			expectDer:   true,
			expectStn:   false,
			expectModel: "ECMWF_HR",
			expectElem:  "SHOWALTER",
			expectType:  "SHOWALTER",
			expectL1:    "850",
			expectL2:    "500",
			expectFile:  "26100920.012",
		},
		{
			name:        "ECMWF_HR SWEAT Index",
			path:        "/api/derived/ECMWF_HR/SWEAT/26100920.012",
			file:        "",
			expectDer:   true,
			expectStn:   false,
			expectModel: "ECMWF_HR",
			expectElem:  "SWEAT",
			expectType:  "SWEAT",
			expectL1:    "850",
			expectL2:    "500",
			expectFile:  "26100920.012",
		},
		{
			name:        "ECMWF_HR Lifted Index",
			path:        "/api/derived/ECMWF_HR/LIFTED/26100920.012",
			file:        "",
			expectDer:   true,
			expectStn:   false,
			expectModel: "ECMWF_HR",
			expectElem:  "LIFTED",
			expectType:  "LIFTED",
			expectL1:    "850",
			expectL2:    "500",
			expectFile:  "26100920.012",
		},
		{
			name:        "Upper air station K-INDEX",
			path:        "/api/derived/UPPER_AIR/PLOT/K-INDEX/20261010080000.000",
			file:        "",
			expectDer:   true,
			expectStn:   true,
			expectModel: "UPPER_AIR",
			expectElem:  "K-INDEX",
			expectType:  "K-INDEX",
			expectL1:    "850",
			expectL2:    "500",
			expectFile:  "20261010080000.000",
		},
		{
			name:        "Without derived prefix: ECMWF_HR/TMP/850-500",
			path:        "ECMWF_HR/TMP/850-500",
			file:        "26100920.012",
			expectDer:   true,
			expectStn:   false,
			expectModel: "ECMWF_HR",
			expectElem:  "TMP",
			expectType:  "DIFF",
			expectL1:    "850",
			expectL2:    "500",
			expectFile:  "26100920.012",
		},
		{
			name:        "Combined token T850-500",
			path:        "/api/derived/ECMWF_HR/T850-500/26100920.012",
			file:        "",
			expectDer:   true,
			expectStn:   false,
			expectModel: "ECMWF_HR",
			expectElem:  "TMP",
			expectType:  "DIFF",
			expectL1:    "850",
			expectL2:    "500",
			expectFile:  "26100920.012",
		},
		{
			name:        "Combined token UPPER_AIR/PLOT/T850-500",
			path:        "/api/derived/UPPER_AIR/PLOT/T850-500/20261010080000.000",
			file:        "",
			expectDer:   true,
			expectStn:   true,
			expectModel: "UPPER_AIR",
			expectElem:  "TMP",
			expectType:  "DIFF",
			expectL1:    "850",
			expectL2:    "500",
			expectFile:  "20261010080000.000",
		},
		{
			name:        "Latest keyword in URL file path",
			path:        "/api/derived/UPPER_AIR/PLOT/K-INDEX/latest",
			file:        "",
			expectDer:   true,
			expectStn:   true,
			expectModel: "UPPER_AIR",
			expectElem:  "K-INDEX",
			expectType:  "K-INDEX",
			expectL1:    "850",
			expectL2:    "500",
			expectFile:  "latest",
		},
		{
			name:        "Thickness 1000-500",
			path:        "/api/derived/ECMWF_HR/THICKNESS/26100920.012",
			file:        "",
			expectDer:   true,
			expectStn:   false,
			expectModel: "ECMWF_HR",
			expectElem:  "THICKNESS",
			expectType:  "THICKNESS",
			expectL1:    "1000",
			expectL2:    "500",
			expectFile:  "26100920.012",
		},
		{
			name:      "Removed legacy /derived/ grid path must NOT be parsed as derived",
			path:      "/derived/ECMWF_HR/TMP/850-500/26100920.012",
			file:      "",
			expectDer: false,
		},
		{
			name:      "Removed legacy /derived/ station path must NOT be parsed as derived",
			path:      "/derived/UPPER_AIR/PLOT/TMP/850-500/20261010080000.000",
			file:      "",
			expectDer: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req, ok := handler.ParseDerivedPath(tc.path, tc.file)
			if ok != tc.expectDer {
				t.Fatalf("expected isDerived=%v, got %v", tc.expectDer, ok)
			}
			if !tc.expectDer {
				return
			}
			if req.IsStation != tc.expectStn {
				t.Errorf("expected isStation=%v, got %v", tc.expectStn, req.IsStation)
			}
			if req.Model != tc.expectModel {
				t.Errorf("expected model=%s, got %s", tc.expectModel, req.Model)
			}
			if req.Element != tc.expectElem {
				t.Errorf("expected element=%s, got %s", tc.expectElem, req.Element)
			}
			if req.DerivedType != tc.expectType {
				t.Errorf("expected derivedType=%s, got %s", tc.expectType, req.DerivedType)
			}
			if req.Level1 != tc.expectL1 || req.Level2 != tc.expectL2 {
				t.Errorf("expected levels=%s-%s, got %s-%s", tc.expectL1, tc.expectL2, req.Level1, req.Level2)
			}
			if req.File != tc.expectFile {
				t.Errorf("expected file=%s, got %s", tc.expectFile, req.File)
			}
		})
	}
}

func TestThermodynamics(t *testing.T) {
	// 1. Dewpoint from RH
	td := handler.DewpointFromRH(20.0, 50.0)
	if td < 9.0 || td > 10.0 {
		t.Errorf("expected Dewpoint(20C, 50%%) ~ 9.3C, got %f", td)
	}

	// 2. Dewpoint saturation
	tdSat := handler.DewpointFromRH(15.0, 100.0)
	if math.Abs(tdSat-15.0) > 0.1 {
		t.Errorf("expected saturated dewpoint == temp (15C), got %f", tdSat)
	}

	// 3. Lift parcel dry & moist
	// Lift 850 hPa parcel (T=15, Td=10) to 500 hPa
	t500 := handler.LiftParcel(850.0, 15.0, 10.0, 500.0)
	if t500 > 0.0 || t500 < -30.0 {
		t.Errorf("expected lifted parcel at 500 hPa to be reasonable negative (-5 to -20 C), got %f", t500)
	}

	// 4. K-Index calculation: K = (T850 - T500) + Td850 - (T700 - Td700)
	// T850=20, Td850=14, T700=10, Td700=6, T500=-10
	// K = (20 - (-10)) + 14 - (10 - 6) = 30 + 14 - 4 = 40
	k := handler.CalculateKIndex(20.0, 14.0, 10.0, 6.0, -10.0)
	if math.Abs(k-40.0) > 1e-4 {
		t.Errorf("expected K=40, got %f", k)
	}

	// 5. Total Totals Index: TT = T850 + Td850 - 2*T500
	// TT = 20 + 14 - 2*(-10) = 54
	tt := handler.CalculateTotalTotals(20.0, 14.0, -10.0)
	if math.Abs(tt-54.0) > 1e-4 {
		t.Errorf("expected TT=54, got %f", tt)
	}

	// 6. Showalter Index: SSI = T500 - Tparcel500
	// If env T500 is -15, and parcel is -8, SSI = -15 - (-8) = -7 (unstable)
	ssi := handler.CalculateShowalter(18.0, 12.0, -15.0)
	if ssi > 10.0 || ssi < -25.0 {
		t.Errorf("expected plausible SSI, got %f", ssi)
	}

	// 7. SWEAT Index
	sweat := handler.CalculateSWEAT(20.0, 14.0, -10.0, 12.0, 180.0, 20.0, 250.0)
	if sweat <= 0.0 {
		t.Errorf("expected positive SWEAT index for severe setup, got %f", sweat)
	}

	// 8. Wind shear
	shear := handler.CalculateWindShear(0.0, 10.0, 10.0, 0.0)
	expectedHypot := math.Sqrt(200.0)
	if math.Abs(shear-expectedHypot) > 1e-4 {
		t.Errorf("expected shear ~ 14.14, got %f", shear)
	}
}

func TestDerivedHandler_MockCalculations(t *testing.T) {
	dH := &handler.DerivedHandler{
		Client:   nil,
		Cache:    nil,
		MockMode: true,
	}

	// 1. Grid Difference (T850 - T500)
	dReqGrid, ok := handler.ParseDerivedPath("/api/derived/ECMWF_HR/TMP/850-500", "26100920.012")
	if !ok {
		t.Fatal("failed to parse derived grid path")
	}
	gridResp, err := dH.CalculateDerivedGrid(dReqGrid)
	if err != nil {
		t.Fatalf("CalculateDerivedGrid failed: %v", err)
	}
	if len(gridResp.Values) == 0 {
		t.Fatal("expected non-empty grid values")
	}
	if gridResp.Header.Element != "TMP" {
		t.Errorf("expected Element=TMP, got %s", gridResp.Header.Element)
	}

	// 2. Grid Weather Index: K-INDEX
	dReqK, _ := handler.ParseDerivedPath("/api/derived/ECMWF_HR/K-INDEX", "26100920.012")
	kResp, errK := dH.CalculateDerivedGrid(dReqK)
	if errK != nil {
		t.Fatalf("CalculateDerivedGrid K-INDEX failed: %v", errK)
	}
	if kResp.Header.Element != "K-INDEX" {
		t.Errorf("expected Element=K-INDEX, got %s", kResp.Header.Element)
	}

	// 3. Grid Weather Index: SHOWALTER
	dReqSSI, _ := handler.ParseDerivedPath("/api/derived/ECMWF_HR/SHOWALTER", "26100920.012")
	ssiResp, errSSI := dH.CalculateDerivedGrid(dReqSSI)
	if errSSI != nil {
		t.Fatalf("CalculateDerivedGrid SHOWALTER failed: %v", errSSI)
	}
	if ssiResp.Header.Element != "SHOWALTER" {
		t.Errorf("expected Element=SHOWALTER, got %s", ssiResp.Header.Element)
	}

	// 4. Station Difference: UPPER_AIR/PLOT/TMP/850-500
	dReqStn, okStn := handler.ParseDerivedPath("/api/derived/UPPER_AIR/PLOT/TMP/850-500", "20261010080000.000")
	if !okStn {
		t.Fatal("failed to parse derived station path")
	}
	stnResp, errStn := dH.CalculateDerivedStation(dReqStn)
	if errStn != nil {
		t.Fatalf("CalculateDerivedStation failed: %v", errStn)
	}
	if len(stnResp.Features) == 0 {
		t.Fatal("expected non-empty station features")
	}
	firstProps := stnResp.Features[0].Properties
	if _, ok := firstProps["temperature"]; !ok {
		t.Errorf("expected temperature property in station feature, got %+v", firstProps)
	}

	// 5. Station Shear: UPPER_AIR/PLOT/SHEAR/850-500
	dReqShear, okShear := handler.ParseDerivedPath("/api/derived/UPPER_AIR/PLOT/SHEAR/850-500", "20261010080000.000")
	if !okShear {
		t.Fatal("failed to parse derived station SHEAR path")
	}
	shearStnResp, errShearStn := dH.CalculateDerivedStation(dReqShear)
	if errShearStn != nil {
		t.Fatalf("CalculateDerivedStation SHEAR failed: %v", errShearStn)
	}
	if len(shearStnResp.Features) == 0 {
		t.Fatal("expected non-empty station SHEAR features")
	}
	shearProps := shearStnResp.Features[0].Properties
	if _, ok := shearProps["shear"]; !ok {
		t.Errorf("expected shear property in station feature, got %+v", shearProps)
	}

	// 6. Station Thickness: UPPER_AIR/PLOT/THICKNESS
	dReqThick, okThick := handler.ParseDerivedPath("/api/derived/UPPER_AIR/PLOT/THICKNESS", "20261010080000.000")
	if !okThick {
		t.Fatal("failed to parse derived station THICKNESS path")
	}
	thickResp, errThick := dH.CalculateDerivedStation(dReqThick)
	if errThick != nil {
		t.Fatalf("CalculateDerivedStation THICKNESS failed: %v", errThick)
	}
	if len(thickResp.Features) == 0 {
		t.Fatal("expected non-empty station THICKNESS features")
	}
	thickProps := thickResp.Features[0].Properties
	if _, ok := thickProps["thickness"]; !ok {
		t.Errorf("expected thickness property in station feature, got %+v", thickProps)
	}
}

func TestDirectHandler_HTTPEndpoints(t *testing.T) {
	dH := &handler.DerivedHandler{
		Client:   nil,
		Cache:    nil,
		MockMode: true,
	}

	gridH := &handler.GridHandler{
		Client:   nil,
		Cache:    nil,
		MockMode: true,
		Derived:  dH,
	}

	statH := &handler.StationHandler{
		Client:   nil,
		MockMode: true,
		Derived:  dH,
	}

	catH := &handler.CatalogHandler{
		Client:   nil,
		MockMode: true,
	}
	staticH := &handler.StaticHandler{
		Cfg: &config.Config{StaticDir: "testdata"},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/derived/", dH.DirectHandler)
	mux.HandleFunc("/api/data/grid", gridH.JSONHandler)
	mux.HandleFunc("/api/data/grid/binary", gridH.BinaryHandler)
	mux.HandleFunc("/api/data/station", statH.StationGeoJSONHandler)
	mux.HandleFunc("/api/catalog/tree", catH.TreeHandler)
	mux.HandleFunc("/api/catalog/latest", catH.LatestHandler)
	mux.HandleFunc("/", staticH.SPAHandler)

	// 1. Direct URL: GET /api/derived/ECMWF_HR/TMP/850-500/26100920.012
	req1 := httptest.NewRequest("GET", "/api/derived/ECMWF_HR/TMP/850-500/26100920.012", nil)
	w1 := httptest.NewRecorder()
	mux.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("Direct URL expected 200 OK, got %d (%s)", w1.Code, w1.Body.String())
	}
	var grid1 model.GridResponse
	if err := json.Unmarshal(w1.Body.Bytes(), &grid1); err != nil {
		t.Fatalf("failed to decode GridResponse: %v", err)
	}
	if len(grid1.Values) == 0 {
		t.Errorf("expected non-empty grid values")
	}

	// 2. Direct URL binary: GET /api/derived/ECMWF_HR/TMP/850-500/26100920.012?binary=true
	req2 := httptest.NewRequest("GET", "/api/derived/ECMWF_HR/TMP/850-500/26100920.012?binary=true", nil)
	w2 := httptest.NewRecorder()
	mux.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("Direct binary expected 200 OK, got %d", w2.Code)
	}
	if len(w2.Body.Bytes()) < 32 {
		t.Errorf("expected binary stream length >= 32 bytes, got %d", len(w2.Body.Bytes()))
	}

	// 3. Direct Station URL: GET /api/derived/UPPER_AIR/PLOT/TMP/850-500/20261010080000.000
	req3 := httptest.NewRequest("GET", "/api/derived/UPPER_AIR/PLOT/TMP/850-500/20261010080000.000", nil)
	w3 := httptest.NewRecorder()
	mux.ServeHTTP(w3, req3)
	if w3.Code != http.StatusOK {
		t.Fatalf("Direct station expected 200 OK, got %d", w3.Code)
	}
	var fc model.GeoJSONFeatureCollection
	if err := json.Unmarshal(w3.Body.Bytes(), &fc); err != nil {
		t.Fatalf("failed to decode GeoJSONFeatureCollection: %v", err)
	}
	if len(fc.Features) == 0 {
		t.Errorf("expected non-empty station features")
	}

	// 4. API Query parameter: GET /api/data/grid?path=/api/derived/ECMWF_HR/TMP/850-500&file=26100920.012
	req4 := httptest.NewRequest("GET", "/api/data/grid?path=/api/derived/ECMWF_HR/TMP/850-500&file=26100920.012", nil)
	w4 := httptest.NewRecorder()
	mux.ServeHTTP(w4, req4)
	if w4.Code != http.StatusOK {
		t.Fatalf("API data grid expected 200 OK, got %d", w4.Code)
	}

	// 5. API Station Query parameter: GET /api/data/station?path=/api/derived/UPPER_AIR/PLOT/TMP/850-500&file=20261010080000.000
	req5 := httptest.NewRequest("GET", "/api/data/station?path=/api/derived/UPPER_AIR/PLOT/TMP/850-500&file=20261010080000.000", nil)
	w5 := httptest.NewRecorder()
	mux.ServeHTTP(w5, req5)
	if w5.Code != http.StatusOK {
		t.Fatalf("API station expected 200 OK, got %d", w5.Code)
	}

	// 6. API Catalog Tree: GET /api/catalog/tree?path=/api/derived/ECMWF_HR/TMP/850-500
	req6 := httptest.NewRequest("GET", "/api/catalog/tree?path=/api/derived/ECMWF_HR/TMP/850-500", nil)
	w6 := httptest.NewRecorder()
	mux.ServeHTTP(w6, req6)
	if w6.Code != http.StatusOK {
		t.Fatalf("API catalog tree expected 200 OK, got %d", w6.Code)
	}

	// 7. API Catalog Latest: GET /api/catalog/latest?path=/api/derived/ECMWF_HR/TMP/850-500
	req7 := httptest.NewRequest("GET", "/api/catalog/latest?path=/api/derived/ECMWF_HR/TMP/850-500", nil)
	w7 := httptest.NewRecorder()
	mux.ServeHTTP(w7, req7)
	if w7.Code != http.StatusOK {
		t.Fatalf("API catalog latest expected 200 OK, got %d", w7.Code)
	}

	// 8. Removed /derived/ route: GET /derived/ECMWF_HR/TMP/850-500/26100920.012 must return 404 (even with SPA fallback mounted)
	reqRemoved := httptest.NewRequest("GET", "/derived/ECMWF_HR/TMP/850-500/26100920.012", nil)
	wRemoved := httptest.NewRecorder()
	mux.ServeHTTP(wRemoved, reqRemoved)
	if wRemoved.Code != http.StatusNotFound {
		t.Fatalf("Expected 404 for removed /derived/ path, got %d", wRemoved.Code)
	}

	// 9. Removed /derived/ station route: GET /derived/UPPER_AIR/PLOT/TMP/850-500/20261010080000.000 must return 404
	reqRemovedStn := httptest.NewRequest("GET", "/derived/UPPER_AIR/PLOT/TMP/850-500/20261010080000.000", nil)
	wRemovedStn := httptest.NewRecorder()
	mux.ServeHTTP(wRemovedStn, reqRemovedStn)
	if wRemovedStn.Code != http.StatusNotFound {
		t.Fatalf("Expected 404 for removed /derived/ station path, got %d", wRemovedStn.Code)
	}

	// 10. Query parameter using removed /derived/ path must not succeed as derived
	reqRemovedParam := httptest.NewRequest("GET", "/api/data/grid?path=/derived/ECMWF_HR/TMP/850-500&file=26100920.012", nil)
	wRemovedParam := httptest.NewRecorder()
	mux.ServeHTTP(wRemovedParam, reqRemovedParam)
	if wRemovedParam.Code != http.StatusNotFound {
		t.Fatalf("Expected 404 for query param using removed /derived/ path, got %d", wRemovedParam.Code)
	}
}

func TestCassandraLiveDerivedCalculations(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping live Cassandra integration test in short mode")
	}
	client, err := db.NewCQLClient("bore.pub:59042", 5*time.Second)
	if err != nil {
		t.Skipf("Cassandra bore.pub:59042 not accessible: %v", err)
	}
	defer client.Close()

	dH := &handler.DerivedHandler{
		Client:   client,
		Cache:    nil,
		MockMode: false,
	}

	// 1. Live Upper Air Station T850-500 difference calculation
	dReqStn, ok := handler.ParseDerivedPath("/api/derived/UPPER_AIR/PLOT/TMP/850-500", "20260413080000.000")
	if !ok {
		t.Fatal("ParseDerivedPath failed for station")
	}
	stnResp, errStn := dH.CalculateDerivedStation(dReqStn)
	if errStn != nil {
		t.Fatalf("Live CalculateDerivedStation failed: %v", errStn)
	}
	if len(stnResp.Features) == 0 {
		t.Fatalf("Expected non-empty live station features")
	}
	firstProps := stnResp.Features[0].Properties
	t.Logf("Live UPPER_AIR/PLOT/TMP/850-500 Station[0]: ID=%v TempDiff=%v", firstProps["station_id"], firstProps["temperature"])

	// 1b. Live Upper Air K-INDEX
	dReqK, okK := handler.ParseDerivedPath("/api/derived/UPPER_AIR/PLOT/K-INDEX", "20260413080000.000")
	if okK {
		stnK, errK := dH.CalculateDerivedStation(dReqK)
		if errK != nil {
			t.Logf("Live UPPER_AIR/PLOT/K-INDEX failed: %v", errK)
		} else {
			t.Logf("Live UPPER_AIR/PLOT/K-INDEX: Features=%d Val0=%v", len(stnK.Features), stnK.Features[0].Properties["k_index"])
		}
	}

	// 1c. Live Upper Air SHEAR
	dReqShear, okShear := handler.ParseDerivedPath("/api/derived/UPPER_AIR/PLOT/SHEAR/850-500", "20260413080000.000")
	if okShear {
		stnShear, errShear := dH.CalculateDerivedStation(dReqShear)
		if errShear != nil {
			t.Logf("Live UPPER_AIR/PLOT/SHEAR failed: %v", errShear)
		} else {
			t.Logf("Live UPPER_AIR/PLOT/SHEAR: Features=%d Val0=%v", len(stnShear.Features), stnShear.Features[0].Properties["shear"])
		}
	}

	// 2. Live NWP Grid calculation on JAPAN_MR (TMP/850-500)
	dReqGrid, ok := handler.ParseDerivedPath("/api/derived/JAPAN_MR/TMP/850-500", "26100708.012")
	if !ok {
		t.Fatal("ParseDerivedPath failed for JAPAN_MR")
	}
	gridResp, errGrid := dH.CalculateDerivedGrid(dReqGrid)
	if errGrid != nil {
		t.Fatalf("Live CalculateDerivedGrid for JAPAN_MR failed: %v", errGrid)
	}
	if len(gridResp.Values) == 0 {
		t.Fatalf("Expected non-empty grid values for JAPAN_MR")
	}
	t.Logf("Live JAPAN_MR TMP/850-500 Grid: Points=%d Stats=%+v", len(gridResp.Values), gridResp.Stats)

	// 2b. Check treeview files for ECMWF_HR
	filesEC, errEC := db.GetFileList(client, "ECMWF_HR/TMP/850", 5)
	t.Logf("ECMWF_HR/TMP/850 files: err=%v, count=%d", errEC, len(filesEC))
	if len(filesEC) > 0 {
		t.Logf("ECMWF_HR file 0: %s", filesEC[0].Name)
		// Try derived on ECMWF_HR
		dReqEC, okEC := handler.ParseDerivedPath("/api/derived/ECMWF_HR/TMP/850-500", filesEC[0].Name)
		if okEC {
			gridEC, errGridEC := dH.CalculateDerivedGrid(dReqEC)
			if errGridEC != nil {
				t.Logf("Live ECMWF_HR TMP/850-500 failed: %v", errGridEC)
			} else if gridEC != nil {
				t.Logf("Live ECMWF_HR TMP/850-500: points=%v", len(gridEC.Values))
			}
		}
		// Try K-Index on ECMWF_HR
		dReqECK, okECK := handler.ParseDerivedPath("/api/derived/ECMWF_HR/K-INDEX", filesEC[0].Name)
		if okECK {
			gridECK, errGridECK := dH.CalculateDerivedGrid(dReqECK)
			if errGridECK != nil {
				t.Logf("Live ECMWF_HR K-INDEX failed: %v", errGridECK)
			} else if gridECK != nil {
				t.Logf("Live ECMWF_HR K-INDEX: points=%v", len(gridECK.Values))
			}
		}
	}
}
