package parser

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"time"

	"micaps-web/model"
)

// AWXHeader1 represents the fixed 40-byte Primary Header of an AWX file.
type AWXHeader1 struct {
	SAT96                 string
	ByteSequence          int16 // 0 = LittleEndian, != 0 = BigEndian
	FirstClassHeadLength  int16 // 40
	SecondClassHeadLength int16
	PadDataLength         int16
	RecordLength          int16
	HeadRecordNumber      int16
	DataRecordNumber      int16
	ProductCategory       int16 // 1: Geostationary Image, 2: Polar, 3: Grid Quantitative, 4: Discrete Vectors, 5: Graphics
	CompressMethod        int16
	FormatString          string
	QualityFlag           int16
}

// AWXHeader2Geo represents the 64-byte Secondary Header for ProductCategory 1 (Geostationary Imagery).
type AWXHeader2Geo struct {
	SatelliteName    string
	Year             int16
	Month            int16
	Day              int16
	Hour             int16
	Minute           int16
	Channel          int16
	FlagOfProjection int16 // 0: None/NOM, 1: Lambert, 2: Mercator, 3: Polar, 4: Equirectangular
	WidthOfImage     int16
	HeightOfImage    int16
	ScanLineTopLeft  int16
	PixelTopLeft     int16
	SampleRatio      int16
	LatitudeOfNorth  int16 // scaled by 100
	LatitudeOfSouth  int16 // scaled by 100
	LongitudeOfWest  int16 // scaled by 100
	LongitudeOfEast  int16 // scaled by 100
	CenterLat        int16
	CenterLon        int16
	StandardLat1     int16
	StandardLat2     int16
	HorizontalRes    int16
	VerticalRes      int16
	OverlapFlag      int16
	OverlapVal       int16
	ColorTableLen    int16
	CalibrationLen   int16
	GeolocationLen   int16
	Reserved         int16
}

// AWXHeader2Grid represents the 80-byte Secondary Header for ProductCategory 3 (Grid Quantitative Products: CTT, QPE).
type AWXHeader2Grid struct {
	SatelliteName   string
	Element         int16
	BytePerGrid     int16 // 1 or 2
	Base            int16
	Scale           int16
	TimeScale       int16
	StartYear       int16
	StartMonth      int16
	StartDay        int16
	StartHour       int16
	StartMinute     int16
	EndYear         int16
	EndMonth        int16
	EndDay          int16
	EndHour         int16
	EndMinute       int16
	LeftUpLat       int16 // North, scaled by 100
	LeftUpLon       int16 // West, scaled by 100
	RightDownLat    int16 // South, scaled by 100
	RightDownLon    int16 // East, scaled by 100
	ResolutionUnit  int16
	HorizontalRes   int16
	VerticalRes     int16
	WidthOfImage    int16
	HeightOfImage   int16
	HasLand         int16
	LandVal         int16
	HasCloud        int16
	CloudVal        int16
	HasWater        int16
	WaterVal        int16
	HasIce          int16
	IceVal          int16
	HasQuality      int16
	QualityUp       int16
	QualityDown     int16
	Reserved        int16
}

// IsAWX checks whether the decompressed payload conforms to the CMA AWX format.
func IsAWX(data []byte) bool {
	if len(data) < 40 {
		return false
	}
	// Header1 has FirstClassHeadLength = 40 at bytes 14-16 in little or big endian
	firstLenLE := int16(binary.LittleEndian.Uint16(data[14:16]))
	firstLenBE := int16(binary.BigEndian.Uint16(data[14:16]))
	if firstLenLE != 40 && firstLenBE != 40 {
		return false
	}

	formatStr := string(bytes.TrimRight(data[30:38], "\x00 "))
	if strings.HasPrefix(formatStr, "SAT") {
		return true
	}
	sat96 := string(bytes.TrimRight(data[0:12], "\x00 "))
	return strings.HasSuffix(strings.ToUpper(sat96), ".AWX")
}

