package parser

import (
	"bufio"
	"bytes"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"micaps-web/model"
)

// ParseDiamond11Grid parses a Diamond 11 text vector grid into GridResponse
func ParseDiamond11Grid(data []byte) (*model.GridResponse, error) {
	scanner := bufio.NewScanner(bytes.NewReader(data))
	// Increase buffer for very large text lines
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 64*1024*1024)

	// Line 1: Header title
	if !scanner.Scan() {
		return nil, fmt.Errorf("empty Diamond 11 data")
	}
	line1 := strings.TrimSpace(scanner.Text())
	if !strings.HasPrefix(strings.ToLower(line1), "diamond 11") {
		return nil, fmt.Errorf("not a Diamond 11 file: %q", line1)
	}
	desc := strings.TrimSpace(strings.TrimPrefix(line1, "diamond 11"))
	desc = strings.TrimSpace(strings.TrimPrefix(desc, "Diamond 11"))

	// Line 2: Grid parameters
	if !scanner.Scan() {
		return nil, fmt.Errorf("missing Diamond 11 grid parameters line")
	}
	fields := strings.Fields(scanner.Text())
	if len(fields) < 14 {
		return nil, fmt.Errorf("insufficient fields in Diamond 11 parameters: got %d, expected at least 14", len(fields))
	}

	year, _ := strconv.Atoi(fields[0])
	month, _ := strconv.Atoi(fields[1])
	day, _ := strconv.Atoi(fields[2])
	hour, _ := strconv.Atoi(fields[3])
	period, _ := strconv.Atoi(fields[4])
	level, _ := strconv.ParseFloat(fields[5], 32)
	gridX, _ := strconv.ParseFloat(fields[6], 32)
	gridY, _ := strconv.ParseFloat(fields[7], 32)
	startLon, _ := strconv.ParseFloat(fields[8], 32)
	endLon, _ := strconv.ParseFloat(fields[9], 32)
	startLat, _ := strconv.ParseFloat(fields[10], 32)
	endLat, _ := strconv.ParseFloat(fields[11], 32)
	nLon, _ := strconv.Atoi(fields[12])
	nLat, _ := strconv.Atoi(fields[13])

	if year < 100 {
		year += 2000
	}
	totalPoints := nLon * nLat
	if totalPoints <= 0 || totalPoints > 20000000 {
		return nil, fmt.Errorf("invalid grid size: %d x %d", nLon, nLat)
	}

	// Read all numeric tokens into float array
	values := make([]float32, 0, totalPoints*2)
	for scanner.Scan() {
		toks := strings.Fields(scanner.Text())
		for _, tok := range toks {
			v, err := strconv.ParseFloat(tok, 32)
			if err == nil {
				values = append(values, float32(v))
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading Diamond 11 values: %w", err)
	}

	if len(values) < totalPoints {
		return nil, fmt.Errorf("insufficient values for Diamond 11 grid: got %d, expected at least %d", len(values), totalPoints)
	}

	hasUV := len(values) >= totalPoints*2
	uVals := make([]float32, totalPoints)
	vVals := make([]float32, totalPoints)
	speedVals := make([]float32, totalPoints)

	var minVal, maxVal, sumVal float32
	minVal = math.MaxFloat32
	maxVal = -math.MaxFloat32

	// In Diamond 11 text grid:
	// Rows are typically ordered North to South.
	// If startLat > endLat, then raw row 0 is North.
	// If startLat < endLat, raw row 0 is South.
	flipY := startLat > endLat
	actualStartLat := startLat
	actualEndLat := endLat
	if flipY {
		actualStartLat = endLat
		actualEndLat = startLat
	}

	for j := 0; j < nLat; j++ {
		srcRow := j
		if flipY {
			srcRow = nLat - 1 - j
		}
		for i := 0; i < nLon; i++ {
			dstIdx := j*nLon + i
			srcIdx := srcRow*nLon + i

			var u, v float32
			if hasUV {
				u = values[srcIdx]
				v = values[totalPoints+srcIdx]
			} else {
				u = values[srcIdx]
				v = 0
			}

			// Handle missing sentinel (9999 or -9999)
			if u > 9000 || u < -9000 || v > 9000 || v < -9000 {
				u = -9999
				v = -9999
				speedVals[dstIdx] = -9999
			} else {
				uVals[dstIdx] = u
				vVals[dstIdx] = v
				spd := float32(math.Hypot(float64(u), float64(v)))
				speedVals[dstIdx] = spd
				if spd < minVal {
					minVal = spd
				}
				if spd > maxVal {
					maxVal = spd
				}
				sumVal += spd
			}
		}
	}

	initTime := time.Date(year, time.Month(month), day, hour, 0, 0, 0, time.UTC)
	validTime := initTime.Add(time.Duration(period) * time.Hour)

	gridHdr := model.GridHeader{
		Discriminator:       "diamond 11",
		DataType:            11,
		ModelName:           "NMC",
		Element:             "WIND",
		Description:         desc,
		Level:               float32(level),
		Year:                int32(year),
		Month:               int32(month),
		Day:                 int32(day),
		Hour:                int32(hour),
		Period:              int32(period),
		StartLongitude:      float32(startLon),
		EndLongitude:        float32(endLon),
		LongitudeGridSpace:  float32(gridX),
		LongitudeGridNumber: int32(nLon),
		StartLatitude:       float32(actualStartLat),
		EndLatitude:         float32(actualEndLat),
		LatitudeGridSpace:   float32(gridY),
		LatitudeGridNumber:  int32(nLat),
		InitTime:            initTime,
		ValidTime:           validTime,
	}

	xCoords := make([]float64, nLon)
	for i := 0; i < nLon; i++ {
		xCoords[i] = float64(startLon) + float64(i)*float64(gridX)
	}
	yCoords := make([]float64, nLat)
	for j := 0; j < nLat; j++ {
		yCoords[j] = float64(actualStartLat) + float64(j)*float64(gridY)
	}

	resp := &model.GridResponse{
		Header: gridHdr,
		X:      xCoords,
		Y:      yCoords,
		Values: speedVals,
		U:      uVals,
		V:      vVals,
		Stats: model.GridStats{
			Min:  minVal,
			Max:  maxVal,
			Mean: sumVal / float32(totalPoints),
		},
	}

	return resp, nil
}

// ParseDiamondTextStation parses Diamond text station reports (Diamond 1, 2, 1126 ROCEA marine buoys, etc.)
func ParseDiamondTextStation(data []byte) (*model.GeoJSONFeatureCollection, error) {
	scanner := bufio.NewScanner(bytes.NewReader(data))
	// Line 1: diamond ...
	if !scanner.Scan() {
		return &model.GeoJSONFeatureCollection{Type: "FeatureCollection", Features: []model.GeoJSONFeature{}}, nil
	}
	// Line 2: year month day hour stationCount
	if !scanner.Scan() {
		return &model.GeoJSONFeatureCollection{Type: "FeatureCollection", Features: []model.GeoJSONFeature{}}, nil
	}

	features := make([]model.GeoJSONFeature, 0)

	type currentStn struct {
		id        string
		lon       float64
		lat       float64
		elev      float32
		temp      float32
		dewPoint  float32
		windDir   float32
		windSpeed float32
		slp       float32
	}

	var cur *currentStn

	flushCurrent := func() {
		if cur == nil {
			return
		}
		if cur.lon < -180 || cur.lon > 180 || cur.lat < -90 || cur.lat > 90 {
			return
		}
		props := map[string]interface{}{
			"station_id":  cur.id,
			"temperature": round1(cur.temp),
			"dewpoint":    round1(cur.dewPoint),
			"elevation":   round1(cur.elev),
			"wind_speed":  round1(cur.windSpeed),
			"wind_dir":    round1(cur.windDir),
			"slp":         round1(cur.slp),
		}
		features = append(features, model.GeoJSONFeature{
			Type: "Feature",
			Geometry: model.GeoJSONGeometry{
				Type:        "Point",
				Coordinates: []float64{cur.lon, cur.lat},
			},
			Properties: props,
		})
	}

	for scanner.Scan() {
		rawLine := scanner.Text()
		trimmed := strings.TrimSpace(rawLine)
		if trimmed == "" {
			continue
		}

		isIndented := strings.HasPrefix(rawLine, " ") || strings.HasPrefix(rawLine, "\t")
		if isIndented && cur != nil {
			lvlFields := strings.Fields(trimmed)
			// Format typically: level [height] temp dewpoint [windDir windSpeed] or level temp dewpoint windDir windSpeed
			if len(lvlFields) >= 3 {
				if t, err := strconv.ParseFloat(lvlFields[1], 32); err == nil && t < 9000 && t > -9000 {
					if cur.temp <= -9000 {
						cur.temp = float32(t)
					}
				}
				if td, err := strconv.ParseFloat(lvlFields[2], 32); err == nil && td < 9000 && td > -9000 {
					if cur.dewPoint <= -9000 {
						cur.dewPoint = float32(td)
					}
				}
			}
			if len(lvlFields) >= 5 {
				if wd, err := strconv.ParseFloat(lvlFields[3], 32); err == nil && wd < 9000 && wd >= 0 {
					if cur.windDir <= -9000 {
						cur.windDir = float32(wd)
					}
				}
				if ws, err := strconv.ParseFloat(lvlFields[4], 32); err == nil && ws < 9000 && ws >= 0 {
					if cur.windSpeed <= -9000 {
						cur.windSpeed = float32(ws)
					}
				}
			}
			continue
		}

		// New station line
		fields := strings.Fields(trimmed)
		if len(fields) < 4 {
			continue
		}

		lon, errLon := strconv.ParseFloat(fields[1], 64)
		lat, errLat := strconv.ParseFloat(fields[2], 64)
		if errLon != nil || errLat != nil {
			continue
		}
		elev, _ := strconv.ParseFloat(fields[3], 32)

		flushCurrent()

		cur = &currentStn{
			id:        fields[0],
			lon:       lon,
			lat:       lat,
			elev:      float32(elev),
			temp:      -9999,
			dewPoint:  -9999,
			windDir:   -9999,
			windSpeed: -9999,
			slp:       -9999,
		}
	}

	flushCurrent()

	return &model.GeoJSONFeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}, nil
}

// ParseDiamond11TextStation is an alias for ParseDiamondTextStation for backward compatibility
func ParseDiamond11TextStation(data []byte) (*model.GeoJSONFeatureCollection, error) {
	return ParseDiamondTextStation(data)
}


