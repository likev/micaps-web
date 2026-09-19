package filecache

import (
	"bytes"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestFileCacheBasicPutGet(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "th_cache_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	c, err := New(Config{
		Dir:      tempDir,
		CapBytes: 10 * 1024 * 1024,
		TTL:      1 * time.Hour,
	})
	if err != nil {
		t.Fatalf("failed to init cache: %v", err)
	}
	defer c.Close()

	table := "ECMWF_HR"
	dataPath := "TMP/500"
	file := "26091808.024"
	testPayload := []byte("compressed-gzip-blob-bytes-12345")

	// Get before Put should miss
	_, _, ok := c.Get(table, dataPath, file)
	if ok {
		t.Errorf("expected miss before put")
	}

	// Put
	speedDir := true
	if err := c.Put(table, dataPath, file, testPayload, &speedDir); err != nil {
		t.Fatalf("put failed: %v", err)
	}

	// Get after Put should hit with byte-for-byte exact equality
	got, meta, ok := c.Get(table, dataPath, file)
	if !ok {
		t.Fatalf("expected hit after put")
	}
	if !bytes.Equal(got, testPayload) {
		t.Errorf("got %s, want %s", string(got), string(testPayload))
	}
	if meta == nil || meta.Table != table || meta.DataPath != dataPath || meta.File != file {
		t.Errorf("meta mismatch: %+v", meta)
	}
	if meta.IsSpeedDir == nil || *meta.IsSpeedDir != true {
		t.Errorf("expected isSpeedDir=true in meta")
	}

	stats := c.Stats()
	if stats["entries"].(int64) != 1 {
		t.Errorf("expected 1 entry, got %v", stats["entries"])
	}
	if stats["bytes"].(int64) != int64(len(testPayload)) {
		t.Errorf("expected %d bytes, got %v", len(testPayload), stats["bytes"])
	}
}

func TestFileCacheLRUEvictionUnderCap(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "th_cache_lru_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Cap of 100 bytes
	c, err := New(Config{
		Dir:      tempDir,
		CapBytes: 100,
		TTL:      1 * time.Hour,
	})
	if err != nil {
		t.Fatalf("failed to init cache: %v", err)
	}
	defer c.Close()

	payload1 := make([]byte, 40) // 40 bytes
	payload2 := make([]byte, 40) // 40 bytes
	payload3 := make([]byte, 40) // 40 bytes

	_ = c.Put("T", "P1", "F1", payload1, nil)
	time.Sleep(10 * time.Millisecond)
	_ = c.Put("T", "P2", "F2", payload2, nil)
	time.Sleep(10 * time.Millisecond)

	// Total is now 80 bytes <= 100 bytes
	if c.Stats()["entries"].(int64) != 2 {
		t.Fatalf("expected 2 entries")
	}

	// Putting third (40 bytes) exceeds 100 bytes (80 + 40 = 120 > 100).
	// Oldest (F1) should be evicted.
	_ = c.Put("T", "P3", "F3", payload3, nil)

	// F1 should be gone
	if _, _, ok := c.Get("T", "P1", "F1"); ok {
		t.Errorf("expected F1 to be evicted")
	}
	// F2 and F3 should be present
	if _, _, ok := c.Get("T", "P2", "F2"); !ok {
		t.Errorf("expected F2 to remain")
	}
	if _, _, ok := c.Get("T", "P3", "F3"); !ok {
		t.Errorf("expected F3 to remain")
	}

	if c.Stats()["bytes"].(int64) > 100 {
		t.Errorf("expected bytes <= 100, got %d", c.Stats()["bytes"].(int64))
	}
}

