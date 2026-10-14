package parser

import (
	"os"
	"testing"
)

func TestParseDiamond131_MCR(t *testing.T) {
	fixturePath := "../testdata/diamond131_mcr.bin"
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("Failed to read fixture %s: %v", fixturePath, err)
	}

	resp, err := ParseDiamond131(raw, 0)
	if err != nil {
		t.Fatalf("ParseDiamond131 failed: %v", err)
	}

	if resp.Header.Discriminator != "diamond 131" {
		t.Errorf("expected discriminator 'diamond 131', got %s", resp.Header.Discriminator)
	}
	if resp.Header.LongitudeGridNumber != 1200 {
		t.Errorf("expected LongitudeGridNumber 1200, got %d", resp.Header.LongitudeGridNumber)
	}
	if resp.Header.LatitudeGridNumber != 1000 {
		t.Errorf("expected LatitudeGridNumber 1000, got %d", resp.Header.LatitudeGridNumber)
	}
	if len(resp.Values) != 1200*1000 {
		t.Fatalf("expected 1,200,000 values, got %d", len(resp.Values))
	}
	if len(resp.X) != 1200 {
		t.Errorf("expected 1200 X coords, got %d", len(resp.X))
	}
	if len(resp.Y) != 1000 {
		t.Errorf("expected 1000 Y coords, got %d", len(resp.Y))
	}

	// Verify Y coordinates ascending (South to North)
	if resp.Y[0] >= resp.Y[len(resp.Y)-1] {
		t.Errorf("Y coordinates should ascend South to North: start=%f, end=%f", resp.Y[0], resp.Y[len(resp.Y)-1])
	}

	// Check reasonable stats for radar composite reflectivity
	t.Logf("MCR stats: Min=%f, Max=%f, Mean=%f", resp.Stats.Min, resp.Stats.Max, resp.Stats.Mean)
	if resp.Stats.Max > 90 || resp.Stats.Min < -40 {
		t.Errorf("unreasonable MCR range: min=%f, max=%f", resp.Stats.Min, resp.Stats.Max)
	}
}

func TestParseDiamond131_MVIL(t *testing.T) {
	fixturePath := "../testdata/diamond131_mvil.bin"
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("Failed to read fixture %s: %v", fixturePath, err)
	}

	resp, err := ParseDiamond131(raw, 0)
	if err != nil {
		t.Fatalf("ParseDiamond131 failed: %v", err)
	}

	if resp.Header.LongitudeGridNumber != 1200 || resp.Header.LatitudeGridNumber != 1000 {
		t.Errorf("unexpected grid dims: %dx%d", resp.Header.LongitudeGridNumber, resp.Header.LatitudeGridNumber)
	}
	t.Logf("MVIL stats: Min=%f, Max=%f, Mean=%f", resp.Stats.Min, resp.Stats.Max, resp.Stats.Mean)
	if resp.Stats.Max > 200 || resp.Stats.Min < 0 {
		t.Errorf("unreasonable MVIL range: min=%f, max=%f", resp.Stats.Min, resp.Stats.Max)
	}
}

func TestParseDiamond131_TDMOSAIC(t *testing.T) {
	fixturePath := "../testdata/diamond131_tdmosaic.bin"
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("Failed to read fixture %s: %v", fixturePath, err)
	}

	levels, err := GetDiamond131Levels(raw)
	if err != nil {
		t.Fatalf("GetDiamond131Levels failed: %v", err)
	}
	t.Logf("TDMOSAIC levels count: %d, levels: %v", len(levels), levels)
	if len(levels) == 0 {
		t.Fatal("expected non-empty levels")
	}

	// Slice level 0
	resp0, err := ParseDiamond131(raw, float64(levels[0]))
	if err != nil {
		t.Fatalf("ParseDiamond131 level 0 failed: %v", err)
	}
	if len(resp0.Values) != int(resp0.Header.LongitudeGridNumber)*int(resp0.Header.LatitudeGridNumber) {
		t.Errorf("unexpected values length: %d", len(resp0.Values))
	}
	t.Logf("TDMOSAIC Level 0 (%f m) stats: Min=%f, Max=%f", resp0.Header.Level, resp0.Stats.Min, resp0.Stats.Max)
}

func TestParseDiamond131_CorruptAndTruncated(t *testing.T) {
	// 1. Truncated
	_, err := ParseDiamond131([]byte("diamond 131 truncated"), 0)
	if err == nil {
		t.Fatal("expected error on truncated data, got nil")
	}

	// 2. Corrupt magic
	corrupt := make([]byte, 2048)
	copy(corrupt, []byte("NOT_DIAMOND"))
	_, err = ParseDiamond131(corrupt, 0)
	if err == nil {
		t.Fatal("expected error on corrupt magic, got nil")
	}
}

func TestParseDiamond131_COTRECWIND(t *testing.T) {
	fixturePath := "../testdata/swan_gd_cotrecwind.bin"
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Skipf("Fixture %s not found: %v", fixturePath, err)
	}

	resp, err := ParseDiamond131(raw, 0)
	if err != nil {
		t.Fatalf("ParseDiamond131 COTRECWIND failed: %v", err)
	}

	if resp.Header.DataType != 11 {
		t.Errorf("expected DataType 11 for COTRECWIND vector grid, got %d", resp.Header.DataType)
	}
	if len(resp.U) == 0 || len(resp.V) == 0 {
		t.Errorf("expected non-empty U and V arrays for COTRECWIND, got U=%d, V=%d", len(resp.U), len(resp.V))
	}
	t.Logf("COTRECWIND grid: %dx%d, speed stats: Min=%f, Max=%f, Mean=%f",
		resp.Header.LongitudeGridNumber, resp.Header.LatitudeGridNumber,
		resp.Stats.Min, resp.Stats.Max, resp.Stats.Mean)
}

func TestParseDiamond131_QPF(t *testing.T) {
	fixturePath := "../testdata/swan_extrap_qpf.bin"
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Skipf("Fixture %s not found: %v", fixturePath, err)
	}

	resp, err := ParseDiamond131(raw, 0)
	if err != nil {
		t.Fatalf("ParseDiamond131 QPF failed: %v", err)
	}
	t.Logf("QPF stats: Min=%f, Max=%f, Mean=%f", resp.Stats.Min, resp.Stats.Max, resp.Stats.Mean)
}

func TestParseDiamond131_REFFST(t *testing.T) {
	fixturePath := "../testdata/swan_gd_ref_fst.bin"
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Skipf("Fixture %s not found: %v", fixturePath, err)
	}

	resp, err := ParseDiamond131(raw, 0)
	if err != nil {
		t.Fatalf("ParseDiamond131 REF_FST failed: %v", err)
	}
	t.Logf("REF_FST stats: Min=%f, Max=%f, Mean=%f", resp.Stats.Min, resp.Stats.Max, resp.Stats.Mean)
}

