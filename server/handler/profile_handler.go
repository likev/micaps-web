package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"micaps-web/db"
	"micaps-web/filecache"
	"micaps-web/mock"
	"micaps-web/parser"
)

var (
	cycleRegex = regexp.MustCompile(`^\d{8}$`)
	modelRegex = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
)

// ProfileHandler streams time-height cross-section profiles as NDJSON
type ProfileHandler struct {
	Client   *db.CQLClient
	Cache    *filecache.Cache
	MockMode bool
}

type profileTask struct {
	elementIdx int // 0: RH, 1: TMP, 2: VVEL, 3: WIND
	element    string
	levelIdx   int
	level      int
	leadIdx    int
	lead       int
	table      string
	dataPath   string
	file       string
}

type profileTaskResult struct {
	task        profileTask
	sampled     *parser.SampledPoint
	source      string // "cache", "cassandra", "mock"
	err         error
	outOfDomain bool
}

// ProgressEvent represents one streaming progress update line
type ProgressEvent struct {
	Type       string `json:"type"`
	Loaded     int    `json:"loaded"`
	Total      int    `json:"total"`
	Ok         int    `json:"ok"`
	Failed     int    `json:"failed"`
	CacheHits  int    `json:"cacheHits"`
	LastSource string `json:"lastSource"`
}

// ResultEvent represents the final matrix result line
type ResultEvent struct {
	Type    string                 `json:"type"`
	Point   map[string]interface{} `json:"point"`
	Cycle   string                 `json:"cycle"`
	Leads   []int                  `json:"leads"`
	Levels  []int                  `json:"levels"`
	RH      [][]*float64           `json:"rh"`
	TMP     [][]*float64           `json:"tmp"`
	VVEL    [][]*float64           `json:"vvel"`
	U       [][]*float64           `json:"u"`
	V       [][]*float64           `json:"v"`
	Missing map[string]int         `json:"missing"`
	Stats   map[string]interface{} `json:"stats"`
}

