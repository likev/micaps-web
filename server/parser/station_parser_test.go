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

func TestStationParserHeightAndElevation(t *testing.T) {
	var buf bytes.Buffer

	// 0..271: Header pad
	buf.Write(make([]byte, 272))
	// 272..273: idType = 0 (numeric station ID)
	binary.Write(&buf, binary.LittleEndian, int16(0))
	// 274..287: remaining header pad
	buf.Write(make([]byte, 14))
	// 288..291: stationNumber = 2
	binary.Write(&buf, binary.LittleEndian, uint32(2))
	// 292..293: elementNumber = 2 (elem 3: elevation, elem 421: geopotential height)
	binary.Write(&buf, binary.LittleEndian, uint16(2))

	// Element descriptors:
	// elem 3 (elevation, float32)
	binary.Write(&buf, binary.LittleEndian, int16(3))
	binary.Write(&buf, binary.LittleEndian, int16(5))
	// elem 421 (height, float32)
	binary.Write(&buf, binary.LittleEndian, int16(421))
	binary.Write(&buf, binary.LittleEndian, int16(5))

	// Station 1: PILOT station (72476, Grand Junction) - has elevation 1473m, but NO height (reports 0 elements or only elevation)
	binary.Write(&buf, binary.LittleEndian, uint32(72476))
	binary.Write(&buf, binary.LittleEndian, float32(-108.53))
	binary.Write(&buf, binary.LittleEndian, float32(39.12))
	binary.Write(&buf, binary.LittleEndian, int16(1)) // 1 element
	binary.Write(&buf, binary.LittleEndian, int16(3)) // elem 3: elevation 1473m
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(1473.0))

	// Station 2: Radiosonde station (54511, Beijing) - has elevation 35m and 500hPa height 584 dam (5840 gpm)
	binary.Write(&buf, binary.LittleEndian, uint32(54511))
	binary.Write(&buf, binary.LittleEndian, float32(116.40))
	binary.Write(&buf, binary.LittleEndian, float32(39.90))
	binary.Write(&buf, binary.LittleEndian, int16(2)) // 2 elements
	binary.Write(&buf, binary.LittleEndian, int16(3)) // elem 3: elevation 35m
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(35.0))
	binary.Write(&buf, binary.LittleEndian, int16(421)) // elem 421: 584 dam
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(584.0))

	fc, err := ParseStationData(buf.Bytes())
	if err != nil {
		t.Fatalf("ParseStationData failed: %v", err)
	}

	if len(fc.Features) != 2 {
		t.Fatalf("expected 2 features, got %d", len(fc.Features))
	}

	// Verify Station 1 (PILOT station)
	p1 := fc.Features[0].Properties
	if p1["station_id"] != int32(72476) {
		t.Errorf("expected station_id 72476, got %v", p1["station_id"])
	}
	if p1["elevation"] != float32(1473.0) {
		t.Errorf("expected elevation 1473.0, got %v", p1["elevation"])
	}
	// Height MUST remain -9999 (missing) and NOT fall back to station elevation 1473!
	if p1["height"] != float32(-9999.0) {
		t.Errorf("expected height -9999.0 for PILOT station without height, got %v", p1["height"])
	}

	// Verify Station 2 (Sounding station)
	p2 := fc.Features[1].Properties
	if p2["station_id"] != int32(54511) {
		t.Errorf("expected station_id 54511, got %v", p2["station_id"])
	}
	if p2["elevation"] != float32(35.0) {
		t.Errorf("expected elevation 35.0, got %v", p2["elevation"])
	}
	if p2["height"] != float32(5840.0) {
		t.Errorf("expected height 5840.0, got %v", p2["height"])
	}
}

