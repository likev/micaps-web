package parser_test

import (
	"fmt"
	"strings"
	"testing"

	"micaps-web/parser"
)

func generateDiamond5Fixture() []byte {
	var sb strings.Builder
	sb.WriteString("diamond 5 202603202000_TLOGP\n")
	sb.WriteString("2026 3 20 20 2\n")

	// Station 89571 (Antarctica) with some missing and negative values
	sb.WriteString("89571 77.97 -68.57 23 5\n")
	sb.WriteString("   1000   -23.6   9999   9999   9999   9999\n")
	sb.WriteString("   968   9999   -14.7   -19.7   130   4\n")
	sb.WriteString("   925   36.2   -12.7   -10.0   255   5\n") // Td (-10.0) > T (-12.7) -> should sanitize Td = T
	sb.WriteString("   850   100.0   -17.9   -18.8   305   1\n")
	sb.WriteString("   700   243.3   -24.7   -27.8   125   4\n")

	// Station 58362 (Shanghai / Baoshan) with 1020 levels
	sb.WriteString("58362 121.44 31.39 5.5 1020\n")
	for i := 0; i < 1020; i++ {
		p := 1020.0 - float64(i)*0.95
		h := float64(i) * 3.5 // dagpm -> *10 gpm
		t := 20.0 - float64(i)*0.08
		td := t - 3.0
		sb.WriteString(fmt.Sprintf("   %.1f   %.1f   %.2f   %.2f   120   5.0\n", p, h, t, td))
	}

	return []byte(sb.String())
}

func TestDiamond5Parser(t *testing.T) {
	fixture := generateDiamond5Fixture()

	// 1. Test GeoJSON extraction
	geoJSON, err := parser.ExtractStationsGeoJSON(fixture)
	if err != nil {
		t.Fatalf("ExtractStationsGeoJSON failed: %v", err)
	}
	if len(geoJSON.Features) != 2 {
		t.Fatalf("Expected 2 features, got %d", len(geoJSON.Features))
	}

	// Verify Antarctic station
	stn1 := geoJSON.Features[0]
	if stn1.Properties["station_id"] != "89571" {
		t.Errorf("Expected station_id 89571, got %v", stn1.Properties["station_id"])
	}
	if coords := stn1.Geometry.Coordinates; coords[0] != 77.97 || coords[1] != -68.57 {
		t.Errorf("Unexpected coordinates: %v", coords)
	}

	// Verify Shanghai station in GeoJSON
	stn2 := geoJSON.Features[1]
	if stn2.Properties["station_id"] != "58362" {
		t.Errorf("Expected station_id 58362, got %v", stn2.Properties["station_id"])
	}
	if stn2.Properties["num_levels"] != 1020 {
		t.Errorf("Expected 1020 levels, got %v", stn2.Properties["num_levels"])
	}
	if !strings.Contains(stn2.Properties["name"].(string), "上海") {
		t.Errorf("Expected name to contain 上海, got %v", stn2.Properties["name"])
	}

	// 2. Test ExtractStationProfile for 58362
	profile, err := parser.ExtractStationProfile(fixture, "58362")
	if err != nil {
		t.Fatalf("ExtractStationProfile(58362) failed: %v", err)
	}
	if profile.StationID != "58362" {
		t.Errorf("Expected StationID 58362, got %s", profile.StationID)
	}
	if profile.NumLevels != 1020 {
		t.Errorf("Expected 1020 levels, got %d", profile.NumLevels)
	}
	if len(profile.Levels) != 1020 {
		t.Errorf("Expected 1020 level items, got %d", len(profile.Levels))
	}
	if profile.ObsTime != "2026-03-20 20:00" {
		t.Errorf("Expected ObsTime '2026-03-20 20:00', got %s", profile.ObsTime)
	}

	// Level 10 conversion verification (dagpm * 10 = gpm)
	lvl10 := profile.Levels[10]
	expectedH := 10.0 * 3.5 * 10.0
	if lvl10.Height != expectedH {
		t.Errorf("Expected height %.1f, got %.1f", expectedH, lvl10.Height)
	}

	// 3. Test ExtractStationProfile for 89571 (missing values & Td <= T validation)
	profileAntarctica, err := parser.ExtractStationProfile(fixture, "89571")
	if err != nil {
		t.Fatalf("ExtractStationProfile(89571) failed: %v", err)
	}
	if profileAntarctica.NumLevels != 5 {
		t.Fatalf("Expected 5 levels for 89571, got %d", profileAntarctica.NumLevels)
	}

	// Level 0: 1000 hPa -23.6 dagpm, missing temp/dew/wind
	lvl0 := profileAntarctica.Levels[0]
	if lvl0.Height != -236.0 {
		t.Errorf("Expected height -236.0, got %.1f", lvl0.Height)
	}
	if lvl0.Temp != -9999.0 || lvl0.DewPoint != -9999.0 {
		t.Errorf("Expected missing temp & dewpoint (-9999), got T=%.1f, Td=%.1f", lvl0.Temp, lvl0.DewPoint)
	}

	// Level 2: 925 hPa with T=-12.7, Td=-10.0 -> sanitized to Td = T (-12.7)
	lvl2 := profileAntarctica.Levels[2]
	if lvl2.DewPoint > lvl2.Temp {
		t.Errorf("DewPoint %.2f should not exceed Temp %.2f", lvl2.DewPoint, lvl2.Temp)
	}
	if lvl2.DewPoint != lvl2.Temp {
		t.Errorf("Expected DewPoint to be sanitized to Temp %.2f, got %.2f", lvl2.Temp, lvl2.DewPoint)
	}

	// 4. Test non-existent station
	_, err = parser.ExtractStationProfile(fixture, "99999")
	if err == nil {
		t.Errorf("Expected error for non-existent station 99999")
	}
}
