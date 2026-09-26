package handler

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"sync"

	"micaps-web/db"
	"micaps-web/filecache"
	"micaps-web/parser"
)

var (
	modelRainStepsCache sync.Map // modelName -> []string
	validRainSteps      = map[string]bool{
		"RAIN03": true,
		"RAIN06": true,
		"RAIN12": true,
		"RAIN24": true,
	}
)

// resolveRainStep chooses the best rain step (RAIN03, RAIN06, RAIN12, RAIN24) for a given model
func resolveRainStep(client *db.CQLClient, modelName string, requestedStep string, leads []int, mockMode bool) string {
	requestedStep = strings.ToUpper(strings.TrimSpace(requestedStep))
	if requestedStep != "" && requestedStep != "AUTO" {
		if !strings.HasPrefix(requestedStep, "RAIN") {
			requestedStep = "RAIN" + requestedStep
		}
		if !validRainSteps[requestedStep] {
			requestedStep = ""
		}
	} else {
		requestedStep = ""
	}

	defaultStep := "RAIN12"
	if len(leads) >= 2 {
		diff := leads[1] - leads[0]
		if diff <= 3 {
			defaultStep = "RAIN03"
		} else if diff <= 6 {
			defaultStep = "RAIN06"
		} else if diff <= 12 {
			defaultStep = "RAIN12"
		} else {
			defaultStep = "RAIN24"
		}
	}

	if mockMode || client == nil {
		if requestedStep != "" && validRainSteps[requestedStep] {
			return requestedStep
		}
		return defaultStep
	}

	var avail []string
	if val, ok := modelRainStepsCache.Load(modelName); ok {
		avail = val.([]string)
	} else {
		allSteps := []string{"RAIN03", "RAIN06", "RAIN12", "RAIN24"}
		for _, s := range allSteps {
			dp := fmt.Sprintf("%s/%s", modelName, s)
			q := fmt.Sprintf(`SELECT column1 FROM micapsdataserver.treeview WHERE "dataPath" = '%s' LIMIT 1`, dp)
			rows, err := client.Query(q)
			if err == nil && len(rows) > 0 {
				avail = append(avail, s)
			}
		}
		if len(avail) > 0 {
			modelRainStepsCache.Store(modelName, avail)
		}
	}

	if len(avail) == 0 {
		if requestedStep != "" && validRainSteps[requestedStep] {
			return requestedStep
		}
		return defaultStep
	}

	if requestedStep != "" {
		for _, a := range avail {
			if a == requestedStep {
				return a
			}
		}
	}

	for _, a := range avail {
		if a == defaultStep {
			return a
		}
	}

	prefOrder := []string{"RAIN12", "RAIN06", "RAIN03", "RAIN24"}
	if defaultStep == "RAIN03" {
		prefOrder = []string{"RAIN03", "RAIN06", "RAIN12", "RAIN24"}
	} else if defaultStep == "RAIN06" {
		prefOrder = []string{"RAIN06", "RAIN03", "RAIN12", "RAIN24"}
	} else if defaultStep == "RAIN24" {
		prefOrder = []string{"RAIN24", "RAIN12", "RAIN06", "RAIN03"}
	}
	for _, p := range prefOrder {
		for _, a := range avail {
			if a == p {
				return a
			}
		}
	}

	return avail[0]
}

// HovmollerHandler streams time-line hovmoller (leads x nodes at one level) as NDJSON
type HovmollerHandler struct {
	Client   *db.CQLClient
	Cache    *filecache.Cache
	MockMode bool
}