// ParseAWXHeader1 parses the 40-byte Primary Header.
func ParseAWXHeader1(data []byte) (*AWXHeader1, binary.ByteOrder, error) {
	if len(data) < 40 {
		return nil, nil, fmt.Errorf("data too short for AWX header 1: %d bytes", len(data))
	}
	byteSeq := binary.LittleEndian.Uint16(data[12:14])
	var order binary.ByteOrder = binary.LittleEndian
	if byteSeq != 0 {
		order = binary.BigEndian
	}

	h1 := &AWXHeader1{
		SAT96:                 string(bytes.TrimRight(data[0:12], "\x00 ")),
		ByteSequence:          int16(byteSeq),
		FirstClassHeadLength:  int16(order.Uint16(data[14:16])),
		SecondClassHeadLength: int16(order.Uint16(data[16:18])),
		PadDataLength:         int16(order.Uint16(data[18:20])),
		RecordLength:          int16(order.Uint16(data[20:22])),
		HeadRecordNumber:      int16(order.Uint16(data[22:24])),
		DataRecordNumber:      int16(order.Uint16(data[24:26])),
		ProductCategory:       int16(order.Uint16(data[26:28])),
		CompressMethod:        int16(order.Uint16(data[28:30])),
		FormatString:          string(bytes.TrimRight(data[30:38], "\x00 ")),
		QualityFlag:           int16(order.Uint16(data[38:40])),
	}
	return h1, order, nil
}

// ParseAWXGrid decodes an AWX raster image or quantitative grid (Category 1 or 3) into a model.GridResponse.
func ParseAWXGrid(data []byte, step int) (*model.GridResponse, error) {
	h1, order, err := ParseAWXHeader1(data)
	if err != nil {
		return nil, err
	}

	switch h1.ProductCategory {
	case 1:
		return parseAWXCategory1(data, h1, order, step)
	case 3:
		return parseAWXCategory3(data, h1, order, step)
	default:
		return nil, fmt.Errorf("unsupported AWX productCategory for grid: %d", h1.ProductCategory)
	}
}

