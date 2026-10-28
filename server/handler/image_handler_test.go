package handler

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"image/png"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"micaps-web/filecache"
	"micaps-web/model"
)

// createSyntheticBMP creates a minimal 24-bit uncompressed BMP byte buffer
func createSyntheticBMP(w, h int) []byte {
	rowStride := ((w*3 + 3) / 4) * 4
	pixelDataLen := rowStride * h
	fileSize := 54 + pixelDataLen

	buf := make([]byte, fileSize)
	// BMP header
	buf[0] = 'B'
	buf[1] = 'M'
	binary.LittleEndian.PutUint32(buf[2:6], uint32(fileSize))
	binary.LittleEndian.PutUint32(buf[10:14], 54)

	// DIB header
	binary.LittleEndian.PutUint32(buf[14:18], 40)
	binary.LittleEndian.PutUint32(buf[18:22], uint32(w))
	binary.LittleEndian.PutUint32(buf[22:26], uint32(h))
	binary.LittleEndian.PutUint16(buf[26:28], 1)
	binary.LittleEndian.PutUint16(buf[28:30], 24) // 24 bpp
	binary.LittleEndian.PutUint32(buf[30:34], 0)  // BI_RGB uncompressed
	binary.LittleEndian.PutUint32(buf[34:38], uint32(pixelDataLen))

	// Fill pixel data with some colors
	for y := 0; y < h; y++ {
		rowStart := 54 + y*rowStride
		for x := 0; x < w; x++ {
			buf[rowStart+x*3] = uint8(x % 256)       // B
			buf[rowStart+x*3+1] = uint8(y % 256)     // G
			buf[rowStart+x*3+2] = uint8((x + y) % 256) // R
		}
	}
	return buf
}

func TestDecodeBMPToPNG(t *testing.T) {
	bmp := createSyntheticBMP(100, 50)

	pngBytes, err := decodeBMPToPNG(bmp, 1)
	if err != nil {
		t.Fatalf("decodeBMPToPNG failed: %v", err)
	}

	cfg, err := png.DecodeConfig(bytes.NewReader(pngBytes))
	if err != nil {
		t.Fatalf("png.DecodeConfig failed: %v", err)
	}
	if cfg.Width != 100 || cfg.Height != 50 {
		t.Errorf("Expected 100x50 PNG, got %dx%d", cfg.Width, cfg.Height)
	}

	// Test decimation step = 2
	pngDec, err := decodeBMPToPNG(bmp, 2)
	if err != nil {
		t.Fatalf("decodeBMPToPNG step=2 failed: %v", err)
	}
	cfgDec, err := png.DecodeConfig(bytes.NewReader(pngDec))
	if err != nil {
		t.Fatalf("png.DecodeConfig step=2 failed: %v", err)
	}
	if cfgDec.Width != 50 || cfgDec.Height != 25 {
		t.Errorf("Expected 50x25 PNG, got %dx%d", cfgDec.Width, cfgDec.Height)
	}
}

func TestDecodeBMPCorrupt(t *testing.T) {
	_, err := decodeBMPToPNG([]byte("not a bmp"), 1)
	if err == nil {
		t.Errorf("Expected error for non-BMP data")
	}

	short := []byte{'B', 'M', 10, 0, 0, 0}
	_, err = decodeBMPToPNG(short, 1)
	if err == nil {
		t.Errorf("Expected error for short BMP data")
	}
}

func TestImageHandlerJSONAndMock(t *testing.T) {
	h := &ImageHandler{MockMode: true}

	// 1. JSON metadata request
	req := httptest.NewRequest("GET", "/api/data/image?path=SATELLITE/FY2G/L2/DUST&file=latest&format=json", nil)
	rec := httptest.NewRecorder()
	h.Handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", rec.Code)
	}
	var imgResp model.ImageResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &imgResp); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}
	if len(imgResp.Bounds) != 4 {
		t.Errorf("Expected 4 bounds coordinates, got %d", len(imgResp.Bounds))
	}
	if imgResp.Format != "png" {
		t.Errorf("Expected format png, got %s", imgResp.Format)
	}

	// 2. Binary PNG request with MockMode
	reqPNG := httptest.NewRequest("GET", "/api/data/image?path=SATELLITE/FY2G/L2/DUST&file=latest&format=png", nil)
	recPNG := httptest.NewRecorder()
	h.Handler(recPNG, reqPNG)

	if recPNG.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for mock PNG, got %d", recPNG.Code)
	}
	if ct := recPNG.Header().Get("Content-Type"); ct != "image/png" {
		t.Errorf("Expected Content-Type image/png, got %s", ct)
	}

	cfg, err := png.DecodeConfig(recPNG.Body)
	if err != nil {
		t.Fatalf("Failed to decode mock PNG: %v", err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		t.Errorf("Invalid mock PNG dimensions: %dx%d", cfg.Width, cfg.Height)
	}
}

func TestImageHandler_CacheKeyAndOutputByteIdentical(t *testing.T) {
	tempDir := t.TempDir()
	c, err := filecache.New(filecache.Config{
		Dir:      tempDir,
		CapBytes: 10 * 1024 * 1024,
		TTL:      1 * time.Hour,
	})
	if err != nil {
		t.Fatalf("failed to init cache: %v", err)
	}
	defer c.Close()

	bmpPayload := createSyntheticBMP(60, 40)
	var fetchCalls int
	fakeFetcher := BlobFetcherFunc(func(dataPath, file string) ([]byte, error) {
		fetchCalls++
		return bmpPayload, nil
	})

	source := NewBlobSource(fakeFetcher, c)
	h := &ImageHandler{
		Cache:  c,
		Source: source,
	}

	path := "SATELLITE/FY2G/L2/DUST"
	file := "FY2G_DST_RGB_20261028_0400.BMP"

	// First request: triggers fetch
	req1 := httptest.NewRequest("GET", fmt.Sprintf("/api/data/image?path=%s&file=%s&format=png&step=1", path, file), nil)
	w1 := httptest.NewRecorder()
	h.Handler(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w1.Code)
	}
	bytes1 := w1.Body.Bytes()

	if fetchCalls != 1 {
		t.Fatalf("expected 1 fetch call, got %d", fetchCalls)
	}

	// Verify key in cache is (Table: "SATELLITE", SubDataPath: "FY2G/L2/DUST", File: file)
	if !c.Has("SATELLITE", "FY2G/L2/DUST", file) {
		t.Errorf("expected blob cached under table=SATELLITE, subDataPath=FY2G/L2/DUST")
	}

	// Second request: served from cache
	req2 := httptest.NewRequest("GET", fmt.Sprintf("/api/data/image?path=%s&file=%s&format=png&step=1", path, file), nil)
	w2 := httptest.NewRecorder()
	h.Handler(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w2.Code)
	}
	bytes2 := w2.Body.Bytes()

	if fetchCalls != 1 {
		t.Errorf("expected 0 additional fetch calls on cache hit, got %d total", fetchCalls)
	}

	// Output must be byte-identical
	if !bytes.Equal(bytes1, bytes2) {
		t.Errorf("expected byte-identical output between cold fetch and cached hit")
	}
}
