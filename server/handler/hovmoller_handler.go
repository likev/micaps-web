package handler

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"

	"micaps-web/db"
	"micaps-web/filecache"
)

// HovmollerHandler streams time-line hovmoller (leads x nodes at one level) as NDJSON
type HovmollerHandler struct {
	Client   *db.CQLClient
	Cache    *filecache.Cache
	MockMode bool
}

type hovmollerResultEvent struct {
	Type    string                 `json:"type"`
	PointA  map[string]interface{} `json:"pointA"`
	PointB  map[string]interface{} `json:"pointB"`
	DistKm  float64                `json:"distKm"`
	Cycle   string                 `json:"cycle"`
	Leads   []int                  `json:"leads"`
	Level   int                    `json:"level"`
	RH      [][]*float64           `json:"rh"`
	TMP     [][]*float64           `json:"tmp"`
	VVEL    [][]*float64           `json:"vvel"`
	U       [][]*float64           `json:"u"`
	V       [][]*float64           `json:"v"`
	Missing map[string]int         `json:"missing"`
	Stats   map[string]interface{} `json:"stats"`
}

func (h *HovmollerHandler) Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	modelName, cycle, lon0, lat0, lon1, lat1, npoints, ok := parseLineCommon(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()

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

	levelStr := q.Get("level")
	if levelStr == "" {
		http.Error(w, "missing level parameter", http.StatusBadRequest)
		return
	}
	lvls, err := parseIntegerList(levelStr, 1, 1, 10, 1050)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid level: %v", err), http.StatusBadRequest)
		return
	}
	// Reject lists disguised as single (comma present)
	for _, c := range levelStr {
		if c == ',' {
			http.Error(w, "invalid level: single level only", http.StatusBadRequest)
			return
		}
	}
	level := lvls[0]

	elements := []string{"RH", "TMP", "VVEL", "WIND"}
	totalTasks := len(leads) * len(elements)

	nodes := buildTransectNodes(lon0, lat0, lon1, lat1, npoints)

	tasks := make([]lineBlobTask, 0, totalTasks)
	for ti, lead := range leads {
		fileName := fmt.Sprintf("%s.%03d", cycle, lead)
		for ei, el := range elements {
			dataPath := fmt.Sprintf("%s/%s/%d", modelName, el, level)
			tasks = append(tasks, lineBlobTask{
				elementIdx: ei, element: el,
				rowIdx: ti, pressure: level, lead: lead,
				table: modelName, dataPath: dataPath, file: fileName,
			})
		}
	}

	fetcher := &lineFetcher{Client: h.Client, Cache: h.Cache, MockMode: h.MockMode}
	firstResult := fetcher.processTask(r.Context(), tasks[0], nodes)
	if firstResult.outOfDomain {
		http.Error(w, "transect out of grid domain", http.StatusBadRequest)
		return
	}

	exemptWriteDeadline(w)
	flusher, _ := w.(http.Flusher)
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)

	nLeads := len(leads)
	nPts := npoints
	rhMat := make([][]*float64, nLeads)
	tmpMat := make([][]*float64, nLeads)
	vvelMat := make([][]*float64, nLeads)
	uMat := make([][]*float64, nLeads)
	vMat := make([][]*float64, nLeads)
	for i := 0; i < nLeads; i++ {
		rhMat[i] = make([]*float64, nPts)
		tmpMat[i] = make([]*float64, nPts)
		vvelMat[i] = make([]*float64, nPts)
		uMat[i] = make([]*float64, nPts)
		vMat[i] = make([]*float64, nPts)
	}

	var snappedA, snappedB map[string]interface{}
	setSnapped := func() {
		// Snapped endpoints come from the already-sampled first task (no refetch)
		if snappedA != nil {
			return
		}
		if firstResult.snappedA != nil {
			snappedA = map[string]interface{}{"lon": firstResult.snappedA.SnappedLon, "lat": firstResult.snappedA.SnappedLat, "i": firstResult.snappedA.GridI, "j": firstResult.snappedA.GridJ}
		} else {
			snappedA = map[string]interface{}{"lon": lon0, "lat": lat0, "i": 0, "j": 0}
		}
		if firstResult.snappedB != nil {
			snappedB = map[string]interface{}{"lon": firstResult.snappedB.SnappedLon, "lat": firstResult.snappedB.SnappedLat, "i": firstResult.snappedB.GridI, "j": firstResult.snappedB.GridJ}
		} else {
			snappedB = map[string]interface{}{"lon": lon1, "lat": lat1, "i": 0, "j": 0}
		}
	}

	loaded, okCount, failedCount, cacheHits := 0, 0, 0, 0
	applyResult := func(res lineBlobResult) {
		loaded++
		if res.source == "cache" {
			cacheHits++
		}
		if res.err != nil {
			failedCount++
		} else {
			setSnapped()
			perNodeOk := 0
			ti := res.task.rowIdx
			switch res.task.elementIdx {
			case 0:
				for pi := 0; pi < nPts; pi++ {
					if res.valid[pi] {
						v := res.values[pi]
						rhMat[ti][pi] = &v
						perNodeOk++
					}
				}
			case 1:
				for pi := 0; pi < nPts; pi++ {
					if res.valid[pi] {
						v := res.values[pi]
						tmpMat[ti][pi] = &v
						perNodeOk++
					}
				}
			case 2:
				for pi := 0; pi < nPts; pi++ {
					if res.valid[pi] {
						v := res.values[pi]
						vvelMat[ti][pi] = &v
						perNodeOk++
					}
				}
			case 3:
				for pi := 0; pi < nPts; pi++ {
					if res.valid[pi] {
						uv := res.uVals[pi]
						vv := res.vVals[pi]
						uMat[ti][pi] = &uv
						vMat[ti][pi] = &vv
						perNodeOk++
					}
				}
			}
			if perNodeOk > 0 {
				okCount++
			} else {
				failedCount++
			}
		}
		writeLineProgress(w, flusher, loaded, totalTasks, okCount, failedCount, cacheHits, res.source)
	}

	applyResult(firstResult)
	runLinePool(r.Context(), tasks, nodes, fetcher, firstResult, applyResult)

	if r.Context().Err() != nil {
		return
	}
	if snappedA == nil {
		snappedA = map[string]interface{}{"lon": lon0, "lat": lat0, "i": 0, "j": 0}
		snappedB = map[string]interface{}{"lon": lon1, "lat": lat1, "i": 0, "j": 0}
	}

	missing := map[string]int{"rh": 0, "tmp": 0, "vvel": 0, "wind": 0}
	rhMin, rhMax := math.MaxFloat64, -math.MaxFloat64
	tmpMin, tmpMax := math.MaxFloat64, -math.MaxFloat64
	vvelMin, vvelMax := math.MaxFloat64, -math.MaxFloat64
	for ti := 0; ti < nLeads; ti++ {
		for pi := 0; pi < nPts; pi++ {
			if rhMat[ti][pi] == nil {
				missing["rh"]++
			} else {
				v := *rhMat[ti][pi]
				if v < rhMin {
					rhMin = v
				}
				if v > rhMax {
					rhMax = v
				}
			}
			if tmpMat[ti][pi] == nil {
				missing["tmp"]++
			} else {
				v := *tmpMat[ti][pi]
				if v < tmpMin {
					tmpMin = v
				}
				if v > tmpMax {
					tmpMax = v
				}
			}
			if vvelMat[ti][pi] == nil {
				missing["vvel"]++
			} else {
				v := *vvelMat[ti][pi]
				if v < vvelMin {
					vvelMin = v
				}
				if v > vvelMax {
					vvelMax = v
				}
			}
			if uMat[ti][pi] == nil || vMat[ti][pi] == nil {
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
		"total": totalTasks, "failed": failedCount, "cacheHits": cacheHits,
		"rhMin": rhMin, "rhMax": rhMax, "tmpMin": tmpMin, "tmpMax": tmpMax,
		"vvelMin": vvelMin, "vvelMax": vvelMax,
	}
	resultEvt := hovmollerResultEvent{
		Type: "result", PointA: snappedA, PointB: snappedB,
		DistKm: nodes.TotalKm, Cycle: cycle, Leads: leads, Level: level,
		RH: rhMat, TMP: tmpMat, VVEL: vvelMat, U: uMat, V: vMat,
		Missing: missing, Stats: stats,
	}
	if b, err := json.Marshal(resultEvt); err == nil {
		w.Write(b)
		w.Write([]byte("\n"))
		if flusher != nil {
			flusher.Flush()
		}
	}
}
