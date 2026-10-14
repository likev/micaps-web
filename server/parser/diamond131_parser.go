package parser

import (
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"time"

	"micaps-web/model"
)

// Diamond131Header defines the 1024-byte header of MICAPS Diamond 131 SWAN format
type Diamond131Header struct {
	ZonName        string
	DataName       string
	Flag           string
	Version        string
	Year           uint16
	Month          uint16
	Day            uint16
	Hour           uint16
	Minute         uint16
	Interval       uint16
	XNumGrids      uint16
	YNumGrids      uint16
	ZNumGrids      uint16
	RadarCount     int32
	StartLon       float32
	StartLat       float32
	CenterLon      float32
	CenterLat      float32
	XReso          float32
	YReso          float32
	ZhighGrids     [40]float32
	DataType       int16
	LevelDimension int16
	InitTime       time.Time
}

// ParseDiamond131Header parses the 1024-byte binary header
func ParseDiamond131Header(data []byte) (*Diamond131Header, error) {
	if len(data) < 1024 {
		return nil, fmt.Errorf("insufficient bytes for Diamond 131 header: got %d, expected at least 1024", len(data))
	}

	zonName := strings.TrimSpace(cleanString(data[0:12]))
	if !strings.EqualFold(zonName, "diamond 131") {
		return nil, fmt.Errorf("invalid Diamond 131 magic: %q", zonName)
	}

	flag := strings.TrimSpace(cleanString(data[50:58]))
	version := strings.TrimSpace(cleanString(data[58:66]))

	h := &Diamond131Header{
		ZonName:        zonName,
		DataName:       strings.TrimSpace(cleanString(data[12:50])),
		Flag:           flag,
		Version:        version,
		Year:           binary.LittleEndian.Uint16(data[66:68]),
		Month:          binary.LittleEndian.Uint16(data[68:70]),
		Day:            binary.LittleEndian.Uint16(data[70:72]),
		Hour:           binary.LittleEndian.Uint16(data[72:74]),
		Minute:         binary.LittleEndian.Uint16(data[74:76]),
		Interval:       binary.LittleEndian.Uint16(data[76:78]),
		XNumGrids:      binary.LittleEndian.Uint16(data[78:80]),
		YNumGrids:      binary.LittleEndian.Uint16(data[80:82]),
		ZNumGrids:      binary.LittleEndian.Uint16(data[82:84]),
		RadarCount:     int32(binary.LittleEndian.Uint32(data[84:88])),
		StartLon:       math.Float32frombits(binary.LittleEndian.Uint32(data[88:92])),
		StartLat:       math.Float32frombits(binary.LittleEndian.Uint32(data[92:96])),
		CenterLon:      math.Float32frombits(binary.LittleEndian.Uint32(data[96:100])),
		CenterLat:      math.Float32frombits(binary.LittleEndian.Uint32(data[100:104])),
		XReso:          math.Float32frombits(binary.LittleEndian.Uint32(data[104:108])),
		YReso:          math.Float32frombits(binary.LittleEndian.Uint32(data[108:112])),
		DataType:       int16(binary.LittleEndian.Uint16(data[852:854])),
		LevelDimension: int16(binary.LittleEndian.Uint16(data[854:856])),
	}

	for i := 0; i < 40; i++ {
		offset := 112 + i*4
		h.ZhighGrids[i] = math.Float32frombits(binary.LittleEndian.Uint32(data[offset : offset+4]))
	}

	// Default to u2 for older formats without m_iDataType
	if h.Version != "" && h.Version < "1.5" {
		h.DataType = 2
	}
	if h.LevelDimension <= 0 {
		h.LevelDimension = 1
	}

	year := int(h.Year)
	if year < 100 {
		year += 2000
	}
	h.InitTime = time.Date(year, time.Month(h.Month), int(h.Day), int(h.Hour), int(h.Minute), 0, 0, time.UTC)

	return h, nil
}

