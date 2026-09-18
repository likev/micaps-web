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
	if y < 100 {
		if y < 50 {
			y += 2000
		} else {
			y += 1900
		}
	}
	return fmt.Sprintf("%04d-%02d-%02d %02d:00", y, m, d, h), nil
}

func isDateHeaderLine(fields []string) bool {
	if len(fields) < 4 {
		return false
	}
	y, err1 := strconv.Atoi(fields[0])
	m, err2 := strconv.Atoi(fields[1])
	d, err3 := strconv.Atoi(fields[2])
	h, err4 := strconv.Atoi(fields[3])
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
		return false
	}
	if (y < 0 || (y > 99 && y < 1970) || y > 2100) {
		return false
	}
	if m < 1 || m > 12 {
		return false
	}
	if d < 1 || d > 31 {
		return false
	}
	if h < 0 || h > 23 {
		return false
	}
	return true
}

func isStationHeader(fields []string) bool {
	if len(fields) != 5 {
		return false
	}
	if isDateHeaderLine(fields) {
		return false
	}
	if strings.Contains(fields[0], ".") {
		return false
	}
	lon, err1 := strconv.ParseFloat(fields[1], 64)
	lat, err2 := strconv.ParseFloat(fields[2], 64)
	elev, err3 := strconv.ParseFloat(fields[3], 64)
	_, err4 := strconv.ParseFloat(fields[4], 64)
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
		return false
	}
	if lon < -180 || lon > 360 || lat < -90 || lat > 90 || elev < -1000 || elev > 10000 {
		return false
	}
	return true
}

func parseSoundingLevels(fields []string) []model.SoundingLevel {
	if len(fields) < 6 {
		return nil
	}
	var res []model.SoundingLevel
	for i := 0; i+6 <= len(fields); i += 6 {
		if lvl, ok := parseSoundingLevel(fields[i : i+6]); ok {
			res = append(res, lvl)
		}
	}
	return res
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

	foundDiamond5 := false
	var obsTime string

	features := make([]model.GeoJSONFeature, 0, 600)
	var curFeature *model.GeoJSONFeature
	var levelCount int

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}

		if !foundDiamond5 {
			lower := strings.ToLower(line)
			if strings.HasPrefix(lower, "diamond 5") {
				foundDiamond5 = true
				if len(fields) >= 6 && isDateHeaderLine(fields[2:]) {
					obsTime, _ = parseHeaderTime(strings.Join(fields[2:], " "))
				}
			}
			continue
		}

		if obsTime == "" && isDateHeaderLine(fields) {
			obsTime, _ = parseHeaderTime(line)
			continue
		}

		if isStationHeader(fields) {
			if curFeature != nil {
				curFeature.Properties["num_levels"] = levelCount
				features = append(features, *curFeature)
				curFeature = nil
			}

			stnID := fields[0]
			lon, _ := strconv.ParseFloat(fields[1], 64)
			lat, _ := strconv.ParseFloat(fields[2], 64)
			elev, _ := strconv.ParseFloat(fields[3], 64)
			levelCount = 0

			props := map[string]interface{}{
				"station_id":         stnID,
				"id":                 stnID,
				"name":               GetStationName(stnID),
				"lon":                lon,
				"lat":                lat,
				"elevation":          elev,
				"num_levels":         0,
				"obs_time":           obsTime,
				"surface_temp":       -9999.0,
				"surface_dewpoint":   -9999.0,
				"surface_wind_speed": -9999.0,
				"surface_wind_dir":   -9999.0,
				"temperature":        -9999.0,
				"dewpoint":           -9999.0,
				"wind_speed":         -9999.0,
				"wind_dir":           -9999.0,
				"slp":                -9999.0,
				"height":             -9999.0,
			}

			curFeature = &model.GeoJSONFeature{
				Type: "Feature",
				Geometry: model.GeoJSONGeometry{
					Type:        "Point",
					Coordinates: []float64{lon, lat},
				},
				Properties: props,
			}
			continue
		}

		if curFeature != nil {
			lvls := parseSoundingLevels(fields)
			for _, lvl := range lvls {
				levelCount++
				if levelCount == 1 {
					props := curFeature.Properties
					props["surface_temp"] = lvl.Temp
					props["surface_dewpoint"] = lvl.DewPoint
					props["surface_wind_speed"] = lvl.WindSpeed
					props["surface_wind_dir"] = lvl.WindDir
					props["temperature"] = lvl.Temp
					props["dewpoint"] = lvl.DewPoint
					props["wind_speed"] = lvl.WindSpeed
					props["wind_dir"] = lvl.WindDir
					props["slp"] = lvl.Pressure
					props["height"] = lvl.Height
				}
			}
		}
	}

	if curFeature != nil {
		curFeature.Properties["num_levels"] = levelCount
		features = append(features, *curFeature)
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

	foundDiamond5 := false
	var obsTime string

	var targetFound bool
	var sounding *model.StationSounding
	var levels []model.SoundingLevel

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}

		if !foundDiamond5 {
			lower := strings.ToLower(line)
			if strings.HasPrefix(lower, "diamond 5") {
				foundDiamond5 = true
				if len(fields) >= 6 && isDateHeaderLine(fields[2:]) {
					obsTime, _ = parseHeaderTime(strings.Join(fields[2:], " "))
				}
			}
			continue
		}

		if obsTime == "" && isDateHeaderLine(fields) {
			obsTime, _ = parseHeaderTime(line)
			continue
		}

		if isStationHeader(fields) {
			if targetFound {
				// We already collected all levels for targetStationID
				break
			}
			stnID := fields[0]
			if stnID == targetStationID || strings.TrimLeft(stnID, "0") == strings.TrimLeft(targetStationID, "0") {
				targetFound = true
				lon, _ := strconv.ParseFloat(fields[1], 64)
				lat, _ := strconv.ParseFloat(fields[2], 64)
				elev, _ := strconv.ParseFloat(fields[3], 64)
				levels = make([]model.SoundingLevel, 0, 1024)
				sounding = &model.StationSounding{
					StationID:   targetStationID,
					StationName: GetStationName(targetStationID),
					Lon:         lon,
					Lat:         lat,
					Elevation:   elev,
					ObsTime:     obsTime,
				}
			}
			continue
		}

		if targetFound {
			lvls := parseSoundingLevels(fields)
			for _, lvl := range lvls {
				levels = append(levels, lvl)
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scanner error while locating station %s: %w", targetStationID, err)
	}

	if !targetFound || sounding == nil {
		return nil, fmt.Errorf("station %s not found in sounding data", targetStationID)
	}

	sounding.NumLevels = len(levels)
	sounding.Levels = levels
	return sounding, nil
}
