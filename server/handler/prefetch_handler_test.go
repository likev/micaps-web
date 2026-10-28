package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"micaps-web/filecache"
	"micaps-web/handler"
)

func TestPrefetchHandler_ValidationAndCaps(t *testing.T) {
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

	source := handler.NewBlobSource(handler.BlobFetcherFunc(func(dataPath, file string) ([]byte, error) {
		return []byte("blob"), nil
	}), c)

	h := handler.NewPrefetchHandler(source, c, false, 2, 64)
	defer h.Close()

	// 1. Max 16 items cap
	var seventeenItems []handler.PrefetchItem
	for i := 1; i <= 17; i++ {
		seventeenItems = append(seventeenItems, handler.PrefetchItem{
			Kind:  "grid",
			Path:  "SATELLITE/FY4B/L1/CHINA",
			File:  fmt.Sprintf("C012_20261028%02d0000_FY4B.AWX", i),
			Level: "12",
		})
	}
	body, _ := json.Marshal(handler.PrefetchRequest{
		Scope: "win-1",
		Gen:   1,
		Items: seventeenItems,
	})
	req := httptest.NewRequest("POST", "/api/prefetch", bytes.NewReader(body))
	w := httptest.NewRecorder()
	h.Handler(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for >16 items, got %d", w.Code)
	}

	// 2. Body-size cap (>64KB)
	largeBody := strings.Repeat("A", 70*1024)
	req2 := httptest.NewRequest("POST", "/api/prefetch", strings.NewReader(largeBody))
	w2 := httptest.NewRecorder()
	h.Handler(w2, req2)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for >64KB body, got %d", w2.Code)
	}

	// 3. Table allow-list & validation: UPPER_AIR, .., latest, empty file
	mixedItems := []handler.PrefetchItem{
		{Kind: "grid", Path: "UPPER_AIR/PLOT/500", File: "20260320200000.000"}, // UPPER_AIR rejected
		{Kind: "grid", Path: "SATELLITE/FY4B/L1/CHINA", File: "latest"},          // latest rejected
		{Kind: "grid", Path: "SATELLITE/FY4B/L1/CHINA", File: ""},                // empty file rejected
		{Kind: "grid", Path: "SATELLITE/FY4B/../ETC", File: "passwd"},           // .. rejected
		{Kind: "grid", Path: "SATELLITE/FY4B/L1/CHINA", File: "C012_20261028120000_FY4B.AWX", Level: "12"}, // valid
	}
	body3, _ := json.Marshal(handler.PrefetchRequest{
		Scope: "win-1",
		Gen:   2,
		Items: mixedItems,
	})
	req3 := httptest.NewRequest("POST", "/api/prefetch", bytes.NewReader(body3))
	w3 := httptest.NewRecorder()
	h.Handler(w3, req3)
	if w3.Code != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted, got %d", w3.Code)
	}

	var resp handler.PrefetchResponse
	if err := json.Unmarshal(w3.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Accepted != 1 {
		t.Errorf("expected 1 accepted item, got %d", resp.Accepted)
	}
	if resp.Rejected != 4 {
		t.Errorf("expected 4 rejected items, got %d", resp.Rejected)
	}
}

func TestPrefetchHandler_Supersede(t *testing.T) {
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

	var fetchStarted atomic.Int32
	fakeFetcher := handler.BlobFetcherFunc(func(dataPath, file string) ([]byte, error) {
		fetchStarted.Add(1)
		time.Sleep(50 * time.Millisecond)
		return []byte("data"), nil
	})

	source := handler.NewBlobSource(fakeFetcher, c)
	// Create handler with 1 worker so queue processing is sequential
	h := handler.NewPrefetchHandler(source, c, false, 1, 64)
	defer h.Close()

	// Enqueue gen 1 with 4 items for scope "win-supersede"
	var gen1Items []handler.PrefetchItem
	for i := 1; i <= 4; i++ {
		gen1Items = append(gen1Items, handler.PrefetchItem{
			Kind:  "grid",
			Path:  "SATELLITE/FY4B/L1/CHINA",
			File:  fmt.Sprintf("C012_20261028%02d0000_FY4B.AWX", i),
			Level: "12",
		})
	}
	body1, _ := json.Marshal(handler.PrefetchRequest{
		Scope: "win-supersede",
		Gen:   1,
		Items: gen1Items,
	})
	req1 := httptest.NewRequest("POST", "/api/prefetch", bytes.NewReader(body1))
	w1 := httptest.NewRecorder()
	h.Handler(w1, req1)
	if w1.Code != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted, got %d", w1.Code)
	}

	// Immediately send gen 2 with 1 item for the same scope
	body2, _ := json.Marshal(handler.PrefetchRequest{
		Scope: "win-supersede",
		Gen:   2,
		Items: []handler.PrefetchItem{
			{Kind: "grid", Path: "SATELLITE/FY4B/L1/CHINA", File: "C012_20261028990000_FY4B.AWX", Level: "12"},
		},
	})
	req2 := httptest.NewRequest("POST", "/api/prefetch", bytes.NewReader(body2))
	w2 := httptest.NewRecorder()
	h.Handler(w2, req2)
	if w2.Code != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted, got %d", w2.Code)
	}

	// Wait for worker to finish
	time.Sleep(200 * time.Millisecond)

	stats := h.Stats()
	dropped := stats["dropped"].(int64)
	if dropped == 0 {
		t.Errorf("expected superseded gen 1 items to be dropped, got dropped=0")
	}
}

