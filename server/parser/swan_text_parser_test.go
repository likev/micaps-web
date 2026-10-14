package parser

import (
	"os"
	"testing"
)

func TestParseSwanText_HailFixture(t *testing.T) {
	fixturePath := "../testdata/swan_text_hail.bin"
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("Failed to read fixture %s: %v", fixturePath, err)
	}

	fc, err := ParseSwanText(raw)
	if err != nil {
		t.Fatalf("ParseSwanText failed: %v", err)
	}

	if fc == nil {
		t.Fatal("expected non-nil GeoJSONFeatureCollection")
	}
	// Fixture has 0 active hail events
	if len(fc.Features) != 0 {
		t.Errorf("expected 0 features for inactive hail fixture, got %d", len(fc.Features))
	}
}

func TestParseSwanText_TvsFixture(t *testing.T) {
	fixturePath := "../testdata/swan_text_tvs.bin"
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("Failed to read fixture %s: %v", fixturePath, err)
	}

	fc, err := ParseSwanText(raw)
	if err != nil {
		t.Fatalf("ParseSwanText failed: %v", err)
	}

	if fc == nil {
		t.Fatal("expected non-nil GeoJSONFeatureCollection")
	}
	// Fixture has 0 active tvs events
	if len(fc.Features) != 0 {
		t.Errorf("expected 0 features for inactive tvs fixture, got %d", len(fc.Features))
	}
}

func TestParseSwanText_SyntheticEvents(t *testing.T) {
	synthetic := []byte(`Diamond 35 冰雹识别和预报产品
TAB 2026-10-15 12:00:00 2 9999
6 时间 站号 经度 纬度 移动速度(m/s) 移动方向
202610151200 58362 121.45 31.22 15.2 240
202610151200 54511 116.40 39.90 10.5 180
`)

	fc, err := ParseSwanText(synthetic)
	if err != nil {
		t.Fatalf("ParseSwanText synthetic failed: %v", err)
	}

	if len(fc.Features) != 2 {
		t.Fatalf("expected 2 features, got %d", len(fc.Features))
	}

	feat0 := fc.Features[0]
	if feat0.Geometry.Coordinates[0] != 121.45 || feat0.Geometry.Coordinates[1] != 31.22 {
		t.Errorf("expected coords [121.45, 31.22], got %v", feat0.Geometry.Coordinates)
	}
	if feat0.Properties["站号"] != "58362" {
		t.Errorf("expected 站号 58362, got %v", feat0.Properties["站号"])
	}

	feat1 := fc.Features[1]
	if feat1.Geometry.Coordinates[0] != 116.40 || feat1.Geometry.Coordinates[1] != 39.90 {
		t.Errorf("expected coords [116.40, 39.90], got %v", feat1.Geometry.Coordinates)
	}
	if feat1.Properties["站号"] != "54511" {
		t.Errorf("expected 站号 54511, got %v", feat1.Properties["站号"])
	}
}

func TestParseSwanText_EdgeCases(t *testing.T) {
	// Empty data
	fc, err := ParseSwanText([]byte{})
	if err != nil {
		t.Errorf("empty data should not error: %v", err)
	}
	if len(fc.Features) != 0 {
		t.Errorf("expected 0 features for empty data, got %d", len(fc.Features))
	}

	// Non-diamond header
	_, err = ParseSwanText([]byte("random header line\nTAB 2026-10-15 00:00:00\n"))
	if err == nil {
		t.Error("expected error for non-Diamond 35 header")
	}
}
