package parser

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"strings"

	"micaps-web/model"
)

// ErrOutOfDomain is returned when requested coordinates lie outside the grid's domain
var ErrOutOfDomain = errors.New("coordinates out of grid domain")

// SampledPoint holds the interpolated point results and snapped coordinates
type SampledPoint struct {
	Valid      bool             `json:"valid"`
	Scalar     float64          `json:"scalar"`
	U          float64          `json:"u"`
	V          float64          `json:"v"`
	SnappedLon float64          `json:"snapped_lon"`
	SnappedLat float64          `json:"snapped_lat"`
	GridI      int              `json:"grid_i"`
	GridJ      int              `json:"grid_j"`
	DataType   int16            `json:"data_type"`
	Header     model.GridHeader `json:"header"`
}

// IsValidScalar validates meteorological range for scalar values
func IsValidScalar(val float64, element string) bool {
	if math.IsNaN(val) || math.IsInf(val, 0) {
		return false
	}
	if val >= 9000 || val <= -9000 {
		return false
	}
	switch strings.ToUpper(element) {
	case "RH":
		return val >= -5 && val <= 160
	case "TMP":
		return val >= -100 && val <= 70
	case "VVEL":
		return val >= -2000 && val <= 2000
	default:
		return true
	}
}

// DetectWindSpeedDir determines whether Diamond 11 vector grid encodes (Speed, Dir) or (U, V)
func DetectWindSpeedDir(payload []byte, totalPoints int) bool {
	hasLargeAngle := false
	hasNegative := false
	for i := 0; i < totalPoints; i += 20 {
		b1 := math.Float32frombits(binary.LittleEndian.Uint32(payload[i*4 : (i+1)*4]))
		b2 := math.Float32frombits(binary.LittleEndian.Uint32(payload[totalPoints*4+i*4 : totalPoints*4+(i+1)*4]))
		if math.IsNaN(float64(b1)) || math.IsNaN(float64(b2)) || b1 < -9000 || b2 < -9000 {
			continue
		}
		if b1 < -0.01 || b2 < -0.01 {
			hasNegative = true
		}
		if b2 > 60.0 && b2 <= 360.0 {
			hasLargeAngle = true
		}
	}
	return hasLargeAngle && !hasNegative
}

