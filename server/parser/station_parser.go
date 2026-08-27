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

	features := make([]model.GeoJSONFeature, 0, 3000)

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

		var temp, dewPoint, slp, pDiff3h, windSpeed, windDir, vis, rain1h, rain6h, rain24h float32 = -9999, -9999, -9999, 0, 0, 0, 10, 0, 0, 0
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
			case 2001:
				temp = valFloat
			case 2005:
				dewPoint = valFloat
			case 1001, 1003:
				slp = valFloat
			case 1005:
				pDiff3h = valFloat
				pTendency = int16(valInt)
			case 1401:
				cloudCover = int16(valInt)
			case 1601:
				weatherCode = int16(valInt)
			case 1101:
				windDir = valFloat
			case 1102:
				windSpeed = valFloat
			case 1201, 1203:
				vis = valFloat
			case 1301:
				rain1h = valFloat
			case 1302:
				rain6h = valFloat
			case 1303:
				rain24h = valFloat
			}
		}

		if lon < -180 || lon > 180 || lat < -90 || lat > 90 || (lon == 0 && lat == 0) {
			continue
		}

		props := map[string]interface{}{
			"station_id":    stationID,
			"temperature":   round1(temp),
			"dewpoint":      round1(dewPoint),
			"slp":           round1(slp),
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

		// Limit to 4000 stations max per response for fast transmission
		if len(features) >= 4000 {
			break
		}
	}

	return &model.GeoJSONFeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}, nil
}

func encodeSLP(slp float32) string {
	if slp <= 0 || slp > 1100 {
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
