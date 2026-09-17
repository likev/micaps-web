package parser

import (
	"bufio"
	"bytes"
	"fmt"
	"strconv"
	"strings"

	"micaps-web/model"
)

var majorStationNames = map[string]string{
	"58362": "上海/宝山 (Shanghai)",
	"54511": "北京 (Beijing)",
	"59287": "广州 (Guangzhou)",
	"57516": "重庆 (Chongqing)",
	"57494": "武汉 (Wuhan)",
	"51463": "乌鲁木齐 (Urumqi)",
	"56778": "昆明 (Kunming)",
	"50953": "哈尔滨 (Harbin)",
	"53463": "呼和浩特 (Hohhot)",
	"52889": "兰州 (Lanzhou)",
	"55591": "拉萨 (Lhasa)",
	"58606": "南昌 (Nanchang)",
	"58238": "南京 (Nanjing)",
	"58457": "杭州 (Hangzhou)",
	"59758": "海口 (Haikou)",
	"57036": "西安 (Xi'an)",
	"56294": "成都 (Chengdu)",
	"53614": "银川 (Yinchuan)",
	"52866": "西宁 (Xining)",
	"54857": "青岛 (Qingdao)",
	"54342": "沈阳 (Shenyang)",
	"54161": "长春 (Changchun)",
	"53772": "太原 (Taiyuan)",
	"53698": "石家庄 (Shijiazhuang)",
	"57687": "长沙 (Changsha)",
	"57816": "贵阳 (Guiyang)",
	"59431": "南宁 (Nanning)",
	"58847": "福州 (Fuzhou)",
	"58150": "合肥 (Hefei)",
	"57083": "郑州 (Zhengzhou)",
	"58424": "安庆 (Anqing)",
	"58633": "衢州 (Quzhou)",
	"58242": "常州 (Changzhou)",
	"58968": "厦门 (Xiamen)",
	"59316": "汕头 (Shantou)",
	"59488": "阳江 (Yangjiang)",
	"59644": "湛江 (Zhanjiang)",
	"59981": "西沙 (Xisha)",
	"59997": "南沙 (Nansha)",
}

// GetStationName returns station name in Chinese / English if known, or fallback
func GetStationName(stationID string) string {
	stationID = strings.TrimSpace(stationID)
	if name, ok := majorStationNames[stationID]; ok {
		return name
	}
	return fmt.Sprintf("Station %s", stationID)
}

func parseHeaderTime(line string) (string, error) {
	fields := strings.Fields(line)
	if len(fields) < 4 {
		return "", fmt.Errorf("invalid header line: %s", line)
	}
	y, _ := strconv.Atoi(fields[0])
	m, _ := strconv.Atoi(fields[1])
	d, _ := strconv.Atoi(fields[2])
	h, _ := strconv.Atoi(fields[3])
	return fmt.Sprintf("%04d-%02d-%02d %02d:00", y, m, d, h), nil
}

func parseSoundingLevel(fields []string) (model.SoundingLevel, bool) {
	if len(fields) < 6 {
		return model.SoundingLevel{}, false
	}
	p, err := strconv.ParseFloat(fields[0], 64)
	if err != nil || p <= 0 || p >= 9999 {
		return model.SoundingLevel{}, false
	}

	h, _ := strconv.ParseFloat(fields[1], 64)
	if h >= 9999 || h < -9000 {
		h = -9999
	} else {
		h = h * 10.0 // dagpm -> gpm
	}

	t, _ := strconv.ParseFloat(fields[2], 64)
	if t >= 9999 || t < -150 {
		t = -9999
	}

	td, _ := strconv.ParseFloat(fields[3], 64)
	if td >= 9999 || td < -150 {
		td = -9999
	}

	// Thermodynamic sanity: Td <= T
	if t > -9000 && td > -9000 && td > t {
		td = t
	}

	wd, _ := strconv.ParseFloat(fields[4], 64)
	if wd >= 9999 || wd < 0 {
		wd = -9999
	}

	ws, _ := strconv.ParseFloat(fields[5], 64)
	if ws >= 9999 || ws < 0 {
		ws = -9999
	}

	return model.SoundingLevel{
		Pressure:  p,
		Height:    h,
		Temp:      t,
		DewPoint:  td,
		WindDir:   wd,
		WindSpeed: ws,
	}, true
}

