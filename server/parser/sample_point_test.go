package parser_test

import (
	"bytes"
	"encoding/binary"
	"errors"
	"math"
	"testing"

	"micaps-web/parser"
)

// buildSyntheticGridHeader constructs a 278-byte MICAPS header for testing
func buildSyntheticGridHeader(dataType int16, element string, nLon, nLat int32, startLon, endLon, startLat, endLat float32) []byte {
	buf := make([]byte, 278)
	copy(buf[0:4], "mdfs")
	binary.LittleEndian.PutUint16(buf[4:6], uint16(dataType))
	copy(buf[6:26], "ECMWF_HR")
	copy(buf[26:76], element)
	copy(buf[76:106], "Synthetic Test")

	// Level 500, Year 2026, Month 9, Day 18, Hour 8
	binary.LittleEndian.PutUint32(buf[106:110], math.Float32bits(500))
	binary.LittleEndian.PutUint32(buf[110:114], 26)
	binary.LittleEndian.PutUint32(buf[114:118], 9)
	binary.LittleEndian.PutUint32(buf[118:122], 18)
	binary.LittleEndian.PutUint32(buf[122:126], 8)
	binary.LittleEndian.PutUint32(buf[126:130], 0)
	binary.LittleEndian.PutUint32(buf[130:134], 24)

	binary.LittleEndian.PutUint32(buf[134:138], math.Float32bits(startLon))
	binary.LittleEndian.PutUint32(buf[138:142], math.Float32bits(endLon))
	dLon := float32(0.25)
	if nLon > 1 {
		dLon = (endLon - startLon) / float32(nLon-1)
	}
	binary.LittleEndian.PutUint32(buf[142:146], math.Float32bits(dLon))
	binary.LittleEndian.PutUint32(buf[146:150], uint32(nLon))

	binary.LittleEndian.PutUint32(buf[150:154], math.Float32bits(startLat))
	binary.LittleEndian.PutUint32(buf[154:158], math.Float32bits(endLat))
	dLat := float32(0.25)
	if nLat > 1 {
		dLat = (endLat - startLat) / float32(nLat-1)
	}
	binary.LittleEndian.PutUint32(buf[158:162], math.Float32bits(dLat))
	binary.LittleEndian.PutUint32(buf[162:166], uint32(nLat))

	return buf
}

func TestSampleGridPoint_ScalarBilinear(t *testing.T) {
	// 4x3 grid: Lon 60 to 60.75 (step 0.25), Lat 60 to 59.5 (step -0.25)
	nLon := int32(4)
	nLat := int32(3)
	hdr := buildSyntheticGridHeader(4, "TMP", nLon, nLat, 60.0, 60.75, 60.0, 59.5)

	var payload bytes.Buffer
	payload.Write(hdr)

	// Fill grid with known values: v(y, x) = 10 + x*2 + y*5
	// y=0: [10, 12, 14, 16]
	// y=1: [15, 17, 19, 21]
	// y=2: [20, 22, 24, 26]
	for y := 0; y < int(nLat); y++ {
		for x := 0; x < int(nLon); x++ {
			val := float32(10 + x*2 + y*5)
			var b [4]byte
			binary.LittleEndian.PutUint32(b[:], math.Float32bits(val))
			payload.Write(b[:])
		}
	}

	data := payload.Bytes()

	// Parse full grid to compare
	fullGrid, err := parser.ParseGridData(data)
	if err != nil {
		t.Fatalf("ParseGridData failed: %v", err)
	}
	if len(fullGrid.Values) != 12 {
		t.Fatalf("expected 12 values, got %d", len(fullGrid.Values))
	}

	// Sample exactly at node (x=1, y=1) -> lon=60.25, lat=59.75 -> expected 17
	pt, err := parser.SampleGridPoint(data, 60.25, 59.75, "TMP")
	if err != nil {
		t.Fatalf("SampleGridPoint failed: %v", err)
	}
	if !pt.Valid {
		t.Fatalf("expected valid point")
	}
	if math.Abs(pt.Scalar-17.0) > 1e-4 {
		t.Errorf("expected 17.0, got %f", pt.Scalar)
	}
	if pt.GridI != 1 || pt.GridJ != 1 {
		t.Errorf("expected GridI=1, GridJ=1, got i=%d, j=%d", pt.GridI, pt.GridJ)
	}
	if math.Abs(pt.SnappedLon-60.25) > 1e-4 || math.Abs(pt.SnappedLat-59.75) > 1e-4 {
		t.Errorf("snapped coord mismatch: %f, %f", pt.SnappedLon, pt.SnappedLat)
	}

	// Sample midway between (0,0), (1,0), (0,1), (1,1):
	// x=0.5 (lon 60.125), y=0.5 (lat 59.875)
	// Bilinear average of [10, 12, 15, 17] = 0.25*(10+12+15+17) = 13.5
	ptMid, err := parser.SampleGridPoint(data, 60.125, 59.875, "TMP")
	if err != nil {
		t.Fatalf("SampleGridPoint midway failed: %v", err)
	}
	if math.Abs(ptMid.Scalar-13.5) > 1e-4 {
		t.Errorf("expected 13.5, got %f", ptMid.Scalar)
	}
}

