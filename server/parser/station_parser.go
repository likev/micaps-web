package parser

import (
	"encoding/binary"
	"fmt"
	"math"

	"micaps-web/model"
)

// ParseStationData parses the 288-byte station observations and generates GeoJSON FeatureCollection
func ParseStationData(decompressed []byte) (*model.GeoJSONFeatureCollection, error) {
	if len(decompressed) < 294 {
		return nil, fmt.Errorf("data too short for station observations: %d bytes", len(decompressed))
	}

	idType := int16(binary.LittleEndian.Uint16(decompressed[272:274]))
	ind := 288
	stationNumber := int(binary.LittleEndian.Uint32(decompressed[ind : ind+4]))
	ind += 4
	elementNumber := int(binary.LittleEndian.Uint16(decompressed[ind : ind+2]))
	ind += 2

	if stationNumber <= 0 || stationNumber > 500000 {
		return nil, fmt.Errorf("invalid station count: %d", stationNumber)
	}

	// Element mapping: ID -> length and type
	type ElemDef struct {
		typeCode int16
		byteLen  int
	}
	elemMap := make(map[int16]ElemDef, elementNumber)

	for i := 0; i < elementNumber && ind+4 <= len(decompressed); i++ {
		eID := int16(binary.LittleEndian.Uint16(decompressed[ind : ind+2]))
		eType := int16(binary.LittleEndian.Uint16(decompressed[ind+2 : ind+4]))
		ind += 4

		bLen := 4
		switch eType {
		case 1:
			bLen = 1
		case 2:
			bLen = 2
		case 3, 5:
			bLen = 4
		case 4, 6:
			bLen = 8
		}
		elemMap[eID] = ElemDef{typeCode: eType, byteLen: bLen}
	}

	features := make([]model.GeoJSONFeature, 0, stationNumber)

	for s := 0; s < stationNumber && ind < len(decompressed); s++ {
		var stationID int32
		var lon, lat float32
		var numb int16

		if idType == 0 {
			if ind+14 > len(decompressed) {
				break
			}
			stationID = int32(binary.LittleEndian.Uint32(decompressed[ind : ind+4]))
			lon = math.Float32frombits(binary.LittleEndian.Uint32(decompressed[ind+4 : ind+8]))
			lat = math.Float32frombits(binary.LittleEndian.Uint32(decompressed[ind+8 : ind+12]))
			numb = int16(binary.LittleEndian.Uint16(decompressed[ind+12 : ind+14]))
			ind += 14
		} else {
			if ind+2 > len(decompressed) {
				break
			}
			idLen := int(binary.LittleEndian.Uint16(decompressed[ind : ind+2]))
			ind += 2
			if ind+idLen+10 > len(decompressed) {
				break
			}
			ind += idLen // Skip string ID for now
			lon = math.Float32frombits(binary.LittleEndian.Uint32(decompressed[ind : ind+4]))
			lat = math.Float32frombits(binary.LittleEndian.Uint32(decompressed[ind+4 : ind+8]))
			numb = int16(binary.LittleEndian.Uint16(decompressed[ind+8 : ind+10]))
			ind += 10
		}

		var temp, dewPoint, slp, stnPress, height, pDiff3h, windSpeed, windDir, vis, rain1h, rain6h, rain24h float32 = -9999, -9999, -9999, -9999, -9999, 0, 0, 0, 10, 0, 0, 0
		var dewDepression float32 = -9999
		var cloudCover, weatherCode, pTendency int16 = 0, 0, 0

		for e := 0; e < int(numb) && ind+2 <= len(decompressed); e++ {
			elemID := int16(binary.LittleEndian.Uint16(decompressed[ind : ind+2]))
			ind += 2

			def, ok := elemMap[elemID]
			bLen := def.byteLen
			if !ok || bLen <= 0 {
				bLen = 4
			}

			if def.typeCode == 7 { // String type has 2-byte prefix length
				if ind+2 <= len(decompressed) {
					strLen := int(binary.LittleEndian.Uint16(decompressed[ind : ind+2]))
					ind += 2 + strLen
				}
				continue
			}

			if ind+bLen > len(decompressed) {
				break
			}

			var valFloat float32
			var valInt int64

			switch def.typeCode {
			case 1:
				valInt = int64(decompressed[ind])
				valFloat = float32(valInt)
			case 2:
				valInt = int64(int16(binary.LittleEndian.Uint16(decompressed[ind : ind+2])))
				valFloat = float32(valInt)
			case 3:
				valInt = int64(int32(binary.LittleEndian.Uint32(decompressed[ind : ind+4])))
				valFloat = float32(valInt)
			case 5:
				valFloat = math.Float32frombits(binary.LittleEndian.Uint32(decompressed[ind : ind+4]))
				valInt = int64(valFloat)
			case 6:
				valFloat = float32(math.Float64frombits(binary.LittleEndian.Uint64(decompressed[ind : ind+8])))
				valInt = int64(valFloat)
			default:
				valFloat = math.Float32frombits(binary.LittleEndian.Uint32(decompressed[ind : ind+4]))
			}
			ind += bLen

			switch elemID {
			case 601, 2001, 23: // Temperature TT (°C)
				temp = normalizeTemp(valFloat)
			case 801, 2005, 24, 301, 302, 303, 304, 305, 2006: // Dew point Td (°C)
				dewPoint = normalizeTemp(valFloat)
			case 803, 802: // Dew point depression T - Td (Upper Air)
				if valFloat >= 0 && valFloat < 100 {
					dewDepression = valFloat
				}
			case 421, 1002, 1004, 1: // Geopotential Height (Upper Air decameters or gpm)
				height = normalizeHeight(valFloat)
			case 1003, 401, 5, 101: // Sea Level Pressure (SLP)
				slp = normalizePress(valFloat)
			case 1001, 402: // Station Pressure
				stnPress = normalizePress(valFloat)
				if slp <= -9000 || slp <= 0 {
					slp = stnPress
				}
			case 1005, 403, 6: // 3-hour pressure change
				pDiff3h = valFloat
			case 1007, 7, 404: // Pressure tendency
				pTendency = int16(valInt)
			case 1401, 20, 701, 702, 1402: // Cloud cover (0-8)
				cloudCover = int16(valInt)
			case 1601, 12, 901, 902: // Present weather code
				weatherCode = int16(valInt)
			case 201, 1101, 209, 21, 501: // Wind direction DD (0-360)
				windDir = valFloat
			case 203, 1102, 211, 22, 502: // Wind speed FF (m/s)
				windSpeed = valFloat
			case 1201, 1203, 1207, 27: // Visibility
				vis = valFloat
			case 1301, 11:
				rain1h = valFloat
			case 1302, 8:
				rain6h = valFloat
			case 1303, 9:
				rain24h = valFloat
			}
		}

		// In upper air soundings, compute dewpoint from temperature and dewpoint depression (Td = T - depression)
		if dewDepression >= 0 && temp > -9000 {
			if dewPoint <= -9000 || dewPoint > temp {
				dewPoint = temp - dewDepression
			}
		}

		if lon < -180 || lon > 180 || lat < -90 || lat > 90 || (lon == 0 && lat == 0) {
			continue
		}

		props := map[string]interface{}{
			"station_id":    stationID,
			"temperature":   round1(temp),
			"dewpoint":      round1(dewPoint),
			"height":        round1(height),
			"slp":           round1(slp),
			"press_stn":     round1(stnPress),
			"slp_encoded":   encodeSLP(slp),
			"press_diff_3h": round1(pDiff3h),
			"press_tend":    pTendency,
			"cloud_cover":   cloudCover,
			"weather_code":  weatherCode,
			"wind_speed":    round1(windSpeed),
			"wind_dir":      round1(windDir),
			"visibility":    round1(vis),
			"rain_1h":       round1(rain1h),
			"rain_6h":       round1(rain6h),
			"rain_24h":      round1(rain24h),
		}

		features = append(features, model.GeoJSONFeature{
			Type: "Feature",
			Geometry: model.GeoJSONGeometry{
				Type:        "Point",
				Coordinates: []float64{float64(lon), float64(lat)},
			},
			Properties: props,
		})
	}

	return &model.GeoJSONFeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}, nil
}