// ParseDiamond131 decodes Diamond 131 radar mosaic into GridResponse
func ParseDiamond131(data []byte, targetLevel float64) (*model.GridResponse, error) {
	// Auto-unwrap GZIP and BZIP2 wrappers
	unwrapped, err := UnwrapPayload(data)
	if err != nil {
		return nil, fmt.Errorf("failed to unwrap Diamond 131 payload: %w", err)
	}

	hdr, err := ParseDiamond131Header(unwrapped)
	if err != nil {
		return nil, err
	}

	nLon := int(hdr.XNumGrids)
	nLat := int(hdr.YNumGrids)
	nLev := int(hdr.ZNumGrids)
	if nLev <= 0 {
		nLev = 1
	}
	totalPointsPerLevel := nLon * nLat
	if totalPointsPerLevel <= 0 || totalPointsPerLevel > 20000000 {
		return nil, fmt.Errorf("invalid Diamond 131 grid dimensions: %d x %d", nLon, nLat)
	}

	// Determine byte length per point:
	// m_iDataType: 0 -> u1 (1 byte), 1 -> u1 (1 byte), 2 -> u2 (2 bytes), 3 -> i2 (2 bytes)
	bytesPerVal := 1
	if hdr.DataType >= 2 {
		bytesPerVal = 2
	}

	dims := int(hdr.LevelDimension)
	if dims <= 0 {
		dims = 1
	}
	levelBytes := totalPointsPerLevel * bytesPerVal * dims
	totalExpectedDataBytes := nLev * levelBytes

	payload := unwrapped[1024:]
	if len(payload) < totalExpectedDataBytes {
		return nil, fmt.Errorf("Diamond 131 payload too short: got %d, expected %d", len(payload), totalExpectedDataBytes)
	}

	// Select vertical slice
	selectedLevelIdx := 0
	if targetLevel > 0 && nLev > 1 {
		// Match requested height in meters or km
		targetKm := float32(targetLevel)
		if targetKm > 100 { // In meters
			targetKm = targetKm / 1000.0
		}
		closestDist := float32(1e9)
		for l := 0; l < nLev; l++ {
			dist := float32(math.Abs(float64(hdr.ZhighGrids[l] - targetKm)))
			if dist < closestDist {
				closestDist = dist
				selectedLevelIdx = l
			}
		}
	}

	// Coordinate conventions:
	// Half-cell offset: lon = StartLon + i*XReso - XReso/2; lat = StartLat - j*YReso - YReso/2
	dLon := float64(hdr.XReso)
	dLat := float64(hdr.YReso)
	xCoords := make([]float64, nLon)
	for i := 0; i < nLon; i++ {
		xCoords[i] = float64(hdr.StartLon) + float64(i)*dLon - dLon/2.0
	}

	// Note: Rows in raw payload start at top-left (North) with latitude decreasing.
	// Standard web grid representation has Y ascending from South to North.
	// Therefore, we reverse Y so that j=0 is the south-most row.
	yCoords := make([]float64, nLat)
	for j := 0; j < nLat; j++ {
		// South-to-north ascending coordinates:
		// North-most lat: hdr.StartLat - dLat/2.0
		// South-most lat: hdr.StartLat - float64(nLat-1)*dLat - dLat/2.0
		yCoords[j] = (float64(hdr.StartLat) - float64(nLat-1)*dLat - dLat/2.0) + float64(j)*dLat
	}

	selectedLevelOffset := selectedLevelIdx * levelBytes
	levelPayload := payload[selectedLevelOffset : selectedLevelOffset+levelBytes]

	gridHdr := model.GridHeader{
		Discriminator:       "diamond 131",
		DataType:            4,
		ModelName:           "SWAN",
		Element:             hdr.DataName,
		Description:         fmt.Sprintf("SWAN %s", hdr.DataName),
		Level:               hdr.ZhighGrids[selectedLevelIdx] * 1000.0, // convert km to meters
		Year:                int32(hdr.Year),
		Month:               int32(hdr.Month),
		Day:                 int32(hdr.Day),
		Hour:                int32(hdr.Hour),
		Period:              int32(hdr.Interval),
		StartLongitude:      float32(xCoords[0]),
		EndLongitude:        float32(xCoords[nLon-1]),
		LongitudeGridSpace:  hdr.XReso,
		LongitudeGridNumber: int32(nLon),
		StartLatitude:       float32(yCoords[0]),
		EndLatitude:         float32(yCoords[nLat-1]),
		LatitudeGridSpace:   hdr.YReso,
		LatitudeGridNumber:  int32(nLat),
		InitTime:            hdr.InitTime,
		ValidTime:           hdr.InitTime.Add(time.Duration(hdr.Interval) * time.Minute),
	}

	resp := &model.GridResponse{
		Header: gridHdr,
		X:      xCoords,
		Y:      yCoords,
	}

	if dims == 2 {
		// Vector components (COTRECWIND): first block is U, second block is V
		gridHdr.DataType = 11
		resp.Header = gridHdr
		resp.U = make([]float32, totalPointsPerLevel)
		resp.V = make([]float32, totalPointsPerLevel)
		resp.Values = make([]float32, totalPointsPerLevel)

		blockBytes := totalPointsPerLevel * bytesPerVal
		uPayload := levelPayload[0:blockBytes]
		vPayload := levelPayload[blockBytes : 2*blockBytes]

		var minVal, maxVal, sumVal float32
		minVal = math.MaxFloat32
		maxVal = -math.MaxFloat32
		validCount := 0

		for j := 0; j < nLat; j++ {
			// Flip latitude: row j in web coordinates corresponds to raw row (nLat - 1 - j)
			rawRow := nLat - 1 - j
			for i := 0; i < nLon; i++ {
				dstIdx := j*nLon + i
				srcIdx := rawRow*nLon + i

				var u, v float32
				if bytesPerVal == 1 {
					rawU := uPayload[srcIdx]
					rawV := vPayload[srcIdx]
					u = (float32(rawU) - 66.0) * 0.5
					v = (float32(rawV) - 66.0) * 0.5
				} else {
					var rawU, rawV int16
					if hdr.DataType == 3 {
						rawU = int16(binary.LittleEndian.Uint16(uPayload[srcIdx*2 : (srcIdx+1)*2]))
						rawV = int16(binary.LittleEndian.Uint16(vPayload[srcIdx*2 : (srcIdx+1)*2]))
					} else {
						rawU = int16(binary.LittleEndian.Uint16(uPayload[srcIdx*2 : (srcIdx+1)*2]))
						rawV = int16(binary.LittleEndian.Uint16(vPayload[srcIdx*2 : (srcIdx+1)*2]))
					}
					u = float32(rawU) * 0.1
					v = float32(rawV) * 0.1
				}

				resp.U[dstIdx] = u
				resp.V[dstIdx] = v
				speed := float32(math.Hypot(float64(u), float64(v)))
				resp.Values[dstIdx] = speed

				if speed < minVal {
					minVal = speed
				}
				if speed > maxVal {
					maxVal = speed
				}
				sumVal += speed
				validCount++
			}
		}

		if validCount > 0 {
			resp.Stats = model.GridStats{
				Min:  minVal,
				Max:  maxVal,
				Mean: sumVal / float32(validCount),
			}
		}
		return resp, nil
	}

	// Scalar field (MCR, MTOP, MVIL, QPE, etc.)
	resp.Values = make([]float32, totalPointsPerLevel)
	var minVal, maxVal, sumVal float32
	minVal = math.MaxFloat32
	maxVal = -math.MaxFloat32
	validCount := 0

	for j := 0; j < nLat; j++ {
		// Flip latitude row: row j corresponds to raw row (nLat - 1 - j)
		rawRow := nLat - 1 - j
		for i := 0; i < nLon; i++ {
			dstIdx := j*nLon + i
			srcIdx := rawRow*nLon + i

			var val float32
			if bytesPerVal == 1 {
				raw := levelPayload[srcIdx]
				if raw == 0 {
					val = -9999.0 // Missing / clear air sentinel
				} else {
					// Physical scaling: dBZ = (raw - 66) / 2
					val = (float32(raw) - 66.0) * 0.5
				}
			} else {
				if hdr.DataType == 3 {
					raw := int16(binary.LittleEndian.Uint16(levelPayload[srcIdx*2 : (srcIdx+1)*2]))
					if raw <= 0 {
						val = -9999.0
					} else {
						val = float32(raw) * 0.1
					}
				} else {
					raw := binary.LittleEndian.Uint16(levelPayload[srcIdx*2 : (srcIdx+1)*2])
					if raw == 0 || raw >= 65530 {
						val = -9999.0
					} else {
						val = float32(raw) * 0.1
					}
				}
			}

			resp.Values[dstIdx] = val
			if val > -9990.0 {
				if val < minVal {
					minVal = val
				}
				if val > maxVal {
					maxVal = val
				}
				sumVal += val
				validCount++
			}
		}
	}

	if validCount > 0 {
		resp.Stats = model.GridStats{
			Min:  minVal,
			Max:  maxVal,
			Mean: sumVal / float32(validCount),
		}
	} else {
		resp.Stats = model.GridStats{
			Min:  0,
			Max:  0,
			Mean: 0,
		}
	}

	return resp, nil
}

