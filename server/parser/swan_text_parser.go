package parser

import (
	"bufio"
	"bytes"
	"fmt"
	"strconv"
	"strings"

	"micaps-web/model"
)

// ParseSwanText parses SWAN Diamond 35 severe storm text products (TVS, HAIL, GALE) into GeoJSON
func ParseSwanText(data []byte) (*model.GeoJSONFeatureCollection, error) {
	unwrapped, err := UnwrapPayload(data)
	if err != nil {
		return nil, fmt.Errorf("failed to unwrap SWAN text: %w", err)
	}

	scanner := bufio.NewScanner(bytes.NewReader(unwrapped))
	// Line 1: Diamond 35 <description>
	if !scanner.Scan() {
		return &model.GeoJSONFeatureCollection{Type: "FeatureCollection", Features: []model.GeoJSONFeature{}}, nil
	}
	line1 := strings.TrimSpace(scanner.Text())
	if !strings.HasPrefix(strings.ToLower(line1), "diamond 35") {
		return nil, fmt.Errorf("invalid Diamond 35 header: %q", line1)
	}
	eventTitle := strings.TrimSpace(strings.TrimPrefix(line1, "Diamond 35"))
	eventTitle = strings.TrimSpace(strings.TrimPrefix(eventTitle, "diamond 35"))

	// Line 2: TAB <YYYY-MM-DD> <HH:MM:SS> ...
	var obsTime string
	if scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) >= 3 && strings.EqualFold(fields[0], "TAB") {
			obsTime = fields[1] + " " + fields[2]
		}
	}

	// Line 3: Column header line, e.g. "6 时间 站号 移动速度(m/s) 移动方向 u(m/s) v(m/s)"
	var colHeaders []string
	if scanner.Scan() {
		colHeaders = strings.Fields(scanner.Text())
		if len(colHeaders) > 0 {
			if _, err := strconv.Atoi(colHeaders[0]); err == nil {
				colHeaders = colHeaders[1:]
			}
		}
	}

	features := make([]model.GeoJSONFeature, 0)

	// Subsequent lines: event records
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}

		// Common fields: time, station_id, speed, dir, u, v, lon, lat
		props := map[string]interface{}{
			"event_type": eventTitle,
			"obs_time":   obsTime,
		}

		var lon, lat float64
		hasCoords := false

		// Check if fields contain lat/lon
		for idx, field := range fields {
			val, err := strconv.ParseFloat(field, 64)
			if err != nil {
				continue
			}
			// Look for longitude/latitude patterns
			if !hasCoords && idx+1 < len(fields) {
				nextVal, nErr := strconv.ParseFloat(fields[idx+1], 64)
				if nErr == nil {
					if val >= 70 && val <= 140 && nextVal >= 0 && nextVal <= 60 {
						lon = val
						lat = nextVal
						hasCoords = true
					} else if nextVal >= 70 && nextVal <= 140 && val >= 0 && val <= 60 {
						lat = val
						lon = nextVal
						hasCoords = true
					}
				}
			}
		}

		if len(colHeaders) > 0 {
			for idx, col := range colHeaders {
				if idx < len(fields) {
					props[col] = fields[idx]
				}
			}
		} else {
			for idx, field := range fields {
				props[fmt.Sprintf("col_%d", idx)] = field
			}
		}

		if !hasCoords {
			// If station coordinates are omitted, center point or default
			lon = 116.4
			lat = 39.9
		}

		features = append(features, model.GeoJSONFeature{
			Type: "Feature",
			Geometry: model.GeoJSONGeometry{
				Type:        "Point",
				Coordinates: []float64{lon, lat},
			},
			Properties: props,
		})
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scanner error in SWAN text: %w", err)
	}

	return &model.GeoJSONFeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}, nil
}
