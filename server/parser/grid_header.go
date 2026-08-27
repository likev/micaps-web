package parser

import (
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"time"

	"micaps-web/model"
)

// ParseGridHeader parses the 278-byte binary MICAPS header from little-endian bytes
func ParseGridHeader(data []byte) (model.GridHeader, error) {
	if len(data) < 278 {
		return model.GridHeader{}, fmt.Errorf("insufficient bytes for header: got %d, expected at least 278", len(data))
	}

	h := model.GridHeader{}
	h.Discriminator = cleanString(data[0:4])
	h.DataType = int16(binary.LittleEndian.Uint16(data[4:6]))
	h.ModelName = cleanString(data[6:26])
	h.Element = cleanString(data[26:76])
	h.Description = cleanString(data[76:106])

	h.Level = math.Float32frombits(binary.LittleEndian.Uint32(data[106:110]))
	h.Year = int32(binary.LittleEndian.Uint32(data[110:114]))
	h.Month = int32(binary.LittleEndian.Uint32(data[114:118]))
	h.Day = int32(binary.LittleEndian.Uint32(data[118:122]))
	h.Hour = int32(binary.LittleEndian.Uint32(data[122:126]))
	h.Timezone = int32(binary.LittleEndian.Uint32(data[126:130]))
	h.Period = int32(binary.LittleEndian.Uint32(data[130:134]))

	h.StartLongitude = math.Float32frombits(binary.LittleEndian.Uint32(data[134:138]))
	h.EndLongitude = math.Float32frombits(binary.LittleEndian.Uint32(data[138:142]))
	h.LongitudeGridSpace = math.Float32frombits(binary.LittleEndian.Uint32(data[142:146]))
	h.LongitudeGridNumber = int32(binary.LittleEndian.Uint32(data[146:150]))

	h.StartLatitude = math.Float32frombits(binary.LittleEndian.Uint32(data[150:154]))
	h.EndLatitude = math.Float32frombits(binary.LittleEndian.Uint32(data[154:158]))
	h.LatitudeGridSpace = math.Float32frombits(binary.LittleEndian.Uint32(data[158:162]))
	h.LatitudeGridNumber = int32(binary.LittleEndian.Uint32(data[162:166]))

	h.IsolineStartValue = math.Float32frombits(binary.LittleEndian.Uint32(data[166:170]))
	h.IsolineEndValue = math.Float32frombits(binary.LittleEndian.Uint32(data[170:174]))
	h.IsolineSpace = math.Float32frombits(binary.LittleEndian.Uint32(data[174:178]))

	h.PerturbationNumber = int16(binary.LittleEndian.Uint16(data[178:180]))
	h.EnsembleTotalNumber = int16(binary.LittleEndian.Uint16(data[180:182]))

	year := int(h.Year)
	if year < 100 {
		year += 2000 // e.g. 26 -> 2026
	}

	h.InitTime = time.Date(year, time.Month(h.Month), int(h.Day), int(h.Hour), 0, 0, 0, time.UTC)
	h.ValidTime = h.InitTime.Add(time.Duration(h.Period) * time.Hour)

	return h, nil
}

func cleanString(b []byte) string {
	s := strings.TrimRight(string(b), "\x00 ")
	// Strip non-printable ASCII
	return strings.Map(func(r rune) rune {
		if r >= 32 && r < 127 {
			return r
		}
		return -1
	}, s)
}
