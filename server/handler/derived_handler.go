package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"micaps-web/db"
	"micaps-web/filecache"
	"micaps-web/mock"
	"micaps-web/model"
	"micaps-web/parser"
)

// DerivedHandler coordinates real-time server-side calculation of derived layers
type DerivedHandler struct {
	Client   *db.CQLClient
	Cache    *filecache.Cache
	MockMode bool
}

// DirectHandler handles direct HTTP requests to /api/derived/*
func (h *DerivedHandler) DirectHandler(w http.ResponseWriter, r *http.Request) {
	queryFile := r.URL.Query().Get("file")
	dReq, ok := ParseDerivedPath(r.URL.Path, queryFile)
	if !ok || dReq == nil {
		reqPath := r.URL.Path
		if strings.HasPrefix(reqPath, "/api/derived") {
			reqPath = reqPath[len("/api/derived"):]
		}
		dReq, ok = ParseDerivedPath(reqPath, queryFile)
	}
	if !ok || dReq == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("invalid derived virtual path: %s", r.URL.Path),
		})
		return
	}

	if dReq.File == "" {
		dReq.File = queryFile
	}
	if dReq.File == "" || dReq.File == "latest" {
		underlying := ResolveUnderlyingCatalogPath(dReq)
		if h.Client != nil && !h.MockMode {
			latest, err := db.GetLatestCycle(h.Client, underlying, "")
			if err == nil && latest != "" {
				dReq.File = latest
			} else {
				files, errList := db.GetFileList(h.Client, underlying, 1)
				if errList == nil && len(files) > 0 {
					dReq.File = files[0].Name
				}
			}
		}
		if dReq.File == "" || dReq.File == "latest" {
			if dReq.IsStation {
				dReq.File = "20261010080000.000"
			} else {
				dReq.File = "26100920.012"
			}
		}
	}

	if dReq.IsStation {
		w.Header().Set("Content-Type", "application/json")
		stns, err := h.CalculateDerivedStation(dReq)
		if err != nil {
			log.Printf("[DerivedHandler] Error calculating derived station layer: %v", err)
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"type":     "FeatureCollection",
				"features": []interface{}{},
				"error":    err.Error(),
			})
			return
		}
		json.NewEncoder(w).Encode(stns)
		return
	}

	isBinary := r.URL.Query().Get("binary") == "true" ||
		strings.HasSuffix(r.URL.Path, ".bin") ||
		strings.Contains(r.Header.Get("Accept"), "application/octet-stream")

	gridResp, err := h.CalculateDerivedGrid(dReq)
	if err != nil {
		log.Printf("[DerivedHandler] Error calculating derived grid layer: %v", err)
		if isBinary {
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte(err.Error()))
		} else {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		}
		return
	}

	if isBinary {
		w.Header().Set("Content-Type", "application/octet-stream")
		bin := parser.EncodeBinaryStream(gridResp)
		w.Header().Set("Content-Length", strconv.Itoa(len(bin)))
		w.Write(bin)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gridResp)
}

func (h *DerivedHandler) fetchGridLevel(modelName, element, level, file string) (*model.GridResponse, error) {
	modelName = NormalizeModelName(modelName)
	if h.MockMode || h.Client == nil {
		lvlF := float32(850)
		if l, err := strconv.ParseFloat(level, 32); err == nil {
			lvlF = float32(l)
		}
		period := int32(24)
		if fileParts := strings.Split(file, "."); len(fileParts) >= 2 {
			if p, err := strconv.Atoi(fileParts[len(fileParts)-1]); err == nil {
				period = int32(p)
			}
		}
		return mock.GenerateMockGrid(element, lvlF, period), nil
	}

	fullPath := modelName + "/" + element + "/" + level
	table := modelName
	subDataPath := element + "/" + level
	if level == "" || level == "0" {
		fullPath = modelName + "/" + element
		subDataPath = element
	}

	if h.Cache != nil {
		if cachedBlob, _, ok := h.Cache.Get(table, subDataPath, file); ok {
			decompressed, err := parser.DecompressGzip(cachedBlob)
			if err == nil {
				return parser.ParseGridData(decompressed)
			}
		}
	}

	rawBlob, err := db.GetBlob(h.Client, fullPath, file)
	if err != nil {
		if level == "" || level == "0" {
			altPath := modelName + "/" + element + "/0"
			if fullPath == altPath {
				altPath = modelName + "/" + element
			}
			if altBlob, altErr := db.GetBlob(h.Client, altPath, file); altErr == nil {
				rawBlob = altBlob
				err = nil
				fullPath = altPath
				subDataPath = strings.TrimPrefix(altPath, modelName+"/")
			}
		} else {
			altPath := modelName + "/" + element
			if altBlob, altErr := db.GetBlob(h.Client, altPath, file); altErr == nil {
				rawBlob = altBlob
				err = nil
				fullPath = altPath
				subDataPath = element
			}
		}
	}
	if err != nil {
		return nil, fmt.Errorf("fetchGridLevel (%s, %s): %w", fullPath, file, err)
	}

	if h.Cache != nil {
		_ = h.Cache.Put(table, subDataPath, file, rawBlob, nil)
	}

	decompressed, err := parser.DecompressGzip(rawBlob)
	if err != nil {
		return nil, fmt.Errorf("decompress %s: %w", fullPath, err)
	}

	return parser.ParseGridData(decompressed)
}

func (h *DerivedHandler) fetchStationData(modelName, subPath, level, file string) (*model.GeoJSONFeatureCollection, error) {
	var fullPath string
	if strings.EqualFold(modelName, "SURFACE") {
		sub := subPath
		if sub == "" {
			sub = "PLOT_GLOBAL_3H"
		}
		fullPath = "SURFACE/" + sub
	} else {
		sub := subPath
		if sub == "" {
			sub = "PLOT"
		}
		lvl := level
		if lvl == "" {
			lvl = "850"
		}
		fullPath = "UPPER_AIR/" + sub + "/" + lvl
	}

	if h.MockMode || h.Client == nil {
		return mock.GenerateMockStationsForPath(fullPath), nil
	}

	rawBlob, err := db.GetBlob(h.Client, fullPath, file)
	if err != nil && !strings.HasSuffix(file, ".000") && len(file) == 14 {
		rawBlob, err = db.GetBlob(h.Client, fullPath, file+".000")
	}
	if err != nil && strings.HasSuffix(file, ".000") {
		rawBlob, err = db.GetBlob(h.Client, fullPath, strings.TrimSuffix(file, ".000"))
	}
	if err != nil {
		return nil, fmt.Errorf("fetchStationData (%s, %s): %w", fullPath, file, err)
	}

	decompressed, err := parser.DecompressGzip(rawBlob)
	if err != nil {
		return nil, fmt.Errorf("decompress %s: %w", fullPath, err)
	}

	return parser.ParseStationData(decompressed)
}

func (h *DerivedHandler) fetchStationLevel(subPath, level, file string) (*model.GeoJSONFeatureCollection, error) {
	return h.fetchStationData("UPPER_AIR", subPath, level, file)
}

func (h *DerivedHandler) fetchGridLevelWithFallback(modelName, element, level, file string) (*model.GridResponse, error) {
	grid, err := h.fetchGridLevel(modelName, element, level, file)
	if err == nil && grid != nil && len(grid.Values) > 0 {
		return grid, nil
	}
	if element == "TMP_2M" {
		if g2, err2 := h.fetchGridLevel(modelName, "TMP", "1000", file); err2 == nil && len(g2.Values) > 0 {
			return g2, nil
		}
		if g3, err3 := h.fetchGridLevel(modelName, "TMP", "850", file); err3 == nil && len(g3.Values) > 0 {
			return g3, nil
		}
	} else if element == "PRMSL" {
		if g2, err2 := h.fetchGridLevel(modelName, "MSL", "0", file); err2 == nil && len(g2.Values) > 0 {
			return g2, nil
		}
		if g3, err3 := h.fetchGridLevel(modelName, "SLP", "0", file); err3 == nil && len(g3.Values) > 0 {
			return g3, nil
		}
	}
	return grid, err
}