// SampleGridPoint samples the decompressed MICAPS grid at (lon, lat) using a 4-point stencil
func SampleGridPoint(decompressed []byte, lon, lat float64, element string) (*SampledPoint, error) {
	header, err := ParseGridHeader(decompressed)
	if err != nil {
		return nil, err
	}

	nLon := int(header.LongitudeGridNumber)
	nLat := int(header.LatitudeGridNumber)
	totalPoints := nLon * nLat
	if totalPoints <= 0 || totalPoints > 20000000 {
		return nil, fmt.Errorf("invalid grid dimensions: %d x %d", nLon, nLat)
	}

	if len(decompressed) < 278 {
		return nil, fmt.Errorf("insufficient bytes for header")
	}
	payload := decompressed[278:]

	dLon := float64(header.LongitudeGridSpace)
	if nLon > 1 && header.EndLongitude != header.StartLongitude {
		dLon = float64(header.EndLongitude-header.StartLongitude) / float64(nLon-1)
	} else if dLon == 0 {
		dLon = 0.25
	}

	dLat := float64(header.LatitudeGridSpace)
	if nLat > 1 && header.EndLatitude != header.StartLatitude {
		dLat = float64(header.EndLatitude-header.StartLatitude) / float64(nLat-1)
	} else if header.StartLatitude > header.EndLatitude && dLat > 0 {
		dLat = -dLat
	} else if dLat == 0 {
		dLat = -0.25
	}

	gx := (lon - float64(header.StartLongitude)) / dLon
	gy := (lat - float64(header.StartLatitude)) / dLat

	// Boundary domain check with tolerance
	const eps = 1e-5
	maxLonIdx := float64(nLon - 1)
	maxLatIdx := float64(nLat - 1)

	if gx < -eps || gx > maxLonIdx+eps || gy < -eps || gy > maxLatIdx+eps {
		return nil, ErrOutOfDomain
	}

	if gx < 0 {
		gx = 0
	} else if gx > maxLonIdx {
		gx = maxLonIdx
	}
	if gy < 0 {
		gy = 0
	} else if gy > maxLatIdx {
		gy = maxLatIdx
	}

	// Snapped node
	gridI := int(math.Round(gx))
	if gridI < 0 {
		gridI = 0
	} else if gridI > nLon-1 {
		gridI = nLon - 1
	}

	gridJ := int(math.Round(gy))
	if gridJ < 0 {
		gridJ = 0
	} else if gridJ > nLat-1 {
		gridJ = nLat - 1
	}

	snappedLon := float64(header.StartLongitude) + float64(gridI)*dLon
	snappedLat := float64(header.StartLatitude) + float64(gridJ)*dLat
	snappedLon = math.Round(snappedLon*10000) / 10000
	snappedLat = math.Round(snappedLat*10000) / 10000

	x0 := int(math.Floor(gx))
	x1 := x0 + 1
	if x1 > nLon-1 {
		x1 = nLon - 1
	}

	y0 := int(math.Floor(gy))
	y1 := y0 + 1
	if y1 > nLat-1 {
		y1 = nLat - 1
	}

	fx := gx - float64(x0)
	fy := gy - float64(y0)

	w00 := (1 - fx) * (1 - fy)
	w10 := fx * (1 - fy)
	w01 := (1 - fx) * fy
	w11 := fx * fy

	idx00 := y0*nLon + x0
	idx10 := y0*nLon + x1
	idx01 := y1*nLon + x0
	idx11 := y1*nLon + x1

	targetElement := element
	if targetElement == "" {
		targetElement = header.Element
	}

	result := &SampledPoint{
		DataType:   header.DataType,
		Header:     header,
		SnappedLon: snappedLon,
		SnappedLat: snappedLat,
		GridI:      gridI,
		GridJ:      gridJ,
	}

	if header.DataType == 4 { // Scalar grid
		expectedBytes := totalPoints * 4
		if len(payload) < expectedBytes {
			return nil, fmt.Errorf("insufficient payload bytes for scalar grid: got %d, expected %d", len(payload), expectedBytes)
		}

		readVal := func(idx int) float64 {
			return float64(math.Float32frombits(binary.LittleEndian.Uint32(payload[idx*4 : (idx+1)*4])))
		}

		v00 := readVal(idx00)
		v10 := readVal(idx10)
		v01 := readVal(idx01)
		v11 := readVal(idx11)

		val00Valid := IsValidScalar(v00, targetElement)
		val10Valid := IsValidScalar(v10, targetElement)
		val01Valid := IsValidScalar(v01, targetElement)
		val11Valid := IsValidScalar(v11, targetElement)

		if val00Valid && val10Valid && val01Valid && val11Valid {
			result.Scalar = w00*v00 + w10*v10 + w01*v01 + w11*v11
			result.Valid = true
		} else {
			var sumWeight float64
			var sumVal float64
			if val00Valid {
				sumVal += w00 * v00
				sumWeight += w00
			}
			if val10Valid {
				sumVal += w10 * v10
				sumWeight += w10
			}
			if val01Valid {
				sumVal += w01 * v01
				sumWeight += w01
			}
			if val11Valid {
				sumVal += w11 * v11
				sumWeight += w11
			}
			if sumWeight > 0.001 {
				result.Scalar = sumVal / sumWeight
				result.Valid = true
			}
		}

		if result.Valid && strings.EqualFold(targetElement, "RH") {
			if result.Scalar < 0 {
				result.Scalar = 0
			} else if result.Scalar > 100 {
				result.Scalar = 100
			}
		}

		return result, nil

	} else if header.DataType == 11 { // Diamond 11: Vector Wind
		expectedBytes := totalPoints * 8
		if len(payload) < expectedBytes {
			return nil, fmt.Errorf("insufficient payload bytes for Diamond 11 vector grid: got %d, expected %d", len(payload), expectedBytes)
		}

		isSpeedDir := DetectWindSpeedDir(payload, totalPoints)

		readCorner := func(idx int) (float64, float64, bool) {
			b1 := math.Float32frombits(binary.LittleEndian.Uint32(payload[idx*4 : (idx+1)*4]))
			b2 := math.Float32frombits(binary.LittleEndian.Uint32(payload[totalPoints*4+idx*4 : totalPoints*4+(idx+1)*4]))
			if math.IsNaN(float64(b1)) || math.IsNaN(float64(b2)) || b1 <= -9000 || b2 <= -9000 || b1 >= 9000 || b2 >= 9000 {
				return 0, 0, false
			}
			var u, v float64
			if isSpeedDir {
				speed := float64(b1)
				rad := float64(b2) * math.Pi / 180.0
				u = float64(float32(speed * math.Cos(rad)))
				v = float64(float32(speed * math.Sin(rad)))
			} else {
				u = float64(b1)
				v = float64(b2)
			}
			if math.IsNaN(u) || math.IsNaN(v) || math.Abs(u) >= 9000 || math.Abs(v) >= 9000 {
				return 0, 0, false
			}
			return u, v, true
		}

		u00, v00, ok00 := readCorner(idx00)
		u10, v10, ok10 := readCorner(idx10)
		u01, v01, ok01 := readCorner(idx01)
		u11, v11, ok11 := readCorner(idx11)

		if ok00 && ok10 && ok01 && ok11 {
			result.U = w00*u00 + w10*u10 + w01*u01 + w11*u11
			result.V = w00*v00 + w10*v10 + w01*v01 + w11*v11
			result.Valid = true
		} else {
			var sumWeight float64
			var sumU float64
			var sumV float64
			if ok00 {
				sumU += w00 * u00
				sumV += w00 * v00
				sumWeight += w00
			}
			if ok10 {
				sumU += w10 * u10
				sumV += w10 * v10
				sumWeight += w10
			}
			if ok01 {
				sumU += w01 * u01
				sumV += w01 * v01
				sumWeight += w01
			}
			if ok11 {
				sumU += w11 * u11
				sumV += w11 * v11
				sumWeight += w11
			}
			if sumWeight > 0.001 {
				result.U = sumU / sumWeight
				result.V = sumV / sumWeight
				result.Valid = true
			}
		}

		return result, nil
	}

	return nil, fmt.Errorf("unsupported grid data type: %d", header.DataType)
}