func (h *ProfileHandler) Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	q := r.URL.Query()
	modelName := q.Get("model")
	if modelName == "" {
		modelName = "ECMWF_HR"
	}
	if !modelRegex.MatchString(modelName) {
		http.Error(w, "invalid model name", http.StatusBadRequest)
		return
	}

	cycle := q.Get("cycle")
	if !cycleRegex.MatchString(cycle) {
		http.Error(w, "invalid cycle: must be 8 digits (e.g. 26091808)", http.StatusBadRequest)
		return
	}

	leadsStr := q.Get("leads")
	if leadsStr == "" {
		http.Error(w, "missing leads parameter", http.StatusBadRequest)
		return
	}
	leads, err := parseIntegerList(leadsStr, 1, 41, 0, 240)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid leads: %v", err), http.StatusBadRequest)
		return
	}

	levelsStr := q.Get("levels")
	if levelsStr == "" {
		http.Error(w, "missing levels parameter", http.StatusBadRequest)
		return
	}
	levels, err := parseIntegerList(levelsStr, 1, 10, 10, 1050)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid levels: %v", err), http.StatusBadRequest)
		return
	}

	lonStr := q.Get("lon")
	latStr := q.Get("lat")
	if lonStr == "" || latStr == "" {
		http.Error(w, "missing lon or lat parameter", http.StatusBadRequest)
		return
	}
	lon, err := strconv.ParseFloat(lonStr, 64)
	if err != nil || math.IsNaN(lon) || lon < -180 || lon > 360 {
		http.Error(w, "invalid lon parameter", http.StatusBadRequest)
		return
	}
	lat, err := strconv.ParseFloat(latStr, 64)
	if err != nil || math.IsNaN(lat) || lat < -90 || lat > 90 {
		http.Error(w, "invalid lat parameter", http.StatusBadRequest)
		return
	}

	// Reject path traversal tokens
	rawQuery := r.URL.RawQuery
	if strings.Contains(rawQuery, "..") || strings.Contains(rawQuery, "%00") {
		http.Error(w, "invalid characters in query", http.StatusBadRequest)
		return
	}

	elements := []string{"RH", "TMP", "VVEL", "WIND"}
	totalTasks := len(levels) * len(leads) * len(elements)
	if totalTasks == 0 {
		http.Error(w, "empty profile grid set", http.StatusBadRequest)
		return
	}

	tasks := make([]profileTask, 0, totalTasks)
	for li, level := range levels {
		for ti, lead := range leads {
			fileName := fmt.Sprintf("%s.%03d", cycle, lead)
			for ei, el := range elements {
				dataPath := fmt.Sprintf("%s/%s/%d", modelName, el, level)
				tasks = append(tasks, profileTask{
					elementIdx: ei,
					element:    el,
					levelIdx:   li,
					level:      level,
					leadIdx:    ti,
					lead:       lead,
					table:      modelName,
					dataPath:   dataPath,
					file:       fileName,
				})
			}
		}
	}

	// Probe the very first grid to check for domain validity before writing OK response headers
	firstResult := h.processTask(r.Context(), tasks[0], lon, lat)
	if firstResult.outOfDomain {
		http.Error(w, "coordinates out of grid domain", http.StatusBadRequest)
		return
	}

	// ResponseController write deadline exemption for streaming
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{})

	flusher, _ := w.(http.Flusher)

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)

	// Preallocate matrices [levels][leads]
	nLevels := len(levels)
	nLeads := len(leads)
	rhMat := make([][]*float64, nLevels)
	tmpMat := make([][]*float64, nLevels)
	vvelMat := make([][]*float64, nLevels)
	uMat := make([][]*float64, nLevels)
	vMat := make([][]*float64, nLevels)
	for i := 0; i < nLevels; i++ {
		rhMat[i] = make([]*float64, nLeads)
		tmpMat[i] = make([]*float64, nLeads)
		vvelMat[i] = make([]*float64, nLeads)
		uMat[i] = make([]*float64, nLeads)
		vMat[i] = make([]*float64, nLeads)
	}

	var snappedPoint map[string]interface{}
	setSnappedPoint := func(pt *parser.SampledPoint) {
		if snappedPoint == nil && pt != nil {
			snappedPoint = map[string]interface{}{
				"lon": pt.SnappedLon,
				"lat": pt.SnappedLat,
				"i":   pt.GridI,
				"j":   pt.GridJ,
			}
		}
	}

	loaded := 0
	okCount := 0
	failedCount := 0
	cacheHits := 0

	applyResult := func(res profileTaskResult) {
		loaded++
		if res.source == "cache" {
			cacheHits++
		}
		if res.err != nil || res.sampled == nil || !res.sampled.Valid {
			failedCount++
		} else {
			okCount++
			setSnappedPoint(res.sampled)
			li := res.task.levelIdx
			ti := res.task.leadIdx
			switch res.task.elementIdx {
			case 0: // RH
				val := res.sampled.Scalar
				rhMat[li][ti] = &val
			case 1: // TMP
				val := res.sampled.Scalar
				tmpMat[li][ti] = &val
			case 2: // VVEL
				val := res.sampled.Scalar
				vvelMat[li][ti] = &val
			case 3: // WIND
				uVal := res.sampled.U
				vVal := res.sampled.V
				uMat[li][ti] = &uVal
				vMat[li][ti] = &vVal
			}
		}

		// Write progress event
		evt := ProgressEvent{
			Type:       "progress",
			Loaded:     loaded,
			Total:      totalTasks,
			Ok:         okCount,
			Failed:     failedCount,
			CacheHits:  cacheHits,
			LastSource: res.source,
		}
		if lineBytes, err := json.Marshal(evt); err == nil {
			w.Write(lineBytes)
			w.Write([]byte("\n"))
			if flusher != nil {
				flusher.Flush()
			}
		}
	}

	// Apply first probed task
	applyResult(firstResult)

	// Remaining tasks (index 1 onwards) processed via concurrency-6 worker pool
	if len(tasks) > 1 {
		remainingTasks := tasks[1:]
		tasksChan := make(chan profileTask, len(remainingTasks))
		for _, t := range remainingTasks {
			tasksChan <- t
		}
		close(tasksChan)

		resultsChan := make(chan profileTaskResult, len(remainingTasks))
		concurrency := 6
		if len(remainingTasks) < concurrency {
			concurrency = len(remainingTasks)
		}

		var wg sync.WaitGroup
		ctx := r.Context()

		for i := 0; i < concurrency; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for {
					select {
					case <-ctx.Done():
						return
					case t, ok := <-tasksChan:
						if !ok {
							return
						}
						res := h.processTask(ctx, t, lon, lat)
						select {
						case <-ctx.Done():
							return
						case resultsChan <- res:
						}
					}
				}
			}()
		}

		go func() {
			wg.Wait()
			close(resultsChan)
		}()

		for res := range resultsChan {
			applyResult(res)
			if ctx.Err() != nil {
				return
			}
		}
	}

	if r.Context().Err() != nil {
		return
	}

	// If no grid yielded snappedPoint, fallback to requested coordinates
	if snappedPoint == nil {
		snappedPoint = map[string]interface{}{
			"lon": lon,
			"lat": lat,
			"i":   0,
			"j":   0,
		}
	}

	// Compute matrix stats and missing counts
	missing := map[string]int{"rh": 0, "tmp": 0, "vvel": 0, "wind": 0}
	rhMin, rhMax := math.MaxFloat64, -math.MaxFloat64
	tmpMin, tmpMax := math.MaxFloat64, -math.MaxFloat64
	vvelMin, vvelMax := math.MaxFloat64, -math.MaxFloat64

	for li := 0; li < nLevels; li++ {
		for ti := 0; ti < nLeads; ti++ {
			if rhMat[li][ti] == nil {
				missing["rh"]++
			} else {
				v := *rhMat[li][ti]
				if v < rhMin {
					rhMin = v
				}
				if v > rhMax {
					rhMax = v
				}
			}

			if tmpMat[li][ti] == nil {
				missing["tmp"]++
			} else {
				v := *tmpMat[li][ti]
				if v < tmpMin {
					tmpMin = v
				}
				if v > tmpMax {
					tmpMax = v
				}
			}

			if vvelMat[li][ti] == nil {
				missing["vvel"]++
			} else {
				v := *vvelMat[li][ti]
				if v < vvelMin {
					vvelMin = v
				}
				if v > vvelMax {
					vvelMax = v
				}
			}

			if uMat[li][ti] == nil || vMat[li][ti] == nil {
				missing["wind"]++
			}
		}
	}

	if rhMin > rhMax {
		rhMin, rhMax = 0, 100
	}
	if tmpMin > tmpMax {
		tmpMin, tmpMax = -40, 40
	}
	if vvelMin > vvelMax {
		vvelMin, vvelMax = -100, 100
	}

	stats := map[string]interface{}{
		"total":     totalTasks,
		"failed":    failedCount,
		"cacheHits": cacheHits,
		"rhMin":     rhMin,
		"rhMax":     rhMax,
		"tmpMin":    tmpMin,
		"tmpMax":    tmpMax,
		"vvelMin":   vvelMin,
		"vvelMax":   vvelMax,
	}

	resultEvt := ResultEvent{
		Type:    "result",
		Point:   snappedPoint,
		Cycle:   cycle,
		Leads:   leads,
		Levels:  levels,
		RH:      rhMat,
		TMP:     tmpMat,
		VVEL:    vvelMat,
		U:       uMat,
		V:       vMat,
		Missing: missing,
		Stats:   stats,
	}

	if lineBytes, err := json.Marshal(resultEvt); err == nil {
		w.Write(lineBytes)
		w.Write([]byte("\n"))
		if flusher != nil {
			flusher.Flush()
		}
	}
}