func (h *DerivedHandler) resolvePriorStationFile(modelName, underlyingPath, currFile string, deltaHours int) (string, error) {
	cleanFile := currFile
	if strings.Contains(cleanFile, "/") {
		parts := strings.Split(cleanFile, "/")
		cleanFile = parts[len(parts)-1]
	}

	var currTime time.Time
	var err error
	hasDot000 := strings.HasSuffix(cleanFile, ".000")
	timeStr := strings.TrimSuffix(cleanFile, ".000")

	if len(timeStr) >= 14 {
		currTime, err = time.Parse("20060102150405", timeStr[:14])
	} else if len(timeStr) >= 10 {
		currTime, err = time.Parse("2006010215", timeStr[:10])
	} else {
		err = fmt.Errorf("invalid station observation timestamp format: %s", cleanFile)
	}

	if err != nil {
		if h.MockMode || h.Client == nil {
			currTime = time.Now().UTC()
		} else {
			return "", fmt.Errorf("parse observation file time %s: %w", cleanFile, err)
		}
	}

	targetTime := currTime.Add(-time.Duration(deltaHours) * time.Hour)
	var exactFile string
	if hasDot000 || len(cleanFile) > 14 {
		exactFile = targetTime.Format("20060102150405") + ".000"
	} else {
		exactFile = targetTime.Format("20060102150405")
	}

	if h.MockMode || h.Client == nil {
		return exactFile, nil
	}

	// 1. Try exact file
	if _, errBlob := db.GetBlob(h.Client, underlyingPath, exactFile); errBlob == nil {
		return exactFile, nil
	}
	if hasDot000 {
		altExact := targetTime.Format("20060102150405")
		if _, errBlob := db.GetBlob(h.Client, underlyingPath, altExact); errBlob == nil {
			return altExact, nil
		}
	} else {
		altExact := targetTime.Format("20060102150405") + ".000"
		if _, errBlob := db.GetBlob(h.Client, underlyingPath, altExact); errBlob == nil {
			return altExact, nil
		}
	}

	// 2. Query available files to find closest file within tolerance
	files, errList := db.GetFileList(h.Client, underlyingPath, 100)
	if errList == nil && len(files) > 0 {
		var closestFile string
		minDiff := time.Duration(6) * time.Hour
		for _, f := range files {
			fClean := strings.TrimSuffix(f.Name, ".000")
			var fTime time.Time
			var fErr error
			if len(fClean) >= 14 {
				fTime, fErr = time.Parse("20060102150405", fClean[:14])
			} else if len(fClean) >= 10 {
				fTime, fErr = time.Parse("2006010215", fClean[:10])
			}
			if fErr == nil {
				diff := fTime.Sub(targetTime)
				if diff < 0 {
					diff = -diff
				}
				if diff < minDiff {
					minDiff = diff
					closestFile = f.Name
				}
			}
		}
		if closestFile != "" {
			return closestFile, nil
		}
	}

	return "", fmt.Errorf("no prior station observation file found near %s (delta=%dh)", targetTime.Format("20060102150405"), deltaHours)
}

func (h *DerivedHandler) resolvePriorGridFile(modelName, element, level, currFile string, deltaHours int) (string, error) {
	modelName = NormalizeModelName(modelName)
	cleanFile := currFile
	if strings.Contains(cleanFile, "/") {
		parts := strings.Split(cleanFile, "/")
		cleanFile = parts[len(parts)-1]
	}

	parts := strings.Split(cleanFile, ".")
	if len(parts) < 2 {
		return "", fmt.Errorf("invalid NWP file format (expected cycle.period): %s", cleanFile)
	}

	cycleStr := parts[0]
	leadStr := parts[1]
	lead, errLead := strconv.Atoi(leadStr)
	if errLead != nil {
		return "", fmt.Errorf("invalid NWP lead period in file %s: %w", cleanFile, errLead)
	}

	if lead >= deltaHours {
		priorLead := lead - deltaHours
		var candidate string
		if len(leadStr) >= 3 {
			candidate = fmt.Sprintf("%s.%03d", cycleStr, priorLead)
		} else {
			candidate = fmt.Sprintf("%s.%d", cycleStr, priorLead)
		}

		if h.MockMode || h.Client == nil {
			return candidate, nil
		}

		fullPath := modelName + "/" + element + "/" + level
		if level == "" || level == "0" {
			fullPath = modelName + "/" + element
		}
		if _, err := db.GetBlob(h.Client, fullPath, candidate); err == nil {
			return candidate, nil
		}
		if level == "0" || level == "" {
			altPath := modelName + "/" + element + "/0"
			if fullPath == altPath {
				altPath = modelName + "/" + element
			}
			if _, err := db.GetBlob(h.Client, altPath, candidate); err == nil {
				return candidate, nil
			}
		}
		altCandidate := fmt.Sprintf("%s.%03d", cycleStr, priorLead)
		if _, err := db.GetBlob(h.Client, fullPath, altCandidate); err == nil {
			return altCandidate, nil
		}
		if level == "0" || level == "" {
			altPath := modelName + "/" + element + "/0"
			if fullPath == altPath {
				altPath = modelName + "/" + element
			}
			if _, err := db.GetBlob(h.Client, altPath, altCandidate); err == nil {
				return altCandidate, nil
			}
		}
		if element == "PRMSL" {
			for _, altElem := range []string{"MSL", "SLP"} {
				p := modelName + "/" + altElem
				if _, err := db.GetBlob(h.Client, p, candidate); err == nil {
					return candidate, nil
				}
				if _, err := db.GetBlob(h.Client, p+"/0", candidate); err == nil {
					return candidate, nil
				}
				if _, err := db.GetBlob(h.Client, p, altCandidate); err == nil {
					return altCandidate, nil
				}
			}
		}
	}

	var cycleTime time.Time
	var errCycle error
	if len(cycleStr) == 8 {
		y, _ := strconv.Atoi(cycleStr[0:2])
		m, _ := strconv.Atoi(cycleStr[2:4])
		d, _ := strconv.Atoi(cycleStr[4:6])
		hh, _ := strconv.Atoi(cycleStr[6:8])
		cycleTime = time.Date(2000+y, time.Month(m), d, hh, 0, 0, 0, time.UTC)
	} else if len(cycleStr) >= 10 {
		y, _ := strconv.Atoi(cycleStr[0:4])
		m, _ := strconv.Atoi(cycleStr[4:6])
		d, _ := strconv.Atoi(cycleStr[6:8])
		hh, _ := strconv.Atoi(cycleStr[8:10])
		cycleTime = time.Date(y, time.Month(m), d, hh, 0, 0, 0, time.UTC)
	} else {
		errCycle = fmt.Errorf("unknown NWP cycle format: %s", cycleStr)
	}

	if errCycle != nil || h.MockMode || h.Client == nil {
		if lead >= deltaHours {
			return fmt.Sprintf("%s.%03d", cycleStr, lead-deltaHours), nil
		}
		if !cycleTime.IsZero() {
			priorCycleTime := cycleTime.Add(-time.Duration(deltaHours) * time.Hour)
			if len(cycleStr) == 8 {
				return fmt.Sprintf("%s.%03d", priorCycleTime.Format("06010215"), lead), nil
			}
			return fmt.Sprintf("%s.%03d", priorCycleTime.Format("2006010215"), lead), nil
		}
		priorLead := lead - deltaHours
		if priorLead < 0 {
			priorLead = 0
		}
		return fmt.Sprintf("%s.%03d", cycleStr, priorLead), nil
	}

	targetValidTime := cycleTime.Add(time.Duration(lead)*time.Hour - time.Duration(deltaHours)*time.Hour)

	fullPath := modelName + "/" + element + "/" + level
	if level == "" || level == "0" {
		fullPath = modelName + "/" + element
	}

	// 1. Direct prior cycle check (cycleTime - deltaHours, same lead)
	if !cycleTime.IsZero() {
		priorCycleTime := cycleTime.Add(-time.Duration(deltaHours) * time.Hour)
		var priorCycleStr string
		if len(cycleStr) == 8 {
			priorCycleStr = priorCycleTime.Format("06010215")
		} else {
			priorCycleStr = priorCycleTime.Format("2006010215")
		}
		candidatePriorCycle := fmt.Sprintf("%s.%03d", priorCycleStr, lead)
		if _, err := db.GetBlob(h.Client, fullPath, candidatePriorCycle); err == nil {
			return candidatePriorCycle, nil
		}
		candidatePriorCycleShort := fmt.Sprintf("%s.%d", priorCycleStr, lead)
		if _, err := db.GetBlob(h.Client, fullPath, candidatePriorCycleShort); err == nil {
			return candidatePriorCycleShort, nil
		}
		if level == "0" || level == "" {
			altPath := modelName + "/" + element + "/0"
			if fullPath == altPath {
				altPath = modelName + "/" + element
			}
			if _, err := db.GetBlob(h.Client, altPath, candidatePriorCycle); err == nil {
				return candidatePriorCycle, nil
			}
		}
		if element == "PRMSL" {
			for _, altElem := range []string{"MSL", "SLP"} {
				p := modelName + "/" + altElem
				if _, err := db.GetBlob(h.Client, p, candidatePriorCycle); err == nil {
					return candidatePriorCycle, nil
				}
				if _, err := db.GetBlob(h.Client, p, candidatePriorCycleShort); err == nil {
					return candidatePriorCycleShort, nil
				}
			}
		}
	}

	// 2. Search available files near target valid time within tolerance
	files, errList := db.GetFileList(h.Client, fullPath, 100)
	if (errList != nil || len(files) == 0) && (level == "0" || level == "") {
		altPath := modelName + "/" + element + "/0"
		if fullPath == altPath {
			altPath = modelName + "/" + element
		}
		files, errList = db.GetFileList(h.Client, altPath, 100)
	}
	if (errList != nil || len(files) == 0) && element == "PRMSL" {
		files, errList = db.GetFileList(h.Client, modelName+"/MSL", 100)
		if errList != nil || len(files) == 0 {
			files, errList = db.GetFileList(h.Client, modelName+"/SLP", 100)
		}
	}
	if errList == nil && len(files) > 0 {
		var closestFile string
		minDiff := time.Duration(6) * time.Hour
		for _, f := range files {
			fParts := strings.Split(f.Name, ".")
			if len(fParts) < 2 {
				continue
			}
			fCycleStr := fParts[0]
			fLead, fLeadErr := strconv.Atoi(fParts[1])
			if fLeadErr != nil {
				continue
			}
			var fCycleTime time.Time
			if len(fCycleStr) == 8 {
				y, _ := strconv.Atoi(fCycleStr[0:2])
				m, _ := strconv.Atoi(fCycleStr[2:4])
				d, _ := strconv.Atoi(fCycleStr[4:6])
				hh, _ := strconv.Atoi(fCycleStr[6:8])
				fCycleTime = time.Date(2000+y, time.Month(m), d, hh, 0, 0, 0, time.UTC)
			} else if len(fCycleStr) >= 10 {
				y, _ := strconv.Atoi(fCycleStr[0:4])
				m, _ := strconv.Atoi(fCycleStr[4:6])
				d, _ := strconv.Atoi(fCycleStr[6:8])
				hh, _ := strconv.Atoi(fCycleStr[8:10])
				fCycleTime = time.Date(y, time.Month(m), d, hh, 0, 0, 0, time.UTC)
			} else {
				continue
			}
			fValidTime := fCycleTime.Add(time.Duration(fLead) * time.Hour)
			diff := fValidTime.Sub(targetValidTime)
			if diff < 0 {
				diff = -diff
			}
			if diff < minDiff {
				minDiff = diff
				closestFile = f.Name
			}
		}
		if closestFile != "" {
			return closestFile, nil
		}
	}

	return "", fmt.Errorf("no prior NWP grid file found near target valid time %s (delta=%dh)", targetValidTime.Format("2006-01-02 15:04"), deltaHours)
}