// ExtractStationsGeoJSON generates GeoJSON Point FeatureCollection for all stations in Diamond 5
func ExtractStationsGeoJSON(data []byte) (*model.GeoJSONFeatureCollection, error) {
	scanner := bufio.NewScanner(bytes.NewReader(data))
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	// Line 0: "diamond 5 ..."
	if !scanner.Scan() {
		return nil, fmt.Errorf("empty diamond 5 data")
	}
	// Line 1: "<year> <month> <day> <hour> <station_count>"
	if !scanner.Scan() {
		return nil, fmt.Errorf("missing diamond 5 header line")
	}

	features := make([]model.GeoJSONFeature, 0, 600)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}

		stnID := fields[0]
		lon, err1 := strconv.ParseFloat(fields[1], 64)
		lat, err2 := strconv.ParseFloat(fields[2], 64)
		elev, err3 := strconv.ParseFloat(fields[3], 64)
		numLevels, err4 := strconv.Atoi(fields[4])
		if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
			continue
		}

		var sTemp, sDew, sWS, sWD, sPres, sHgt float64 = -9999, -9999, -9999, -9999, -9999, -9999
		foundSurface := false

		// Read numLevels lines
		for i := 0; i < numLevels && scanner.Scan(); i++ {
			lvlLine := strings.TrimSpace(scanner.Text())
			if !foundSurface {
				lvlFields := strings.Fields(lvlLine)
				if lvl, ok := parseSoundingLevel(lvlFields); ok {
					sPres = lvl.Pressure
					sHgt = lvl.Height
					sTemp = lvl.Temp
					sDew = lvl.DewPoint
					sWD = lvl.WindDir
					sWS = lvl.WindSpeed
					foundSurface = true
				}
			}
		}

		props := map[string]interface{}{
			"station_id":         stnID,
			"id":                 stnID,
			"name":               GetStationName(stnID),
			"lon":                lon,
			"lat":                lat,
			"elevation":          elev,
			"num_levels":         numLevels,
			"surface_temp":       sTemp,
			"surface_dewpoint":   sDew,
			"surface_wind_speed": sWS,
			"surface_wind_dir":   sWD,
			"temperature":        sTemp,
			"dewpoint":           sDew,
			"wind_speed":         sWS,
			"wind_dir":           sWD,
			"slp":                sPres,
			"height":             sHgt,
		}

		features = append(features, model.GeoJSONFeature{
			Type: "Feature",
			Geometry: model.GeoJSONGeometry{
				Type:        "Point",
				Coordinates: []float64{lon, lat},
			},
			Properties: props,
		})
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scanner error while parsing diamond 5 stations: %w", err)
	}

	return &model.GeoJSONFeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}, nil
}

// ExtractStationProfile extracts vertical sounding profile for a single station from Diamond 5
func ExtractStationProfile(data []byte, targetStationID string) (*model.StationSounding, error) {
	targetStationID = strings.TrimSpace(targetStationID)
	if targetStationID == "" {
		return nil, fmt.Errorf("target station ID is empty")
	}

	scanner := bufio.NewScanner(bytes.NewReader(data))
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	// Line 0: "diamond 5 ..."
	if !scanner.Scan() {
		return nil, fmt.Errorf("empty diamond 5 data")
	}
	// Line 1: "<year> <month> <day> <hour> <station_count>"
	if !scanner.Scan() {
		return nil, fmt.Errorf("missing diamond 5 header line")
	}
	obsTime, err := parseHeaderTime(scanner.Text())
	if err != nil {
		obsTime = ""
	}

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}

		stnID := fields[0]
		lon, _ := strconv.ParseFloat(fields[1], 64)
		lat, _ := strconv.ParseFloat(fields[2], 64)
		elev, _ := strconv.ParseFloat(fields[3], 64)
		numLevels, err := strconv.Atoi(fields[4])
		if err != nil || numLevels < 0 {
			continue
		}

		if stnID == targetStationID {
			levels := make([]model.SoundingLevel, 0, numLevels)
			for i := 0; i < numLevels && scanner.Scan(); i++ {
				lvlLine := strings.TrimSpace(scanner.Text())
				lvlFields := strings.Fields(lvlLine)
				if lvl, ok := parseSoundingLevel(lvlFields); ok {
					levels = append(levels, lvl)
				}
			}

			return &model.StationSounding{
				StationID:   targetStationID,
				StationName: GetStationName(targetStationID),
				Lon:         lon,
				Lat:         lat,
				Elevation:   elev,
				ObsTime:     obsTime,
				NumLevels:   len(levels),
				Levels:      levels,
			}, nil
		}

		// Skip numLevels lines for non-target station
		for i := 0; i < numLevels && scanner.Scan(); i++ {
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scanner error while locating station %s: %w", targetStationID, err)
	}

	return nil, fmt.Errorf("station %s not found in sounding data", targetStationID)
}
