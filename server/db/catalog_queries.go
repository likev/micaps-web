package db

import (
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
				"NWFD_SCMOC", "NWFD_SMERGE", "NWFD_SNWFD", "NWFD_SPCC",
				"CLDAS", "CODAS", "SWAN_PRODUCT",
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

// GetLatestCycle queries latestdatatime table for the most recent run
func GetLatestCycle(client *CQLClient, dataPath string, suffix string) (string, error) {
	if suffix == "" {
		suffix = "*.024"
	}
	dataPath = strings.TrimSuffix(dataPath, "/")
	query := fmt.Sprintf(`SELECT value FROM micapsdataserver.latestdatatime WHERE "dataPath" = '%s' AND column1 = '%s' LIMIT 1`, dataPath, suffix)

	rows, err := client.Query(query)
	if err != nil {
		return "", err
	}
	if len(rows) == 0 || rows[0].Columns["value"] == nil {
		// Try fallback query with wildcards if exact suffix not found
		qFallback := fmt.Sprintf(`SELECT column1, value FROM micapsdataserver.latestdatatime WHERE "dataPath" = '%s' LIMIT 1`, dataPath)
		rFallback, fErr := client.Query(qFallback)
		if fErr == nil && len(rFallback) > 0 && rFallback[0].Columns["value"] != nil {
			return string(rFallback[0].Columns["value"]), nil
		}
		return "", fmt.Errorf("no latest cycle record found for %s", dataPath)
	}

	val := string(rows[0].Columns["value"])
	return val, nil
}

// GetFileList queries treeview table for available files under dataPath
func GetFileList(client *CQLClient, dataPath string) ([]model.FileEntry, error) {
	dataPath = strings.TrimSuffix(dataPath, "/")
	query := fmt.Sprintf(`SELECT column1, value FROM micapsdataserver.treeview WHERE "dataPath" = '%s'`, dataPath)

	rows, err := client.Query(query)
	if err != nil {
		return nil, err
	}

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

// GetPressureLevels queries the level table for configured vertical pressure levels
func GetPressureLevels(client *CQLClient, dataPath string) ([]int, error) {
	dataPath = strings.TrimSuffix(dataPath, "/")
	query := fmt.Sprintf(`SELECT column1 FROM micapsdataserver.level WHERE "dataPath" = '%s'`, dataPath)

	rows, err := client.Query(query)
	if err != nil {
		return nil, err
	}

	levels := make([]int, 0, len(rows))
	for _, row := range rows {
		if col1 := row.Columns["column1"]; len(col1) > 0 {
			if lvl, err := strconv.Atoi(string(col1)); err == nil {
				levels = append(levels, lvl)
			}
		}
	}

	// If no custom levels configured in table, provide standard meteorological levels
	if len(levels) == 0 {
		levels = []int{1000, 925, 850, 700, 500, 400, 300, 250, 200, 100}
	}

	sort.Slice(levels, func(i, j int) bool {
		return levels[i] > levels[j] // descending order (1000 down to 100)
	})

	return levels, nil
}