func (h *DerivedHandler) fetchDewpointGrid(modelName, level, file string, tempGrid *model.GridResponse) []float64 {
	nPoints := len(tempGrid.Values)
	tds := make([]float64, nPoints)

	rh, err := h.fetchGridLevel(modelName, "RH", level, file)
	if err != nil {
		rh, _ = h.fetchGridLevel(modelName, "TD", level, file)
	}

	for i := 0; i < nPoints; i++ {
		t := float64(tempGrid.Values[i])
		if rh != nil && i < len(rh.Values) && rh.Values[i] > -9000 {
			if rh.Header.Element == "TD" {
				tds[i] = float64(rh.Values[i])
			} else {
				tds[i] = DewpointFromRH(t, float64(rh.Values[i]))
			}
		} else {
			// default meteorological fallback when humidity observation is absent
			tds[i] = t - 5.0
		}
	}
	return tds
}

// CalculateDerivedGrid executes real-time server-side derivation for NWP grids
func (h *DerivedHandler) CalculateDerivedGrid(req *DerivedRequest) (*model.GridResponse, error) {
	if req.IsTimeDerived {
		return h.calculateTimeDerivedGrid(req)
	}

	file := req.File
	if file == "" {
		return nil, fmt.Errorf("file parameter required for derived grid")
	}

	lvl1 := req.Level1
	if lvl1 == "" {
		lvl1 = "850"
	}
	lvl2 := req.Level2
	if lvl2 == "" {
		lvl2 = "500"
	}

	switch req.DerivedType {
	case "DIFF":
		grid1, err1 := h.fetchGridLevel(req.Model, req.Element, lvl1, file)
		if err1 != nil {
			return nil, fmt.Errorf("layer 1 (%s/%s/%s): %w", req.Model, req.Element, lvl1, err1)
		}
		grid2, err2 := h.fetchGridLevel(req.Model, req.Element, lvl2, file)
		if err2 != nil {
			return nil, fmt.Errorf("layer 2 (%s/%s/%s): %w", req.Model, req.Element, lvl2, err2)
		}

		nPoints := len(grid1.Values)
		if len(grid2.Values) != nPoints {
			return nil, fmt.Errorf("grid dimensions mismatch between level %s (%d) and %s (%d)", lvl1, nPoints, lvl2, len(grid2.Values))
		}

		resValues := make([]float32, nPoints)
		var minVal float32 = math.MaxFloat32
		var maxVal float32 = -math.MaxFloat32
		var sumVal float32 = 0
		validCount := 0

		isHgt := req.Element == "HGT"

		for i := 0; i < nPoints; i++ {
			v1 := grid1.Values[i]
			v2 := grid2.Values[i]
			if v1 <= -9000 || v2 <= -9000 || math.IsNaN(float64(v1)) || math.IsNaN(float64(v2)) {
				resValues[i] = -9999
				continue
			}

			var diff float32
			if isHgt {
				diff = float32(math.Abs(float64(v1 - v2)))
			} else {
				diff = v1 - v2
			}

			resValues[i] = diff
			if diff < minVal {
				minVal = diff
			}
			if diff > maxVal {
				maxVal = diff
			}
			sumVal += diff
			validCount++
		}

		resp := &model.GridResponse{
			Header: grid1.Header,
			X:      grid1.X,
			Y:      grid1.Y,
			Values: resValues,
		}
		resp.Header.ModelName = req.Model
		resp.Header.Element = req.Element
		if l, err := strconv.ParseFloat(lvl1, 32); err == nil {
			resp.Header.Level = float32(l)
		}
		if validCount > 0 {
			resp.Stats = model.GridStats{
				Min:  minVal,
				Max:  maxVal,
				Mean: sumVal / float32(validCount),
			}
		}
		return resp, nil

	case "THICKNESS":
		grid1, err1 := h.fetchGridLevel(req.Model, "HGT", lvl1, file)
		if err1 != nil {
			return nil, fmt.Errorf("HGT %s: %w", lvl1, err1)
		}
		grid2, err2 := h.fetchGridLevel(req.Model, "HGT", lvl2, file)
		if err2 != nil {
			return nil, fmt.Errorf("HGT %s: %w", lvl2, err2)
		}

		nPoints := len(grid1.Values)
		resValues := make([]float32, nPoints)
		var minVal float32 = math.MaxFloat32
		var maxVal float32 = -math.MaxFloat32
		var sumVal float32 = 0
		validCount := 0

		for i := 0; i < nPoints; i++ {
			v1 := grid1.Values[i]
			v2 := grid2.Values[i]
			if v1 <= -9000 || v2 <= -9000 || math.IsNaN(float64(v1)) || math.IsNaN(float64(v2)) {
				resValues[i] = -9999
				continue
			}
			diff := float32(math.Abs(float64(v1 - v2)))
			resValues[i] = diff
			if diff < minVal {
				minVal = diff
			}
			if diff > maxVal {
				maxVal = diff
			}
			sumVal += diff
			validCount++
		}

		resp := &model.GridResponse{
			Header: grid1.Header,
			X:      grid1.X,
			Y:      grid1.Y,
			Values: resValues,
		}
		resp.Header.Element = "THICKNESS"
		if validCount > 0 {
			resp.Stats = model.GridStats{Min: minVal, Max: maxVal, Mean: sumVal / float32(validCount)}
		}
		return resp, nil

	case "SHEAR":
		wind1, err1 := h.fetchGridLevel(req.Model, "WIND", lvl1, file)
		if err1 != nil {
			return nil, fmt.Errorf("WIND %s: %w", lvl1, err1)
		}
		wind2, err2 := h.fetchGridLevel(req.Model, "WIND", lvl2, file)
		if err2 != nil {
			return nil, fmt.Errorf("WIND %s: %w", lvl2, err2)
		}

		nPoints := len(wind1.Values)
		resValues := make([]float32, nPoints)
		var minVal float32 = math.MaxFloat32
		var maxVal float32 = -math.MaxFloat32
		var sumVal float32 = 0
		validCount := 0

		hasVectors := len(wind1.U) == nPoints && len(wind1.V) == nPoints &&
			len(wind2.U) == nPoints && len(wind2.V) == nPoints

		for i := 0; i < nPoints; i++ {
			if hasVectors {
				u1, v1 := wind1.U[i], wind1.V[i]
				u2, v2 := wind2.U[i], wind2.V[i]
				if u1 <= -9000 || u2 <= -9000 {
					resValues[i] = -9999
					continue
				}
				shear := float32(CalculateWindShear(float64(u1), float64(v1), float64(u2), float64(v2)))
				resValues[i] = shear
				if shear < minVal {
					minVal = shear
				}
				if shear > maxVal {
					maxVal = shear
				}
				sumVal += shear
				validCount++
			} else {
				s1, s2 := wind1.Values[i], wind2.Values[i]
				if s1 <= -9000 || s2 <= -9000 {
					resValues[i] = -9999
					continue
				}
				shear := float32(math.Abs(float64(s1 - s2)))
				resValues[i] = shear
				if shear < minVal {
					minVal = shear
				}
				if shear > maxVal {
					maxVal = shear
				}
				sumVal += shear
				validCount++
			}
		}

		resp := &model.GridResponse{
			Header: wind1.Header,
			X:      wind1.X,
			Y:      wind1.Y,
			Values: resValues,
		}
		resp.Header.Element = "SHEAR"
		if validCount > 0 {
			resp.Stats = model.GridStats{Min: minVal, Max: maxVal, Mean: sumVal / float32(validCount)}
		}
		return resp, nil

	case "K-INDEX":
		t850, err := h.fetchGridLevel(req.Model, "TMP", "850", file)
		if err != nil {
			return nil, err
		}
		t700, err := h.fetchGridLevel(req.Model, "TMP", "700", file)
		if err != nil {
			return nil, err
		}
		t500, err := h.fetchGridLevel(req.Model, "TMP", "500", file)
		if err != nil {
			return nil, err
		}

		td850 := h.fetchDewpointGrid(req.Model, "850", file, t850)
		td700 := h.fetchDewpointGrid(req.Model, "700", file, t700)

		nPoints := len(t850.Values)
		resValues := make([]float32, nPoints)
		var minVal float32 = math.MaxFloat32
		var maxVal float32 = -math.MaxFloat32
		var sumVal float32 = 0
		validCount := 0

		for i := 0; i < nPoints; i++ {
			temp850 := t850.Values[i]
			temp700 := t700.Values[i]
			temp500 := t500.Values[i]
			if temp850 <= -9000 || temp700 <= -9000 || temp500 <= -9000 {
				resValues[i] = -9999
				continue
			}

			kVal := float32(CalculateKIndex(float64(temp850), td850[i], float64(temp700), td700[i], float64(temp500)))
			resValues[i] = kVal
			if kVal < minVal {
				minVal = kVal
			}
			if kVal > maxVal {
				maxVal = kVal
			}
			sumVal += kVal
			validCount++
		}

		resp := &model.GridResponse{
			Header: t850.Header,
			X:      t850.X,
			Y:      t850.Y,
			Values: resValues,
		}
		resp.Header.Element = "K-INDEX"
		if validCount > 0 {
			resp.Stats = model.GridStats{Min: minVal, Max: maxVal, Mean: sumVal / float32(validCount)}
		}
		return resp, nil

	case "SHOWALTER":
		t850, err := h.fetchGridLevel(req.Model, "TMP", "850", file)
		if err != nil {
			return nil, err
		}
		t500, err := h.fetchGridLevel(req.Model, "TMP", "500", file)
		if err != nil {
			return nil, err
		}
		td850 := h.fetchDewpointGrid(req.Model, "850", file, t850)

		nPoints := len(t850.Values)
		resValues := make([]float32, nPoints)
		var minVal float32 = math.MaxFloat32
		var maxVal float32 = -math.MaxFloat32
		var sumVal float32 = 0
		validCount := 0

		for i := 0; i < nPoints; i++ {
			temp850 := t850.Values[i]
			temp500 := t500.Values[i]
			if temp850 <= -9000 || temp500 <= -9000 {
				resValues[i] = -9999
				continue
			}

			ssi := float32(CalculateShowalter(float64(temp850), td850[i], float64(temp500)))
			resValues[i] = ssi
			if ssi < minVal {
				minVal = ssi
			}
			if ssi > maxVal {
				maxVal = ssi
			}
			sumVal += ssi
			validCount++
		}

		resp := &model.GridResponse{
			Header: t850.Header,
			X:      t850.X,
			Y:      t850.Y,
			Values: resValues,
		}
		resp.Header.Element = "SHOWALTER"
		if validCount > 0 {
			resp.Stats = model.GridStats{Min: minVal, Max: maxVal, Mean: sumVal / float32(validCount)}
		}
		return resp, nil

	case "LIFTED":
		t850, err := h.fetchGridLevel(req.Model, "TMP", "850", file)
		if err != nil {
			return nil, err
		}
		t500, err := h.fetchGridLevel(req.Model, "TMP", "500", file)
		if err != nil {
			return nil, err
		}
		td850 := h.fetchDewpointGrid(req.Model, "850", file, t850)

		nPoints := len(t850.Values)
		resValues := make([]float32, nPoints)
		var minVal float32 = math.MaxFloat32
		var maxVal float32 = -math.MaxFloat32
		var sumVal float32 = 0
		validCount := 0

		for i := 0; i < nPoints; i++ {
			temp850 := t850.Values[i]
			temp500 := t500.Values[i]
			if temp850 <= -9000 || temp500 <= -9000 {
				resValues[i] = -9999
				continue
			}

			li := float32(CalculateLiftedIndex(float64(temp850), td850[i], 850.0, float64(temp500)))
			resValues[i] = li
			if li < minVal {
				minVal = li
			}
			if li > maxVal {
				maxVal = li
			}
			sumVal += li
			validCount++
		}

		resp := &model.GridResponse{
			Header: t850.Header,
			X:      t850.X,
			Y:      t850.Y,
			Values: resValues,
		}
		resp.Header.Element = "LIFTED"
		if validCount > 0 {
			resp.Stats = model.GridStats{Min: minVal, Max: maxVal, Mean: sumVal / float32(validCount)}
		}
		return resp, nil

	case "SWEAT":
		t850, err := h.fetchGridLevel(req.Model, "TMP", "850", file)
		if err != nil {
			return nil, err
		}
		t500, err := h.fetchGridLevel(req.Model, "TMP", "500", file)
		if err != nil {
			return nil, err
		}
		td850 := h.fetchDewpointGrid(req.Model, "850", file, t850)
		wind850, _ := h.fetchGridLevel(req.Model, "WIND", "850", file)
		wind500, _ := h.fetchGridLevel(req.Model, "WIND", "500", file)

		nPoints := len(t850.Values)
		resValues := make([]float32, nPoints)
		var minVal float32 = math.MaxFloat32
		var maxVal float32 = -math.MaxFloat32
		var sumVal float32 = 0
		validCount := 0

		for i := 0; i < nPoints; i++ {
			temp850 := t850.Values[i]
			temp500 := t500.Values[i]
			if temp850 <= -9000 || temp500 <= -9000 {
				resValues[i] = -9999
				continue
			}

			td850Val := td850[i]

			var ws850, wd850 float64 = 8.0, 200.0
			if wind850 != nil && i < len(wind850.Values) && wind850.Values[i] > -9000 {
				ws850 = float64(wind850.Values[i])
				if len(wind850.U) == nPoints && len(wind850.V) == nPoints {
					u := float64(wind850.U[i])
					v := float64(wind850.V[i])
					// Meteorological wind direction: direction FROM which wind blows
					deg := math.Atan2(-u, -v) * 180.0 / math.Pi
					if deg < 0 {
						deg += 360.0
					}
					wd850 = deg
				}
			}

			var ws500, wd500 float64 = 15.0, 250.0
			if wind500 != nil && i < len(wind500.Values) && wind500.Values[i] > -9000 {
				ws500 = float64(wind500.Values[i])
				if len(wind500.U) == nPoints && len(wind500.V) == nPoints {
					u := float64(wind500.U[i])
					v := float64(wind500.V[i])
					deg := math.Atan2(-u, -v) * 180.0 / math.Pi
					if deg < 0 {
						deg += 360.0
					}
					wd500 = deg
				}
			}

			sweat := float32(CalculateSWEAT(float64(temp850), td850Val, float64(temp500), ws850, wd850, ws500, wd500))
			resValues[i] = sweat
			if sweat < minVal {
				minVal = sweat
			}
			if sweat > maxVal {
				maxVal = sweat
			}
			sumVal += sweat
			validCount++
		}

		resp := &model.GridResponse{
			Header: t850.Header,
			X:      t850.X,
			Y:      t850.Y,
			Values: resValues,
		}
		resp.Header.Element = "SWEAT"
		if validCount > 0 {
			resp.Stats = model.GridStats{Min: minVal, Max: maxVal, Mean: sumVal / float32(validCount)}
		}
		return resp, nil

	case "TT":
		t850, err := h.fetchGridLevel(req.Model, "TMP", "850", file)
		if err != nil {
			return nil, err
		}
		t500, err := h.fetchGridLevel(req.Model, "TMP", "500", file)
		if err != nil {
			return nil, err
		}
		td850 := h.fetchDewpointGrid(req.Model, "850", file, t850)

		nPoints := len(t850.Values)
		resValues := make([]float32, nPoints)
		var minVal float32 = math.MaxFloat32
		var maxVal float32 = -math.MaxFloat32
		var sumVal float32 = 0
		validCount := 0

		for i := 0; i < nPoints; i++ {
			temp850 := t850.Values[i]
			temp500 := t500.Values[i]
			if temp850 <= -9000 || temp500 <= -9000 {
				resValues[i] = -9999
				continue
			}

			tt := float32(CalculateTotalTotals(float64(temp850), td850[i], float64(temp500)))
			resValues[i] = tt
			if tt < minVal {
				minVal = tt
			}
			if tt > maxVal {
				maxVal = tt
			}
			sumVal += tt
			validCount++
		}

		resp := &model.GridResponse{
			Header: t850.Header,
			X:      t850.X,
			Y:      t850.Y,
			Values: resValues,
		}
		resp.Header.Element = "TT"
		if validCount > 0 {
			resp.Stats = model.GridStats{Min: minVal, Max: maxVal, Mean: sumVal / float32(validCount)}
		}
		return resp, nil

	default:
		return nil, fmt.Errorf("unsupported derived type: %s", req.DerivedType)
	}
}

