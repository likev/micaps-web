package filecache

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Meta represents the metadata sidecar stored for each cached blob
type Meta struct {
	Table      string    `json:"table"`
	DataPath   string    `json:"dataPath"`
	File       string    `json:"file"`
	ByteSize   int64     `json:"byteSize"`
	StoredAt   time.Time `json:"storedAt"`
	IsSpeedDir *bool     `json:"isSpeedDir,omitempty"`
}

// Config configures the server file cache
type Config struct {
	Dir      string
	CapBytes int64
	TTL      time.Duration
	Disabled bool
}

// Cache provides a bounded, on-disk LRU file cache for raw Cassandra blobs
type Cache struct {
	dir          string
	capBytes     int64
	ttl          time.Duration
	disabled     bool
	currentBytes atomic.Int64
	entries      atomic.Int64
	mu           sync.Mutex
	singleflight *Singleflight
	stopChan     chan struct{}
	wg           sync.WaitGroup
}

// Singleflight deduplicates concurrent in-flight requests for the same key
type Singleflight struct {
	mu sync.Mutex
	m  map[string]*sfCall
}

type sfCall struct {
	wg  sync.WaitGroup
	val []byte
	err error
}

func NewSingleflight() *Singleflight {
	return &Singleflight{m: make(map[string]*sfCall)}
}

func (g *Singleflight) Do(key string, fn func() ([]byte, error)) ([]byte, error) {
	g.mu.Lock()
	if c, ok := g.m[key]; ok {
		g.mu.Unlock()
		c.wg.Wait()
		return c.val, c.err
	}
	c := new(sfCall)
	c.wg.Add(1)
	g.m[key] = c
	g.mu.Unlock()

	c.val, c.err = fn()
	c.wg.Done()

	g.mu.Lock()
	delete(g.m, key)
	g.mu.Unlock()

	return c.val, c.err
}

// Key derives the deterministic SHA-1 cache key
func Key(table, dataPath, file string) string {
	raw := fmt.Sprintf("%s|%s|%s", table, dataPath, file)
	h := sha1.Sum([]byte(raw))
	return hex.EncodeToString(h[:])
}

// New initializes the file cache, probes writability, rebuilds index, and starts sweeper
func New(cfg Config) (*Cache, error) {
	c := &Cache{
		dir:          cfg.Dir,
		capBytes:     cfg.CapBytes,
		ttl:          cfg.TTL,
		disabled:     cfg.Disabled,
		singleflight: NewSingleflight(),
		stopChan:     make(chan struct{}),
	}

	if c.disabled {
		log.Printf("[FileCache] Disabled (running cacheless)")
		return c, nil
	}

	if c.capBytes <= 0 {
		c.capBytes = 2000 * 1024 * 1024 // Default 2000 MB
	}
	if c.ttl <= 0 {
		c.ttl = 6 * time.Hour
	}
	if c.dir == "" {
		c.dir = "./th-cache"
	}

	// Ensure directory exists
	if err := os.MkdirAll(c.dir, 0755); err != nil {
		log.Printf("[FileCache] LOUD WARNING: Failed to create cache directory %s: %v. Running cacheless.", c.dir, err)
		c.disabled = true
		return c, nil
	}

	// Writability probe
	probeFile := filepath.Join(c.dir, ".writability_probe")
	if err := os.WriteFile(probeFile, []byte("ok"), 0644); err != nil {
		log.Printf("[FileCache] LOUD WARNING: Cache directory %s not writable: %v. Running cacheless.", c.dir, err)
		c.disabled = true
		return c, nil
	}
	_ = os.Remove(probeFile)

	// Rebuild index from directory
	c.rebuildIndex()

	// Start background sweeper
	c.wg.Add(1)
	go c.sweeper()

	log.Printf("[FileCache] Initialized at %s (cap=%d MB, ttl=%v, existing=%d files, size=%.2f MB)",
		c.dir, c.capBytes/(1024*1024), c.ttl, c.entries.Load(), float64(c.currentBytes.Load())/(1024*1024))

	return c, nil
}

// Close gracefully stops the background sweeper
func (c *Cache) Close() {
	if c.disabled || c.stopChan == nil {
		return
	}
	close(c.stopChan)
	c.wg.Wait()
}

// Singleflight returns the internal singleflight instance
func (c *Cache) Singleflight() *Singleflight {
	return c.singleflight
}

func (c *Cache) rebuildIndex() {
	c.mu.Lock()
	defer c.mu.Unlock()

	entries, err := os.ReadDir(c.dir)
	if err != nil {
		log.Printf("[FileCache] Rebuild index ReadDir error: %v", err)
		return
	}

	var totalBytes int64
	var count int64

	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() {
			continue
		}
		if filepath.Ext(name) == ".tmp" {
			_ = os.Remove(filepath.Join(c.dir, name))
			continue
		}
		if filepath.Ext(name) != ".bin" {
			continue
		}

		binPath := filepath.Join(c.dir, name)
		metaPath := filepath.Join(c.dir, strings.TrimSuffix(name, ".bin")+".meta")

		metaBytes, err := os.ReadFile(metaPath)
		if err != nil {
			// Orphan .bin without .meta, delete
			_ = os.Remove(binPath)
			continue
		}

		var meta Meta
		if err := json.Unmarshal(metaBytes, &meta); err != nil {
			_ = os.Remove(binPath)
			_ = os.Remove(metaPath)
			continue
		}

		info, err := entry.Info()
		if err != nil || info.Size() != meta.ByteSize {
			_ = os.Remove(binPath)
			_ = os.Remove(metaPath)
			continue
		}

		totalBytes += info.Size()
		count++
	}

	c.currentBytes.Store(totalBytes)
	c.entries.Store(count)

	if totalBytes > c.capBytes {
		c.evictUnderLock(c.capBytes)
	}
}