type hovmollerResultEvent struct {
	Type     string                 `json:"type"`
	PointA   map[string]interface{} `json:"pointA"`
	PointB   map[string]interface{} `json:"pointB"`
	DistKm   float64                `json:"distKm"`
	Cycle    string                 `json:"cycle"`
	Leads    []int                  `json:"leads"`
	Level    int                    `json:"level"`
	RainStep string                 `json:"rainStep,omitempty"`
	RH       [][]*float64           `json:"rh"`
	TMP      [][]*float64           `json:"tmp"`
	VVEL     [][]*float64           `json:"vvel"`
	U        [][]*float64           `json:"u"`
	V        [][]*float64           `json:"v"`
	Rain     [][]*float64           `json:"rain"`
	Missing  map[string]int         `json:"missing"`
	Stats    map[string]interface{} `json:"stats"`
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

	rainStepReq := q.Get("rain_step")
	rainStep := resolveRainStep(h.Client, modelName, rainStepReq, leads, h.MockMode)

	elements := []string{"RH", "TMP", "VVEL", "WIND", "RAIN"}
	totalTasks := len(leads) * len(elements)

	nodes := buildTransectNodes(lon0, lat0, lon1, lat1, npoints)

	tasks := make([]lineBlobTask, 0, totalTasks)
	for ti, lead := range leads {
		fileName := fmt.Sprintf("%s.%03d", cycle, lead)
		for ei, el := range elements {
			dataPath := fmt.Sprintf("%s/%s/%d", modelName, el, level)
			if el == "RAIN" {
				dataPath = fmt.Sprintf("%s/%s", modelName, rainStep)
			}
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
	rainMat := make([][]*float64, nLeads)
	for i := 0; i < nLeads; i++ {
		rhMat[i] = make([]*float64, nPts)
		tmpMat[i] = make([]*float64, nPts)
		vvelMat[i] = make([]*float64, nPts)
		uMat[i] = make([]*float64, nPts)
		vMat[i] = make([]*float64, nPts)
		rainMat[i] = make([]*float64, nPts)
	}

	var snappedA, snappedB map[string]interface{}
	setSnapped := func(res *lineBlobResult) {
		if snappedA != nil {
			return
		}
		var srcA, srcB *parser.SampledPoint
		if firstResult.snappedA != nil {
			srcA = firstResult.snappedA
			srcB = firstResult.snappedB
		} else if res != nil && res.snappedA != nil {
			srcA = res.snappedA
			srcB = res.snappedB
		}
		if srcA != nil {
			snappedA = map[string]interface{}{"lon": srcA.SnappedLon, "lat": srcA.SnappedLat, "i": srcA.GridI, "j": srcA.GridJ}
			if srcB != nil {
				snappedB = map[string]interface{}{"lon": srcB.SnappedLon, "lat": srcB.SnappedLat, "i": srcB.GridI, "j": srcB.GridJ}
			} else {
				snappedB = map[string]interface{}{"lon": lon1, "lat": lat1, "i": 0, "j": 0}
			}
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
			setSnapped(&res)
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
			case 4:
				for pi := 0; pi < nPts; pi++ {
					if res.valid[pi] {
						v := res.values[pi]
						rainMat[ti][pi] = &v
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

	missing := map[string]int{"rh": 0, "tmp": 0, "vvel": 0, "wind": 0, "rain": 0}
	rhMin, rhMax := math.MaxFloat64, -math.MaxFloat64
	tmpMin, tmpMax := math.MaxFloat64, -math.MaxFloat64
	vvelMin, vvelMax := math.MaxFloat64, -math.MaxFloat64
	rainMin, rainMax := math.MaxFloat64, -math.MaxFloat64
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
			if rainMat[ti][pi] == nil {
				missing["rain"]++
			} else {
				v := *rainMat[ti][pi]
				if v < rainMin {
					rainMin = v
				}
				if v > rainMax {
					rainMax = v
				}
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
	if rainMin > rainMax {
		rainMin, rainMax = 0, 50
	}
	stats := map[string]interface{}{
		"total": totalTasks, "failed": failedCount, "cacheHits": cacheHits,
		"rhMin": rhMin, "rhMax": rhMax, "tmpMin": tmpMin, "tmpMax": tmpMax,
		"vvelMin": vvelMin, "vvelMax": vvelMax,
		"rainMin": rainMin, "rainMax": rainMax,
	}
	resultEvt := hovmollerResultEvent{
		Type: "result", PointA: snappedA, PointB: snappedB,
		DistKm: nodes.TotalKm, Cycle: cycle, Leads: leads, Level: level,
		RainStep: rainStep,
		RH: rhMat, TMP: tmpMat, VVEL: vvelMat, U: uMat, V: vMat, Rain: rainMat,
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