func (h *ProfileHandler) processTask(ctx context.Context, task profileTask, lon, lat float64) profileTaskResult {
	if ctx.Err() != nil {
		return profileTaskResult{task: task, err: ctx.Err(), source: "cancelled"}
	}

	subPath := ""
	parts := strings.Split(task.dataPath, "/")
	if len(parts) > 1 {
		subPath = strings.Join(parts[1:], "/")
	}

	// 1. Check file cache
	if h.Cache != nil {
		if cachedBlob, _, ok := h.Cache.Get(task.table, subPath, task.file); ok {
			decompressed, err := parser.DecompressGzip(cachedBlob)
			if err == nil {
				sampled, sErr := parser.SampleGridPoint(decompressed, lon, lat, task.element)
				if errors.Is(sErr, parser.ErrOutOfDomain) {
					return profileTaskResult{task: task, outOfDomain: true, err: sErr, source: "cache"}
				}
				if sErr == nil {
					return profileTaskResult{task: task, sampled: sampled, source: "cache"}
				}
			}
		}
	}

	// 2. Fetch from Cassandra or Mock
	if h.MockMode || h.Client == nil {
		mockResp := mock.GenerateMockGrid(task.element, float32(task.level), int32(task.lead))
		decompressed := parser.EncodeMICAPSDecompressed(mockResp)
		sampled, err := parser.SampleGridPoint(decompressed, lon, lat, task.element)
		if errors.Is(err, parser.ErrOutOfDomain) {
			return profileTaskResult{task: task, outOfDomain: true, err: err, source: "mock"}
		}
		if err != nil {
			return profileTaskResult{task: task, err: err, source: "mock"}
		}
		return profileTaskResult{task: task, sampled: sampled, source: "mock"}
	}

	var rawBlob []byte
	if h.Cache != nil && h.Cache.Singleflight() != nil {
		cacheKey := filecache.Key(task.table, subPath, task.file)
		b, err := h.Cache.Singleflight().Do(cacheKey, func() ([]byte, error) {
			if cachedBlob, _, ok := h.Cache.Get(task.table, subPath, task.file); ok {
				return cachedBlob, nil
			}
			blob, err := db.GetBlob(h.Client, task.dataPath, task.file)
			if err != nil {
				return nil, err
			}
			_ = h.Cache.Put(task.table, subPath, task.file, blob, nil)
			return blob, nil
		})
		if err != nil {
			return profileTaskResult{task: task, err: err, source: "cassandra"}
		}
		rawBlob = b
	} else {
		blob, err := db.GetBlob(h.Client, task.dataPath, task.file)
		if err != nil {
			return profileTaskResult{task: task, err: err, source: "cassandra"}
		}
		if h.Cache != nil {
			_ = h.Cache.Put(task.table, subPath, task.file, blob, nil)
		}
		rawBlob = blob
	}

	decompressed, err := parser.DecompressGzip(rawBlob)
	if err != nil {
		return profileTaskResult{task: task, err: err, source: "cassandra"}
	}

	sampled, sErr := parser.SampleGridPoint(decompressed, lon, lat, task.element)
	if errors.Is(sErr, parser.ErrOutOfDomain) {
		return profileTaskResult{task: task, outOfDomain: true, err: sErr, source: "cassandra"}
	}
	if sErr != nil {
		return profileTaskResult{task: task, err: sErr, source: "cassandra"}
	}

	return profileTaskResult{task: task, sampled: sampled, source: "cassandra"}
}

func parseIntegerList(s string, minLen, maxLen, minVal, maxVal int) ([]int, error) {
	parts := strings.Split(s, ",")
	if len(parts) < minLen || len(parts) > maxLen {
		return nil, fmt.Errorf("length must be between %d and %d, got %d", minLen, maxLen, len(parts))
	}
	res := make([]int, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed == "" {
			return nil, fmt.Errorf("empty integer element")
		}
		v, err := strconv.Atoi(trimmed)
		if err != nil {
			return nil, fmt.Errorf("invalid integer: %s", trimmed)
		}
		if v < minVal || v > maxVal {
			return nil, fmt.Errorf("integer %d out of range [%d, %d]", v, minVal, maxVal)
		}
		res = append(res, v)
	}
	return res, nil
}