func TestStationParserWindQC(t *testing.T) {
	var buf bytes.Buffer

	// Header
	buf.Write(make([]byte, 272))
	binary.Write(&buf, binary.LittleEndian, int16(0)) // idType = 0
	buf.Write(make([]byte, 14))
	binary.Write(&buf, binary.LittleEndian, uint32(4)) // 4 stations
	binary.Write(&buf, binary.LittleEndian, uint16(2)) // 2 elements (201: windDir, 203: windSpeed)

	// Elem definitions: elem 201 (float32), elem 203 (float32)
	binary.Write(&buf, binary.LittleEndian, int16(201))
	binary.Write(&buf, binary.LittleEndian, int16(5))
	binary.Write(&buf, binary.LittleEndian, int16(203))
	binary.Write(&buf, binary.LittleEndian, int16(5))

	// Station 1: Valid wind (270°, 24.5 m/s)
	binary.Write(&buf, binary.LittleEndian, uint32(54511))
	binary.Write(&buf, binary.LittleEndian, float32(116.4))
	binary.Write(&buf, binary.LittleEndian, float32(39.9))
	binary.Write(&buf, binary.LittleEndian, int16(2))
	binary.Write(&buf, binary.LittleEndian, int16(201))
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(270.0))
	binary.Write(&buf, binary.LittleEndian, int16(203))
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(24.5))

	// Station 2: Calm wind (speed 0, dir not sent -> should resolve to dir 0)
	binary.Write(&buf, binary.LittleEndian, uint32(58362))
	binary.Write(&buf, binary.LittleEndian, float32(121.4))
	binary.Write(&buf, binary.LittleEndian, float32(31.2))
	binary.Write(&buf, binary.LittleEndian, int16(1))
	binary.Write(&buf, binary.LittleEndian, int16(203))
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(0.0))

	// Station 3: Outlier wind speed (> 150 m/s -> reject to -9999)
	binary.Write(&buf, binary.LittleEndian, uint32(59287))
	binary.Write(&buf, binary.LittleEndian, float32(113.3))
	binary.Write(&buf, binary.LittleEndian, float32(23.1))
	binary.Write(&buf, binary.LittleEndian, int16(2))
	binary.Write(&buf, binary.LittleEndian, int16(201))
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(180.0))
	binary.Write(&buf, binary.LittleEndian, int16(203))
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(1850.0))

	// Station 4: Missing wind direction (dir 9999 -> -9999, speed 15.0 m/s)
	binary.Write(&buf, binary.LittleEndian, uint32(56294))
	binary.Write(&buf, binary.LittleEndian, float32(104.0))
	binary.Write(&buf, binary.LittleEndian, float32(30.6))
	binary.Write(&buf, binary.LittleEndian, int16(2))
	binary.Write(&buf, binary.LittleEndian, int16(201))
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(9999.0))
	binary.Write(&buf, binary.LittleEndian, int16(203))
	binary.Write(&buf, binary.LittleEndian, math.Float32bits(15.0))

	fc, err := ParseStationData(buf.Bytes())
	if err != nil {
		t.Fatalf("ParseStationData failed: %v", err)
	}

	if len(fc.Features) != 4 {
		t.Fatalf("expected 4 features, got %d", len(fc.Features))
	}

	// 1. Valid wind
	p1 := fc.Features[0].Properties
	if p1["wind_dir"] != float32(270.0) || p1["wind_speed"] != float32(24.5) {
		t.Errorf("Station 1: expected dir 270, speed 24.5, got dir %v, speed %v", p1["wind_dir"], p1["wind_speed"])
	}

	// 2. Calm wind
	p2 := fc.Features[1].Properties
	if p2["wind_speed"] != float32(0.0) || p2["wind_dir"] != float32(0.0) {
		t.Errorf("Station 2 (calm): expected dir 0, speed 0, got dir %v, speed %v", p2["wind_dir"], p2["wind_speed"])
	}

	// 3. Outlier wind speed
	p3 := fc.Features[2].Properties
	if p3["wind_speed"] != float32(-9999.0) {
		t.Errorf("Station 3 (outlier >150 m/s): expected speed -9999, got %v", p3["wind_speed"])
	}

	// 4. Missing wind direction
	p4 := fc.Features[3].Properties
	if p4["wind_dir"] != float32(-9999.0) || p4["wind_speed"] != float32(15.0) {
		t.Errorf("Station 4 (missing dir 9999): expected dir -9999, speed 15.0, got dir %v, speed %v", p4["wind_dir"], p4["wind_speed"])
	}
}
