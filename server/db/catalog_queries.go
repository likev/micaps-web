package db

import (
	"encoding/binary"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"micaps-web/model"
)

// SupportedModels returns categorized list of supported MICAPS 4 tables
func SupportedModels() []model.CategoryInfo {
	return []model.CategoryInfo{
		{
			Category: "Global NWP Models",
			Tables: []string{
				"ECMWF_HR", "ECMWF_MR", "ECMWF_LR", "ECMWF_ENSEMBLE",
				"ECMWF_ENSEMBLE_PRODUCT",
				"NCEP_GFS", "NCEP_GFS_HR", "NCEP_ENSEMBLE",
				"GERMAN_HR", "JAPAN_HR", "CANADA_ENSEMBLE",
			},
		},
		{
			Category: "CMA National & Regional Models",
			Tables: []string{
				"GRAPES_GFS", "GRAPES_MESO_HR", "GRAPES_3KM",
				"GRAPES_GEPS_ENSEMBLE", "T639",
				"BEIJING_HR", "GUANGZHOU_HR", "SHANGHAI_HR",
			},
		},
		{
			Category: "National Gridded Guidance",
			Tables: []string{
				"NWFD_SCMOC", "NWFD_SCMOC_1H", "NWFD_SMERGE", "NWFD_SNWFD", "NWFD_SPCC",
				"CLDAS", "CODAS", "SWAN_PRODUCT", "FORECAST_PRODUCT",
			},
		},
		{
			Category: "Observations & Remote Sensing",
			Tables: []string{
				"SURFACE", "UPPER_AIR", "SINGLERADAR", "RADARMOSAIC",
				"SATELLITE", "WIND_PROFILER",
			},
		},
	}
}

func candidateDataPaths(dataPath string) []string {
	dataPath = strings.Trim(dataPath, "/")
	if dataPath == "" {
		return nil
	}
	seen := make(map[string]bool)
	var paths []string
	add := func(p string) {
		p = strings.Trim(p, "/")
		if p != "" && !seen[p] {
			seen[p] = true
			paths = append(paths, p)
		}
	}
	add(dataPath)

	if strings.Contains(dataPath, "TLOGP") {
		add("UPPER_AIR/TLOGP")
		add("TLOGP")
	}

	if strings.HasPrefix(dataPath, "CMA_GFS/") {
		add("GRAPES_GFS/" + strings.TrimPrefix(dataPath, "CMA_GFS/"))
	}
	if strings.HasPrefix(dataPath, "CMA-GFS/") {
		add("GRAPES_GFS/" + strings.TrimPrefix(dataPath, "CMA-GFS/"))
	}
	if strings.HasPrefix(dataPath, "CMAGFS/") {
		add("GRAPES_GFS/" + strings.TrimPrefix(dataPath, "CMAGFS/"))
	}
	if strings.HasPrefix(dataPath, "GFS/") {
		add("GRAPES_GFS/" + strings.TrimPrefix(dataPath, "GFS/"))
		add("NCEP_GFS/" + strings.TrimPrefix(dataPath, "GFS/"))
	}

	parts := strings.Split(dataPath, "/")
	if len(parts) >= 2 {
		add(strings.Join(parts[1:], "/"))
	}
	if len(parts) == 3 {
		add(parts[0] + "/" + parts[1])
		add(parts[1])
	} else if len(parts) == 2 {
		add(parts[1])
	}
	return paths
}

// GetLatestCycle queries latestdatatime table for the most recent run
func GetLatestCycle(client *CQLClient, dataPath string, suffix string) (string, error) {
	if suffix == "" {
		suffix = "*.024"
	}
	candidates := candidateDataPaths(dataPath)
	if len(candidates) == 0 {
		return "", fmt.Errorf("empty dataPath")
	}

	for _, cPath := range candidates {
		query := fmt.Sprintf(`SELECT value FROM micapsdataserver.latestdatatime WHERE "dataPath" = '%s' AND column1 = '%s' LIMIT 1`, cPath, suffix)
		rows, err := client.Query(query)
		if err == nil && len(rows) > 0 && rows[0].Columns["value"] != nil {
			return string(rows[0].Columns["value"]), nil
		}

		qFallback := fmt.Sprintf(`SELECT column1, value FROM micapsdataserver.latestdatatime WHERE "dataPath" = '%s' LIMIT 1`, cPath)
		rFallback, fErr := client.Query(qFallback)
		if fErr == nil && len(rFallback) > 0 && rFallback[0].Columns["value"] != nil {
			return string(rFallback[0].Columns["value"]), nil
		}
	}

	// Fallback to treeview if latestdatatime has no record
	for _, cPath := range candidates {
		qTree := fmt.Sprintf(`SELECT column1 FROM micapsdataserver.treeview WHERE "dataPath" = '%s' ORDER BY column1 DESC LIMIT 1`, cPath)
		rTree, tErr := client.Query(qTree)
		if tErr == nil && len(rTree) > 0 && rTree[0].Columns["column1"] != nil {
			return string(rTree[0].Columns["column1"]), nil
		}
	}

	return "", fmt.Errorf("no latest cycle record found for %s", dataPath)
}