// parseAWXCategory1 handles geostationary imagery (FY-4B CHINA and DISK, FY-2G).
func parseAWXCategory1(data []byte, h1 *AWXHeader1, order binary.ByteOrder, step int) (*model.GridResponse, error) {
	if len(data) < 40+64 {
		return nil, fmt.Errorf("AWX Category 1 payload too short for secondary header: %d", len(data))
	}
	h2Raw := data[40:104]
	h2 := &AWXHeader2Geo{
		SatelliteName:    string(bytes.TrimRight(h2Raw[0:8], "\x00 ")),
		Year:             int16(order.Uint16(h2Raw[8:10])),
		Month:            int16(order.Uint16(h2Raw[10:12])),
		Day:              int16(order.Uint16(h2Raw[12:14])),
		Hour:             int16(order.Uint16(h2Raw[14:16])),
		Minute:           int16(order.Uint16(h2Raw[16:18])),
		Channel:          int16(order.Uint16(h2Raw[18:20])),
		FlagOfProjection: int16(order.Uint16(h2Raw[20:22])),
		WidthOfImage:     int16(order.Uint16(h2Raw[22:24])),
		HeightOfImage:    int16(order.Uint16(h2Raw[24:26])),
		ScanLineTopLeft:  int16(order.Uint16(h2Raw[26:28])),
		PixelTopLeft:     int16(order.Uint16(h2Raw[28:30])),
		SampleRatio:      int16(order.Uint16(h2Raw[30:32])),
		LatitudeOfNorth:  int16(order.Uint16(h2Raw[32:34])),
		LatitudeOfSouth:  int16(order.Uint16(h2Raw[34:36])),
		LongitudeOfWest:  int16(order.Uint16(h2Raw[36:38])),
		LongitudeOfEast:  int16(order.Uint16(h2Raw[38:40])),
		CenterLat:        int16(order.Uint16(h2Raw[40:42])),
		CenterLon:        int16(order.Uint16(h2Raw[42:44])),
		StandardLat1:     int16(order.Uint16(h2Raw[44:46])),
		StandardLat2:     int16(order.Uint16(h2Raw[46:48])),
		HorizontalRes:    int16(order.Uint16(h2Raw[48:50])),
		VerticalRes:      int16(order.Uint16(h2Raw[50:52])),
		OverlapFlag:      int16(order.Uint16(h2Raw[52:54])),
		OverlapVal:       int16(order.Uint16(h2Raw[54:56])),
		ColorTableLen:    int16(order.Uint16(h2Raw[56:58])),
		CalibrationLen:   int16(order.Uint16(h2Raw[58:60])),
		GeolocationLen:   int16(order.Uint16(h2Raw[60:62])),
		Reserved:         int16(order.Uint16(h2Raw[62:64])),
	}

	// Calibration table (2048 bytes = 1024 uint16 elements)
	var lut [256]float32
	hasCalibration := false
	calibOffset := 104 + int(h2.ColorTableLen)
	if h2.CalibrationLen >= 2048 && len(data) >= calibOffset+2048 {
		hasCalibration = true
		calibBytes := data[calibOffset : calibOffset+2048]
		calibRaw := make([]uint16, 1024)
		for i := 0; i < 1024; i++ {
			calibRaw[i] = order.Uint16(calibBytes[i*2 : i*2+2])
		}

		if h2.Channel == 4 {
			// Visible channel: first 64 entries scaled by 0.01 and repeated 4 times
			for dn := 0; dn < 256; dn++ {
				idx := dn / 4
				if idx >= 64 {
					idx = 63
				}
				lut[dn] = float32(calibRaw[idx]) * 0.01
			}
		} else {
			// IR / WV channels: sample every 4th entry in calibration table
			for dn := 0; dn < 256; dn++ {
				idx := dn * 4
				if idx >= 1024 {
					idx = 1023
				}
				lut[dn] = float32(calibRaw[idx]) * 0.01
			}
		}
	} else {
		for dn := 0; dn < 256; dn++ {
			lut[dn] = float32(dn)
		}
	}

	// Data start calculation
	dataOffset := int(h1.HeadRecordNumber) * int(h1.RecordLength)
	if dataOffset <= 0 || dataOffset >= len(data) {
		dataOffset = 40 + int(h1.SecondClassHeadLength) + int(h1.PadDataLength)
	}
	if dataOffset >= len(data) {
		return nil, fmt.Errorf("AWX Category 1 dataOffset %d exceeds payload length %d", dataOffset, len(data))
	}

	w := int(h2.WidthOfImage)
	h := int(h2.HeightOfImage)
	if w <= 0 || h <= 0 {
		return nil, fmt.Errorf("invalid AWX image dimensions: %dx%d", w, h)
	}
	totalPixels := w * h
	if dataOffset+totalPixels > len(data) {
		return nil, fmt.Errorf("truncated AWX image payload: needed %d bytes from %d, got %d", totalPixels, dataOffset, len(data))
	}

	// Automatic decimation for large satellite products (meeting < 3s first paint & < 5s DISK gates)
	if step <= 0 {
		if totalPixels > 4000000 {
			step = 3
		} else if totalPixels > 1000000 {
			step = 2
		} else {
			step = 1
		}
	}

	outW := (w + step - 1) / step
	outH := (h + step - 1) / step

	lonMin := float64(h2.LongitudeOfWest) / 100.0
	lonMax := float64(h2.LongitudeOfEast) / 100.0
	latMin := float64(h2.LatitudeOfSouth) / 100.0
	latMax := float64(h2.LatitudeOfNorth) / 100.0

	// Continuous longitude coordinates across 180° meridian (e.g. 70° to 200°E)
	dLon := (lonMax - lonMin) / float64(w-1)
	dLat := (latMax - latMin) / float64(h-1)

	xCoords := make([]float64, outW)
	for i := 0; i < outW; i++ {
		origCol := i * step
		xCoords[i] = lonMin + float64(origCol)*dLon
	}

	yCoords := make([]float64, outH)
	for j := 0; j < outH; j++ {
		origRow := j * step
		yCoords[j] = latMin + float64(origRow)*dLat
	}

	outValues := make([]float32, outW*outH)
	var sum float64
	var count int
	minVal := float32(math.MaxFloat32)
	maxVal := float32(-math.MaxFloat32)

	// In AWX, rows start from top (North, decreasing lat).
	// In MICAPS GridResponse, rows start from bottom (South, increasing lat).
	rawPixels := data[dataOffset : dataOffset+totalPixels]
	for outR := 0; outR < outH; outR++ {
		origGridRow := outR * step // 0 is South, outH-1 is North
		awxRow := (h - 1) - origGridRow
		if awxRow < 0 {
			awxRow = 0
		}
		rowOffset := awxRow * w

		for outC := 0; outC < outW; outC++ {
			awxCol := outC * step
			if awxCol >= w {
				awxCol = w - 1
			}
			dn := rawPixels[rowOffset+awxCol]
			var v float32
			if hasCalibration {
				v = lut[dn]
			} else {
				v = float32(dn)
			}

			outValues[outR*outW+outC] = v
			if v < minVal {
				minVal = v
			}
			if v > maxVal {
				maxVal = v
			}
			sum += float64(v)
			count++
		}
	}

	meanVal := float32(0)
	if count > 0 {
		meanVal = float32(sum / float64(count))
	} else {
		minVal, maxVal = 0, 0
	}

	obsTime := time.Date(int(h2.Year), time.Month(h2.Month), int(h2.Day), int(h2.Hour), int(h2.Minute), 0, 0, time.UTC)

	channelName := fmt.Sprintf("C%03d", h2.Channel)
	header := model.GridHeader{
		Discriminator:       "AWX",
		DataType:            4,
		ModelName:           h2.SatelliteName,
		Element:             channelName,
		Description:         fmt.Sprintf("%s Channel %d Imagery", h2.SatelliteName, h2.Channel),
		Level:               0,
		Year:                int32(h2.Year),
		Month:               int32(h2.Month),
		Day:                 int32(h2.Day),
		Hour:                int32(h2.Hour),
		Period:              0,
		StartLongitude:      float32(xCoords[0]),
		EndLongitude:        float32(xCoords[outW-1]),
		LongitudeGridSpace:  float32(dLon * float64(step)),
		LongitudeGridNumber: int32(outW),
		StartLatitude:       float32(yCoords[0]),
		EndLatitude:         float32(yCoords[outH-1]),
		LatitudeGridSpace:   float32(dLat * float64(step)),
		LatitudeGridNumber:  int32(outH),
		ValidTime:           obsTime,
		InitTime:            obsTime,
	}

	return &model.GridResponse{
		Header: header,
		Stats: model.GridStats{
			Min:  minVal,
			Max:  maxVal,
			Mean: meanVal,
		},
		X:      xCoords,
		Y:      yCoords,
		Values: outValues,
	}, nil
}

