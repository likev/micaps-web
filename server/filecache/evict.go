package filecache

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type fileInfoItem struct {
	path       string
	metaPath   string
	modTime    time.Time
	size       int64
	prefetched bool
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
		metaPath := filepath.Join(c.dir, base+".meta")
		var prefetched bool
		if mb, err := os.ReadFile(metaPath); err == nil {
			var m Meta
			if json.Unmarshal(mb, &m) == nil {
				prefetched = m.Prefetched
			}
		}
		items = append(items, fileInfoItem{
			path:       filepath.Join(c.dir, entry.Name()),
			metaPath:   metaPath,
			modTime:    info.ModTime(),
			size:       info.Size(),
			prefetched: prefetched,
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
		if item.prefetched {
			c.prefetchedEntries.Add(-1)
		}
	}

	if c.prefetchedEntries.Load() < 0 {
		c.prefetchedEntries.Store(0)
	}
	if c.currentBytes.Load() < 0 {
		c.currentBytes.Store(0)
	}
	if c.entries.Load() < 0 {
		c.entries.Store(0)
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

		base := strings.TrimSuffix(entry.Name(), ".bin")
		metaPath := filepath.Join(c.dir, base+".meta")

		expired := false
		var meta Meta
		if metaBytes, err := os.ReadFile(metaPath); err == nil {
			if err := json.Unmarshal(metaBytes, &meta); err == nil {
				if c.ttl > 0 && !meta.StoredAt.IsZero() && now.Sub(meta.StoredAt) > c.ttl {
					expired = true
				}
			}
		}
		if c.ttl > 0 && now.Sub(info.ModTime()) > c.ttl {
			expired = true
		}

		if expired {
			_ = os.Remove(filepath.Join(c.dir, entry.Name()))
			_ = os.Remove(metaPath)
			c.currentBytes.Add(-info.Size())
			c.entries.Add(-1)
			if meta.Prefetched {
				c.prefetchedEntries.Add(-1)
			}
		}
	}

	if c.prefetchedEntries.Load() < 0 {
		c.prefetchedEntries.Store(0)
	}
	if c.currentBytes.Load() < 0 {
		c.currentBytes.Store(0)
	}
	if c.entries.Load() < 0 {
		c.entries.Store(0)
	}

	if c.currentBytes.Load() > c.capBytes {
		c.evictUnderLock(c.capBytes)
	}
}