func TestSampleGridPoint_RHClamp(t *testing.T) {
	nLon := int32(2)
	nLat := int32(2)
	hdr := buildSyntheticGridHeader(4, "RH", nLon, nLat, 100.0, 100.25, 30.0, 29.75)

	var payload bytes.Buffer
	payload.Write(hdr)
	// 4 corners all 105% RH (overshoot)
	for i := 0; i < 4; i++ {
		var b [4]byte
		binary.LittleEndian.PutUint32(b[:], math.Float32bits(105.0))
		payload.Write(b[:])
	}

	pt, err := parser.SampleGridPoint(payload.Bytes(), 100.1, 29.9, "RH")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pt.Scalar != 100.0 {
		t.Errorf("expected RH clamped to 100.0, got %f", pt.Scalar)
	}
}

func TestSampleGridPoint_SentinelAndReweight(t *testing.T) {
	nLon := int32(2)
	nLat := int32(2)
	hdr := buildSyntheticGridHeader(4, "TMP", nLon, nLat, 100.0, 100.25, 30.0, 29.75)

	var payload bytes.Buffer
	payload.Write(hdr)
	// (0,0)=10, (1,0)=-9999 (missing), (0,1)=20, (1,1)=-9999 (missing)
	vals := []float32{10.0, -9999.0, 20.0, -9999.0}
	for _, v := range vals {
		var b [4]byte
		binary.LittleEndian.PutUint32(b[:], math.Float32bits(v))
		payload.Write(b[:])
	}

	// gx = 0.5, gy = 0.5:
	// w00 = 0.25, w01 = 0.25
	// Valid corners: (0,0) with weight 0.25, (0,1) with weight 0.25
	// Reweighted: (0.25*10 + 0.25*20) / 0.50 = 15.0
	pt, err := parser.SampleGridPoint(payload.Bytes(), 100.125, 29.875, "TMP")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !pt.Valid {
		t.Fatalf("expected valid point under partial missing corners")
	}
	if math.Abs(pt.Scalar-15.0) > 1e-4 {
		t.Errorf("expected 15.0 after reweighting, got %f", pt.Scalar)
	}
}

func TestSampleGridPoint_OutOfDomain(t *testing.T) {
	hdr := buildSyntheticGridHeader(4, "TMP", 4, 3, 60.0, 60.75, 60.0, 59.5)
	var payload bytes.Buffer
	payload.Write(hdr)
	for i := 0; i < 12; i++ {
		var b [4]byte
		binary.LittleEndian.PutUint32(b[:], math.Float32bits(10.0))
		payload.Write(b[:])
	}

	// Lon outside (59.0 < 60.0)
	_, err := parser.SampleGridPoint(payload.Bytes(), 59.0, 59.8, "TMP")
	if !errors.Is(err, parser.ErrOutOfDomain) {
		t.Errorf("expected ErrOutOfDomain for lon 59.0, got %v", err)
	}

	// Lat outside (61.0 > 60.0)
	_, err = parser.SampleGridPoint(payload.Bytes(), 60.2, 61.0, "TMP")
	if !errors.Is(err, parser.ErrOutOfDomain) {
		t.Errorf("expected ErrOutOfDomain for lat 61.0, got %v", err)
	}
}

func TestSampleGridPoint_WindDiamond11(t *testing.T) {
	nLon := int32(2)
	nLat := int32(2)
	totalPoints := 4
	hdr := buildSyntheticGridHeader(11, "WIND", nLon, nLat, 100.0, 100.25, 30.0, 29.75)

	var payload bytes.Buffer
	payload.Write(hdr)

	// Block 1 (Speed): 10 m/s for all 4 corners
	for i := 0; i < totalPoints; i++ {
		var b [4]byte
		binary.LittleEndian.PutUint32(b[:], math.Float32bits(10.0))
		payload.Write(b[:])
	}
	// Block 2 (Dir): 90 degrees (east wind) -> u = 10*cos(90°) ≈ 0, v = 10*sin(90°) = 10
	for i := 0; i < totalPoints; i++ {
		var b [4]byte
		binary.LittleEndian.PutUint32(b[:], math.Float32bits(90.0))
		payload.Write(b[:])
	}

	data := payload.Bytes()

	// 1. Verify ParseGridData detection
	fullGrid, err := parser.ParseGridData(data)
	if err != nil {
		t.Fatalf("ParseGridData failed on Diamond 11: %v", err)
	}
	if len(fullGrid.U) != 4 || len(fullGrid.V) != 4 {
		t.Fatalf("expected 4 UV points, got U=%d, V=%d", len(fullGrid.U), len(fullGrid.V))
	}

	// 2. Verify SampleGridPoint
	pt, err := parser.SampleGridPoint(data, 100.125, 29.875, "WIND")
	if err != nil {
		t.Fatalf("SampleGridPoint failed on Diamond 11: %v", err)
	}
	if !pt.Valid {
		t.Fatalf("expected valid wind point")
	}
	// U ≈ 0, V ≈ 10
	if math.Abs(pt.U-0.0) > 1e-4 {
		t.Errorf("expected U ≈ 0, got %f", pt.U)
	}
	if math.Abs(pt.V-10.0) > 1e-4 {
		t.Errorf("expected V ≈ 10, got %f", pt.V)
	}
}