func normalizeTemp(val float32) float32 {
	if val < -9000 || val > 9000 || val == 9999.0 || val == 999.0 || val == -999.0 {
		return -9999
	}
	if val > 150 && val < 373.15 { // Kelvin
		return val - 273.15
	}
	if (val > 60 && val <= 600) || (val < -60 && val >= -600) { // Tenths of °C
		return val / 10.0
	}
	if val > 600 && val <= 6000 { // Hundredths of °C
		return val / 100.0
	}
	return val
}

func normalizePress(val float32) float32 {
	if val < -9000 || val > 9000 || val <= 0 || val == 9999.0 || val == 999.0 {
		return -9999
	}
	// MICAPS Diamond 1 / 3 standard 3-digit sea-level pressure decoding:
	// If val <= 600: val/10 + 1000 (e.g. 124 -> 1012.4 hPa, 36 -> 1003.6 hPa)
	// If val > 600 and < 800: val/10 + 900 (e.g. 984 -> 998.4 hPa, 850 -> 985.0 hPa)
	if val > 0 && val <= 600 {
		return val/10.0 + 1000.0
	}
	if val > 600 && val < 800 {
		return val/10.0 + 900.0
	}
	if val >= 800 && val <= 1100 { // Standard hPa
		return val
	}
	if val > 8000 && val < 11000 { // Tenths of hPa (e.g. 10124 -> 1012.4 hPa)
		return val / 10.0
	}
	if val >= 80000 && val <= 110000 { // Pascals to hPa (e.g. 101325 Pa -> 1013.25 hPa)
		return val / 100.0
	}
	return val
}

func normalizeHeight(val float32) float32 {
	if val < -9000 || val > 90000 || val == 9999.0 || val == 999.0 {
		return -9999
	}
	// MICAPS decameters (e.g. 588 decameters -> 5880 gpm)
	if val > 100 && val < 1000 {
		return val * 10.0
	}
	return val
}

func encodeSLP(slp float32) string {
	if slp <= 0 || slp > 1100 || slp < 800 {
		return "---"
	}
	val := int(math.Round(float64(slp * 10)))
	return fmt.Sprintf("%03d", val%1000)
}

func round1(val float32) float32 {
	if val < -9900 {
		return -9999
	}
	return float32(math.Round(float64(val)*10) / 10)
}