// CalculateDerivedStation executes real-time server-side derivation for UPPER_AIR sounding stations or SURFACE stations
func (h *DerivedHandler) CalculateDerivedStation(req *DerivedRequest) (*model.GeoJSONFeatureCollection, error) {
	if req.IsTimeDerived {
		return h.calculateTimeDerivedStation(req)
	}

	file := req.File
	if file == "" {
		return nil, fmt.Errorf("file parameter required for derived station layer")
	}

	lvl1 := req.Level1
	if lvl1 == "" {
		lvl1 = "850"
	}
	lvl2 := req.Level2
	if lvl2 == "" {
		lvl2 = "500"
	}

	switch req.DerivedType {
	case "DIFF":
		stn1, err1 := h.fetchStationLevel(req.SubPath, lvl1, file)
		if err1 != nil {
			return nil, fmt.Errorf("station layer 1 (%s): %w", lvl1, err1)
		}
		stn2, err2 := h.fetchStationLevel(req.SubPath, lvl2, file)
		if err2 != nil {
			return nil, fmt.Errorf("station layer 2 (%s): %w", lvl2, err2)
		}

		stn2Map := make(map[int32]model.GeoJSONFeature, len(stn2.Features))
		for _, f := range stn2.Features {
			if idVal, ok := f.Properties["station_id"]; ok {
				var id int32
				switch v := idVal.(type) {
				case float64:
					id = int32(v)
				case int32:
					id = v
				case int:
					id = int32(v)
				}
				if id > 0 {
					stn2Map[id] = f
				}
			}
		}

		features := make([]model.GeoJSONFeature, 0, len(stn1.Features))
		elemKey := strings.ToLower(req.Element)
		if elemKey == "tmp" || elemKey == "tmp_diff" || strings.HasPrefix(elemKey, "t") {
			elemKey = "temperature"
		} else if elemKey == "hgt" || elemKey == "thickness" {
			elemKey = "height"
		} else if elemKey == "td" {
			elemKey = "dewpoint"
		} else if elemKey == "wind" {
			elemKey = "wind_speed"
		}

		for _, f1 := range stn1.Features {
			id := extractStationID(f1)
			if id <= 0 {
				continue
			}

			f2, ok := stn2Map[id]
			if !ok {
				continue
			}

			v1, ok1 := extractFloat(f1.Properties[elemKey])
			v2, ok2 := extractFloat(f2.Properties[elemKey])
			if !ok1 || !ok2 || v1 <= -9000 || v2 <= -9000 {
				continue
			}

			var diff float64
			if elemKey == "height" {
				diff = math.Abs(v1 - v2)
			} else {
				diff = v1 - v2
			}

			newProps := make(map[string]interface{})
			for k, v := range f1.Properties {
				newProps[k] = v
			}
			newProps[elemKey] = diff
			newProps["tmp_diff"] = diff
			newProps["temperature"] = diff // Enables standard contour extractor to read smoothly
			newProps["val"] = diff
			newProps["value"] = diff
			newProps["level1"] = lvl1
			newProps["level2"] = lvl2

			features = append(features, model.GeoJSONFeature{
				Type:       "Feature",
				Geometry:   f1.Geometry,
				Properties: newProps,
			})
		}

		return &model.GeoJSONFeatureCollection{
			Type:     "FeatureCollection",
			Features: features,
		}, nil

	case "K-INDEX":
		stn850, err1 := h.fetchStationLevel(req.SubPath, "850", file)
		if err1 != nil {
			return nil, err1
		}
		stn700, err2 := h.fetchStationLevel(req.SubPath, "700", file)
		if err2 != nil {
			return nil, err2
		}
		stn500, err3 := h.fetchStationLevel(req.SubPath, "500", file)
		if err3 != nil {
			return nil, err3
		}

		stn700Map := make(map[int32]model.GeoJSONFeature, len(stn700.Features))
		for _, f := range stn700.Features {
			if id := extractStationID(f); id > 0 {
				stn700Map[id] = f
			}
		}
		stn500Map := make(map[int32]model.GeoJSONFeature, len(stn500.Features))
		for _, f := range stn500.Features {
			if id := extractStationID(f); id > 0 {
				stn500Map[id] = f
			}
		}

		features := make([]model.GeoJSONFeature, 0, len(stn850.Features))
		for _, f850 := range stn850.Features {
			id := extractStationID(f850)
			if id <= 0 {
				continue
			}
			f700, ok700 := stn700Map[id]
			f500, ok500 := stn500Map[id]
			if !ok700 || !ok500 {
				continue
			}

			t850, okT850 := extractFloat(f850.Properties["temperature"])
			td850, okTd850 := extractFloat(f850.Properties["dewpoint"])
			t700, okT700 := extractFloat(f700.Properties["temperature"])
			td700, okTd700 := extractFloat(f700.Properties["dewpoint"])
			t500, okT500 := extractFloat(f500.Properties["temperature"])

			if !okT850 || !okTd850 || !okT700 || !okTd700 || !okT500 {
				continue
			}
			if t850 <= -9000 || td850 <= -9000 || t700 <= -9000 || td700 <= -9000 || t500 <= -9000 {
				continue
			}

			kVal := CalculateKIndex(t850, td850, t700, td700, t500)
			newProps := copyProps(f850.Properties)
			newProps["k_index"] = kVal
			newProps["temperature"] = kVal
			newProps["val"] = kVal
			newProps["value"] = kVal

			features = append(features, model.GeoJSONFeature{
				Type:       "Feature",
				Geometry:   f850.Geometry,
				Properties: newProps,
			})
		}

		return &model.GeoJSONFeatureCollection{
			Type:     "FeatureCollection",
			Features: features,
		}, nil

	case "SHOWALTER":
		stn850, err1 := h.fetchStationLevel(req.SubPath, "850", file)
		if err1 != nil {
			return nil, err1
		}
		stn500, err2 := h.fetchStationLevel(req.SubPath, "500", file)
		if err2 != nil {
			return nil, err2
		}

		stn500Map := make(map[int32]model.GeoJSONFeature, len(stn500.Features))
		for _, f := range stn500.Features {
			if id := extractStationID(f); id > 0 {
				stn500Map[id] = f
			}
		}

		features := make([]model.GeoJSONFeature, 0, len(stn850.Features))
		for _, f850 := range stn850.Features {
			id := extractStationID(f850)
			if id <= 0 {
				continue
			}
			f500, ok500 := stn500Map[id]
			if !ok500 {
				continue
			}

			t850, okT850 := extractFloat(f850.Properties["temperature"])
			td850, okTd850 := extractFloat(f850.Properties["dewpoint"])
			t500, okT500 := extractFloat(f500.Properties["temperature"])

			if !okT850 || !okTd850 || !okT500 || t850 <= -9000 || td850 <= -9000 || t500 <= -9000 {
				continue
			}

			ssi := CalculateShowalter(t850, td850, t500)
			newProps := copyProps(f850.Properties)
			newProps["showalter"] = ssi
			newProps["ssi"] = ssi
			newProps["temperature"] = ssi
			newProps["val"] = ssi
			newProps["value"] = ssi

			features = append(features, model.GeoJSONFeature{
				Type:       "Feature",
				Geometry:   f850.Geometry,
				Properties: newProps,
			})
		}

		return &model.GeoJSONFeatureCollection{
			Type:     "FeatureCollection",
			Features: features,
		}, nil

	case "LIFTED":
		stn850, err1 := h.fetchStationLevel(req.SubPath, "850", file)
		if err1 != nil {
			return nil, err1
		}
		stn500, err2 := h.fetchStationLevel(req.SubPath, "500", file)
		if err2 != nil {
			return nil, err2
		}

		stn500Map := make(map[int32]model.GeoJSONFeature, len(stn500.Features))
		for _, f := range stn500.Features {
			if id := extractStationID(f); id > 0 {
				stn500Map[id] = f
			}
		}

		features := make([]model.GeoJSONFeature, 0, len(stn850.Features))
		for _, f850 := range stn850.Features {
			id := extractStationID(f850)
			if id <= 0 {
				continue
			}
			f500, ok500 := stn500Map[id]
			if !ok500 {
				continue
			}

			t850, okT850 := extractFloat(f850.Properties["temperature"])
			td850, okTd850 := extractFloat(f850.Properties["dewpoint"])
			t500, okT500 := extractFloat(f500.Properties["temperature"])

			if !okT850 || !okTd850 || !okT500 || t850 <= -9000 || td850 <= -9000 || t500 <= -9000 {
				continue
			}

			li := CalculateLiftedIndex(t850, td850, 850.0, t500)
			newProps := copyProps(f850.Properties)
			newProps["lifted"] = li
			newProps["li"] = li
			newProps["temperature"] = li
			newProps["val"] = li
			newProps["value"] = li

			features = append(features, model.GeoJSONFeature{
				Type:       "Feature",
				Geometry:   f850.Geometry,
				Properties: newProps,
			})
		}

		return &model.GeoJSONFeatureCollection{
			Type:     "FeatureCollection",
			Features: features,
		}, nil

	case "SWEAT":
		stn850, err1 := h.fetchStationLevel(req.SubPath, "850", file)
		if err1 != nil {
			return nil, err1
		}
		stn500, err2 := h.fetchStationLevel(req.SubPath, "500", file)
		if err2 != nil {
			return nil, err2
		}

		stn500Map := make(map[int32]model.GeoJSONFeature, len(stn500.Features))
		for _, f := range stn500.Features {
			if id := extractStationID(f); id > 0 {
				stn500Map[id] = f
			}
		}

		features := make([]model.GeoJSONFeature, 0, len(stn850.Features))
		for _, f850 := range stn850.Features {
			id := extractStationID(f850)
			if id <= 0 {
				continue
			}
			f500, ok500 := stn500Map[id]
			if !ok500 {
				continue
			}

			t850, okT850 := extractFloat(f850.Properties["temperature"])
			td850, okTd850 := extractFloat(f850.Properties["dewpoint"])
			t500, okT500 := extractFloat(f500.Properties["temperature"])

			if !okT850 || !okTd850 || !okT500 || t850 <= -9000 || td850 <= -9000 || t500 <= -9000 {
				continue
			}

			ws850, _ := extractFloat(f850.Properties["wind_speed"])
			wd850, _ := extractFloat(f850.Properties["wind_dir"])
			ws500, _ := extractFloat(f500.Properties["wind_speed"])
			wd500, _ := extractFloat(f500.Properties["wind_dir"])
			if ws850 < 0 || ws850 > 250 {
				ws850 = 0
			}
			if ws500 < 0 || ws500 > 250 {
				ws500 = 0
			}
			if wd850 < 0 || wd850 > 360 {
				wd850 = 0
			}
			if wd500 < 0 || wd500 > 360 {
				wd500 = 0
			}

			sweat := CalculateSWEAT(t850, td850, t500, ws850, wd850, ws500, wd500)
			newProps := copyProps(f850.Properties)
			newProps["sweat"] = sweat
			newProps["temperature"] = sweat
			newProps["val"] = sweat
			newProps["value"] = sweat

			features = append(features, model.GeoJSONFeature{
				Type:       "Feature",
				Geometry:   f850.Geometry,
				Properties: newProps,
			})
		}

		return &model.GeoJSONFeatureCollection{
			Type:     "FeatureCollection",
			Features: features,
		}, nil

	case "TT":
		stn850, err1 := h.fetchStationLevel(req.SubPath, "850", file)
		if err1 != nil {
			return nil, err1
		}
		stn500, err2 := h.fetchStationLevel(req.SubPath, "500", file)
		if err2 != nil {
			return nil, err2
		}

		stn500Map := make(map[int32]model.GeoJSONFeature, len(stn500.Features))
		for _, f := range stn500.Features {
			if id := extractStationID(f); id > 0 {
				stn500Map[id] = f
			}
		}

		features := make([]model.GeoJSONFeature, 0, len(stn850.Features))
		for _, f850 := range stn850.Features {
			id := extractStationID(f850)
			if id <= 0 {
				continue
			}
			f500, ok500 := stn500Map[id]
			if !ok500 {
				continue
			}

			t850, okT850 := extractFloat(f850.Properties["temperature"])
			td850, okTd850 := extractFloat(f850.Properties["dewpoint"])
			t500, okT500 := extractFloat(f500.Properties["temperature"])

			if !okT850 || !okTd850 || !okT500 || t850 <= -9000 || td850 <= -9000 || t500 <= -9000 {
				continue
			}

			tt := CalculateTotalTotals(t850, td850, t500)
			newProps := copyProps(f850.Properties)
			newProps["tt"] = tt
			newProps["temperature"] = tt
			newProps["val"] = tt
			newProps["value"] = tt

			features = append(features, model.GeoJSONFeature{
				Type:       "Feature",
				Geometry:   f850.Geometry,
				Properties: newProps,
			})
		}

		return &model.GeoJSONFeatureCollection{
			Type:     "FeatureCollection",
			Features: features,
		}, nil

	case "SHEAR":
		stn1, err1 := h.fetchStationLevel(req.SubPath, lvl1, file)
		if err1 != nil {
			return nil, err1
		}
		stn2, err2 := h.fetchStationLevel(req.SubPath, lvl2, file)
		if err2 != nil {
			return nil, err2
		}

		stn2Map := make(map[int32]model.GeoJSONFeature, len(stn2.Features))
		for _, f := range stn2.Features {
			if id := extractStationID(f); id > 0 {
				stn2Map[id] = f
			}
		}

		features := make([]model.GeoJSONFeature, 0, len(stn1.Features))
		for _, f1 := range stn1.Features {
			id := extractStationID(f1)
			if id <= 0 {
				continue
			}
			f2, ok2 := stn2Map[id]
			if !ok2 {
				continue
			}

			ws1, okWs1 := extractFloat(f1.Properties["wind_speed"])
			wd1, okWd1 := extractFloat(f1.Properties["wind_dir"])
			ws2, okWs2 := extractFloat(f2.Properties["wind_speed"])
			wd2, okWd2 := extractFloat(f2.Properties["wind_dir"])

			if !okWs1 || !okWs2 || ws1 < 0 || ws2 < 0 {
				continue
			}

			var shear float64
			if okWd1 && okWd2 {
				rad1 := wd1 * math.Pi / 180.0
				rad2 := wd2 * math.Pi / 180.0
				u1 := -ws1 * math.Sin(rad1)
				v1 := -ws1 * math.Cos(rad1)
				u2 := -ws2 * math.Sin(rad2)
				v2 := -ws2 * math.Cos(rad2)
				shear = CalculateWindShear(u1, v1, u2, v2)
			} else {
				shear = math.Abs(ws1 - ws2)
			}

			newProps := copyProps(f1.Properties)
			newProps["shear"] = shear
			newProps["wind_speed"] = shear
			newProps["val"] = shear
			newProps["value"] = shear
			newProps["level1"] = lvl1
			newProps["level2"] = lvl2

			features = append(features, model.GeoJSONFeature{
				Type:       "Feature",
				Geometry:   f1.Geometry,
				Properties: newProps,
			})
		}

		return &model.GeoJSONFeatureCollection{
			Type:     "FeatureCollection",
			Features: features,
		}, nil

	case "THICKNESS":
		lvl1 := req.Level1
		if lvl1 == "" {
			lvl1 = "1000"
		}
		lvl2 := req.Level2
		if lvl2 == "" {
			lvl2 = "500"
		}
		stn1, err1 := h.fetchStationLevel(req.SubPath, lvl1, file)
		if err1 != nil {
			return nil, fmt.Errorf("station thickness layer 1 (%s): %w", lvl1, err1)
		}
		stn2, err2 := h.fetchStationLevel(req.SubPath, lvl2, file)
		if err2 != nil {
			return nil, fmt.Errorf("station thickness layer 2 (%s): %w", lvl2, err2)
		}

		stn2Map := make(map[int32]model.GeoJSONFeature, len(stn2.Features))
		for _, f := range stn2.Features {
			if id := extractStationID(f); id > 0 {
				stn2Map[id] = f
			}
		}

		features := make([]model.GeoJSONFeature, 0, len(stn1.Features))
		for _, f1 := range stn1.Features {
			id := extractStationID(f1)
			if id <= 0 {
				continue
			}
			f2, ok2 := stn2Map[id]
			if !ok2 {
				continue
			}

			h1, okH1 := extractFloat(f1.Properties["height"])
			h2, okH2 := extractFloat(f2.Properties["height"])
			if !okH1 || !okH2 || h1 <= -9000 || h2 <= -9000 {
				continue
			}

			diff := math.Abs(h1 - h2)
			newProps := copyProps(f1.Properties)
			newProps["thickness"] = diff
			newProps["height"] = diff
			newProps["val"] = diff
			newProps["value"] = diff
			newProps["level1"] = lvl1
			newProps["level2"] = lvl2

			features = append(features, model.GeoJSONFeature{
				Type:       "Feature",
				Geometry:   f1.Geometry,
				Properties: newProps,
			})
		}

		return &model.GeoJSONFeatureCollection{
			Type:     "FeatureCollection",
			Features: features,
		}, nil

	default:
		return nil, fmt.Errorf("unsupported derived station type: %s", req.DerivedType)
	}
}