// UnwrapPayload decompresses outer GZIP and inner BZIP2 wrappers if present
func UnwrapPayload(data []byte) ([]byte, error) {
	decomp := data
	// Check outer GZIP magic 1f 8b
	if len(decomp) >= 2 && decomp[0] == 0x1f && decomp[1] == 0x8b {
		d, err := DecompressGzip(decomp)
		if err != nil {
			return nil, err
		}
		decomp = d
	}
	// Check inner BZIP2 magic BZh
	if len(decomp) >= 3 && decomp[0] == 'B' && decomp[1] == 'Z' && decomp[2] == 'h' {
		d, err := DecompressBzip2(decomp)
		if err != nil {
			return nil, err
		}
		decomp = d
	}
	return decomp, nil
}

// GetDiamond131Levels returns the vertical levels in meters from Diamond 131 payload
func GetDiamond131Levels(data []byte) ([]int, error) {
	unwrapped, err := UnwrapPayload(data)
	if err != nil {
		return nil, err
	}
	hdr, err := ParseDiamond131Header(unwrapped)
	if err != nil {
		return nil, err
	}
	nLev := int(hdr.ZNumGrids)
	if nLev <= 0 {
		return []int{0}, nil
	}
	levels := make([]int, 0, nLev)
	for i := 0; i < nLev; i++ {
		levels = append(levels, int(math.Round(float64(hdr.ZhighGrids[i]*1000.0))))
	}
	return levels, nil
}
