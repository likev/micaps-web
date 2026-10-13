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