func extractStationID(f model.GeoJSONFeature) int32 {
	if idVal, ok := f.Properties["station_id"]; ok {
		switch v := idVal.(type) {
		case float64:
			return int32(v)
		case float32:
			return int32(v)
		case int32:
			return v
		case int:
			return int32(v)
		case int64:
			return int32(v)
		case string:
			if id, err := strconv.Atoi(v); err == nil {
				return int32(id)
			}
		}
	}
	return 0
}

func extractFloat(val interface{}) (float64, bool) {
	if val == nil {
		return 0, false
	}
	switch v := val.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	default:
		return 0, false
	}
}

func copyProps(props map[string]interface{}) map[string]interface{} {
	m := make(map[string]interface{}, len(props)+4)
	for k, v := range props {
		m[k] = v
	}
	return m
}

func (h *DerivedHandler) calculateTimeDerivedGrid(req *DerivedRequest) (*model.GridResponse, error) {
	file := req.File
	underlying := ResolveUnderlyingCatalogPath(req)
	if file == "" || file == "latest" {
		if h.Client != nil && !h.MockMode {
			latest, err := db.GetLatestCycle(h.Client, underlying, "")
			if err == nil && latest != "" {
				file = latest
			} else {
				files, errList := db.GetFileList(h.Client, underlying, 1)
				if errList == nil && len(files) > 0 {
					file = files[0].Name
				}
			}
		}
		if file == "" || file == "latest" {
			file = "26101408.024"
		}
	}

	hours := req.TimeDeltaHours
	if hours <= 0 {
		hours = 24
	}

	isSLP := req.DerivedType == "SLP-VARIATION-24H" || req.DerivedType == "SLP-VARIATION-48H" || req.Element == "PRMSL" || req.Element == "SLP"

	elem := req.Element
	lvl := req.Level1
	if isSLP {
		elem = "PRMSL"
		lvl = "0"
	} else {
		if lvl != "" && lvl != "0" && !strings.EqualFold(lvl, "SURFACE") {
			elem = "TMP"
		} else {
			elem = "TMP_2M"
			lvl = "0"
		}
	}

	priorFile, errPrior := h.resolvePriorGridFile(req.Model, elem, lvl, file, hours)
	if errPrior != nil {
		return nil, fmt.Errorf("resolve prior grid file (delta=%dh): %w", hours, errPrior)
	}

	gridCurr, errCurr := h.fetchGridLevelWithFallback(req.Model, elem, lvl, file)
	if errCurr != nil {
		return nil, fmt.Errorf("fetch current grid (%s/%s/%s, %s): %w", req.Model, elem, lvl, file, errCurr)
	}

	gridPrior, errPriorFetch := h.fetchGridLevelWithFallback(req.Model, elem, lvl, priorFile)
	if errPriorFetch != nil {
		return nil, fmt.Errorf("fetch prior grid (%s/%s/%s, %s): %w", req.Model, elem, lvl, priorFile, errPriorFetch)
	}

	nPoints := len(gridCurr.Values)
	if len(gridPrior.Values) != nPoints {
		return nil, fmt.Errorf("grid dimension mismatch: current (%d) vs prior (%d)", nPoints, len(gridPrior.Values))
	}

	resValues := make([]float32, nPoints)
	var minVal float32 = math.MaxFloat32
	var maxVal float32 = -math.MaxFloat32
	var sumVal float32 = 0
	validCount := 0

	// In mock mode without live CQL, synthesize realistic variations
	if (h.MockMode || h.Client == nil) && (file == priorFile || gridCurr.Stats.Min == gridPrior.Stats.Min) {
		factor := float32(hours) / 24.0
		for i := 0; i < nPoints; i++ {
			x := float32(gridCurr.X[i%len(gridCurr.X)])
			y := float32(gridCurr.Y[i/len(gridCurr.X)])
			var val float32
			if isSLP {
				val = float32(math.Sin(float64(x)*0.08)*math.Cos(float64(y)*0.08)*8.0) * factor
			} else {
				val = float32(math.Sin(float64(x)*0.06)*math.Cos(float64(y)*0.06)*10.0) * factor
			}
			resValues[i] = val
			if val < minVal {
				minVal = val
			}
			if val > maxVal {
				maxVal = val
			}
			sumVal += val
			validCount++
		}
	} else {
		for i := 0; i < nPoints; i++ {
			v1 := gridCurr.Values[i]
			v2 := gridPrior.Values[i]
			if v1 <= -9000 || v2 <= -9000 || math.IsNaN(float64(v1)) || math.IsNaN(float64(v2)) {
				resValues[i] = -9999
				continue
			}
			diff := v1 - v2
			resValues[i] = diff
			if diff < minVal {
				minVal = diff
			}
			if diff > maxVal {
				maxVal = diff
			}
			sumVal += diff
			validCount++
		}
	}

	resp := &model.GridResponse{
		Header: gridCurr.Header,
		X:      gridCurr.X,
		Y:      gridCurr.Y,
		Values: resValues,
	}
	resp.Header.Element = req.DerivedType
	paramDesc := "Temperature"
	if isSLP {
		paramDesc = "Sea Level Pressure"
	}
	resp.Header.Description = fmt.Sprintf("%d-Hour %s Variation (%s)", hours, paramDesc, req.Model)
	resp.Header.IsolineStartValue = -20
	resp.Header.IsolineEndValue = 20
	resp.Header.IsolineSpace = 2

	if validCount > 0 {
		resp.Stats = model.GridStats{
			Min:  minVal,
			Max:  maxVal,
			Mean: sumVal / float32(validCount),
		}
	}

	return resp, nil
}

