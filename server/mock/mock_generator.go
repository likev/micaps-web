package mock

import (
	"fmt"
	"math"
	"time"

	"micaps-web/model"
)

// GenerateMockGrid creates a synthetic high-resolution meteorological field over East Asia
func GenerateMockGrid(element string, level float32, period int32) *model.GridResponse {
	startLon := float32(70.0)
	endLon := float32(140.0)
	dLon := float32(0.25)
	nLon := int32(281) // (140 - 70) / 0.25 + 1

	startLat := float32(15.0)
	endLat := float32(55.0)
	dLat := float32(0.25)
	nLat := int32(161) // (55 - 15) / 0.25 + 1

	total := int(nLon * nLat)
	now := time.Now().UTC().Truncate(time.Hour)

	resp := &model.GridResponse{
		Header: model.GridHeader{
			Discriminator:       "mdfs",
			DataType:            4,
			ModelName:           "MOCK_SYNTHETIC",
			Element:             element,
			Description:         fmt.Sprintf("Synthetic %s field at %0.0f hPa", element, level),
			Level:               level,
			Year:                int32(now.Year()),
			Month:               int32(now.Month()),
			Day:                 int32(now.Day()),
			Hour:                int32(now.Hour()),
			Period:              period,
			StartLongitude:      startLon,
			EndLongitude:        endLon,
			LongitudeGridSpace:  dLon,
			LongitudeGridNumber: nLon,
			StartLatitude:       startLat,
			EndLatitude:         endLat,
			LatitudeGridSpace:   dLat,
			LatitudeGridNumber:  nLat,
			IsolineStartValue:   -30.0,
			IsolineEndValue:     40.0,
			IsolineSpace:        4.0,
			InitTime:            now,
			ValidTime:           now.Add(time.Duration(period) * time.Hour),
		},
		X:      make([]float64, nLon),
		Y:      make([]float64, nLat),
		Values: make([]float32, total),
	}

	for i := 0; i < int(nLon); i++ {
		resp.X[i] = float64(startLon) + float64(i)*float64(dLon)
	}
	for j := 0; j < int(nLat); j++ {
		resp.Y[j] = float64(startLat) + float64(j)*float64(dLat)
	}

	var minVal, maxVal, sumVal float32 = math.MaxFloat32, -math.MaxFloat32, 0

	// Synthesize meteorological distribution
	centerLon := 115.0 + float64(period)*0.1
	centerLat := 35.0 + float64(period)*0.05

	for j := 0; j < int(nLat); j++ {
		lat := resp.Y[j]
		for i := 0; i < int(nLon); i++ {
			lon := resp.X[i]
			idx := j*int(nLon) + i

			// Base temperature: colder north, warmer south
			val := float32(32.0 - (lat-15.0)*0.9)

			// Cyclone wave depression
			dist := math.Hypot(lon-centerLon, lat-centerLat)
			wave := float32(math.Sin(dist*0.3) * 8.0)
			val += wave

			// Additional perturbation based on element
			if element == "HGT" {
				val = float32(5000.0 + float64(val)*10.0) // 500hPa height in gpm
			} else if element == "RAIN" {
				rain := float32(math.Max(0, float64(15.0-dist*2.0)))
				val = rain
			}

			resp.Values[idx] = val
			if val < minVal {
				minVal = val
			}
			if val > maxVal {
				maxVal = val
			}
			sumVal += val
		}
	}

	resp.Stats = model.GridStats{
		Min:  minVal,
		Max:  maxVal,
		Mean: sumVal / float32(total),
	}

	return resp
}

// GenerateMockStations generates realistic Chinese AWS station observations
func GenerateMockStations() *model.GeoJSONFeatureCollection {
	type StationDef struct {
		ID   int32
		Name string
		Lon  float64
		Lat  float64
		T    float32
		Td   float32
		SLP  float32
		N    int16 // Cloud cover (0-8)
		Ww   int16 // Weather code
		FF   float32
		DD   float32
	}

	stations := []StationDef{
		{54511, "Beijing", 116.4, 39.9, 27.2, 17.5, 1012.4, 4, 2, 4.2, 180},
		{58362, "Shanghai", 121.4, 31.2, 31.5, 24.2, 1008.8, 6, 21, 5.8, 135},
		{59287, "Guangzhou", 113.3, 23.1, 33.1, 26.0, 1006.2, 5, 80, 3.5, 210},
		{57494, "Wuhan", 114.3, 30.6, 29.4, 22.8, 1009.5, 7, 61, 4.0, 90},
		{56294, "Chengdu", 104.1, 30.7, 26.8, 21.0, 1011.0, 8, 51, 2.1, 45},
		{57036, "Xi'an", 108.9, 34.3, 28.5, 19.2, 1013.1, 3, 2, 3.8, 270},
		{50953, "Harbin", 126.6, 45.8, 21.0, 12.4, 1016.7, 2, 0, 4.5, 315},
		{51463, "Urumqi", 87.6, 43.8, 24.5, 8.5, 1018.4, 1, 0, 5.2, 290},
		{55591, "Lhasa", 91.1, 29.7, 18.2, 6.0, 1022.0, 4, 15, 6.1, 195},
		{53463, "Hohhot", 111.7, 40.8, 23.4, 13.0, 1014.2, 2, 0, 5.0, 300},
		{59981, "Haikou", 110.3, 20.0, 32.8, 26.5, 1005.4, 5, 25, 4.8, 150},
		{58847, "Fuzhou", 119.3, 26.1, 32.0, 24.8, 1007.1, 6, 2, 4.1, 120},
		{52889, "Lanzhou", 103.8, 36.1, 25.1, 14.5, 1015.0, 3, 0, 3.2, 250},
		{57516, "Chongqing", 106.5, 29.6, 30.2, 23.5, 1008.0, 7, 10, 2.5, 160},
	}

	features := make([]model.GeoJSONFeature, len(stations))
	for i, s := range stations {
		features[i] = model.GeoJSONFeature{
			Type: "Feature",
			Geometry: model.GeoJSONGeometry{
				Type:        "Point",
				Coordinates: []float64{s.Lon, s.Lat},
			},
			Properties: map[string]interface{}{
				"station_id":    s.ID,
				"name":          s.Name,
				"temperature":   s.T,
				"dewpoint":      s.Td,
				"height":        float32(math.Round(float64(5500.0+(s.T+15.0)*25.0)*10) / 10),
				"slp":           s.SLP,
				"slp_encoded":   encodeSLP(s.SLP),
				"press_diff_3h": 1.2,
				"press_tend":    2, // rising steadily
				"cloud_cover":   s.N,
				"weather_code":  s.Ww,
				"wind_speed":    s.FF,
				"wind_dir":      s.DD,
				"visibility":    10.0,
				"rain_1h":       0.0,
				"rain_6h":       0.5,
				"rain_24h":      2.4,
			},
		}
	}

	return &model.GeoJSONFeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}
}

func encodeSLP(slp float32) string {
	val := int(math.Round(float64(slp * 10)))
	return fmt.Sprintf("%03d", val%1000)
}