func TestFileCacheRestartRebuildAndCorruptFileTolerance(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "th_cache_rebuild_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	c1, err := New(Config{
		Dir:      tempDir,
		CapBytes: 10 * 1024,
		TTL:      1 * time.Hour,
	})
	if err != nil {
		t.Fatalf("failed to init c1: %v", err)
	}

	payload := []byte("hello-cache-rebuild-123")
	_ = c1.Put("T", "P", "F", payload, nil)
	c1.Close()

	// Inject an orphan .bin without .meta
	orphanBin := filepath.Join(tempDir, "orphan1234567890abcdef1234567890abcdef12.bin")
	_ = os.WriteFile(orphanBin, []byte("orphan"), 0644)

	// Inject a corrupt .meta
	corruptBin := filepath.Join(tempDir, "corrupt1234567890abcdef1234567890abcdef12.bin")
	corruptMeta := filepath.Join(tempDir, "corrupt1234567890abcdef1234567890abcdef12.meta")
	_ = os.WriteFile(corruptBin, []byte("corrupt-bytes"), 0644)
	_ = os.WriteFile(corruptMeta, []byte("{invalid-json"), 0644)

	// Re-open cache on the same directory
	c2, err := New(Config{
		Dir:      tempDir,
		CapBytes: 10 * 1024,
		TTL:      1 * time.Hour,
	})
	if err != nil {
		t.Fatalf("failed to re-open c2: %v", err)
	}
	defer c2.Close()

	// The original valid entry must survive
	got, _, ok := c2.Get("T", "P", "F")
	if !ok || !bytes.Equal(got, payload) {
		t.Fatalf("expected valid entry to survive restart rebuild")
	}

	// The orphan and corrupt files must have been cleaned up
	if _, err := os.Stat(orphanBin); !os.IsNotExist(err) {
		t.Errorf("expected orphan file to be deleted")
	}
	if _, err := os.Stat(corruptBin); !os.IsNotExist(err) {
		t.Errorf("expected corrupt file to be deleted")
	}
}

func TestFileCacheSingleflight(t *testing.T) {
	sf := NewSingleflight()
	var fetchCount atomic.Int32

	var wg sync.WaitGroup
	results := make([][]byte, 10)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			res, err := sf.Do("test-key", func() ([]byte, error) {
				fetchCount.Add(1)
				time.Sleep(50 * time.Millisecond)
				return []byte("fetched-data"), nil
			})
			if err == nil {
				results[idx] = res
			}
		}(i)
	}

	wg.Wait()

	if fetchCount.Load() != 1 {
		t.Errorf("expected 1 fetch execution under singleflight, got %d", fetchCount.Load())
	}
	for i := 0; i < 10; i++ {
		if string(results[i]) != "fetched-data" {
			t.Errorf("result %d mismatch: %s", i, string(results[i]))
		}
	}
}

func TestFileCacheDisabledMode(t *testing.T) {
	c, err := New(Config{
		Disabled: true,
	})
	if err != nil {
		t.Fatalf("failed to init disabled cache: %v", err)
	}
	defer c.Close()

	if err := c.Put("T", "P", "F", []byte("123"), nil); err != nil {
		t.Errorf("put on disabled cache should not error")
	}
	if _, _, ok := c.Get("T", "P", "F"); ok {
		t.Errorf("disabled cache should always miss")
	}
}

