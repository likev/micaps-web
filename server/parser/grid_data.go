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
	} else if header.DataType == 11 { // Diamond 11: 2D Gridded Vector Wind Field (Block 1 = U component in m/s, Block 2 = V component in m/s)
		expectedBytes := totalPoints * 8
		if len(payload) < expectedBytes {
			return nil, fmt.Errorf("insufficient payload bytes for Diamond 11 vector grid: got %d, expected %d", len(payload), expectedBytes)
		}

		resp.U = make([]float32, totalPoints)
		resp.V = make([]float32, totalPoints)
		resp.Values = make([]float32, totalPoints) // Wind speed magnitude

		var maxSpeed float32 = 0
		var sumSpeed float32 = 0
		for i := 0; i < totalPoints; i++ {
			u := math.Float32frombits(binary.LittleEndian.Uint32(payload[i*4 : (i+1)*4]))
			v := math.Float32frombits(binary.LittleEndian.Uint32(payload[totalPoints*4+i*4 : totalPoints*4+(i+1)*4]))

			var speed float32 = 0
			if !math.IsNaN(float64(u)) && !math.IsNaN(float64(v)) && u > -9000 && v > -9000 {
				speed = float32(math.Hypot(float64(u), float64(v)))
			} else {
				u = 0
				v = 0
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
