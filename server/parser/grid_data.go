package parser

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"math"

	"micaps-web/model"
)

// ParseGridData decodes the full grid payload (Type 4 or Type 11)
func ParseGridData(decompressed []byte) (*model.GridResponse, error) {
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

	payload := decompressed[278:]
	resp := &model.GridResponse{
		Header: header,
		X:      make([]float64, nLon),
		Y:      make([]float64, nLat),
	}

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

	// Generate longitude coordinate array
	for i := 0; i < nLon; i++ {
		resp.X[i] = float64(header.StartLongitude) + float64(i)*dLon
	}
	// Generate latitude coordinate array
	for j := 0; j < nLat; j++ {
		resp.Y[j] = float64(header.StartLatitude) + float64(j)*dLat
	}
	header.LongitudeGridSpace = float32(dLon)
	header.LatitudeGridSpace = float32(dLat)
	header.EndLongitude = float32(resp.X[nLon-1])
	header.EndLatitude = float32(resp.Y[nLat-1])
	resp.Header = header

	if header.DataType == 4 { // Scalar grid
		expectedBytes := totalPoints * 4
		if len(payload) < expectedBytes {
			return nil, fmt.Errorf("insufficient payload bytes for scalar grid: got %d, expected %d", len(payload), expectedBytes)
		}

		resp.Values = make([]float32, totalPoints)
		var minVal, maxVal, sumVal float32
		minVal = math.MaxFloat32
		maxVal = -math.MaxFloat32

		for i := 0; i < totalPoints; i++ {
			bits := binary.LittleEndian.Uint32(payload[i*4 : (i+1)*4])
			val := math.Float32frombits(bits)
			resp.Values[i] = val

			if !math.IsNaN(float64(val)) && !math.IsInf(float64(val), 0) && val > -9990.0 {
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
			Mean: sumVal / float32(totalPoints),
		}
	} else if header.DataType == 11 { // Diamond 11: 2D Gridded Vector Wind Field
		expectedBytes := totalPoints * 8
		if len(payload) < expectedBytes {
			return nil, fmt.Errorf("insufficient payload bytes for Diamond 11 vector grid: got %d, expected %d", len(payload), expectedBytes)
		}

		resp.U = make([]float32, totalPoints)
		resp.V = make([]float32, totalPoints)
		resp.Values = make([]float32, totalPoints) // Wind speed magnitude

		// In MICAPS ECMWF_HR wind grids, Block 1 is Speed (magnitude) and Block 2 is Direction in degrees [0, 360].
		// In pure UV grids, Block 1 is U (m/s) and Block 2 is V (m/s).
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

		isSpeedDir := hasLargeAngle && !hasNegative

		var maxSpeed float32 = 0
		var sumSpeed float32 = 0
		for i := 0; i < totalPoints; i++ {
			b1 := math.Float32frombits(binary.LittleEndian.Uint32(payload[i*4 : (i+1)*4]))
			b2 := math.Float32frombits(binary.LittleEndian.Uint32(payload[totalPoints*4+i*4 : totalPoints*4+(i+1)*4]))

			var u, v, speed float32
			if isSpeedDir {
				speed = b1
				rad := float64(b2) * math.Pi / 180.0
				u = float32(float64(speed) * math.Cos(rad))
				v = float32(float64(speed) * math.Sin(rad))
			} else {
				u = b1
				v = b2
				speed = float32(math.Hypot(float64(u), float64(v)))
			}

			resp.U[i] = u
			resp.V[i] = v
			resp.Values[i] = speed
			if speed > maxSpeed {
				maxSpeed = speed
			}
			sumSpeed += speed
		}

		resp.Stats = model.GridStats{
			Min:  0,
			Max:  maxSpeed,
			Mean: sumSpeed / float32(totalPoints),
		}
	}

	return resp, nil
}

// EncodeBinaryStream encodes a 32-byte header followed by raw float32 bytes for zero-copy client streaming
func EncodeBinaryStream(resp *model.GridResponse) []byte {
	var buf bytes.Buffer
	h := resp.Header

	startLon := h.StartLongitude
	endLon := h.EndLongitude
	if len(resp.X) > 1 {
		endLon = float32(resp.X[len(resp.X)-1])
	}
	startLat := h.StartLatitude
	endLat := h.EndLatitude
	if len(resp.Y) > 1 {
		endLat = float32(resp.Y[len(resp.Y)-1])
	}

	// 32-byte Header
	binary.Write(&buf, binary.LittleEndian, startLon)
	binary.Write(&buf, binary.LittleEndian, endLon)
	binary.Write(&buf, binary.LittleEndian, startLat)
	binary.Write(&buf, binary.LittleEndian, endLat)
	binary.Write(&buf, binary.LittleEndian, h.LongitudeGridNumber)
	binary.Write(&buf, binary.LittleEndian, h.LatitudeGridNumber)
	binary.Write(&buf, binary.LittleEndian, resp.Stats.Min)
	binary.Write(&buf, binary.LittleEndian, resp.Stats.Max)

	// Append raw float32 grid values
	for _, val := range resp.Values {
		binary.Write(&buf, binary.LittleEndian, val)
	}

	return buf.Bytes()
}
