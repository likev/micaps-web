package parser

import (
	"os"
	"testing"
)

func TestAWXChinaC006(t *testing.T) {
	raw, err := os.ReadFile("../testdata/awx_china_c006.bin")
	if err != nil {
		t.Fatalf("Failed to read fixture: %v", err)
	}

	decomp, err := UnwrapPayload(raw)
	if err != nil {
		t.Fatalf("Unwrap error: %v", err)
	}

	if !IsAWX(decomp) {
		t.Fatalf("IsAWX returned false for valid AWX file")
	}

	h1, _, err := ParseAWXHeader1(decomp)
	if err != nil {
		t.Fatalf("ParseAWXHeader1 error: %v", err)
	}

	if h1.ProductCategory != 1 {
		t.Errorf("Expected productCategory 1, got %d", h1.ProductCategory)
	}
	if h1.FormatString != "SAT2004" {
		t.Errorf("Expected formatString SAT2004, got %s", h1.FormatString)
	}

	// Test decimation step = 2
	resp, err := ParseAWXGrid(decomp, 2)
	if err != nil {
		t.Fatalf("ParseAWXGrid step=2 error: %v", err)
	}

	expectedW := (3501 + 1) / 2 // 1751
	expectedH := (2001 + 1) / 2 // 1001
	if len(resp.X) != expectedW {
		t.Errorf("Expected X len %d, got %d", expectedW, len(resp.X))
	}
	if len(resp.Y) != expectedH {
		t.Errorf("Expected Y len %d, got %d", expectedH, len(resp.Y))
	}
	if len(resp.Values) != expectedW*expectedH {
		t.Errorf("Expected Values len %d, got %d", expectedW*expectedH, len(resp.Values))
	}

	// Verify coordinates
	if resp.X[0] != 70.0 {
		t.Errorf("Expected start lon 70.0, got %f", resp.X[0])
	}
	if resp.Y[0] != 15.0 {
		t.Errorf("Expected start lat 15.0, got %f", resp.Y[0])
	}
	if resp.Y[len(resp.Y)-1] != 55.0 {
		t.Errorf("Expected end lat 55.0, got %f", resp.Y[len(resp.Y)-1])
	}

	// Values range check (calibrated reflectance % for C006)
	t.Logf("Go FY4B CHINA C006 stats: min=%f, max=%f, mean=%f", resp.Stats.Min, resp.Stats.Max, resp.Stats.Mean)
	if resp.Stats.Min < 0 || resp.Stats.Max > 120.0 {
		t.Errorf("Values out of reasonable range [0, 120]: min=%f, max=%f", resp.Stats.Min, resp.Stats.Max)
	}
	if resp.Stats.Mean <= 0 {
		t.Errorf("Expected positive mean, got %f", resp.Stats.Mean)
	}
}

func TestAWXFy2gQpe(t *testing.T) {
	raw, err := os.ReadFile("../testdata/awx_fy2g_qpe.bin")
	if err != nil {
		t.Fatalf("Failed to read fixture: %v", err)
	}

	decomp, err := UnwrapPayload(raw)
	if err != nil {
		t.Fatalf("Unwrap error: %v", err)
	}

	if !IsAWX(decomp) {
		t.Fatalf("IsAWX returned false for valid AWX QPE file")
	}

	h1, _, err := ParseAWXHeader1(decomp)
	if err != nil {
		t.Fatalf("ParseAWXHeader1 error: %v", err)
	}

	if h1.ProductCategory != 3 {
		t.Errorf("Expected productCategory 3, got %d", h1.ProductCategory)
	}

	resp, err := ParseAWXGrid(decomp, 1)
	if err != nil {
		t.Fatalf("ParseAWXGrid error: %v", err)
	}

	if len(resp.X) != 1001 {
		t.Errorf("Expected X len 1001, got %d", len(resp.X))
	}
	if len(resp.Y) != 501 {
		t.Errorf("Expected Y len 501, got %d", len(resp.Y))
	}
	if resp.Header.Element != "QPE001" {
		t.Errorf("Expected element QPE001, got %s", resp.Header.Element)
	}

	// Range check (rain rate 0 to 30 mm/h)
	if resp.Stats.Min < 0 || resp.Stats.Max > 50.0 {
		t.Errorf("Valid rain out of range [0, 50]: min=%f, max=%f", resp.Stats.Min, resp.Stats.Max)
	}
}

func TestAWXFy2gCtt(t *testing.T) {
	raw, err := os.ReadFile("../testdata/awx_fy2g_ctt.bin")
	if err != nil {
		t.Skip("awx_fy2g_ctt.bin fixture not present")
	}

	decomp, err := UnwrapPayload(raw)
	if err != nil {
		t.Fatalf("Unwrap error: %v", err)
	}

	resp, err := ParseAWXGrid(decomp, 1)
	if err != nil {
		t.Fatalf("ParseAWXGrid error: %v", err)
	}

	if resp.Header.Element != "CTT" {
		t.Errorf("Expected element CTT, got %s", resp.Header.Element)
	}
	if len(resp.X) != 1001 || len(resp.Y) != 1001 {
		t.Errorf("Expected 1001x1001 grid, got %dx%d", len(resp.X), len(resp.Y))
	}
	// Temperature in K
	if resp.Stats.Max < 150.0 || resp.Stats.Max > 350.0 {
		t.Errorf("Unexpected CTT temperature range: min=%f, max=%f", resp.Stats.Min, resp.Stats.Max)
	}
}

