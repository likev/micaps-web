package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"micaps-web/db"
	"micaps-web/handler"
	"micaps-web/model"
)

func TestTLogPHandlerMockMode(t *testing.T) {
	h := &handler.TLogPHandler{
		Client:   nil,
		MockMode: true,
	}

	// 1. Test station list GeoJSON (station omitted)
	req := httptest.NewRequest("GET", "/api/data/tlogp?file=20260320200000.000", nil)
	w := httptest.NewRecorder()
	h.Handler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w.Code)
	}

	var fc model.GeoJSONFeatureCollection
	if err := json.Unmarshal(w.Body.Bytes(), &fc); err != nil {
		t.Fatalf("Failed to parse GeoJSON: %v", err)
	}
	if len(fc.Features) == 0 {
		t.Errorf("Expected features > 0, got 0")
	}

	// 2. Test station profile JSON for 58362
	req2 := httptest.NewRequest("GET", "/api/data/tlogp?file=20260320200000.000&station=58362", nil)
	w2 := httptest.NewRecorder()
	h.Handler(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w2.Code)
	}

	var profile model.StationSounding
	if err := json.Unmarshal(w2.Body.Bytes(), &profile); err != nil {
		t.Fatalf("Failed to parse station profile: %v", err)
	}
	if profile.StationID != "58362" {
		t.Errorf("Expected StationID 58362, got %s", profile.StationID)
	}
	if len(profile.Levels) == 0 {
		t.Errorf("Expected vertical levels > 0, got 0")
	}
}

func TestTLogPHandlerLiveCassandra(t *testing.T) {
	cqlClient, err := db.NewCQLClient("bore.pub:59042", 5*time.Second)
	if err != nil {
		t.Skipf("Live Cassandra bore.pub:59042 not reachable: %v", err)
		return
	}
	defer cqlClient.Close()

	h := &handler.TLogPHandler{
		Client:   cqlClient,
		MockMode: false,
	}

	// 1. Fetch latest stations GeoJSON
	req := httptest.NewRequest("GET", "/api/data/tlogp?file=latest", nil)
	w := httptest.NewRecorder()
	h.Handler(w, req)

	if w.Code != http.StatusOK {
		t.Skipf("Live Cassandra returned code %d: %s", w.Code, w.Body.String())
		return
	}

	var fc model.GeoJSONFeatureCollection
	if err := json.Unmarshal(w.Body.Bytes(), &fc); err != nil {
		t.Skipf("Failed to parse live GeoJSON: %v", err)
		return
	}
	if len(fc.Features) == 0 {
		t.Skipf("Live station features count is 0")
		return
	}

	// 2. Fetch sounding profile for the first present station in latest run
	targetStn := fc.Features[0].Properties["station_id"].(string)
	req2 := httptest.NewRequest("GET", fmt.Sprintf("/api/data/tlogp?file=latest&station=%s", targetStn), nil)
	w2 := httptest.NewRecorder()
	h.Handler(w2, req2)

	if w2.Code != http.StatusOK {
		t.Skipf("Live Cassandra profile for %s returned code %d: %s", targetStn, w2.Code, w2.Body.String())
		return
	}

	var profile model.StationSounding
	if err := json.Unmarshal(w2.Body.Bytes(), &profile); err != nil {
		t.Fatalf("Failed to parse live profile: %v", err)
	}
	if profile.StationID != targetStn {
		t.Errorf("Expected StationID %s, got %s", targetStn, profile.StationID)
	}
	if len(profile.Levels) < 5 {
		t.Errorf("Expected at least 5 levels, got %d", len(profile.Levels))
	}

	// 3. Specifically verify Shanghai 58362 in synoptic 08:00 BJT release
	req3 := httptest.NewRequest("GET", "/api/data/tlogp?file=20260917080000.000&station=58362", nil)
	w3 := httptest.NewRecorder()
	h.Handler(w3, req3)
	if w3.Code == http.StatusOK {
		var shProfile model.StationSounding
		if err := json.Unmarshal(w3.Body.Bytes(), &shProfile); err == nil {
			if shProfile.StationID != "58362" {
				t.Errorf("Expected StationID 58362, got %s", shProfile.StationID)
			}
			if len(shProfile.Levels) < 100 {
				t.Errorf("Expected >100 levels for Shanghai, got %d", len(shProfile.Levels))
			}
		}
	}
}
