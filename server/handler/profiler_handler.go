package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"

	"micaps-web/db"
	"micaps-web/model"
	"micaps-web/parser"
)

// ProfilerHandler processes /api/data/windprofiler requests
type ProfilerHandler struct {
	Client   *db.CQLClient
	MockMode bool
}

// Handler handles /api/data/windprofiler
func (h *ProfilerHandler) Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	station := strings.TrimSpace(r.URL.Query().Get("station"))
	product := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("product")))
	if product == "" {
		product = "ROBS"
	}
	if product != "ROBS" && product != "RAD" {
		product = "ROBS"
	}

	if station == "" {
		// Return station list as GeoJSON FeatureCollection
		stations := h.getStationList(product)
		json.NewEncoder(w).Encode(stations)
		return
	}

	// Return specific station vertical profile
	file := strings.TrimSpace(r.URL.Query().Get("file"))
	beforeDate, pErr := ParseHistoryDateParam(r)
	if pErr != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, pErr.Error()), http.StatusBadRequest)
		return
	}
	profile, err := h.getStationProfile(product, station, file, beforeDate)
	if err != nil {
		if h.MockMode {
			log.Printf("[ProfilerHandler] Mock fallback for station %s: %v", station, err)
			json.NewEncoder(w).Encode(h.mockProfile(station))
			return
		}
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(profile)
}

func (h *ProfilerHandler) getStationList(product string) *model.GeoJSONFeatureCollection {
	// Standard national reference stations with confirmed coordinates
	refStations := []struct {
		id   string
		name string
		lon  float64
		lat  float64
		alt  float64
	}{
		{"54511", "北京(南郊)", 116.47, 39.81, 31.5},
		{"58362", "上海(宝山)", 121.45, 31.40, 5.5},
		{"59287", "广州", 113.33, 23.17, 43.1},
		{"50527", "海拉尔", 119.75, 49.22, 610.2},
		{"50557", "根河", 121.52, 50.78, 517.4},
		{"50745", "齐齐哈尔", 123.92, 47.38, 147.2},
		{"50774", "五大连池", 126.17, 48.65, 276.0},
		{"58722", "厦门", 118.08, 24.48, 139.4},
		{"59320", "深圳", 114.05, 22.55, 18.0},
		{"57036", "西安", 108.93, 34.30, 397.5},
		{"56294", "成都", 104.02, 30.67, 506.1},
		{"57516", "重庆", 106.55, 29.58, 259.1},
		{"52889", "兰州", 103.88, 36.05, 1517.2},
		{"51463", "乌鲁木齐", 87.65, 43.78, 917.9},
		{"53698", "银川", 106.20, 38.48, 1111.4},
		{"53463", "呼和浩特", 111.68, 40.85, 1064.7},
		{"54161", "长春", 125.22, 43.90, 236.8},
		{"54342", "沈阳", 123.43, 41.73, 48.6},
	}

	features := make([]model.GeoJSONFeature, 0, len(refStations))
	for _, s := range refStations {
		features = append(features, model.GeoJSONFeature{
			Type: "Feature",
			Id:   s.id,
			Geometry: model.GeoJSONGeometry{
				Type:        "Point",
				Coordinates: []float64{s.lon, s.lat},
			},
			Properties: map[string]interface{}{
				"station":    s.id,
				"station_id": s.id,
				"name":       s.name,
				"altitude":   s.alt,
				"product":    product,
			},
		})
	}

	return &model.GeoJSONFeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}
}

