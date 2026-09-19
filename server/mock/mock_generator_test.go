package mock_test

import (
	"testing"

	"micaps-web/mock"
)

func TestGenerateMockGrid_VVEL(t *testing.T) {
	grid := mock.GenerateMockGrid("VVEL", 500, 24)
	if grid == nil {
		t.Fatal("expected non-nil GridResponse for VVEL")
	}

	if grid.Header.Element != "VVEL" {
		t.Errorf("expected Element VVEL, got %s", grid.Header.Element)
	}

	if grid.Header.Description != "10e-2.Pa.s-1" {
		t.Errorf("expected Description '10e-2.Pa.s-1', got '%s'", grid.Header.Description)
	}

	// Verify vertical velocity signed range (centipascals/s)
	// Negative values signify upward motion (ascent), positive values signify subsidence
	if grid.Stats.Min >= 0 {
		t.Errorf("expected negative minimum for VVEL ascent, got %f", grid.Stats.Min)
	}
	if grid.Stats.Max <= 0 {
		t.Errorf("expected positive maximum for VVEL subsidence, got %f", grid.Stats.Max)
	}

	// Verify total grid points
	expectedTotal := int(grid.Header.LongitudeGridNumber * grid.Header.LatitudeGridNumber)
	if len(grid.Values) != expectedTotal {
		t.Errorf("expected %d values, got %d", expectedTotal, len(grid.Values))
	}
}

func TestGenerateMockGrid_RH(t *testing.T) {
	grid := mock.GenerateMockGrid("RH", 850, 24)
	if grid == nil {
		t.Fatal("expected non-nil GridResponse for RH")
	}

	if grid.Header.Element != "RH" {
		t.Errorf("expected Element RH, got %s", grid.Header.Element)
	}

	if grid.Header.Description != "%" {
		t.Errorf("expected Description '%%', got '%s'", grid.Header.Description)
	}

	// Verify relative humidity range [0, 100] %
	if grid.Stats.Min < 0 || grid.Stats.Min > 50 {
		t.Errorf("expected Min RH in [0, 50], got %f", grid.Stats.Min)
	}
	if grid.Stats.Max < 70 || grid.Stats.Max > 100 {
		t.Errorf("expected Max RH in [70, 100], got %f", grid.Stats.Max)
	}

	for _, v := range grid.Values {
		if v < 0 || v > 100 {
			t.Fatalf("RH value out of bounds [0, 100]: %f", v)
		}
	}
}

func TestGenerateMockGrid_Wind(t *testing.T) {
	grid := mock.GenerateMockGrid("WIND", 850, 12)
	if grid == nil {
		t.Fatal("expected non-nil GridResponse for WIND")
	}

	if grid.Header.DataType != 11 {
		t.Errorf("expected DataType 11 for vector wind, got %d", grid.Header.DataType)
	}

	expectedTotal := int(grid.Header.LongitudeGridNumber * grid.Header.LatitudeGridNumber)
	if len(grid.U) != expectedTotal || len(grid.V) != expectedTotal {
		t.Errorf("expected U and V arrays length %d, got U=%d, V=%d", expectedTotal, len(grid.U), len(grid.V))
	}
}
