package parser

import (
	"os"
	"testing"
)

func TestParseDiamondTextStation_MarineROCEA(t *testing.T) {
	fixturePath := "../testdata/marine_rocea.bin"
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("Failed to read fixture %s: %v", fixturePath, err)
	}

	decompressed, err := DecompressGzip(raw)
	if err != nil {
		t.Fatalf("DecompressGzip failed: %v", err)
	}

	fc, err := ParseDiamondTextStation(decompressed)
	if err != nil {
		t.Fatalf("ParseDiamondTextStation failed: %v", err)
	}

	if fc == nil {
		t.Fatal("expected non-nil GeoJSONFeatureCollection")
	}

	// Exact station count in marine_rocea.bin is 35
	if len(fc.Features) != 35 {
		t.Fatalf("expected exactly 35 stations, got %d", len(fc.Features))
	}

	// Verify first station (MAQT2)
	feat0 := fc.Features[0]
	props0 := feat0.Properties
	if props0["station_id"] != "MAQT2" {
		t.Errorf("expected station_id MAQT2, got %v", props0["station_id"])
	}
	if len(feat0.Geometry.Coordinates) != 2 {
		t.Fatalf("expected 2 coordinates, got %d", len(feat0.Geometry.Coordinates))
	}
	if feat0.Geometry.Coordinates[0] != -97.03 || feat0.Geometry.Coordinates[1] != 27.98 {
		t.Errorf("expected coords [-97.03, 27.98], got %v", feat0.Geometry.Coordinates)
	}
	if props0["temperature"] != float32(28.8) {
		t.Errorf("expected temperature 28.8, got %v", props0["temperature"])
	}
	if props0["dewpoint"] != float32(30.8) {
		t.Errorf("expected dewpoint 30.8, got %v", props0["dewpoint"])
	}

	// Verify station 41056 (which previously broke due to 125 total value count)
	found41056 := false
	for _, f := range fc.Features {
		if f.Properties["station_id"] == "41056" {
			found41056 = true
			if f.Geometry.Coordinates[0] != -65.46 || f.Geometry.Coordinates[1] != 18.26 {
				t.Errorf("station 41056 coords mismatch: %v", f.Geometry.Coordinates)
			}
			break
		}
	}
	if !found41056 {
		t.Error("station 41056 was not found in parsed features")
	}
}

func TestParseDiamond11Grid_Synthetic(t *testing.T) {
	// Synthetic 2x2 grid
	data := []byte(`diamond 11 2026101500_WIND
2026 10 15 0 0 1000 1.0 1.0 100.0 101.0 30.0 31.0 2 2
10.0 12.0
8.0 9.0
2.0 3.0
1.0 1.5
`)

	resp, err := ParseDiamond11Grid(data)
	if err != nil {
		t.Fatalf("ParseDiamond11Grid failed: %v", err)
	}

	if resp.Header.Discriminator != "diamond 11" {
		t.Errorf("expected 'diamond 11', got %q", resp.Header.Discriminator)
	}
	if resp.Header.LongitudeGridNumber != 2 || resp.Header.LatitudeGridNumber != 2 {
		t.Errorf("expected 2x2 grid, got %dx%d", resp.Header.LongitudeGridNumber, resp.Header.LatitudeGridNumber)
	}
	if len(resp.Values) != 4 {
		t.Fatalf("expected 4 speed values, got %d", len(resp.Values))
	}
	if len(resp.U) != 4 || len(resp.V) != 4 {
		t.Errorf("expected 4 U/V values, got U:%d V:%d", len(resp.U), len(resp.V))
	}
}

func TestParseDiamondTextStation_EdgeCases(t *testing.T) {
	// Empty data
	fc, err := ParseDiamondTextStation([]byte{})
	if err != nil {
		t.Errorf("empty input should not error: %v", err)
	}
	if len(fc.Features) != 0 {
		t.Errorf("expected 0 features for empty input, got %d", len(fc.Features))
	}

	// Incomplete header
	fc, err = ParseDiamondTextStation([]byte("diamond 1\n"))
	if err != nil {
		t.Errorf("incomplete header should not error: %v", err)
	}
	if len(fc.Features) != 0 {
		t.Errorf("expected 0 features, got %d", len(fc.Features))
	}
}