func TestAWXFy2gAmv(t *testing.T) {
	raw, err := os.ReadFile("../testdata/awx_fy2g_amv.bin")
	if err != nil {
		t.Skip("awx_fy2g_amv.bin fixture not present")
	}

	decomp, err := UnwrapPayload(raw)
	if err != nil {
		t.Fatalf("Unwrap error: %v", err)
	}

	fc, err := ParseAWXDiscrete(decomp, 0)
	if err != nil {
		t.Fatalf("ParseAWXDiscrete error: %v", err)
	}

	if len(fc.Features) == 0 {
		t.Fatalf("Expected non-empty AMV features")
	}

	feat := fc.Features[0]
	if feat.Geometry.Type != "Point" {
		t.Errorf("Expected geometry Point, got %s", feat.Geometry.Type)
	}
	coords := feat.Geometry.Coordinates
	if coords[0] < 50.0 || coords[0] > 160.0 {
		t.Errorf("AMV longitude out of expected bounds: %f", coords[0])
	}

	ws, ok := feat.Properties["wind_speed"].(float64)
	if !ok || ws < 0 || ws > 150 {
		t.Errorf("Invalid wind_speed: %v", feat.Properties["wind_speed"])
	}

	wd, ok := feat.Properties["wind_dir"].(float64)
	if !ok || wd < 0 || wd > 360 {
		t.Errorf("Invalid wind_dir: %v", feat.Properties["wind_dir"])
	}

	// Test level filter
	fcLevel, err := ParseAWXDiscrete(decomp, 200)
	if err != nil {
		t.Fatalf("ParseAWXDiscrete with level filter error: %v", err)
	}
	for _, f := range fcLevel.Features {
		p := f.Properties["pressure"].(float64)
		if p < 140 || p > 260 {
			t.Errorf("AMV level filter failed: got pressure %f for target 200", p)
		}
	}
}

func TestAWXErrorsAndTruncation(t *testing.T) {
	// 1. Truncated data
	if IsAWX([]byte("short")) {
		t.Errorf("Short data should not be AWX")
	}

	_, _, err := ParseAWXHeader1([]byte("too short"))
	if err == nil {
		t.Errorf("Expected error for short header")
	}

	// 2. Corrupt payload with AWX header but truncated body
	corrupt := make([]byte, 80)
	copy(corrupt[0:12], []byte("SAT96001.AWX"))
	copy(corrupt[30:38], []byte("SAT2004"))
	corrupt[14] = 40 // FirstClassHeadLength
	corrupt[20] = 40 // RecordLength
	corrupt[22] = 1  // HeadRecordNumber
	corrupt[26] = 1  // ProductCategory 1
	// but payload is only 80 bytes, missing Header2 and data!
	_, err = ParseAWXGrid(corrupt, 1)
	if err == nil {
		t.Errorf("Expected error for truncated AWX payload")
	}
}

func TestAWXReflectiveChannelLUTDetection(t *testing.T) {
	// 1. Channel 4 is legacy reflective channel code
	if !isReflectiveAWXChannel(4, nil) {
		t.Errorf("Channel 4 should always be recognized as reflective")
	}

	// 2. Reflective 64-entry LUT (entries 64..1023 are padded with the 63rd entry value)
	reflectiveCalib := make([]uint16, 1024)
	for i := 0; i < 64; i++ {
		reflectiveCalib[i] = uint16(i * 187) // 0 to ~11981 (albedo 0..119.81%)
	}
	for i := 64; i < 1024; i++ {
		reflectiveCalib[i] = reflectiveCalib[63]
	}

	for ch := int16(1); ch <= 6; ch++ {
		if !isReflectiveAWXChannel(ch, reflectiveCalib) {
			t.Errorf("Channel %d with 64-bin reflectance table should be detected as reflective", ch)
		}
	}

	// 3. IR / WV channel table with continuous 1024 monotonic entries (e.g., 180K to 330K)
	// (e.g. FY-2 channels 1, 2, 3 which are IR1, IR2, IR3/WV)
	irCalib := make([]uint16, 1024)
	for i := 0; i < 1024; i++ {
		irCalib[i] = uint16(18000 + i*15) // 180.00K to 333.60K
	}

	for _, ch := range []int16{1, 2, 3, 5, 6} {
		if isReflectiveAWXChannel(ch, irCalib) {
			t.Errorf("Channel %d with IR continuous curve should NOT be detected as reflective", ch)
		}
	}


	// 4. Non-reflective channels (e.g., C007 MWIR, C008..C015 IR/WV) should never be detected as reflective
	for ch := int16(7); ch <= 15; ch++ {
		if isReflectiveAWXChannel(ch, reflectiveCalib) {
			t.Errorf("Channel %d should never be detected as reflective", ch)
		}
	}
}

