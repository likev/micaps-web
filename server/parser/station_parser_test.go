package parser

import (
	"bytes"
	"encoding/binary"
	"math"
	"testing"
)

func TestStationParserPrecipitation(t *testing.T) {
	// Construct a minimal synthetic MDFS buffer
	var buf bytes.Buffer

	// 0..271: Header pad
	buf.Write(make([]byte, 272))

	// 272..273: idType = 0 (numeric station ID)
	binary.Write(&buf, binary.LittleEndian, int16(0))

	// 274..287: remaining header pad
	buf.Write(make([]byte, 14))

	// 288..291: stationNumber = 1
	binary.Write(&buf, binary.LittleEndian, uint32(1))

	// 292..293: elementNumber = 4 (SLP: 401, 3h diff: 403, Tendency: 404, 6h Rain: 1007)
	binary.Write(&buf, binary.LittleEndian, uint16(4))

	// Element descriptors: eID (int16), eType (int16)
	// eType: 5 = float32 (4 bytes), 2 = short (2 bytes)
	// elem 401 (SLP, float32)
	binary.Write(&buf, binary.LittleEndian, int16(401))
	binary.Write(&buf, binary.LittleEndian, int16(5))
	// elem 403 (pDiff3h, float32)
	binary.Write(&buf, binary.LittleEndian, int16(403))
	binary.Write(&buf, binary.LittleEndian, int16(5))
	// elem 404 (pTendency, int16)
	binary.Write(&buf, binary.LittleEndian, int16(404))
	binary.Write(&buf, binary.LittleEndian, int16(2))
	// elem 1007 (6h Rain, float32)
	binary.Write(&buf, binary.LittleEndian, int16(1007))
	binary.Write(&buf, binary.LittleEndian, int16(5))

	// Station record:
	// stationID (uint32)
	binary.Write(&buf, binary.LittleEndian, uint32(54511))
	// lon (float32)
	binary.Write(&buf, binary.LittleEndian, float32(116.40))
	// lat (float32)
	binary.Write(&buf, binary.LittleEndian, float32(39.90))
	// numb of elements (int16) = 4
	binary.Write(&buf, binary.LittleEndian, int16(4))

	// Element 1: 401 -> 1012.4 hPa
	binary.Write(&buf, binary.LittleEndian, int16(401))
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(1012.4))

	// Element 2: 403 -> 1.5 hPa
	binary.Write(&buf, binary.LittleEndian, int16(403))
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(1.5))

	// Element 3: 404 -> code 2
	binary.Write(&buf, binary.LittleEndian, int16(404))
	binary.Write(&buf, binary.LittleEndian, int16(2))

	// Element 4: 1007 -> 15.6 mm rain
	binary.Write(&buf, binary.LittleEndian, int16(1007))
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(15.6))

	fc, err := ParseStationData(buf.Bytes())
	if err != nil {
		t.Fatalf("ParseStationData failed: %v", err)
	}

	if len(fc.Features) != 1 {
		t.Fatalf("expected 1 feature, got %d", len(fc.Features))
	}

	props := fc.Features[0].Properties
	if props["station_id"] != int32(54511) {
		t.Errorf("expected station_id 54511, got %v", props["station_id"])
	}

	rain6, ok := props["rain_6h"].(float32)
	if !ok || rain6 != 15.6 {
		t.Errorf("expected rain_6h 15.6, got %v", props["rain_6h"])
	}

	tend, ok := props["press_tend"].(int16)
	if !ok || tend != 2 {
		t.Errorf("expected press_tend 2, got %v", props["press_tend"])
	}

	pDiff, ok := props["press_diff_3h"].(float32)
	if !ok || pDiff != 1.5 {
		t.Errorf("expected press_diff_3h 1.5, got %v", props["press_diff_3h"])
	}
}