// parseAWXCategory3 handles quantitative grid products (FY-2G CTT, QPE001/003/006).
func parseAWXCategory3(data []byte, h1 *AWXHeader1, order binary.ByteOrder, step int) (*model.GridResponse, error) {
	if len(data) < 40+80 {
		return nil, fmt.Errorf("AWX Category 3 payload too short for secondary header: %d", len(data))
	}
	h2Raw := data[40:120]
	h2 := &AWXHeader2Grid{
		SatelliteName:  string(bytes.TrimRight(h2Raw[0:8], "\x00 ")),
		Element:        int16(order.Uint16(h2Raw[8:10])),
		BytePerGrid:    int16(order.Uint16(h2Raw[10:12])),
		Base:           int16(order.Uint16(h2Raw[12:14])),
		Scale:          int16(order.Uint16(h2Raw[14:16])),
		TimeScale:      int16(order.Uint16(h2Raw[16:18])),
		StartYear:      int16(order.Uint16(h2Raw[18:20])),
		StartMonth:     int16(order.Uint16(h2Raw[20:22])),
		StartDay:       int16(order.Uint16(h2Raw[22:24])),
		StartHour:      int16(order.Uint16(h2Raw[24:26])),
		StartMinute:    int16(order.Uint16(h2Raw[26:28])),
		EndYear:        int16(order.Uint16(h2Raw[28:30])),
		EndMonth:       int16(order.Uint16(h2Raw[30:32])),
		EndDay:         int16(order.Uint16(h2Raw[32:34])),
		EndHour:        int16(order.Uint16(h2Raw[34:36])),
		EndMinute:      int16(order.Uint16(h2Raw[36:38])),
		LeftUpLat:      int16(order.Uint16(h2Raw[38:40])), // North
		LeftUpLon:      int16(order.Uint16(h2Raw[40:42])), // West
		RightDownLat:   int16(order.Uint16(h2Raw[42:44])), // South
		RightDownLon:   int16(order.Uint16(h2Raw[44:46])), // East
		ResolutionUnit: int16(order.Uint16(h2Raw[46:48])),
		HorizontalRes:  int16(order.Uint16(h2Raw[48:50])),
		VerticalRes:    int16(order.Uint16(h2Raw[50:52])),
		WidthOfImage:   int16(order.Uint16(h2Raw[52:54])),
		HeightOfImage:  int16(order.Uint16(h2Raw[54:56])),
		HasLand:        int16(order.Uint16(h2Raw[56:58])),
		LandVal:        int16(order.Uint16(h2Raw[58:60])),
		HasCloud:       int16(order.Uint16(h2Raw[60:62])),
		CloudVal:       int16(order.Uint16(h2Raw[62:64])),
		HasWater:       int16(order.Uint16(h2Raw[64:66])),
		WaterVal:       int16(order.Uint16(h2Raw[66:68])),
		HasIce:         int16(order.Uint16(h2Raw[68:70])),
		IceVal:         int16(order.Uint16(h2Raw[70:72])),
		HasQuality:     int16(order.Uint16(h2Raw[72:74])),
		QualityUp:      int16(order.Uint16(h2Raw[74:76])),
		QualityDown:    int16(order.Uint16(h2Raw[76:78])),
		Reserved:       int16(order.Uint16(h2Raw[78:80])),
	}

	dataOffset := int(h1.HeadRecordNumber) * int(h1.RecordLength)
	if dataOffset <= 0 || dataOffset >= len(data) {
		dataOffset = 40 + int(h1.SecondClassHeadLength) + int(h1.PadDataLength)
	}
	if dataOffset >= len(data) {
		return nil, fmt.Errorf("AWX Category 3 dataOffset %d exceeds payload length %d", dataOffset, len(data))
	}

	w := int(h2.WidthOfImage)
	h := int(h2.HeightOfImage)
	if w <= 0 || h <= 0 {
		return nil, fmt.Errorf("invalid AWX grid dimensions: %dx%d", w, h)
	}
	bytesPerCell := int(h2.BytePerGrid)
	if bytesPerCell <= 0 {
		bytesPerCell = 1
	}
	totalBytesNeeded := w * h * bytesPerCell
	if dataOffset+totalBytesNeeded > len(data) {
		return nil, fmt.Errorf("truncated AWX grid payload: needed %d bytes from %d, got %d", totalBytesNeeded, dataOffset, len(data))
	}

	if step <= 0 {
		step = 1
	}

	outW := (w + step - 1) / step
	outH := (h + step - 1) / step

	lonMin := float64(h2.LeftUpLon) / 100.0
	lonMax := float64(h2.RightDownLon) / 100.0
	latMin := float64(h2.RightDownLat) / 100.0
	latMax := float64(h2.LeftUpLat) / 100.0

	dLon := (lonMax - lonMin) / float64(w-1)
	dLat := (latMax - latMin) / float64(h-1)

	xCoords := make([]float64, outW)
	for i := 0; i < outW; i++ {
		origCol := i * step
		xCoords[i] = lonMin + float64(origCol)*dLon
	}

	yCoords := make([]float64, outH)
	for j := 0; j < outH; j++ {
		origRow := j * step
		yCoords[j] = latMin + float64(origRow)*dLat
	}

	outValues := make([]float32, outW*outH)
	var sum float64
	var count int
	minVal := float32(math.MaxFloat32)
	maxVal := float32(-math.MaxFloat32)

	scale := float32(h2.Scale)
	if scale == 0 {
		scale = 1.0
	}
	base := float32(h2.Base)

	rawGrid := data[dataOffset : dataOffset+totalBytesNeeded]

	for outR := 0; outR < outH; outR++ {
		origGridRow := outR * step // 0 is South, outH-1 is North
		awxRow := (h - 1) - origGridRow
		if awxRow < 0 {
			awxRow = 0
		}
		rowByteOffset := awxRow * w * bytesPerCell

		for outC := 0; outC < outW; outC++ {
			awxCol := outC * step
			if awxCol >= w {
				awxCol = w - 1
			}

			var val float32
			if bytesPerCell == 2 {
				idx := rowByteOffset + awxCol*2
				rawVal := int16(order.Uint16(rawGrid[idx : idx+2]))
				if rawVal == -990 || rawVal <= -900 || rawVal == -9999 {
					val = -9999.0
				} else {
					val = (float32(rawVal) + base) / scale
				}
			} else {
				idx := rowByteOffset + awxCol
				rawByte := rawGrid[idx]
				if rawByte == 255 {
					val = -9999.0
				} else {
					val = (float32(rawByte) + base) / scale
				}
			}

			outValues[outR*outW+outC] = val
			if val != -9999.0 {
				if val < minVal {
					minVal = val
				}
				if val > maxVal {
					maxVal = val
				}
				sum += float64(val)
				count++
			}
		}
	}

	meanVal := float32(0)
	if count > 0 {
		meanVal = float32(sum / float64(count))
	} else {
		minVal, maxVal = 0, 0
	}

	elemName := getAWXElementName(h2.Element)
	obsTime := time.Date(int(h2.StartYear), time.Month(h2.StartMonth), int(h2.StartDay), int(h2.StartHour), int(h2.StartMinute), 0, 0, time.UTC)

	header := model.GridHeader{
		Discriminator:       "AWX",
		DataType:            4,
		ModelName:           h2.SatelliteName,
		Element:             elemName,
		Description:         fmt.Sprintf("%s %s", h2.SatelliteName, elemName),
		Level:               0,
		Year:                int32(h2.StartYear),
		Month:               int32(h2.StartMonth),
		Day:                 int32(h2.StartDay),
		Hour:                int32(h2.StartHour),
		Period:              0,
		StartLongitude:      float32(xCoords[0]),
		EndLongitude:        float32(xCoords[outW-1]),
		LongitudeGridSpace:  float32(dLon * float64(step)),
		LongitudeGridNumber: int32(outW),
		StartLatitude:       float32(yCoords[0]),
		EndLatitude:         float32(yCoords[outH-1]),
		LatitudeGridSpace:   float32(dLat * float64(step)),
		LatitudeGridNumber:  int32(outH),
		ValidTime:           obsTime,
		InitTime:            obsTime,
	}

	return &model.GridResponse{
		Header: header,
		Stats: model.GridStats{
			Min:  minVal,
			Max:  maxVal,
			Mean: meanVal,
		},
		X:      xCoords,
		Y:      yCoords,
		Values: outValues,
	}, nil
}