// EncodeMICAPSDecompressed encodes a GridResponse into a valid 278-byte MICAPS header followed by float32 payload
func EncodeMICAPSDecompressed(resp *model.GridResponse) []byte {
	h := resp.Header
	nLon := int(h.LongitudeGridNumber)
	nLat := int(h.LatitudeGridNumber)
	total := nLon * nLat

	buf := make([]byte, 278)
	copy(buf[0:4], "mdfs")
	binary.LittleEndian.PutUint16(buf[4:6], uint16(h.DataType))
	copy(buf[6:26], h.ModelName)
	copy(buf[26:76], h.Element)
	copy(buf[76:106], h.Description)

	binary.LittleEndian.PutUint32(buf[106:110], math.Float32bits(h.Level))
	binary.LittleEndian.PutUint32(buf[110:114], uint32(h.Year))
	binary.LittleEndian.PutUint32(buf[114:118], uint32(h.Month))
	binary.LittleEndian.PutUint32(buf[118:122], uint32(h.Day))
	binary.LittleEndian.PutUint32(buf[122:126], uint32(h.Hour))
	binary.LittleEndian.PutUint32(buf[126:130], uint32(h.Timezone))
	binary.LittleEndian.PutUint32(buf[130:134], uint32(h.Period))

	binary.LittleEndian.PutUint32(buf[134:138], math.Float32bits(h.StartLongitude))
	binary.LittleEndian.PutUint32(buf[138:142], math.Float32bits(h.EndLongitude))
	binary.LittleEndian.PutUint32(buf[142:146], math.Float32bits(h.LongitudeGridSpace))
	binary.LittleEndian.PutUint32(buf[146:150], uint32(h.LongitudeGridNumber))

	binary.LittleEndian.PutUint32(buf[150:154], math.Float32bits(h.StartLatitude))
	binary.LittleEndian.PutUint32(buf[154:158], math.Float32bits(h.EndLatitude))
	binary.LittleEndian.PutUint32(buf[158:162], math.Float32bits(h.LatitudeGridSpace))
	binary.LittleEndian.PutUint32(buf[162:166], uint32(h.LatitudeGridNumber))

	var payload []byte
	if h.DataType == 4 {
		payload = make([]byte, total*4)
		for i := 0; i < total && i < len(resp.Values); i++ {
			binary.LittleEndian.PutUint32(payload[i*4:(i+1)*4], math.Float32bits(resp.Values[i]))
		}
	} else if h.DataType == 11 {
		payload = make([]byte, total*8)
		for i := 0; i < total && i < len(resp.U); i++ {
			binary.LittleEndian.PutUint32(payload[i*4:(i+1)*4], math.Float32bits(resp.U[i]))
		}
		for i := 0; i < total && i < len(resp.V); i++ {
			binary.LittleEndian.PutUint32(payload[total*4+i*4:total*4+(i+1)*4], math.Float32bits(resp.V[i]))
		}
	}

	return append(buf, payload...)
}

