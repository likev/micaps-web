package config

import (
	"flag"
	"os"
	"strconv"
)

// Config represents the application runtime configuration
type Config struct {
	CassandraHost string `json:"cassandra_host"`
	CassandraPort int    `json:"cassandra_port"`
	HTTPPort      string `json:"http_port"`
	EnableTunnel  bool   `json:"enable_tunnel"`
	MockMode      bool   `json:"mock_mode"`
	StaticDir     string `json:"static_dir"`
	PMTilesPath   string `json:"pmtiles_path"`
}

// LoadConfig parses flags, environment variables, and applies sensible defaults
func LoadConfig() *Config {
	cfg := &Config{
		CassandraHost: getEnv("CASSANDRA_HOST", "159.223.110.159"),
		CassandraPort: getEnvInt("CASSANDRA_PORT", 45060),
		HTTPPort:      getEnv("HTTP_PORT", "8088"),
		EnableTunnel:  getEnvBool("ENABLE_TUNNEL", true),
		MockMode:      getEnvBool("MOCK_MODE", false),
		StaticDir:     getEnv("STATIC_DIR", "../client/dist"),
		PMTilesPath:   getEnv("PMTILES_PATH", "../client/public/map-china.pmtiles"),
	}

	hostFlag := flag.String("host", cfg.CassandraHost, "Cassandra host IP or hostname")
	cportFlag := flag.Int("cport", cfg.CassandraPort, "Cassandra port (dynamic tunnel port)")
	httpPortFlag := flag.String("port", cfg.HTTPPort, "HTTP server listening port")
	tunnelFlag := flag.Bool("tunnel", cfg.EnableTunnel, "Enable reverse proxy tunnel mode")
	mockFlag := flag.Bool("mock", cfg.MockMode, "Enable offline mock data generator")
	staticDirFlag := flag.String("static", cfg.StaticDir, "Path to static frontend dist directory")
	pmtilesFlag := flag.String("pmtiles", cfg.PMTilesPath, "Path to local map-china.pmtiles file")

	if !flag.Parsed() {
		flag.Parse()
	}

	cfg.CassandraHost = *hostFlag
	cfg.CassandraPort = *cportFlag
	cfg.HTTPPort = *httpPortFlag
	cfg.EnableTunnel = *tunnelFlag
	cfg.MockMode = *mockFlag
	cfg.StaticDir = *staticDirFlag
	cfg.PMTilesPath = *pmtilesFlag

	return cfg
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return defaultVal
}

func getEnvBool(key string, defaultVal bool) bool {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		if b, err := strconv.ParseBool(val); err == nil {
			return b
		}
	}
	return defaultVal
}