func TestFileCacheOverwriteExactCounters(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "th_cache_overwrite_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	c, err := New(Config{
		Dir:      tempDir,
		CapBytes: 10 * 1024 * 1024,
		TTL:      1 * time.Hour,
	})
	if err != nil {
		t.Fatalf("failed to init cache: %v", err)
	}
	defer c.Close()

	table := "ECMWF_HR"
	path := "TMP/500"
	file := "26091808.024"

	// 1. Initial Put of 30 bytes
	data30 := bytes.Repeat([]byte("A"), 30)
	if err := c.Put(table, path, file, data30, nil); err != nil {
		t.Fatalf("put failed: %v", err)
	}
	if stats := c.Stats(); stats["entries"].(int64) != 1 || stats["bytes"].(int64) != 30 {
		t.Fatalf("expected entries=1, bytes=30, got entries=%v, bytes=%v", stats["entries"], stats["bytes"])
	}

	// 2. Overwrite with 50 bytes (larger)
	data50 := bytes.Repeat([]byte("B"), 50)
	if err := c.Put(table, path, file, data50, nil); err != nil {
		t.Fatalf("overwrite failed: %v", err)
	}
	if stats := c.Stats(); stats["entries"].(int64) != 1 || stats["bytes"].(int64) != 50 {
		t.Fatalf("after larger overwrite: expected entries=1, bytes=50, got entries=%v, bytes=%v", stats["entries"], stats["bytes"])
	}
	got50, _, ok := c.Get(table, path, file)
	if !ok || !bytes.Equal(got50, data50) {
		t.Fatalf("get after 50-byte overwrite failed")
	}

	// 3. Overwrite with 20 bytes (smaller)
	data20 := bytes.Repeat([]byte("C"), 20)
	if err := c.Put(table, path, file, data20, nil); err != nil {
		t.Fatalf("overwrite failed: %v", err)
	}
	if stats := c.Stats(); stats["entries"].(int64) != 1 || stats["bytes"].(int64) != 20 {
		t.Fatalf("after smaller overwrite: expected entries=1, bytes=20, got entries=%v, bytes=%v", stats["entries"], stats["bytes"])
	}
	got20, _, ok := c.Get(table, path, file)
	if !ok || !bytes.Equal(got20, data20) {
		t.Fatalf("get after 20-byte overwrite failed")
	}

	// 4. Put a different file
	file2 := "26091808.036"
	data15 := bytes.Repeat([]byte("D"), 15)
	if err := c.Put(table, path, file2, data15, nil); err != nil {
		t.Fatalf("put 2nd file failed: %v", err)
	}
	if stats := c.Stats(); stats["entries"].(int64) != 2 || stats["bytes"].(int64) != 35 {
		t.Fatalf("after 2nd file: expected entries=2, bytes=35, got entries=%v, bytes=%v", stats["entries"], stats["bytes"])
	}
}

func TestFileCacheGetTTLExpiry(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "th_cache_ttl_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	c, err := New(Config{
		Dir:      tempDir,
		CapBytes: 10 * 1024 * 1024,
		TTL:      60 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("failed to init cache: %v", err)
	}
	defer c.Close()

	table := "ECMWF_HR"
	path := "TMP/850"
	file := "26091808.012"
	data := []byte("temporary-ttl-test-data")

	if err := c.Put(table, path, file, data, nil); err != nil {
		t.Fatalf("put failed: %v", err)
	}

	// Immediate Get should hit
	if _, _, ok := c.Get(table, path, file); !ok {
		t.Fatalf("immediate get expected hit")
	}
	if stats := c.Stats(); stats["entries"].(int64) != 1 || stats["bytes"].(int64) != int64(len(data)) {
		t.Fatalf("expected entries=1, bytes=%d, got %+v", len(data), stats)
	}

	// Wait for TTL expiry
	time.Sleep(100 * time.Millisecond)

	// Get should detect expiration, evict file, and return miss
	if _, _, ok := c.Get(table, path, file); ok {
		t.Errorf("expected get after TTL to return miss")
	}

	// Counters should be back to 0
	if stats := c.Stats(); stats["entries"].(int64) != 0 || stats["bytes"].(int64) != 0 {
		t.Errorf("expected entries=0, bytes=0 after TTL eviction, got entries=%v, bytes=%v", stats["entries"], stats["bytes"])
	}

	// Files should be removed from disk
	key := Key(table, path, file)
	if _, err := os.Stat(filepath.Join(tempDir, key+".bin")); !os.IsNotExist(err) {
		t.Errorf("expected .bin to be deleted after TTL expiry")
	}
	if _, err := os.Stat(filepath.Join(tempDir, key+".meta")); !os.IsNotExist(err) {
		t.Errorf("expected .meta to be deleted after TTL expiry")
	}
}
