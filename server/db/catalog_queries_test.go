package db

import (
	"encoding/binary"
	"testing"
)

func TestParsePressureLevel(t *testing.T) {
	// 4-byte Int32 big-endian
	b500 := make([]byte, 4)
	binary.BigEndian.PutUint32(b500, 500)
	lvl, ok := parsePressureLevel(b500)
	if !ok || lvl != 500 {
		t.Errorf("expected 500, got %d (ok=%v)", lvl, ok)
	}

	b850 := make([]byte, 4)
	binary.BigEndian.PutUint32(b850, 850)
	lvl, ok = parsePressureLevel(b850)
	if !ok || lvl != 850 {
		t.Errorf("expected 850, got %d (ok=%v)", lvl, ok)
	}

	b1000 := make([]byte, 4)
	binary.BigEndian.PutUint32(b1000, 1000)
	lvl, ok = parsePressureLevel(b1000)
	if !ok || lvl != 1000 {
		t.Errorf("expected 1000, got %d (ok=%v)", lvl, ok)
	}

	// ASCII string fallback
	lvl, ok = parsePressureLevel([]byte("700"))
	if !ok || lvl != 700 {
		t.Errorf("expected 700, got %d (ok=%v)", lvl, ok)
	}

	// Empty
	_, ok = parsePressureLevel(nil)
	if ok {
		t.Errorf("expected false for nil")
	}
}

func TestDeriveCQLUpperBound(t *testing.T) {
	tests := []struct {
		name       string
		sampleName string
		isDir      bool
		date       string
		expected   string
	}{
		{
			name:       "4-digit year observation",
			sampleName: "20260910200000.000",
			isDir:      false,
			date:       "2026-09-10",
			expected:   "20260910~",
		},
		{
			name:       "4-digit year json",
			sampleName: "20260910234800.JSON",
			isDir:      false,
			date:       "20260910",
			expected:   "20260910~",
		},
		{
			name:       "2-digit year NWP model",
			sampleName: "26091020.024",
			isDir:      false,
			date:       "2026-09-10",
			expected:   "260910~",
		},
		{
			name:       "2-digit year NWP model 08 cycle",
			sampleName: "26091008.240",
			isDir:      false,
			date:       "20260910",
			expected:   "260910~",
		},
		{
			name:       "prefixed FY4B AWX",
			sampleName: "C006_20260910234500_FY4B.AWX",
			isDir:      false,
			date:       "2026-09-10",
			expected:   "C006_20260910~",
		},
		{
			name:       "prefixed radar bin bz2",
			sampleName: "Z_OTHE_RADAMCR_20260910164800.BIN.BZ2",
			isDir:      false,
			date:       "2026-09-10",
			expected:   "Z_OTHE_RADAMCR_20260910~",
		},
		{
			name:       "prefixed FY2G bmp",
			sampleName: "FY2G_DST_RGB_20260910_1600.BMP",
			isDir:      false,
			date:       "2026-09-10",
			expected:   "FY2G_DST_RGB_20260910~",
		},
		{
			name:       "prefixed SWAN hail",
			sampleName: "Z_SWAN_HAIL_NOWACASTING_20260910164200.TXT",
			isDir:      false,
			date:       "2026-09-10",
			expected:   "Z_SWAN_HAIL_NOWACASTING_20260910~",
		},
		{
			name:       "4-digit year 8-char file",
			sampleName: "20260910.000",
			isDir:      false,
			date:       "2026-09-10",
			expected:   "20260910~",
		},
		{
			name:       "prefixed with dot separator",
			sampleName: "RADAR.202609101200.BIN",
			isDir:      false,
			date:       "2026-09-10",
			expected:   "RADAR.20260910~",
		},
		{
			name:       "directory entry value D",
			sampleName: "500",
			isDir:      true,
			date:       "2026-09-10",
			expected:   "",
		},
		{
			name:       "directory entry numeric level without digits for date",
			sampleName: "850",
			isDir:      false,
			date:       "2026-09-10",
			expected:   "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			actual := DeriveCQLUpperBound(tc.sampleName, tc.isDir, tc.date)
			if actual != tc.expected {
				t.Errorf("DeriveCQLUpperBound(%q, %v, %q) = %q; want %q", tc.sampleName, tc.isDir, tc.date, actual, tc.expected)
			}
		})
	}
}

func TestIsFileOnOrBeforeDate(t *testing.T) {
	targetDate := "2026-09-10"

	tests := []struct {
		name     string
		fileName string
		target   string
		expected bool
	}{
		// Boundary conditions on 2026-09-10
		{
			name:     "NWP model on target day with 240h lead included",
			fileName: "26091020.240",
			target:   targetDate,
			expected: true,
		},
		{
			name:     "NWP model early on target day included",
			fileName: "26091008.024",
			target:   targetDate,
			expected: true,
		},
		{
			name:     "NWP model without extension included",
			fileName: "26091008",
			target:   targetDate,
			expected: true,
		},
		{
			name:     "4-digit year 8-char file on target day included",
			fileName: "20260910.000",
			target:   targetDate,
			expected: true,
		},
		{
			name:     "4-digit year 8-char file in October excluded",
			fileName: "20261015.000",
			target:   targetDate,
			expected: false,
		},
		{
			name:     "2-digit year observation on day 20 excluded by day 10",
			fileName: "260920120000.000",
			target:   targetDate,
			expected: false,
		},
		{
			name:     "observation right before midnight included",
			fileName: "20260910235959.000",
			target:   targetDate,
			expected: true,
		},
		{
			name:     "observation earlier on target day included",
			fileName: "20260910200000.000",
			target:   targetDate,
			expected: true,
		},
		{
			name:     "prefixed satellite on target day included",
			fileName: "C006_20260910234500_FY4B.AWX",
			target:   targetDate,
			expected: true,
		},
		{
			name:     "prefixed with dot separator on target day included",
			fileName: "RADAR.202609101200.BIN",
			target:   targetDate,
			expected: true,
		},
		{
			name:     "prefixed with dot separator next day excluded",
			fileName: "RADAR.202609110000.BIN",
			target:   targetDate,
			expected: false,
		},
		{
			name:     "NWP model from next day excluded",
			fileName: "26091100.000",
			target:   targetDate,
			expected: false,
		},
		{
			name:     "observation right at midnight next day excluded",
			fileName: "20260911000000.000",
			target:   targetDate,
			expected: false,
		},
		{
			name:     "observation hours into next day excluded",
			fileName: "20260911080000.000",
			target:   targetDate,
			expected: false,
		},
		{
			name:     "ASCII collision protection: 20261015000000.000 excluded by 20260910",
			fileName: "20261015000000.000",
			target:   targetDate,
			expected: false,
		},
		{
			name:     "Subdirectory level entry 500 preserved",
			fileName: "500",
			target:   targetDate,
			expected: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			actual := IsFileOnOrBeforeDate(tc.fileName, tc.target)
			if actual != tc.expected {
				t.Errorf("IsFileOnOrBeforeDate(%q, %q) = %v; want %v", tc.fileName, tc.target, actual, tc.expected)
			}
		})
	}
}