func TestPrefetchHandler_NegativeCache(t *testing.T) {
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

	var fetchCalls atomic.Int32
	fakeFetcher := handler.BlobFetcherFunc(func(dataPath, file string) ([]byte, error) {
		fetchCalls.Add(1)
		return nil, fmt.Errorf("Cassandra 404: not found")
	})

	source := handler.NewBlobSource(fakeFetcher, c)
	h := handler.NewPrefetchHandler(source, c, false, 2, 64)
	defer h.Close()

	item := handler.PrefetchItem{
		Kind:  "grid",
		Path:  "SATELLITE/FY4B/L1/CHINA",
		File:  "C014_20261028120000_FY4B.AWX",
		Level: "14",
	}
	body, _ := json.Marshal(handler.PrefetchRequest{
		Scope: "win-neg",
		Gen:   1,
		Items: []handler.PrefetchItem{item},
	})

	// First request: enqueues and fails in worker
	req1 := httptest.NewRequest("POST", "/api/prefetch", bytes.NewReader(body))
	w1 := httptest.NewRecorder()
	h.Handler(w1, req1)
	if w1.Code != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted, got %d", w1.Code)
	}

	// Wait for worker to process and record failure in negative cache
	time.Sleep(50 * time.Millisecond)

	if fetchCalls.Load() != 1 {
		t.Fatalf("expected 1 fetch call, got %d", fetchCalls.Load())
	}

	// Second request with same item should short-circuit via negative cache
	body2, _ := json.Marshal(handler.PrefetchRequest{
		Scope: "win-neg",
		Gen:   2,
		Items: []handler.PrefetchItem{item},
	})
	req2 := httptest.NewRequest("POST", "/api/prefetch", bytes.NewReader(body2))
	w2 := httptest.NewRecorder()
	h.Handler(w2, req2)
	if w2.Code != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted, got %d", w2.Code)
	}

	var resp2 handler.PrefetchResponse
	json.Unmarshal(w2.Body.Bytes(), &resp2)
	if resp2.Rejected != 1 {
		t.Errorf("expected negatively cached item to be rejected, got %d", resp2.Rejected)
	}

	// Fetcher should NOT have been called a second time
	if fetchCalls.Load() != 1 {
		t.Errorf("expected fetchCalls to remain 1, got %d", fetchCalls.Load())
	}

	stats := h.Stats()
	if stats["negativeHits"].(int64) < 1 {
		t.Errorf("expected negativeHits >= 1, got %v", stats["negativeHits"])
	}
}

func TestPrefetchHandler_DisabledAndMock(t *testing.T) {
	// 1. Disabled mode
	hDisabled := handler.NewPrefetchHandler(nil, nil, false, 0, 64)
	body, _ := json.Marshal(handler.PrefetchRequest{
		Scope: "win-dis",
		Gen:   1,
		Items: []handler.PrefetchItem{
			{Kind: "grid", Path: "SATELLITE/FY4B/L1/CHINA", File: "C012_20261028120000_FY4B.AWX", Level: "12"},
		},
	})
	req1 := httptest.NewRequest("POST", "/api/prefetch", bytes.NewReader(body))
	w1 := httptest.NewRecorder()
	hDisabled.Handler(w1, req1)
	if w1.Code != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted, got %d", w1.Code)
	}
	var resp1 handler.PrefetchResponse
	json.Unmarshal(w1.Body.Bytes(), &resp1)
	if !resp1.Disabled {
		t.Errorf("expected disabled: true, got %+v", resp1)
	}

	// 2. Mock mode
	hMock := handler.NewPrefetchHandler(nil, nil, true, 2, 64)
	req2 := httptest.NewRequest("POST", "/api/prefetch", bytes.NewReader(body))
	w2 := httptest.NewRecorder()
	hMock.Handler(w2, req2)
	if w2.Code != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted, got %d", w2.Code)
	}
	var resp2 handler.PrefetchResponse
	json.Unmarshal(w2.Body.Bytes(), &resp2)
	if resp2.Disabled || resp2.Accepted != 1 {
		t.Errorf("expected accepted: 1, disabled: false, got %+v", resp2)
	}
}