func (h *ProfilerHandler) getStationProfile(product, station, file string, beforeDate ...string) (*model.ProfilerProfile, error) {
	if h.MockMode {
		return h.mockProfile(station), nil
	}
	if h.Client == nil {
		return nil, fmt.Errorf("CQL client not connected")
	}

	dataPath := fmt.Sprintf("WIND_PROFILER/%s/%s", product, station)
	if file == "" || file == "latest" {
		files, err := db.GetFileList(h.Client, dataPath, 1, beforeDate...)
		if (err != nil || len(files) == 0) && product == "RAD" && station != "AH001" {
			// Fallback to AH001 if requested station has no data for RAD
			dataPath = "WIND_PROFILER/RAD/AH001"
			station = "AH001"
			files, err = db.GetFileList(h.Client, dataPath, 1, beforeDate...)
		}
		if err != nil || len(files) == 0 {
			return nil, fmt.Errorf("no files found for profiler station %s: %v", station, err)
		}
		file = files[0].Name
	}

	rawBlob, err := db.GetBlob(h.Client, dataPath, file)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch profiler blob: %w", err)
	}

	unwrapped, err := parser.UnwrapPayload(rawBlob)
	if err != nil {
		return nil, fmt.Errorf("failed to decompress profiler blob: %w", err)
	}

	// Parse JSON
	var rawJSON struct {
		StationID       string `json:"stationId"`
		ObservationTime string `json:"observationTime"`
		Longitude       string `json:"longitude"`
		Latitude        string `json:"latitude"`
		Altitude        string `json:"altitude"`
		Type            string `json:"type"`
		Data            []struct {
			SamplingHeight                  string `json:"samplingHeight"`
			HorizontalWindDirection         string `json:"horizontalWindDirection"`
			HorizontalWindSpeed             string `json:"horizontalWindSpeed"`
			VerticalWindSpeed               string `json:"verticalWindSpeed"`
			HorizontalDirectionReliability  string `json:"horizontalDirectionReliability"`
			HorizontalSpeedReliability      string `json:"horizontalSpeedReliability"`
		} `json:"data"`
	}

	if err := json.Unmarshal(unwrapped, &rawJSON); err != nil {
		return nil, fmt.Errorf("failed to parse wind profiler JSON: %w", err)
	}

	lon, _ := strconv.ParseFloat(rawJSON.Longitude, 64)
	lat, _ := strconv.ParseFloat(rawJSON.Latitude, 64)
	alt, _ := strconv.ParseFloat(rawJSON.Altitude, 64)

	levels := make([]model.ProfilerLevel, 0, len(rawJSON.Data))
	for _, d := range rawJSON.Data {
		hVal, _ := strconv.ParseFloat(d.SamplingHeight, 64)
		dir, _ := strconv.ParseFloat(d.HorizontalWindDirection, 64)
		spd, _ := strconv.ParseFloat(d.HorizontalWindSpeed, 64)
		wVal, _ := strconv.ParseFloat(d.VerticalWindSpeed, 64)
		qual, _ := strconv.Atoi(d.HorizontalSpeedReliability)

		// Meteorological wind vector conversion:
		// U = -speed * sin(dir)
		// V = -speed * cos(dir)
		rad := dir * math.Pi / 180.0
		u := -spd * math.Sin(rad)
		v := -spd * math.Cos(rad)

		levels = append(levels, model.ProfilerLevel{
			Height:    hVal,
			WindSpeed: math.Round(spd*10) / 10,
			WindDir:   math.Round(dir*10) / 10,
			U:         math.Round(u*10) / 10,
			V:         math.Round(v*10) / 10,
			W:         math.Round(wVal*100) / 100,
			Quality:   qual,
		})
	}

	return &model.ProfilerProfile{
		StationID: rawJSON.StationID,
		ObsTime:   rawJSON.ObservationTime,
		Lon:       lon,
		Lat:       lat,
		Altitude:  alt,
		Type:      rawJSON.Type,
		Levels:    levels,
	}, nil
}

func (h *ProfilerHandler) mockProfile(station string) *model.ProfilerProfile {
	heights := []float64{150, 300, 600, 900, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000}
	levels := make([]model.ProfilerLevel, 0, len(heights))

	for i, ht := range heights {
		dir := 180.0 + float64(i)*8.0
		if dir >= 360.0 {
			dir -= 360.0
		}
		spd := 5.0 + float64(i)*2.2
		rad := dir * math.Pi / 180.0
		u := -spd * math.Sin(rad)
		v := -spd * math.Cos(rad)

		levels = append(levels, model.ProfilerLevel{
			Height:    ht,
			WindSpeed: math.Round(spd*10) / 10,
			WindDir:   math.Round(dir*10) / 10,
			U:         math.Round(u*10) / 10,
			V:         math.Round(v*10) / 10,
			W:         0.1,
			Quality:   100,
		})
	}

	return &model.ProfilerProfile{
		StationID: station,
		ObsTime:   "20261014235400",
		Lon:       116.47,
		Lat:       39.81,
		Altitude:  31.5,
		Type:      "LC",
		Levels:    levels,
	}
}