// Get fetches the compressed blob and metadata for a key. Returns (data, meta, true) on hit.
func (c *Cache) Get(table, dataPath, file string) ([]byte, *Meta, bool) {
	if c.disabled {
		return nil, nil, false
	}

	key := Key(table, dataPath, file)
	binPath := filepath.Join(c.dir, key+".bin")
	metaPath := filepath.Join(c.dir, key+".meta")

	data, err := os.ReadFile(binPath)
	if err != nil {
		return nil, nil, false
	}

	metaData, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, nil, false
	}

	var meta Meta
	if err := json.Unmarshal(metaData, &meta); err != nil {
		return nil, nil, false
	}

	// Update mtime as LRU signal
	now := time.Now()
	_ = os.Chtimes(binPath, now, now)

	return data, &meta, true
}

// Put saves a compressed blob and metadata sidecar. Best-effort; never returns fatal error.
func (c *Cache) Put(table, dataPath, file string, data []byte, isSpeedDir *bool) error {
	if c.disabled || len(data) == 0 {
		return nil
	}

	key := Key(table, dataPath, file)
	tmpPath := filepath.Join(c.dir, key+".tmp")
	binPath := filepath.Join(c.dir, key+".bin")
	metaPath := filepath.Join(c.dir, key+".meta")

	// Write temp file with fsync
	f, err := os.OpenFile(tmpPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		log.Printf("[FileCache] Put OpenFile error: %v", err)
		return nil
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		_ = os.Remove(tmpPath)
		log.Printf("[FileCache] Put Write error: %v", err)
		return nil
	}
	if err := f.Sync(); err != nil {
		f.Close()
		_ = os.Remove(tmpPath)
		log.Printf("[FileCache] Put Sync error: %v", err)
		return nil
	}
	f.Close()

	// Atomic rename
	if err := os.Rename(tmpPath, binPath); err != nil {
		_ = os.Remove(tmpPath)
		log.Printf("[FileCache] Put Rename error: %v", err)
		return nil
	}

	// Write metadata sidecar
	meta := Meta{
		Table:      table,
		DataPath:   dataPath,
		File:       file,
		ByteSize:   int64(len(data)),
		StoredAt:   time.Now().UTC(),
		IsSpeedDir: isSpeedDir,
	}
	metaBytes, _ := json.Marshal(meta)
	_ = os.WriteFile(metaPath, metaBytes, 0644)

	// Update counters and enforce cap under lock
	c.mu.Lock()
	defer c.mu.Unlock()

	c.currentBytes.Add(int64(len(data)))
	c.entries.Add(1)

	if c.currentBytes.Load() > c.capBytes {
		c.evictUnderLock(c.capBytes)
	}

	return nil
}

type fileInfoItem struct {
	path     string
	metaPath string
	modTime  time.Time
	size     int64
}

// evictUnderLock removes oldest-mtime entries until currentBytes <= targetCap
func (c *Cache) evictUnderLock(targetCap int64) {
	entries, err := os.ReadDir(c.dir)
	if err != nil {
		return
	}

	var items []fileInfoItem
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".bin" {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		base := strings.TrimSuffix(entry.Name(), ".bin")
		items = append(items, fileInfoItem{
			path:     filepath.Join(c.dir, entry.Name()),
			metaPath: filepath.Join(c.dir, base+".meta"),
			modTime:  info.ModTime(),
			size:     info.Size(),
		})
	}

	// Sort oldest mtime first
	sort.Slice(items, func(i, j int) bool {
		return items[i].modTime.Before(items[j].modTime)
	})

	for _, item := range items {
		if c.currentBytes.Load() <= targetCap {
			break
		}
		_ = os.Remove(item.path)
		_ = os.Remove(item.metaPath)
		c.currentBytes.Add(-item.size)
		c.entries.Add(-1)
	}
}

func (c *Cache) sweeper() {
	defer c.wg.Done()
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-c.stopChan:
			return
		case <-ticker.C:
			c.sweep()
		}
	}
}

func (c *Cache) sweep() {
	c.mu.Lock()
	defer c.mu.Unlock()

	entries, err := os.ReadDir(c.dir)
	if err != nil {
		return
	}

	now := time.Now()
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".bin" {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if now.Sub(info.ModTime()) > c.ttl {
			base := strings.TrimSuffix(entry.Name(), ".bin")
			_ = os.Remove(filepath.Join(c.dir, entry.Name()))
			_ = os.Remove(filepath.Join(c.dir, base+".meta"))
			c.currentBytes.Add(-info.Size())
			c.entries.Add(-1)
		}
	}

	if c.currentBytes.Load() > c.capBytes {
		c.evictUnderLock(c.capBytes)
	}
}

// Stats returns counters for monitoring
func (c *Cache) Stats() map[string]interface{} {
	return map[string]interface{}{
		"entries":  c.entries.Load(),
		"bytes":    c.currentBytes.Load(),
		"capBytes": c.capBytes,
	}
}
