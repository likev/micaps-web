package model

import "time"

// GridHeader represents the 278-byte binary header of a MICAPS gridded file
type GridHeader struct {
	Discriminator       string    `json:"discriminator"`
	DataType            int16     `json:"data_type"` // 4 = scalar, 11 = vector U/V
	ModelName           string    `json:"model_name"`
	Element             string    `json:"element"`
	Description         string    `json:"description"`
	Level               float32   `json:"level"`
	Year                int32     `json:"year"`
	Month               int32     `json:"month"`
	Day                 int32     `json:"day"`
	Hour                int32     `json:"hour"`
	Timezone            int32     `json:"timezone"`
	Period              int32     `json:"period"` // Forecast offset in hours
	StartLongitude      float32   `json:"start_lon"`
	EndLongitude        float32   `json:"end_lon"`
	LongitudeGridSpace  float32   `json:"d_lon"`
	LongitudeGridNumber int32     `json:"n_lon"`
	StartLatitude       float32   `json:"start_lat"`
	EndLatitude         float32   `json:"end_lat"`
	LatitudeGridSpace   float32   `json:"d_lat"`
	LatitudeGridNumber  int32     `json:"n_lat"`
	IsolineStartValue   float32   `json:"isoline_start"`
	IsolineEndValue     float32   `json:"isoline_end"`
	IsolineSpace        float32   `json:"isoline_space"`
	PerturbationNumber  int16     `json:"perturb_num"`
	EnsembleTotalNumber int16     `json:"ensemble_total"`
	ValidTime           time.Time `json:"valid_time"`
	InitTime            time.Time `json:"init_time"`
}

// GridStats contains summary statistics of a 2D scalar field
type GridStats struct {
	Min  float32 `json:"min"`
	Max  float32 `json:"max"`
	Mean float32 `json:"mean"`
}

// GridResponse is the JSON DTO returned by /api/data/grid
type GridResponse struct {
	Header GridHeader `json:"header"`
	Stats  GridStats  `json:"stats"`
	X      []float64  `json:"x"`      // 1D array of longitude coordinates
	Y      []float64  `json:"y"`      // 1D array of latitude coordinates
	Values []float32  `json:"values"` // Flattened row-major grid values
	U      []float32  `json:"u,omitempty"`
	V      []float32  `json:"v,omitempty"`
}

// StationRecord represents an observation from surface synoptic / AWS stations
type StationRecord struct {
	StationID        int32   `json:"station_id"`
	Longitude        float32 `json:"lon"`
	Latitude         float32 `json:"lat"`
	Temperature      float32 `json:"temperature"`       // TT (°C)
	DewPoint         float32 `json:"dewpoint"`          // TdTd (°C)
	SeaLevelPressure float32 `json:"slp"`               // PPP (hPa)
	PressureChange3h float32 `json:"pressure_diff_3h"`  // pp (tenths of hPa)
	PressureTendency int16   `json:"pressure_tendency"` // a (0-8 curve code)
	TotalCloudCover  int16   `json:"cloud_cover"`       // N (0-8 octas)
	PresentWeather   int16   `json:"weather_code"`      // ww (WMO 4677 code)
	WindSpeed        float32 `json:"wind_speed"`        // ff (m/s or knots)
	WindDirection    float32 `json:"wind_direction"`    // dd (degrees)
	Visibility       float32 `json:"visibility"`        // VV (km)
	Rain1h           float32 `json:"rain_1h"`
	Rain6h           float32 `json:"rain_6h"`
	Rain24h          float32 `json:"rain_24h"`
}

// GeoJSONFeature represents a standard GeoJSON Point Feature
type GeoJSONFeature struct {
	Type       string                 `json:"type"`
	Geometry   GeoJSONGeometry        `json:"geometry"`
	Properties map[string]interface{} `json:"properties"`
}

// GeoJSONGeometry represents GeoJSON coordinates
type GeoJSONGeometry struct {
	Type        string    `json:"type"`
	Coordinates []float64 `json:"coordinates"`
}

// GeoJSONFeatureCollection represents a GeoJSON collection
type GeoJSONFeatureCollection struct {
	Type     string           `json:"type"`
	Features []GeoJSONFeature `json:"features"`
}

// FileEntry represents a file in treeview
type FileEntry struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
}

// CategoryInfo represents a model category
type CategoryInfo struct {
	Category string   `json:"category"`
	Tables   []string `json:"tables"`
}
