package handler_test

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
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
		{
			name:        "Surface station T-variation-24H",
			path:        "/api/derived/SURFACE/T-VARIATION-24H/20261014080000.000",
			file:        "",
			expectDer:   true,
			expectStn:   true,
			expectModel: "SURFACE",
			expectElem:  "TMP",
			expectType:  "T-VARIATION-24H",
			expectL1:    "SURFACE",
			expectFile:  "20261014080000.000",
		},
		{
			name:        "Surface station SLP-variation-24H",
			path:        "/api/derived/SURFACE/SLP-VARIATION-24H",
			file:        "20261014080000.000",
			expectDer:   true,
			expectStn:   true,
			expectModel: "SURFACE",
			expectElem:  "SLP",
			expectType:  "SLP-VARIATION-24H",
			expectL1:    "SURFACE",
			expectFile:  "20261014080000.000",
		},
		{
			name:        "Upper air 850hPa T-variation-24H",
			path:        "/api/derived/UPPER_AIR/PLOT/T-VARIATION-24H/850/20261014080000.000",
			file:        "",
			expectDer:   true,
			expectStn:   true,
			expectModel: "UPPER_AIR",
			expectElem:  "TMP",
			expectType:  "T-VARIATION-24H",
			expectL1:    "850",
			expectFile:  "20261014080000.000",
		},
		{
			name:        "ECMWF_HR 850hPa T-variation-24H",
			path:        "/api/derived/ECMWF_HR/T-VARIATION-24H/850",
			file:        "26101408.024",
			expectDer:   true,
			expectStn:   false,
			expectModel: "ECMWF_HR",
			expectElem:  "TMP",
			expectType:  "T-VARIATION-24H",
			expectL1:    "850",
			expectFile:  "26101408.024",
		},
		{
			name:        "ECMWF_HR SLP-variation-24H",
			path:        "/api/derived/ECMWF_HR/SLP-VARIATION-24H",
			file:        "26101408.024",
			expectDer:   true,
			expectStn:   false,
			expectModel: "ECMWF_HR",
			expectElem:  "PRMSL",
			expectType:  "SLP-VARIATION-24H",
			expectL1:    "0",
			expectFile:  "26101408.024",
		},
		{
			name:        "ECMWF_HR 850hPa 4-part T-variation-24H",
			path:        "/api/derived/ECMWF_HR/TMP/T-VARIATION-24H/850",
			file:        "26101408.024",
			expectDer:   true,
			expectStn:   false,
			expectModel: "ECMWF_HR",
			expectElem:  "TMP",
			expectType:  "T-VARIATION-24H",
			expectL1:    "850",
			expectFile:  "26101408.024",
		},
		{
			name:        "Surface station 4-part T-variation-24H",
			path:        "/api/derived/SURFACE/TMP/T-VARIATION-24H",
			file:        "20261014080000.000",
			expectDer:   true,
			expectStn:   true,
			expectModel: "SURFACE",
			expectElem:  "TMP",
			expectType:  "T-VARIATION-24H",
			expectL1:    "SURFACE",
			expectFile:  "20261014080000.000",
		},
		{
			name:        "Upper-Air 850hPa 5-part T-variation-24H",
			path:        "/api/derived/UPPER_AIR/PLOT/TMP/T-VARIATION-24H/850",
			file:        "20261014080000.000",
			expectDer:   true,
			expectStn:   true,
			expectModel: "UPPER_AIR",
			expectElem:  "TMP",
			expectType:  "T-VARIATION-24H",
			expectL1:    "850",
			expectFile:  "20261014080000.000",
		},
		{
			name:        "ECMWF_HR PRMSL SLP-variation-48H",
			path:        "/api/derived/ECMWF_HR/PRMSL/SLP-VARIATION-48H",
			file:        "26101408.048",
			expectDer:   true,
			expectStn:   false,
			expectModel: "ECMWF_HR",
			expectElem:  "PRMSL",
			expectType:  "SLP-VARIATION-48H",
			expectL1:    "0",
			expectFile:  "26101408.048",
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

func TestMockTimeDerivedCalculations(t *testing.T) {
	dH := &handler.DerivedHandler{
		Client:   nil,
		Cache:    nil,
		MockMode: true,
	}

	// 1. Mock Surface Station T-variation-24H
	dReqSfcT, ok := handler.ParseDerivedPath("/api/derived/SURFACE/T-VARIATION-24H", "20261014080000.000")
	if !ok || !dReqSfcT.IsTimeDerived {
		t.Fatalf("ParseDerivedPath failed for SURFACE/T-VARIATION-24H")
	}
	stnResp, err := dH.CalculateDerivedStation(dReqSfcT)
	if err != nil {
		t.Fatalf("Mock CalculateDerivedStation for SURFACE/T-VARIATION-24H failed: %v", err)
	}
	if len(stnResp.Features) == 0 {
		t.Fatalf("Expected non-empty mock station features")
	}
	if _, okT := stnResp.Features[0].Properties["temperature"]; !okT {
		t.Fatalf("Expected temperature property in derived surface station")
	}
	if _, okT24 := stnResp.Features[0].Properties["t_var_24h"]; !okT24 {
		t.Fatalf("Expected t_var_24h property in derived surface station")
	}
	if _, okVal := stnResp.Features[0].Properties["val"]; !okVal {
		t.Fatalf("Expected val property in derived surface station")
	}

	// 1b. Mock Surface Station T-variation-48H
	dReqSfcT48, ok48 := handler.ParseDerivedPath("/api/derived/SURFACE/T-VARIATION-48H", "20261014080000.000")
	if !ok48 || !dReqSfcT48.IsTimeDerived || dReqSfcT48.TimeDeltaHours != 48 {
		t.Fatalf("ParseDerivedPath failed for SURFACE/T-VARIATION-48H")
	}
	stnResp48, err48 := dH.CalculateDerivedStation(dReqSfcT48)
	if err48 != nil {
		t.Fatalf("Mock CalculateDerivedStation for SURFACE/T-VARIATION-48H failed: %v", err48)
	}
	if len(stnResp48.Features) == 0 {
		t.Fatalf("Expected non-empty mock station features for 48H")
	}
	if _, okT48 := stnResp48.Features[0].Properties["t_var_48h"]; !okT48 {
		t.Fatalf("Expected t_var_48h property in derived surface station 48H")
	}
	if _, okVal48 := stnResp48.Features[0].Properties["value"]; !okVal48 {
		t.Fatalf("Expected value property in derived surface station 48H")
	}

	// 2. Mock Surface Station SLP-variation-24H
	dReqSfcSLP, ok := handler.ParseDerivedPath("/api/derived/SURFACE/SLP-VARIATION-24H", "20261014080000.000")
	if !ok || !dReqSfcSLP.IsTimeDerived {
		t.Fatalf("ParseDerivedPath failed for SURFACE/SLP-VARIATION-24H")
	}
	stnSLPResp, err := dH.CalculateDerivedStation(dReqSfcSLP)
	if err != nil {
		t.Fatalf("Mock CalculateDerivedStation for SURFACE/SLP-VARIATION-24H failed: %v", err)
	}
	if len(stnSLPResp.Features) == 0 {
		t.Fatalf("Expected non-empty mock station features")
	}
	if _, okSLP := stnSLPResp.Features[0].Properties["slp"]; !okSLP {
		t.Fatalf("Expected slp property in derived surface station")
	}
	if _, okSLP24 := stnSLPResp.Features[0].Properties["slp_var_24h"]; !okSLP24 {
		t.Fatalf("Expected slp_var_24h property in derived surface station")
	}
	if _, okSLPVal := stnSLPResp.Features[0].Properties["val"]; !okSLPVal {
		t.Fatalf("Expected val property in derived surface station SLP")
	}

	// 2b. Mock Surface Station SLP-variation-48H
	dReqSfcSLP48, okSLP48 := handler.ParseDerivedPath("/api/derived/SURFACE/SLP-VARIATION-48H", "20261014080000.000")
	if !okSLP48 || !dReqSfcSLP48.IsTimeDerived || dReqSfcSLP48.TimeDeltaHours != 48 {
		t.Fatalf("ParseDerivedPath failed for SURFACE/SLP-VARIATION-48H")
	}
	stnSLPResp48, errSLP48 := dH.CalculateDerivedStation(dReqSfcSLP48)
	if errSLP48 != nil {
		t.Fatalf("Mock CalculateDerivedStation for SURFACE/SLP-VARIATION-48H failed: %v", errSLP48)
	}
	if len(stnSLPResp48.Features) == 0 {
		t.Fatalf("Expected non-empty mock station features for SLP 48H")
	}
	if _, okSLP48Prop := stnSLPResp48.Features[0].Properties["slp_var_48h"]; !okSLP48Prop {
		t.Fatalf("Expected slp_var_48h property in derived surface station 48H")
	}

	// 3. Mock Upper-Air 850hPa T-variation-24H
	dReqUAT, ok := handler.ParseDerivedPath("/api/derived/UPPER_AIR/PLOT/T-VARIATION-24H/850", "20261014080000.000")
	if !ok || !dReqUAT.IsTimeDerived {
		t.Fatalf("ParseDerivedPath failed for UPPER_AIR/PLOT/T-VARIATION-24H/850")
	}
	stnUAResp, err := dH.CalculateDerivedStation(dReqUAT)
	if err != nil {
		t.Fatalf("Mock CalculateDerivedStation for UPPER_AIR/PLOT/T-VARIATION-24H/850 failed: %v", err)
	}
	if len(stnUAResp.Features) == 0 {
		t.Fatalf("Expected non-empty mock station features")
	}
	if _, okUAT24 := stnUAResp.Features[0].Properties["t_var_24h"]; !okUAT24 {
		t.Fatalf("Expected t_var_24h in derived upper-air station")
	}

	// 3b. Mock Upper-Air 850hPa T-variation-48H
	dReqUAT48, okUAT48 := handler.ParseDerivedPath("/api/derived/UPPER_AIR/PLOT/T-VARIATION-48H/850", "20261014080000.000")
	if !okUAT48 || !dReqUAT48.IsTimeDerived || dReqUAT48.TimeDeltaHours != 48 {
		t.Fatalf("ParseDerivedPath failed for UPPER_AIR/PLOT/T-VARIATION-48H/850")
	}
	stnUAResp48, errUAT48 := dH.CalculateDerivedStation(dReqUAT48)
	if errUAT48 != nil {
		t.Fatalf("Mock CalculateDerivedStation for UPPER_AIR/PLOT/T-VARIATION-48H/850 failed: %v", errUAT48)
	}
	if len(stnUAResp48.Features) == 0 {
		t.Fatalf("Expected non-empty mock station features for UA 48H")
	}
	if _, okUAT48Prop := stnUAResp48.Features[0].Properties["t_var_48h"]; !okUAT48Prop {
		t.Fatalf("Expected t_var_48h in derived upper-air station 48H")
	}

	// 4. Mock ECMWF_HR 850hPa T-variation-24H
	dReqECGridT, ok := handler.ParseDerivedPath("/api/derived/ECMWF_HR/T-VARIATION-24H/850", "26101408.024")
	if !ok || !dReqECGridT.IsTimeDerived {
		t.Fatalf("ParseDerivedPath failed for ECMWF_HR/T-VARIATION-24H/850")
	}
	gridResp, err := dH.CalculateDerivedGrid(dReqECGridT)
	if err != nil {
		t.Fatalf("Mock CalculateDerivedGrid for ECMWF_HR/T-VARIATION-24H/850 failed: %v", err)
	}
	if len(gridResp.Values) == 0 {
		t.Fatalf("Expected non-empty mock grid values")
	}

	// 4b. Mock ECMWF_HR 850hPa T-variation-48H
	dReqECGridT48, okECGridT48 := handler.ParseDerivedPath("/api/derived/ECMWF_HR/T-VARIATION-48H/850", "26101408.048")
	if !okECGridT48 || !dReqECGridT48.IsTimeDerived || dReqECGridT48.TimeDeltaHours != 48 {
		t.Fatalf("ParseDerivedPath failed for ECMWF_HR/T-VARIATION-48H/850")
	}
	gridResp48, errECGridT48 := dH.CalculateDerivedGrid(dReqECGridT48)
	if errECGridT48 != nil {
		t.Fatalf("Mock CalculateDerivedGrid for ECMWF_HR/T-VARIATION-48H/850 failed: %v", errECGridT48)
	}
	if len(gridResp48.Values) == 0 {
		t.Fatalf("Expected non-empty mock grid values for 48H")
	}

	// 5. Mock ECMWF_HR SLP-variation-24H
	dReqECGridSLP, ok := handler.ParseDerivedPath("/api/derived/ECMWF_HR/SLP-VARIATION-24H", "26101408.024")
	if !ok || !dReqECGridSLP.IsTimeDerived {
		t.Fatalf("ParseDerivedPath failed for ECMWF_HR/SLP-VARIATION-24H")
	}
	gridSLPResp, err := dH.CalculateDerivedGrid(dReqECGridSLP)
	if err != nil {
		t.Fatalf("Mock CalculateDerivedGrid for ECMWF_HR/SLP-VARIATION-24H failed: %v", err)
	}
	if len(gridSLPResp.Values) == 0 {
		t.Fatalf("Expected non-empty mock grid values")
	}

	// 5b. Mock ECMWF_HR SLP-variation-48H
	dReqECGridSLP48, okECGridSLP48 := handler.ParseDerivedPath("/api/derived/ECMWF_HR/SLP-VARIATION-48H", "26101408.048")
	if !okECGridSLP48 || !dReqECGridSLP48.IsTimeDerived || dReqECGridSLP48.TimeDeltaHours != 48 {
		t.Fatalf("ParseDerivedPath failed for ECMWF_HR/SLP-VARIATION-48H")
	}
	gridSLPResp48, errECGridSLP48 := dH.CalculateDerivedGrid(dReqECGridSLP48)
	if errECGridSLP48 != nil {
		t.Fatalf("Mock CalculateDerivedGrid for ECMWF_HR/SLP-VARIATION-48H failed: %v", errECGridSLP48)
	}
	if len(gridSLPResp48.Values) == 0 {
		t.Fatalf("Expected non-empty mock grid values for SLP 48H")
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

	// 1. Live Upper Air Station calculation with dynamic latest file
	filesUA, errUA := db.GetFileList(client, "UPPER_AIR/PLOT/850", 5)
	if errUA != nil || len(filesUA) == 0 {
		t.Skipf("No files found in UPPER_AIR/PLOT/850: %v", errUA)
	}
	latestUA := filesUA[0].Name
	t.Logf("Using latest live UPPER_AIR/PLOT/850 file: %s", latestUA)

	dReqStn, ok := handler.ParseDerivedPath("/api/derived/UPPER_AIR/PLOT/TMP/850-500", latestUA)
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

	// 1b. Live Upper Air 850hPa 24H Temperature Variation
	dReqUAVar, okUAVar := handler.ParseDerivedPath("/api/derived/UPPER_AIR/PLOT/T-VARIATION-24H/850", latestUA)
	if okUAVar {
		stnUAVar, errUAVar := dH.CalculateDerivedStation(dReqUAVar)
		if errUAVar != nil {
			t.Logf("Live UPPER_AIR/PLOT/T-VARIATION-24H/850 note: %v", errUAVar)
		} else if len(stnUAVar.Features) > 0 {
			t.Logf("Live UPPER_AIR 850hPa T-VAR-24H: Features=%d Val0=%v", len(stnUAVar.Features), stnUAVar.Features[0].Properties["temperature"])
		} else {
			t.Logf("Live UPPER_AIR 850hPa T-VAR-24H: 0 features")
		}
	}

	// 1c. Live Upper Air 850hPa 48H Temperature Variation
	dReqUAVar48, okUAVar48 := handler.ParseDerivedPath("/api/derived/UPPER_AIR/PLOT/T-VARIATION-48H/850", latestUA)
	if okUAVar48 {
		stnUAVar48, errUAVar48 := dH.CalculateDerivedStation(dReqUAVar48)
		if errUAVar48 != nil {
			t.Logf("Live UPPER_AIR/PLOT/T-VARIATION-48H/850 note: %v", errUAVar48)
		} else if len(stnUAVar48.Features) > 0 {
			t.Logf("Live UPPER_AIR 850hPa T-VAR-48H: Features=%d Val0=%v", len(stnUAVar48.Features), stnUAVar48.Features[0].Properties["temperature"])
		} else {
			t.Logf("Live UPPER_AIR 850hPa T-VAR-48H: 0 features")
		}
	}

	// 2. Live Surface Station Observation Variations
	filesSfc, errSfc := db.GetFileList(client, "SURFACE/PLOT_GLOBAL_3H", 5)
	if errSfc == nil && len(filesSfc) > 0 {
		latestSfc := filesSfc[0].Name
		t.Logf("Using latest live SURFACE/PLOT_GLOBAL_3H file: %s", latestSfc)

		// 2a. Surface T-variation-24H
		dReqSfcT, okSfcT := handler.ParseDerivedPath("/api/derived/SURFACE/T-VARIATION-24H", latestSfc)
		if okSfcT {
			stnSfcT, errSfcT := dH.CalculateDerivedStation(dReqSfcT)
			if errSfcT != nil {
				t.Logf("Live SURFACE/T-VARIATION-24H note: %v", errSfcT)
			} else if len(stnSfcT.Features) > 0 {
				t.Logf("Live SURFACE T-VAR-24H: Features=%d Val0=%v", len(stnSfcT.Features), stnSfcT.Features[0].Properties["temperature"])
			} else {
				t.Logf("Live SURFACE T-VAR-24H: 0 features")
			}
		}

		// 2b. Surface SLP-variation-24H
		dReqSfcSLP, okSfcSLP := handler.ParseDerivedPath("/api/derived/SURFACE/SLP-VARIATION-24H", latestSfc)
		if okSfcSLP {
			stnSfcSLP, errSfcSLP := dH.CalculateDerivedStation(dReqSfcSLP)
			if errSfcSLP != nil {
				t.Logf("Live SURFACE/SLP-VARIATION-24H note: %v", errSfcSLP)
			} else if len(stnSfcSLP.Features) > 0 {
				t.Logf("Live SURFACE SLP-VAR-24H: Features=%d Val0=%v", len(stnSfcSLP.Features), stnSfcSLP.Features[0].Properties["slp"])
			} else {
				t.Logf("Live SURFACE SLP-VAR-24H: 0 features")
			}
		}

		// 2c. Surface T-variation-48H
		dReqSfcT48, okSfcT48 := handler.ParseDerivedPath("/api/derived/SURFACE/T-VARIATION-48H", latestSfc)
		if okSfcT48 {
			stnSfcT48, errSfcT48 := dH.CalculateDerivedStation(dReqSfcT48)
			if errSfcT48 != nil {
				t.Logf("Live SURFACE/T-VARIATION-48H note: %v", errSfcT48)
			} else if len(stnSfcT48.Features) > 0 {
				t.Logf("Live SURFACE T-VAR-48H: Features=%d Val0=%v", len(stnSfcT48.Features), stnSfcT48.Features[0].Properties["temperature"])
			} else {
				t.Logf("Live SURFACE T-VAR-48H: 0 features")
			}
		}

		// 2d. Surface SLP-variation-48H
		dReqSfcSLP48, okSfcSLP48 := handler.ParseDerivedPath("/api/derived/SURFACE/SLP-VARIATION-48H", latestSfc)
		if okSfcSLP48 {
			stnSfcSLP48, errSfcSLP48 := dH.CalculateDerivedStation(dReqSfcSLP48)
			if errSfcSLP48 != nil {
				t.Logf("Live SURFACE/SLP-VARIATION-48H note: %v", errSfcSLP48)
			} else if len(stnSfcSLP48.Features) > 0 {
				t.Logf("Live SURFACE SLP-VAR-48H: Features=%d Val0=%v", len(stnSfcSLP48.Features), stnSfcSLP48.Features[0].Properties["slp"])
			} else {
				t.Logf("Live SURFACE SLP-VAR-48H: 0 features")
			}
		}
	}

	// 3. Live NWP Grid calculation on JAPAN_MR and ECMWF_HR
	filesJP, errJP := db.GetFileList(client, "JAPAN_MR/TMP/850", 5)
	if errJP == nil && len(filesJP) > 0 {
		latestJP := filesJP[0].Name
		dReqGrid, ok := handler.ParseDerivedPath("/api/derived/JAPAN_MR/TMP/850-500", latestJP)
		if ok {
			gridResp, errGrid := dH.CalculateDerivedGrid(dReqGrid)
			if errGrid == nil && gridResp != nil {
				t.Logf("Live JAPAN_MR TMP/850-500 Grid: Points=%d Stats=%+v", len(gridResp.Values), gridResp.Stats)
			}
		}
	}

	// 4. Live ECMWF_HR time-derived calculations
	filesEC, errEC := db.GetFileList(client, "ECMWF_HR/TMP/850", 5)
	t.Logf("ECMWF_HR/TMP/850 files: err=%v, count=%d", errEC, len(filesEC))
	if len(filesEC) > 0 {
		latestEC := filesEC[0].Name
		t.Logf("ECMWF_HR file 0: %s", latestEC)

		// 4a. 850hPa 24H Temperature Variation
		dReqEC24, okEC24 := handler.ParseDerivedPath("/api/derived/ECMWF_HR/T-VARIATION-24H/850", latestEC)
		if okEC24 {
			gridEC24, errGridEC24 := dH.CalculateDerivedGrid(dReqEC24)
			if errGridEC24 != nil {
				t.Logf("Live ECMWF_HR T-VARIATION-24H/850 note: %v", errGridEC24)
			} else if gridEC24 != nil {
				t.Logf("Live ECMWF_HR T-VARIATION-24H/850: points=%v stats=%+v", len(gridEC24.Values), gridEC24.Stats)
			}
		}

		// 4b. 850hPa 48H Temperature Variation
		dReqEC48, okEC48 := handler.ParseDerivedPath("/api/derived/ECMWF_HR/T-VARIATION-48H/850", latestEC)
		if okEC48 {
			gridEC48, errGridEC48 := dH.CalculateDerivedGrid(dReqEC48)
			if errGridEC48 != nil {
				t.Logf("Live ECMWF_HR T-VARIATION-48H/850 note: %v", errGridEC48)
			} else if gridEC48 != nil {
				t.Logf("Live ECMWF_HR T-VARIATION-48H/850: points=%v stats=%+v", len(gridEC48.Values), gridEC48.Stats)
			}
		}

		// 4c. SLP 24H Sea Level Pressure Variation
		filesSLP, errSLP := db.GetFileList(client, "ECMWF_HR/PRMSL", 10)
		t.Logf("ECMWF_HR/PRMSL files: err=%v, count=%d", errSLP, len(filesSLP))
		var testSLPFile string
		for _, f := range filesSLP {
			parts := strings.Split(f.Name, ".")
			if len(parts) >= 2 {
				if lead, errLead := strconv.Atoi(parts[1]); errLead == nil && lead >= 24 {
					testSLPFile = f.Name
					break
				}
			}
		}
		if testSLPFile == "" && len(filesSLP) > 0 {
			testSLPFile = filesSLP[0].Name
		}
		if testSLPFile != "" {
			t.Logf("Using live ECMWF_HR PRMSL file: %s", testSLPFile)
			dReqECSLP24, okECSLP24 := handler.ParseDerivedPath("/api/derived/ECMWF_HR/SLP-VARIATION-24H", testSLPFile)
			if okECSLP24 {
				gridECSLP24, errGridECSLP24 := dH.CalculateDerivedGrid(dReqECSLP24)
				if errGridECSLP24 != nil {
					t.Logf("Live ECMWF_HR SLP-VARIATION-24H note: %v", errGridECSLP24)
				} else if gridECSLP24 != nil {
					t.Logf("Live ECMWF_HR SLP-VARIATION-24H: points=%v stats=%+v", len(gridECSLP24.Values), gridECSLP24.Stats)
				}
			}

			// 4d. SLP 48H Sea Level Pressure Variation
			dReqECSLP48, okECSLP48 := handler.ParseDerivedPath("/api/derived/ECMWF_HR/SLP-VARIATION-48H", testSLPFile)
			if okECSLP48 {
				gridECSLP48, errGridECSLP48 := dH.CalculateDerivedGrid(dReqECSLP48)
				if errGridECSLP48 != nil {
					t.Logf("Live ECMWF_HR SLP-VARIATION-48H note: %v", errGridECSLP48)
				} else if gridECSLP48 != nil {
					t.Logf("Live ECMWF_HR SLP-VARIATION-48H: points=%v stats=%+v", len(gridECSLP48.Values), gridECSLP48.Stats)
				}
			}
		}

		// 4e. Surface 2m Temperature 24H Variation (TMP_2M fallback)
		dReqECT2m24, okECT2m24 := handler.ParseDerivedPath("/api/derived/ECMWF_HR/T-VARIATION-24H", latestEC)
		if okECT2m24 {
			gridECT2m24, errGridECT2m24 := dH.CalculateDerivedGrid(dReqECT2m24)
			if errGridECT2m24 != nil {
				t.Logf("Live ECMWF_HR Surface T-VARIATION-24H note: %v", errGridECT2m24)
			} else if gridECT2m24 != nil {
				t.Logf("Live ECMWF_HR Surface T-VARIATION-24H: points=%v stats=%+v", len(gridECT2m24.Values), gridECT2m24.Stats)
			}
		}

		// 4f. Cross-cycle NWP prior resolution (e.g., lead hour < delta)
		parts := strings.Split(latestEC, ".")
		if len(parts) >= 2 {
			leadSmallFile := fmt.Sprintf("%s.012", parts[0])
			dReqCrossCycle, okCross := handler.ParseDerivedPath("/api/derived/ECMWF_HR/T-VARIATION-24H/850", leadSmallFile)
			if okCross {
				gridCross, errCross := dH.CalculateDerivedGrid(dReqCrossCycle)
				if errCross != nil {
					t.Logf("Live cross-cycle ECMWF lead 012 note: %v", errCross)
				} else if gridCross != nil {
					t.Logf("Live cross-cycle ECMWF lead 012 resolved successfully: points=%d", len(gridCross.Values))
				}
			}
		}
	}
}

func TestCassandraLiveOtherModels(t *testing.T) {
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

	testCases := []struct {
		urlPath string
	}{
		{"/api/derived/JAPAN_MR/T-VARIATION-24H/850"},
		{"/api/derived/JAPAN_MR/T-VARIATION-24H/500"},
		{"/api/derived/JAPAN_MR/T-VARIATION-48H/850"},
		{"/api/derived/JAPAN_MR/SLP-VARIATION-24H"},
		{"/api/derived/JAPAN_MR/SLP-VARIATION-48H"},
		{"/api/derived/GRAPES_GFS/T-VARIATION-24H/850"},
		{"/api/derived/GRAPES_GFS/T-VARIATION-48H/850"},
		{"/api/derived/GRAPES_GFS/SLP-VARIATION-24H"},
		{"/api/derived/GRAPES_GFS/SLP-VARIATION-48H"},
		{"/api/derived/CMA_GFS/T-VARIATION-24H/850"},
		{"/api/derived/CMA_GFS/SLP-VARIATION-24H"},
		{"/api/derived/GFS/T-VARIATION-24H/850"},
		{"/api/derived/GFS/SLP-VARIATION-24H"},
		{"/api/derived/SHANGHAI_MR/T-VARIATION-24H/850"},
		{"/api/derived/SHANGHAI_MR/T-VARIATION-24H/500"},
		{"/api/derived/SHANGHAI_MR/SLP-VARIATION-24H"},
	}

	for _, tc := range testCases {
		req := httptest.NewRequest("GET", tc.urlPath, nil)
		rec := httptest.NewRecorder()
		dH.DirectHandler(rec, req)
		t.Logf("DirectHandler %-45s -> Code: %d BodyLen: %d", tc.urlPath, rec.Code, rec.Body.Len())
		if rec.Code != http.StatusOK {
			t.Errorf("DirectHandler %s failed with code %d: %s", tc.urlPath, rec.Code, rec.Body.String())
		}
	}

	// Test GridHandler and CatalogHandler integration for other models
	gridH := &handler.GridHandler{
		Client:  client,
		Derived: dH,
	}
	catH := &handler.CatalogHandler{
		Client: client,
	}

	// 1. GridHandler for JAPAN_MR
	recGrid := httptest.NewRecorder()
	reqGrid := httptest.NewRequest("GET", "/api/data/grid?path=/api/derived/JAPAN_MR/T-VARIATION-24H/850", nil)
	gridH.JSONHandler(recGrid, reqGrid)
	if recGrid.Code != http.StatusOK {
		t.Errorf("GridHandler JAPAN_MR failed: %s", recGrid.Body.String())
	} else {
		t.Logf("GridHandler JAPAN_MR T-VAR-24H/850 -> Code: 200 BodyLen: %d", recGrid.Body.Len())
	}

	// 2. CatalogHandler latest and tree for CMA_GFS & GFS
	recCatLatest := httptest.NewRecorder()
	reqCatLatest := httptest.NewRequest("GET", "/api/catalog/latest?path=CMA_GFS/T-VARIATION-24H/850", nil)
	catH.LatestHandler(recCatLatest, reqCatLatest)
	if recCatLatest.Code != http.StatusOK {
		t.Errorf("CatalogHandler latest CMA_GFS failed: %s", recCatLatest.Body.String())
	} else {
		t.Logf("CatalogHandler latest CMA_GFS: %s", recCatLatest.Body.String())
	}

	recCatTree := httptest.NewRecorder()
	reqCatTree := httptest.NewRequest("GET", "/api/catalog/tree?path=GFS/T-VARIATION-24H/850&limit=5", nil)
	catH.TreeHandler(recCatTree, reqCatTree)
	if recCatTree.Code != http.StatusOK {
		t.Errorf("CatalogHandler tree GFS failed: %s", recCatTree.Body.String())
	} else {
		t.Logf("CatalogHandler tree GFS: len=%d", recCatTree.Body.Len())
	}

	// 3. CatalogHandler levels for CMA_GFS, GFS, JAPAN_MR, and ECMWF_HR derived paths
	for _, p := range []string{
		"/api/derived/ECMWF_HR/T-VARIATION-24H/850",
		"/api/derived/JAPAN_MR/T-VARIATION-24H/850",
		"/api/derived/CMA_GFS/T-VARIATION-24H/850",
		"CMA_GFS/T-VARIATION-24H/850",
		"GFS/T-VARIATION-24H/850",
		"GRAPES_GFS/T-VARIATION-24H/850",
		"SHANGHAI_MR/T-VARIATION-24H/850",
	} {
		recLevels := httptest.NewRecorder()
		reqLevels := httptest.NewRequest("GET", "/api/catalog/levels?path="+p, nil)
		catH.LevelsHandler(recLevels, reqLevels)
		t.Logf("CatalogHandler levels %s -> Code: %d Body: %s", p, recLevels.Code, strings.TrimSpace(recLevels.Body.String()))
		if recLevels.Code != http.StatusOK {
			t.Errorf("CatalogHandler levels %s failed: code %d, body: %s", p, recLevels.Code, recLevels.Body.String())
		} else {
			var lvls []int
			if err := json.Unmarshal(recLevels.Body.Bytes(), &lvls); err != nil || len(lvls) == 0 {
				t.Errorf("CatalogHandler levels %s returned empty or invalid levels: %s", p, recLevels.Body.String())
			}
		}
	}

	// 4. Test explicit file queries and cross-cycle queries for other models
	for _, m := range []string{"JAPAN_MR", "GRAPES_GFS", "SHANGHAI_MR"} {
		files, err := db.GetFileList(client, m+"/TMP/850", 10)
		if err != nil || len(files) == 0 {
			t.Logf("No files for %s/TMP/850: %v", m, err)
			continue
		}
		t.Logf("%s files count=%d (first: %s)", m, len(files), files[0].Name)
		// 4a. Query with the latest file explicitly
		recFile := httptest.NewRecorder()
		reqFile := httptest.NewRequest("GET", fmt.Sprintf("/api/derived/%s/T-VARIATION-24H/850?file=%s", m, files[0].Name), nil)
		dH.DirectHandler(recFile, reqFile)
		if recFile.Code != http.StatusOK {
			t.Errorf("DirectHandler %s with explicit file %s failed: %s", m, files[0].Name, recFile.Body.String())
		} else {
			t.Logf("DirectHandler %s explicit file %s -> OK (%d bytes)", m, files[0].Name, recFile.Body.Len())
		}

		// 4b. Find a lead hour < 24 if available to test cross-cycle resolution
		for _, f := range files {
			parts := strings.Split(f.Name, ".")
			if len(parts) >= 2 {
				if lead, errLead := strconv.Atoi(parts[1]); errLead == nil && lead < 24 && lead > 0 {
					recCross := httptest.NewRecorder()
					reqCross := httptest.NewRequest("GET", fmt.Sprintf("/api/derived/%s/T-VARIATION-24H/850?file=%s", m, f.Name), nil)
					dH.DirectHandler(recCross, reqCross)
					t.Logf("Cross-cycle test %s lead %d (%s) -> Code: %d", m, lead, f.Name, recCross.Code)
					break
				}
			}
		}
	}
}
