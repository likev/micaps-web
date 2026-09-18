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

func TestDiamond5ParserRealCMAMultiLineHeaderAndLenTimesSix(t *testing.T) {
	// Real CMA Diamond 5:
	// Line 0: "diamond 5"
	// Line 1: description on its own line "202609132000_TLOGP"
	// Line 2: "2026 9 13 20 2"
	// Line 3: station header with fields[4] = 6 * numLevels (e.g. 30 for 5 levels, 6120 for 1020 levels)
	var sb strings.Builder
	sb.WriteString("diamond 5\n")
	sb.WriteString("202609132000_TLOGP\n")
	sb.WriteString("2026 9 13 20 2\n")

	// Station 54511 Beijing (5 levels, len = 5 * 6 = 30)
	sb.WriteString("54511 116.47 39.93 31.3 30\n")
	sb.WriteString("   1000.0   5.0   22.0   15.0   180   3.0\n")
	sb.WriteString("   925.0   75.0   17.0   12.0   190   5.0\n")
	sb.WriteString("   850.0   150.0   12.0   8.0   210   8.0\n")
	sb.WriteString("   700.0   310.0   2.0   -5.0   230   12.0\n")
	sb.WriteString("   500.0   588.0   -15.0   -25.0   260   18.0\n")

	// Station 58362 Shanghai (1020 levels, len = 1020 * 6 = 6120)
	sb.WriteString("58362 121.44 31.39 5.5 6120\n")
	for i := 0; i < 1020; i++ {
		p := 1020.0 - float64(i)*0.95
		h := float64(i) * 3.5
		temp := 25.0 - float64(i)*0.08
		dew := temp - 2.5
		sb.WriteString(fmt.Sprintf("   %.1f   %.1f   %.2f   %.2f   130   4.0\n", p, h, temp, dew))
	}

	raw := []byte(sb.String())

	// 1. ExtractStationsGeoJSON
	geoJSON, err := parser.ExtractStationsGeoJSON(raw)
	if err != nil {
		t.Fatalf("ExtractStationsGeoJSON failed: %v", err)
	}
	if len(geoJSON.Features) != 2 {
		t.Fatalf("Expected 2 features, got %d", len(geoJSON.Features))
	}
	shFeat := geoJSON.Features[1]
	if shFeat.Properties["station_id"] != "58362" {
		t.Errorf("Expected station_id 58362, got %v", shFeat.Properties["station_id"])
	}
	if shFeat.Properties["num_levels"] != 1020 {
		t.Errorf("Expected 1020 levels for 58362, got %v", shFeat.Properties["num_levels"])
	}
	if shFeat.Properties["surface_temp"] != 25.0 {
		t.Errorf("Expected surface_temp 25.0, got %v", shFeat.Properties["surface_temp"])
	}

	// 2. ExtractStationProfile for 58362 (located AFTER 54511)
	profile, err := parser.ExtractStationProfile(raw, "58362")
	if err != nil {
		t.Fatalf("ExtractStationProfile(58362) failed on real CMA structure: %v", err)
	}
	if profile.StationID != "58362" {
		t.Errorf("Expected station 58362, got %s", profile.StationID)
	}
	if profile.ObsTime != "2026-09-13 20:00" {
		t.Errorf("Expected ObsTime '2026-09-13 20:00', got %s", profile.ObsTime)
	}
	if profile.NumLevels != 1020 {
		t.Errorf("Expected 1020 levels, got %d", profile.NumLevels)
	}
	if len(profile.Levels) != 1020 {
		t.Errorf("Expected 1020 levels slice, got %d", len(profile.Levels))
	}

	// 3. ExtractStationProfile for 54511 (located BEFORE 58362)
	profileBj, err := parser.ExtractStationProfile(raw, "54511")
	if err != nil {
		t.Fatalf("ExtractStationProfile(54511) failed: %v", err)
	}
	if profileBj.NumLevels != 5 {
		t.Errorf("Expected 5 levels for Beijing, got %d", profileBj.NumLevels)
	}
}

func TestDiamond5ParserMultipleLevelsPerLine(t *testing.T) {
	data := []byte(`diamond 5 202609132000_TLOGP
2026 9 13 20 1
58362 121.44 31.39 5.5 12
1000.0 5.0 22.0 15.0 180 3.0 925.0 75.0 17.0 12.0 190 5.0
`)
	profile, err := parser.ExtractStationProfile(data, "58362")
	if err != nil {
		t.Fatalf("ExtractStationProfile failed: %v", err)
	}
	if profile.NumLevels != 2 {
		t.Fatalf("Expected 2 levels, got %d", profile.NumLevels)
	}
	if profile.Levels[0].Pressure != 1000.0 || profile.Levels[1].Pressure != 925.0 {
		t.Errorf("Unexpected pressure levels: %v, %v", profile.Levels[0].Pressure, profile.Levels[1].Pressure)
	}
}

