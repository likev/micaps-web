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

	if element == "WIND" {
		resp.U = make([]float32, total)
		resp.V = make([]float32, total)
		resp.Header.DataType = 11
		for j := 0; j < int(nLat); j++ {
			lat := resp.Y[j]
			for i := 0; i < int(nLon); i++ {
				lon := resp.X[i]
				idx := j*int(nLon) + i

				// Westerly Jet stream peaking around 35°N-42°N
				latDist := math.Abs(lat - 38.0)
				jetBase := 24.0 * math.Exp(-latDist*latDist/60.0)

				// Atmospheric Rossby wave (meandering westerly flow)
				wavePhase := (lon-90.0)*0.12 - float64(period)*0.05
				uComp := float32(jetBase + 8.0*math.Cos(wavePhase))
				vComp := float32(10.0 * math.Sin(wavePhase) * math.Exp(-latDist/10.0))

				resp.U[idx] = uComp
				resp.V[idx] = vComp
				speed := float32(math.Hypot(float64(uComp), float64(vComp)))
				resp.Values[idx] = speed

				if speed < minVal {
					minVal = speed
				}
				if speed > maxVal {
					maxVal = speed
				}
				sumVal += speed
			}
		}
	} else {
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
		P3   float32
		Pt   int16
	}

	stations := []StationDef{
		// North China
		{54511, "Beijing", 116.47, 39.80, 27.2, 17.5, 1012.4, 4, 2, 4.2, 180, 1.2, 2},
		{54527, "Tianjin", 117.20, 39.08, 28.1, 19.0, 1011.8, 5, 2, 5.1, 160, 0.8, 2},
		{53698, "Shijiazhuang", 114.42, 38.03, 29.3, 18.2, 1010.5, 3, 0, 3.4, 140, 1.0, 2},
		{53772, "Taiyuan", 112.55, 37.78, 25.4, 14.1, 1014.0, 2, 0, 2.8, 200, 1.5, 1},
		{53463, "Hohhot", 111.68, 40.82, 23.4, 13.0, 1014.2, 2, 0, 5.0, 300, 1.8, 1},
		{53446, "Baotou", 109.84, 40.66, 24.0, 11.8, 1015.1, 1, 0, 4.8, 290, 1.6, 1},
		{54218, "Chifeng", 118.96, 42.26, 22.8, 12.5, 1016.0, 3, 0, 3.9, 320, 2.0, 2},
		{53487, "Datong", 113.33, 40.10, 22.1, 10.9, 1015.8, 2, 0, 3.5, 280, 1.4, 1},
		{54401, "Zhangjiakou", 114.88, 40.78, 21.8, 9.8, 1016.5, 2, 0, 4.6, 310, 1.9, 1},
		{54423, "Chengde", 117.96, 40.97, 24.2, 13.5, 1014.7, 4, 1, 3.1, 230, 1.1, 2},
		{54534, "Tangshan", 118.15, 39.63, 27.5, 18.8, 1012.0, 5, 2, 4.4, 170, 0.9, 2},
		{54602, "Baoding", 115.48, 38.87, 28.6, 18.0, 1011.2, 3, 0, 3.2, 150, 1.1, 2},
		{54900, "Handan", 114.48, 36.60, 30.1, 19.5, 1009.8, 4, 2, 3.0, 130, 0.7, 3},
		{50527, "Hailar", 119.75, 49.22, 18.2, 8.4, 1019.5, 2, 0, 5.6, 330, 2.4, 1},
		{53068, "Erenhot", 111.97, 43.65, 22.0, 6.5, 1017.8, 1, 0, 6.2, 315, 2.1, 1},

		// Northeast China
		{50953, "Harbin", 126.63, 45.75, 21.0, 12.4, 1016.7, 2, 0, 4.5, 315, 1.8, 2},
		{54161, "Changchun", 125.32, 43.88, 23.2, 14.0, 1015.2, 3, 1, 4.1, 290, 1.5, 2},
		{54342, "Shenyang", 123.43, 41.80, 25.6, 16.2, 1013.5, 4, 2, 3.8, 210, 1.2, 2},
		{54662, "Dalian", 121.61, 38.91, 26.8, 20.5, 1011.0, 6, 10, 5.5, 150, 0.6, 3},
		{50745, "Qiqihar", 123.97, 47.33, 19.8, 10.2, 1018.0, 2, 0, 4.8, 320, 2.0, 1},
		{50978, "Mudanjiang", 129.60, 44.58, 22.4, 13.1, 1015.9, 3, 0, 3.6, 300, 1.6, 2},
		{50873, "Jiamusi", 130.37, 46.80, 20.5, 11.5, 1017.3, 3, 0, 4.2, 330, 1.9, 1},
		{54386, "Yanji", 129.50, 42.90, 23.0, 14.6, 1014.8, 4, 2, 3.2, 240, 1.3, 2},
		{50136, "Mohe", 122.52, 52.97, 14.5, 4.2, 1022.4, 1, 0, 3.8, 350, 2.8, 1},
		{50468, "Heihe", 127.50, 50.25, 17.6, 7.8, 1019.8, 2, 0, 4.4, 340, 2.3, 1},

		// East China
		{58362, "Shanghai", 121.47, 31.23, 31.5, 24.2, 1008.8, 6, 21, 5.8, 135, -0.8, 6},
		{58238, "Nanjing", 118.78, 32.04, 31.0, 23.5, 1009.2, 5, 2, 4.0, 120, -0.5, 7},
		{58457, "Hangzhou", 120.15, 30.28, 32.2, 25.0, 1008.1, 6, 21, 4.2, 140, -1.0, 6},
		{58321, "Hefei", 117.28, 31.86, 30.4, 22.8, 1009.7, 4, 2, 3.6, 110, -0.4, 7},
		{58847, "Fuzhou", 119.30, 26.08, 32.0, 24.8, 1007.1, 6, 2, 4.1, 120, -1.2, 8},
		{58606, "Nanchang", 115.89, 28.68, 32.8, 25.4, 1007.5, 5, 2, 3.8, 160, -0.9, 7},
		{54823, "Jinan", 117.00, 36.65, 29.8, 19.2, 1010.8, 3, 0, 3.5, 180, 0.5, 3},
		{54857, "Qingdao", 120.38, 36.07, 26.5, 22.1, 1011.5, 7, 10, 5.2, 150, 0.2, 3},
		{58562, "Ningbo", 121.55, 29.87, 31.8, 24.6, 1008.4, 6, 21, 4.9, 130, -0.9, 6},
		{58659, "Wenzhou", 120.67, 28.00, 31.2, 25.2, 1007.8, 7, 80, 4.6, 110, -1.4, 8},
		{59134, "Xiamen", 118.08, 24.48, 31.6, 25.8, 1006.9, 5, 2, 5.4, 170, -1.1, 7},
		{58027, "Xuzhou", 117.18, 34.27, 29.5, 20.8, 1010.2, 4, 2, 3.7, 130, 0.3, 3},
		{58158, "Yancheng", 120.13, 33.38, 28.8, 22.0, 1010.0, 5, 2, 4.5, 120, -0.2, 7},
		{58531, "Huangshan", 118.33, 29.72, 28.0, 21.5, 1009.0, 6, 61, 2.5, 90, -0.8, 6},
		{58927, "Ganzhou", 114.93, 25.83, 33.2, 25.6, 1006.8, 4, 2, 3.0, 190, -1.0, 7},

		// Central China
		{57494, "Wuhan", 114.31, 30.59, 29.4, 22.8, 1009.5, 7, 61, 4.0, 90, -0.6, 6},
		{57687, "Changsha", 112.98, 28.20, 31.8, 24.5, 1008.2, 6, 21, 3.2, 170, -0.9, 7},
		{57083, "Zhengzhou", 113.67, 34.76, 29.8, 19.8, 1010.6, 3, 0, 3.4, 150, 0.6, 3},
		{57461, "Yichang", 111.28, 30.69, 28.6, 22.0, 1010.1, 7, 61, 2.6, 80, -0.5, 6},
		{57265, "Xiangyang", 112.14, 32.04, 29.0, 21.2, 1010.8, 5, 2, 3.0, 100, 0.1, 3},
		{57872, "Hengyang", 112.61, 26.89, 32.5, 25.0, 1007.6, 5, 2, 3.5, 180, -1.1, 7},
		{57558, "Zhangjiajie", 110.48, 29.13, 28.2, 21.8, 1009.8, 8, 80, 2.2, 120, -0.7, 6},
		{57073, "Luoyang", 112.45, 34.62, 28.5, 18.6, 1011.4, 3, 0, 2.9, 160, 0.8, 2},
		{57178, "Nanyang", 112.53, 33.00, 29.2, 20.5, 1010.9, 4, 2, 3.1, 140, 0.3, 3},

		// South China
		{59287, "Guangzhou", 113.26, 23.13, 33.1, 26.0, 1006.2, 5, 80, 3.5, 210, -1.5, 8},
		{59493, "Shenzhen", 114.05, 22.54, 32.4, 26.2, 1006.5, 6, 21, 4.8, 190, -1.3, 8},
		{59431, "Nanning", 108.33, 22.82, 32.8, 25.5, 1006.0, 5, 80, 3.2, 180, -1.4, 8},
		{59981, "Haikou", 110.33, 20.03, 32.8, 26.5, 1005.4, 5, 25, 4.8, 150, -1.6, 8},
		{59948, "Sanya", 109.51, 18.25, 31.5, 26.8, 1005.0, 6, 80, 5.2, 135, -1.8, 8},
		{57957, "Guilin", 110.29, 25.27, 31.4, 24.2, 1007.8, 6, 21, 2.8, 170, -1.0, 7},
		{59046, "Liuzhou", 109.40, 24.32, 32.2, 24.8, 1006.8, 5, 2, 3.0, 190, -1.2, 7},
		{59644, "Beihai", 109.12, 21.48, 32.0, 26.2, 1005.8, 5, 2, 4.5, 160, -1.5, 8},
		{59316, "Shantou", 116.68, 23.37, 32.6, 25.7, 1006.6, 5, 2, 4.2, 140, -1.2, 7},
		{59658, "Zhanjiang", 110.37, 21.20, 32.5, 26.4, 1005.6, 5, 80, 4.6, 170, -1.6, 8},
		{45005, "Hong Kong", 114.17, 22.31, 32.0, 26.5, 1006.3, 6, 21, 5.0, 180, -1.4, 8},
		{46692, "Taipei", 121.52, 25.04, 33.0, 25.2, 1006.8, 4, 2, 3.6, 120, -1.1, 7},
		{46749, "Kaohsiung", 120.30, 22.62, 32.2, 26.0, 1006.1, 5, 2, 4.0, 150, -1.3, 8},

		// Southwest China
		{56294, "Chengdu", 104.07, 30.67, 26.8, 21.0, 1011.0, 8, 51, 2.1, 45, -0.2, 3},
		{57516, "Chongqing", 106.55, 29.56, 30.2, 23.5, 1008.0, 7, 10, 2.5, 160, -0.8, 7},
		{56778, "Kunming", 102.71, 25.04, 22.5, 16.0, 1013.2, 6, 80, 3.4, 220, -0.5, 3},
		{57816, "Guiyang", 106.71, 26.57, 26.0, 20.5, 1010.5, 7, 61, 2.8, 150, -0.7, 6},
		{55591, "Lhasa", 91.13, 29.65, 18.2, 6.0, 1022.0, 4, 15, 6.1, 195, 0.5, 2},
		{56196, "Mianyang", 104.74, 31.47, 27.2, 20.8, 1011.4, 7, 10, 2.0, 60, 0.0, 3},
		{56492, "Yibin", 104.62, 28.77, 28.8, 22.5, 1009.6, 7, 61, 2.3, 110, -0.5, 6},
		{56571, "Xichang", 102.26, 27.90, 25.0, 17.5, 1012.0, 5, 2, 3.2, 180, -0.3, 3},
		{56751, "Dali", 100.23, 25.59, 21.8, 15.2, 1013.8, 6, 80, 4.0, 210, -0.4, 3},
		{56651, "Lijiang", 100.23, 26.87, 19.5, 13.0, 1015.0, 7, 61, 3.5, 200, -0.2, 3},
		{55578, "Shigatse", 88.88, 29.27, 16.5, 4.2, 1023.5, 3, 0, 5.8, 220, 0.8, 1},
		{56312, "Nyingchi", 94.36, 29.65, 19.0, 11.2, 1018.5, 6, 61, 3.0, 170, 0.1, 3},

		// Northwest China
		{57036, "Xi'an", 108.94, 34.34, 28.5, 19.2, 1013.1, 3, 2, 3.8, 270, 0.8, 2},
		{52889, "Lanzhou", 103.82, 36.06, 25.1, 14.5, 1015.0, 3, 0, 3.2, 250, 1.2, 1},
		{52866, "Xining", 101.78, 36.62, 20.8, 9.5, 1017.5, 4, 1, 3.6, 260, 1.4, 1},
		{53614, "Yinchuan", 106.27, 38.47, 26.4, 12.0, 1014.8, 2, 0, 4.5, 310, 1.6, 1},
		{51463, "Urumqi", 87.62, 43.83, 24.5, 8.5, 1018.4, 1, 0, 5.2, 290, 2.2, 1},
		{53845, "Yan'an", 109.49, 36.59, 25.8, 14.0, 1014.0, 2, 0, 3.6, 280, 1.1, 2},
		{52533, "Jiuquan", 98.52, 39.74, 25.0, 7.2, 1017.0, 1, 0, 5.0, 300, 2.0, 1},
		{52418, "Dunhuang", 94.66, 40.14, 27.5, 5.0, 1016.2, 0, 0, 4.8, 270, 1.9, 1},
		{52818, "Golmud", 94.90, 36.40, 19.2, 4.0, 1020.5, 2, 0, 5.5, 240, 1.5, 1},
		{51709, "Kashgar", 75.99, 39.47, 28.0, 9.0, 1015.5, 2, 0, 4.2, 70, 1.7, 1},
		{51644, "Korla", 86.15, 41.76, 29.2, 8.2, 1014.5, 1, 0, 4.6, 60, 1.5, 1},
		{51828, "Hotan", 79.92, 37.11, 28.8, 7.5, 1015.0, 2, 5, 3.8, 90, 1.6, 1},
		{52203, "Hami", 93.52, 42.83, 29.5, 6.0, 1014.2, 0, 0, 5.8, 30, 2.1, 1},
		{51076, "Altay", 88.13, 47.85, 19.5, 6.8, 1020.0, 1, 0, 4.5, 320, 2.5, 1},
		{51431, "Yining", 81.33, 43.92, 23.8, 10.2, 1017.2, 2, 0, 3.8, 260, 1.8, 1},
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
				"press_diff_3h": s.P3,
				"press_tend":    s.Pt,
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
	if slp <= 0 || slp > 1100 || slp < 800 {
		return "---"
	}
	val := int(math.Round(float64(slp * 10)))
	return fmt.Sprintf("%03d", val%1000)
}