func (h *DerivedHandler) calculateTimeDerivedStation(req *DerivedRequest) (*model.GeoJSONFeatureCollection, error) {
	file := req.File
	underlying := ResolveUnderlyingCatalogPath(req)
	if file == "" || file == "latest" {
		if h.Client != nil && !h.MockMode {
			latest, err := db.GetLatestCycle(h.Client, underlying, "")
			if err == nil && latest != "" {
				file = latest
			} else {
				files, errList := db.GetFileList(h.Client, underlying, 1)
				if errList == nil && len(files) > 0 {
					file = files[0].Name
				}
			}
		}
		if file == "" || file == "latest" {
			file = "20261014080000.000"
		}
	}

	hours := req.TimeDeltaHours
	if hours <= 0 {
		hours = 24
	}

	priorFile, errPrior := h.resolvePriorStationFile(req.Model, underlying, file, hours)
	if errPrior != nil {
		return nil, fmt.Errorf("resolve prior station file (delta=%dh): %w", hours, errPrior)
	}

	stnCurr, errCurr := h.fetchStationData(req.Model, req.SubPath, req.Level1, file)
	if errCurr != nil {
		return nil, fmt.Errorf("fetch current station data (%s, %s): %w", underlying, file, errCurr)
	}

	stnPrior, errPriorFetch := h.fetchStationData(req.Model, req.SubPath, req.Level1, priorFile)
	if errPriorFetch != nil {
		return nil, fmt.Errorf("fetch prior station data (%s, %s): %w", underlying, priorFile, errPriorFetch)
	}

	isSLP := req.DerivedType == "SLP-VARIATION-24H" || req.DerivedType == "SLP-VARIATION-48H" || req.Element == "SLP"

	if h.MockMode || h.Client == nil {
		features := make([]model.GeoJSONFeature, 0, len(stnCurr.Features))
		for _, f := range stnCurr.Features {
			id := extractStationID(f)
			props := make(map[string]interface{}, len(f.Properties)+8)
			for k, v := range f.Properties {
				props[k] = v
			}

			sign := 1.0
			if id%2 == 0 {
				sign = -1.0
			}
			factor := float64(hours) / 24.0

			if isSLP {
				deltaP := float32(math.Round((sign*float64(id%9)*0.8*factor)*10) / 10)
				props["slp"] = deltaP
				props["slp_variation"] = deltaP
				props[fmt.Sprintf("slp_var_%dh", hours)] = deltaP
				props["slp_var"] = deltaP
				props["val"] = deltaP
				props["value"] = deltaP
				props["time_delta_h"] = hours
			} else {
				deltaT := float32(math.Round((sign*float64(id%7)*1.2*factor)*10) / 10)
				props["temperature"] = deltaT
				props["t_variation"] = deltaT
				props[fmt.Sprintf("t_var_%dh", hours)] = deltaT
				props["t_var"] = deltaT
				props["val"] = deltaT
				props["value"] = deltaT
				props["time_delta_h"] = hours
			}

			fNew := f
			fNew.Properties = props
			features = append(features, fNew)
		}
		return &model.GeoJSONFeatureCollection{Type: "FeatureCollection", Features: features}, nil
	}

	priorMap := make(map[int32]model.GeoJSONFeature, len(stnPrior.Features))
	for _, f := range stnPrior.Features {
		id := extractStationID(f)
		if id > 0 {
			priorMap[id] = f
		}
	}

	features := make([]model.GeoJSONFeature, 0, len(stnCurr.Features))
	for _, f := range stnCurr.Features {
		id := extractStationID(f)
		if id <= 0 {
			continue
		}

		fPrior, ok := priorMap[id]
		if !ok {
			continue
		}

		props := make(map[string]interface{}, len(f.Properties)+8)
		for k, v := range f.Properties {
			props[k] = v
		}

		if isSLP {
			slpCurr, ok1 := extractFloat(f.Properties["slp"])
			if !ok1 {
				slpCurr, ok1 = extractFloat(f.Properties["press_slp"])
			}
			if !ok1 {
				slpCurr, ok1 = extractFloat(f.Properties["press_stn"])
			}
			slpPrior, ok2 := extractFloat(fPrior.Properties["slp"])
			if !ok2 {
				slpPrior, ok2 = extractFloat(fPrior.Properties["press_slp"])
			}
			if !ok2 {
				slpPrior, ok2 = extractFloat(fPrior.Properties["press_stn"])
			}
			if !ok1 || !ok2 || slpCurr <= 0 || slpPrior <= 0 || slpCurr < 800 || slpPrior < 800 || slpCurr > 1100 || slpPrior > 1100 {
				continue
			}
			diff := float32(math.Round((slpCurr-slpPrior)*10) / 10)
			props["slp"] = diff
			props["slp_variation"] = diff
			props[fmt.Sprintf("slp_var_%dh", hours)] = diff
			props["slp_var"] = diff
			props["val"] = diff
			props["value"] = diff
			props["slp_curr"] = float32(slpCurr)
			props["slp_prev"] = float32(slpPrior)
			props["time_delta_h"] = hours
		} else {
			tCurr, ok1 := extractFloat(f.Properties["temperature"])
			if !ok1 {
				tCurr, ok1 = extractFloat(f.Properties["temp"])
			}
			if !ok1 {
				tCurr, ok1 = extractFloat(f.Properties["tmp"])
			}
			tPrior, ok2 := extractFloat(fPrior.Properties["temperature"])
			if !ok2 {
				tPrior, ok2 = extractFloat(fPrior.Properties["temp"])
			}
			if !ok2 {
				tPrior, ok2 = extractFloat(fPrior.Properties["tmp"])
			}
			if !ok1 || !ok2 || tCurr <= -9000 || tPrior <= -9000 || tCurr < -90 || tPrior < -90 || tCurr > 70 || tPrior > 70 {
				continue
			}
			diff := float32(math.Round((tCurr-tPrior)*10) / 10)
			props["temperature"] = diff
			props["t_variation"] = diff
			props[fmt.Sprintf("t_var_%dh", hours)] = diff
			props["t_var"] = diff
			props["val"] = diff
			props["value"] = diff
			props["t_curr"] = float32(tCurr)
			props["t_prev"] = float32(tPrior)
			props["time_delta_h"] = hours
		}

		fNew := f
		fNew.Properties = props
		features = append(features, fNew)
	}

	return &model.GeoJSONFeatureCollection{Type: "FeatureCollection", Features: features}, nil
}