// GetFileList queries treeview table for available files under dataPath with an optional limit
func GetFileList(client *CQLClient, dataPath string, limit int) ([]model.FileEntry, error) {
	if limit <= 0 {
		limit = 100
	}
	candidates := candidateDataPaths(dataPath)
	if len(candidates) == 0 {
		return nil, fmt.Errorf("empty dataPath")
	}

	var lastErr error
	for _, cPath := range candidates {
		query := fmt.Sprintf(`SELECT column1, value FROM micapsdataserver.treeview WHERE "dataPath" = '%s' ORDER BY column1 DESC LIMIT %d`, cPath, limit)
		rows, err := client.Query(query)
		if err != nil {
			lastErr = err
			continue
		}
		if len(rows) > 0 {
			files := make([]model.FileEntry, 0, len(rows))
			for _, row := range rows {
				name := string(row.Columns["column1"])
				var size int64
				if valBytes := row.Columns["value"]; len(valBytes) > 0 {
					if s, err := strconv.ParseInt(string(valBytes), 10, 64); err == nil {
						size = s
					}
				}
				files = append(files, model.FileEntry{Name: name, Size: size})
			}

			sort.Slice(files, func(i, j int) bool {
				return files[i].Name > files[j].Name
			})

			return files, nil
		}
	}

	if lastErr != nil {
		return nil, lastErr
	}
	return []model.FileEntry{}, nil
}

// parsePressureLevel parses column1 which may be an Int32Type (4-byte big-endian), Int64Type (8-byte), Int16Type (2-byte), or textual decimal string.
func parsePressureLevel(col []byte) (int, bool) {
	if len(col) == 0 {
		return 0, false
	}
	if len(col) == 4 {
		return int(binary.BigEndian.Uint32(col)), true
	}
	if len(col) == 8 {
		return int(binary.BigEndian.Uint64(col)), true
	}
	if len(col) == 2 {
		return int(binary.BigEndian.Uint16(col)), true
	}
	if lvl, err := strconv.Atoi(string(col)); err == nil {
		return lvl, true
	}
	return 0, false
}

// GetPressureLevels queries the level table for configured vertical pressure levels
func GetPressureLevels(client *CQLClient, dataPath string) ([]int, error) {
	dataPath = strings.Trim(dataPath, "/")
	if dataPath == "" {
		return nil, fmt.Errorf("empty dataPath")
	}

	rawCandidates := []string{dataPath}
	if !strings.Contains(dataPath, "/") {
		rawCandidates = append(rawCandidates, dataPath+"/TMP", dataPath+"/HGT", dataPath+"/UGRD")
	} else {
		parts := strings.Split(dataPath, "/")
		rawCandidates = append(rawCandidates, parts[0]+"/TMP", parts[0]+"/HGT")
		if len(parts) >= 3 {
			rawCandidates = append(rawCandidates, parts[0]+"/"+parts[1])
		}
	}

	seenCand := make(map[string]bool)
	var candidates []string
	for _, rc := range rawCandidates {
		for _, cp := range candidateDataPaths(rc) {
			if !seenCand[cp] {
				seenCand[cp] = true
				candidates = append(candidates, cp)
			}
		}
	}

	seen := make(map[int]bool)
	var levels []int
	var lastErr error

	for _, cand := range candidates {
		query := fmt.Sprintf(`SELECT column1 FROM micapsdataserver.level WHERE "dataPath" = '%s'`, cand)
		rows, err := client.Query(query)
		if err != nil {
			lastErr = err
			continue
		}
		if len(rows) > 0 {
			for _, row := range rows {
				if col1 := row.Columns["column1"]; len(col1) > 0 {
					if lvl, ok := parsePressureLevel(col1); ok && !seen[lvl] {
						seen[lvl] = true
						levels = append(levels, lvl)
					}
				}
			}
			if len(levels) > 0 {
				break
			}
		}
	}

	// If level table yielded no rows, query treeview table for directory entries under candidate paths
	if len(levels) == 0 {
		for _, cand := range candidates {
			qTree := fmt.Sprintf(`SELECT column1, value FROM micapsdataserver.treeview WHERE "dataPath" = '%s'`, cand)
			rTree, errTree := client.Query(qTree)
			if errTree == nil && len(rTree) > 0 {
				for _, row := range rTree {
					if string(row.Columns["value"]) == "D" {
						col1 := row.Columns["column1"]
						if lvl, ok := parsePressureLevel(col1); ok && !seen[lvl] {
							seen[lvl] = true
							levels = append(levels, lvl)
						}
					}
				}
				if len(levels) > 0 {
					break
				}
			}
		}
	}

	// If no custom levels configured in table, provide default meteorological levels
	if len(levels) == 0 {
		if lastErr != nil && len(candidates) == 1 {
			return nil, lastErr
		}
		levels = []int{1000, 925, 850, 700, 500, 400, 300, 250, 200, 100}
	}

	sort.Slice(levels, func(i, j int) bool {
		return levels[i] > levels[j] // descending order (1000 down to 100)
	})

	return levels, nil
}
