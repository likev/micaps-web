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

	// Generate longitude coordinate array
	for i := 0; i < nLon; i++ {
		resp.X[i] = float64(header.StartLongitude) + float64(i)*float64(header.LongitudeGridSpace)
	}
	// Generate latitude coordinate array
	for j := 0; j < nLat; j++ {
		resp.Y[j] = float64(header.StartLatitude) + float64(j)*float64(header.LatitudeGridSpace)
	}
	if nLon > 1 {
		resp.Header.EndLongitude = float32(resp.X[nLon-1])
	}
	if nLat > 1 {
		resp.Header.EndLatitude = float32(resp.Y[nLat-1])
	}

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
	} else if header.DataType == 11 { // Vector Wind grid (Speed and Direction or U and V)
		expectedBytes := totalPoints * 8
		if len(payload) < expectedBytes {
			return nil, fmt.Errorf("insufficient payload bytes for vector grid: got %d, expected %d", len(payload), expectedBytes)
		}

		resp.U = make([]float32, totalPoints)
		resp.V = make([]float32, totalPoints)
		resp.Values = make([]float32, totalPoints) // wind speed magnitude

		// Detect if Block 1 is Speed and Block 2 is Direction in degrees [0, 360]
		isSpeedDir := true
		validSamples := 0
		for i := 0; i < totalPoints; i += 50 {
			b1 := math.Float32frombits(binary.LittleEndian.Uint32(payload[i*4 : (i+1)*4]))
			b2 := math.Float32frombits(binary.LittleEndian.Uint32(payload[totalPoints*4+i*4 : totalPoints*4+(i+1)*4]))
			if math.IsNaN(float64(b1)) || math.IsNaN(float64(b2)) || b1 < -9000 || b2 < -9000 {
				continue
			}
			if b1 < -0.01 || b2 < -0.01 || b2 > 360.5 {
				isSpeedDir = false
				break
			}
			validSamples++
		}
		if validSamples < 5 {
			isSpeedDir = false
		}

		var maxSpeed float32 = 0
		for i := 0; i < totalPoints; i++ {
			b1 := math.Float32frombits(binary.LittleEndian.Uint32(payload[i*4 : (i+1)*4]))
			b2 := math.Float32frombits(binary.LittleEndian.Uint32(payload[totalPoints*4+i*4 : totalPoints*4+(i+1)*4]))

			var u, v, speed float32
			if isSpeedDir {
				speed = b1
				rad := float64(b2) * math.Pi / 180.0
				// In MICAPS / MDFS Diamond 11 vector grid:
				// Block 1 is Speed (magnitude).
				// Block 2 is mathematical polar angle theta in degrees (0° = East / +X, 90° = North / +Y, 180° = West / -X, 270° = South / -Y):
				// u = speed * cos(theta) (eastward physical velocity component)
				// v = speed * sin(theta) (northward physical velocity component)
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
		}

		resp.Stats = model.GridStats{
			Min:  0,
			Max:  maxSpeed,
			Mean: maxSpeed / 2,
		}
	}

	return resp, nil
}

// EncodeBinaryStream encodes a 32-byte header followed by raw float32 bytes for zero-copy client streaming
func EncodeBinaryStream(resp *model.GridResponse) []byte {
	var buf bytes.Buffer
	h := resp.Header

	// 32-byte Header
	binary.Write(&buf, binary.LittleEndian, h.StartLongitude)
	binary.Write(&buf, binary.LittleEndian, h.EndLongitude)
	binary.Write(&buf, binary.LittleEndian, h.StartLatitude)
	binary.Write(&buf, binary.LittleEndian, h.EndLatitude)
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