// ParseAWXDiscrete decodes AWX ProductCategory 4 (discrete point vectors, e.g. FY-2G AMV IR1/IR3)
// into a GeoJSON Point FeatureCollection suitable for station/wind vector rendering.
func ParseAWXDiscrete(data []byte, targetLevel float64) (*model.GeoJSONFeatureCollection, error) {
	h1, order, err := ParseAWXHeader1(data)
	if err != nil {
		return nil, err
	}
	if h1.ProductCategory != 4 {
		return nil, fmt.Errorf("ParseAWXDiscrete expects productCategory 4, got %d", h1.ProductCategory)
	}

	dataOffset := int(h1.HeadRecordNumber) * int(h1.RecordLength)
	if dataOffset <= 0 || dataOffset >= len(data) {
		dataOffset = 40 + int(h1.SecondClassHeadLength) + int(h1.PadDataLength)
	}
	if dataOffset >= len(data) {
		return nil, fmt.Errorf("AWX Discrete dataOffset %d exceeds payload length %d", dataOffset, len(data))
	}

	recLen := int(h1.RecordLength)
	if recLen < 40 {
		recLen = 40
	}
	numRecords := int(h1.DataRecordNumber)
	availableRecords := (len(data) - dataOffset) / recLen
	if numRecords <= 0 || numRecords > availableRecords {
		numRecords = availableRecords
	}

	features := make([]model.GeoJSONFeature, 0, 2048)

	// Decimation factor if total records is very large and no level filter
	decimateStep := 1
	if targetLevel <= 0 && numRecords > 2500 {
		decimateStep = numRecords / 2000
		if decimateStep < 1 {
			decimateStep = 1
		}
	}

	for i := 0; i < numRecords; i += decimateStep {
		idx := dataOffset + i*recLen
		rec := data[idx : idx+recLen]

		// Unpack 20 int16 fields
		lonRaw := int16(order.Uint16(rec[2:4]))  // Col 1
		latRaw := int16(order.Uint16(rec[4:6]))  // Col 2
		wdRaw := int16(order.Uint16(rec[6:8]))   // Col 3
		wsRaw := int16(order.Uint16(rec[8:10]))  // Col 4
		pRaw := int16(order.Uint16(rec[30:32]))  // Col 15 (Pressure in hPa)
		tRaw := int16(order.Uint16(rec[32:34]))  // Col 16 (Temp in K)

		lon := float64(lonRaw) / 100.0
		lat := float64(latRaw) / 100.0
		wd := float64(wdRaw)
		ws := float64(wsRaw)
		pressure := float64(pRaw)
		tempC := float64(tRaw) - 273.15

		if lon < -180 || lon > 180 || lat < -90 || lat > 90 {
			continue
		}
		if ws < 0 || ws > 150 {
			continue
		}

		if targetLevel > 0 {
			if math.Abs(pressure-targetLevel) > 60.0 {
				continue
			}
		}

		rad := wd * math.Pi / 180.0
		u := -ws * math.Sin(rad)
		v := -ws * math.Cos(rad)

		feat := model.GeoJSONFeature{
			Type: "Feature",
			Id:   fmt.Sprintf("amv-%d", i),
			Geometry: model.GeoJSONGeometry{
				Type:        "Point",
				Coordinates: []float64{lon, lat},
			},
			Properties: map[string]interface{}{
				"wind_speed":     ws,
				"wind_dir":       wd,
				"u":              u,
				"v":              v,
				"pressure":       pressure,
				"temperature":    tempC,
				"height":         pressure,
				"source":         "AMV",
				"station_id":     i + 1,
			},
		}
		features = append(features, feat)
	}

	return &model.GeoJSONFeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}, nil
}

func getAWXElementName(elemCode int16) string {
	switch elemCode {
	case 11:
		return "CTT"
	case 14:
		return "QPE001"
	case 15:
		return "QPE006"
	case 16:
		return "QPE012"
	case 17:
		return "QPE024"
	case 22:
		return "QPE006"
	case 23:
		return "QPE024"
	default:
		return fmt.Sprintf("ELEM_%d", elemCode)
	}
}
