package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"micaps-web/filecache"
)

// PrefetchItem represents one item in a prefetch request payload
type PrefetchItem struct {
	Kind      string `json:"kind"`
	Path      string `json:"path"`
	File      string `json:"file"`
	Level     string `json:"level,omitempty"`
	Direction string `json:"dir,omitempty"`
	Date      string `json:"date,omitempty"`
}

// PrefetchRequest represents the JSON body sent to POST /api/prefetch
type PrefetchRequest struct {
	Scope string         `json:"scope"`
	Gen   int64          `json:"gen"`
	Items []PrefetchItem `json:"items"`
}

// PrefetchResponse represents the JSON response returned from POST /api/prefetch
type PrefetchResponse struct {
	Accepted      int  `json:"accepted"`
	AlreadyCached int  `json:"alreadyCached"`
	Rejected      int  `json:"rejected"`
	Disabled      bool `json:"disabled"`
}

type prefetchJob struct {
	scope string
	gen   int64
	ref   BlobRef
}

type prefetchStats struct {
	queued       atomic.Int64
	running      atomic.Int64
	warmed       atomic.Int64
	failed       atomic.Int64
	dropped      atomic.Int64
	negativeHits atomic.Int64
}

// PrefetchHandler manages backend cache warming
type PrefetchHandler struct {
	Source    *BlobSource
	Cache     *filecache.Cache
	MockMode  bool
	Workers   int
	QueueSize int

	queue     chan prefetchJob
	scopeMu   sync.Mutex
	scopeGens map[string]int64
	negMu     sync.RWMutex
	negCache  map[string]time.Time
	stats     prefetchStats
	stopChan  chan struct{}
	wg        sync.WaitGroup
	started   sync.Once
}

// NewPrefetchHandler creates and starts a PrefetchHandler with worker pool
func NewPrefetchHandler(source *BlobSource, cache *filecache.Cache, mockMode bool, workers int, queueSize int) *PrefetchHandler {
	if workers < 0 {
		workers = 0
	}
	if workers > 0 && queueSize <= 0 {
		queueSize = 64
	}

	h := &PrefetchHandler{
		Source:    source,
		Cache:     cache,
		MockMode:  mockMode,
		Workers:   workers,
		QueueSize: queueSize,
		scopeGens: make(map[string]int64),
		negCache:  make(map[string]time.Time),
		stopChan:  make(chan struct{}),
	}

	if h.Workers > 0 && h.Cache != nil && !h.Cache.IsDisabled() {
		h.queue = make(chan prefetchJob, h.QueueSize)
		h.startWorkers()
	}

	return h
}

func (h *PrefetchHandler) startWorkers() {
	h.started.Do(func() {
		for i := 0; i < h.Workers; i++ {
			h.wg.Add(1)
			go h.workerLoop()
		}
	})
}

func (h *PrefetchHandler) Close() {
	if h.stopChan == nil {
		return
	}
	select {
	case <-h.stopChan:
		return
	default:
		close(h.stopChan)
	}
	h.wg.Wait()
}

// Stats returns counters for /api/status -> prefetch
func (h *PrefetchHandler) Stats() map[string]interface{} {
	return map[string]interface{}{
		"queued":       h.stats.queued.Load(),
		"running":      h.stats.running.Load(),
		"warmed":       h.stats.warmed.Load(),
		"failed":       h.stats.failed.Load(),
		"dropped":      h.stats.dropped.Load(),
		"negativeHits": h.stats.negativeHits.Load(),
	}
}

func (h *PrefetchHandler) isNegativelyCached(key string) bool {
	h.negMu.RLock()
	exp, exists := h.negCache[key]
	h.negMu.RUnlock()

	if !exists {
		return false
	}
	if time.Now().After(exp) {
		h.negMu.Lock()
		delete(h.negCache, key)
		h.negMu.Unlock()
		return false
	}
	return true
}

func (h *PrefetchHandler) setNegativeCache(key string) {
	h.negMu.Lock()
	defer h.negMu.Unlock()
	h.negCache[key] = time.Now().Add(30 * time.Second)
}

func (h *PrefetchHandler) workerLoop() {
	defer h.wg.Done()

	for {
		select {
		case <-h.stopChan:
			return
		case job, ok := <-h.queue:
			if !ok {
				return
			}
			h.processJob(job)
		}
	}
}

func (h *PrefetchHandler) processJob(job prefetchJob) {
	// 1. Supersede check: if a newer gen was registered for this scope, drop it
	h.scopeMu.Lock()
	latestGen := h.scopeGens[job.scope]
	h.scopeMu.Unlock()

	if job.gen < latestGen {
		h.stats.dropped.Add(1)
		return
	}

	key := filecache.Key(job.ref.Table, job.ref.SubDataPath, job.ref.File)

	// 2. Negative cache check
	if h.isNegativelyCached(key) {
		h.stats.negativeHits.Add(1)
		return
	}

	// 3. Cache presence check
	if h.Cache != nil && h.Cache.Has(job.ref.Table, job.ref.SubDataPath, job.ref.File) {
		h.Cache.Touch(job.ref.Table, job.ref.SubDataPath, job.ref.File)
		return
	}

	// 4. Warm blob
	h.stats.running.Add(1)
	defer h.stats.running.Add(-1)

	if h.Source == nil {
		h.stats.failed.Add(1)
		h.setNegativeCache(key)
		return
	}

	err := h.Source.Warm(job.ref)
	if err != nil {
		h.stats.failed.Add(1)
		h.setNegativeCache(key)
	} else {
		h.stats.warmed.Add(1)
	}
}

// Handler serves POST /api/prefetch
func (h *PrefetchHandler) Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// 1. Cap request body at 64 KB
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var req PrefetchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("invalid json payload or body too large: %v", err)})
		return
	}

	// 2. Mock mode: return 202 without performing work
	if h.MockMode {
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(PrefetchResponse{
			Accepted:      len(req.Items),
			AlreadyCached: 0,
			Rejected:      0,
			Disabled:      false,
		})
		return
	}

	// 3. Check disabled mode
	if h.Workers == 0 || h.Cache == nil || h.Cache.IsDisabled() {
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(PrefetchResponse{
			Accepted:      0,
			AlreadyCached: 0,
			Rejected:      0,
			Disabled:      true,
		})
		return
	}

	// 4. Max 16 items check
	if len(req.Items) > 16 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "items exceed maximum limit of 16"})
		return
	}

	// 5. Update latest generation for scope
	if req.Scope != "" {
		h.scopeMu.Lock()
		if req.Gen > h.scopeGens[req.Scope] {
			h.scopeGens[req.Scope] = req.Gen
		}
		h.scopeMu.Unlock()
	}

	var accepted int
	var alreadyCached int
	var rejected int

	for _, item := range req.Items {
		// Validation: reject path traversal ..
		if strings.Contains(item.Path, "..") || strings.Contains(item.File, "..") {
			rejected++
			continue
		}

		cleanPath := SanitizeGridPath(item.Path)
		cleanFile := SanitizeFile(item.File)

		// Validation: reject empty, "latest", or derived paths
		if cleanPath == "" || cleanFile == "" || cleanFile == "latest" || strings.Contains(cleanPath, "derived") {
			rejected++
			continue
		}

		var ref BlobRef
		var err error

		kind := strings.ToLower(strings.TrimSpace(item.Kind))
		if kind == "image" {
			ref, err = CanonicalImageRef(cleanPath, cleanFile)
		} else {
			ref, err = CanonicalGridRef(cleanPath, cleanFile, item.Level)
		}

		if err != nil {
			rejected++
			continue
		}

		// Table allow-list: SATELLITE only in v1
		if ref.Table != "SATELLITE" {
			rejected++
			continue
		}

		key := filecache.Key(ref.Table, ref.SubDataPath, ref.File)

		// Check negative cache
		if h.isNegativelyCached(key) {
			h.stats.negativeHits.Add(1)
			rejected++
			continue
		}

		// Check presence in disk cache
		if h.Cache.Has(ref.Table, ref.SubDataPath, ref.File) {
			h.Cache.Touch(ref.Table, ref.SubDataPath, ref.File)
			alreadyCached++
			continue
		}

		// Enqueue job into bounded queue
		job := prefetchJob{
			scope: req.Scope,
			gen:   req.Gen,
			ref:   ref,
		}

		select {
		case h.queue <- job:
			accepted++
			h.stats.queued.Add(1)
		default:
			// Queue full: drop job
			h.stats.dropped.Add(1)
		}
	}

	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(PrefetchResponse{
		Accepted:      accepted,
		AlreadyCached: alreadyCached,
		Rejected:      rejected,
		Disabled:      false,
	})
}
