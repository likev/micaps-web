package config

import (
	"encoding/xml"
	"flag"
	"log"
	"math/rand"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
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

type xmlAddEntry struct {
	Key   string `xml:"key,attr"`
	Value string `xml:"value,attr"`
}

type xmlConfiguration struct {
	XMLName     xml.Name `xml:"configuration"`
	AppSettings struct {
		AddEntries []xmlAddEntry `xml:"add"`
	} `xml:"appSettings"`
}

// ParseClusterIPs extracts all ClusterIPAddress values from XML data
func ParseClusterIPs(data []byte) []string {
	var ips []string
	var xmlCfg xmlConfiguration
	if err := xml.Unmarshal(data, &xmlCfg); err == nil {
		for _, entry := range xmlCfg.AppSettings.AddEntries {
			if strings.HasPrefix(strings.ToLower(entry.Key), "clusteripaddress") {
				val := strings.TrimSpace(entry.Value)
				if val != "" {
					ips = append(ips, val)
				}
			}
		}
	}

	// Regex fallback in case XML structure has namespace/declaration variations
	if len(ips) == 0 {
		re := regexp.MustCompile(`(?i)<add\s+[^>]*key=["']ClusterIPAddress\d*["'][^>]*value=["']([^"']+)["']`)
		matches := re.FindAllStringSubmatch(string(data), -1)
		for _, m := range matches {
			if len(m) > 1 {
				val := strings.TrimSpace(m[1])
				if val != "" {
					ips = append(ips, val)
				}
			}
		}
	}
	return ips
}

// FindRandomClusterIP checks if MICAPS.exe.config exists in the same directory as the executable
// or in the working directory, and selects one random ClusterIPAddress from it.
func FindRandomClusterIP() (string, string, error) {
	var candidates []string

	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		candidates = append(candidates, filepath.Join(exeDir, "MICAPS.exe.config"))
	}

	candidates = append(candidates,
		"MICAPS.exe.config",
		"server/MICAPS.exe.config",
		"../MICAPS.exe.config",
	)

	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		ips := ParseClusterIPs(data)
		if len(ips) > 0 {
			r := rand.New(rand.NewSource(time.Now().UnixNano()))
			selected := ips[r.Intn(len(ips))]
			return selected, path, nil
		}
	}
	return "", "", os.ErrNotExist
}

// LoadConfig parses flags, environment variables, and applies sensible defaults
func LoadConfig() *Config {
	defaultHost := getEnv("CASSANDRA_HOST", "")
	if defaultHost == "" {
		if ip, path, err := FindRandomClusterIP(); err == nil && ip != "" {
			defaultHost = ip
			log.Printf("[Config] Auto-detected MICAPS.exe.config at %s, selected random ClusterIPAddress: %s", path, ip)
		}
	}

	cfg := &Config{
		CassandraHost: defaultHost,
		CassandraPort: getEnvInt("CASSANDRA_PORT", 9042),
		HTTPPort:      getEnv("HTTP_PORT", "8088"),
		EnableTunnel:  getEnvBool("ENABLE_TUNNEL", false),
		MockMode:      getEnvBool("MOCK_MODE", false),
		StaticDir:     getEnv("STATIC_DIR", "../client/dist"),
		PMTilesPath:   getEnv("PMTILES_PATH", "../client/public/map-china.pmtiles"),
	}

	hostFlag := flag.String("host", cfg.CassandraHost, "Cassandra host IP or hostname (no default, auto-detects from MICAPS.exe.config if present)")
	cportFlag := flag.Int("cport", cfg.CassandraPort, "Cassandra CQL port")
	httpPortFlag := flag.String("port", cfg.HTTPPort, "HTTP server listening port")
	tunnelFlag := flag.Bool("tunnel", cfg.EnableTunnel, "Enable reverse proxy tunnel mode")
	mockFlag := flag.Bool("mock", cfg.MockMode, "Enable offline mock data generator (default: false, product mode)")
	staticDirFlag := flag.String("static", cfg.StaticDir, "Path to static frontend dist directory")
	pmtilesFlag := flag.String("pmtiles", cfg.PMTilesPath, "Path to local map-china.pmtiles file")

	if !flag.Parsed() {
		flag.Parse()
	}

	cfg.CassandraHost = *hostFlag
	if cfg.CassandraHost == "" {
		if ip, path, err := FindRandomClusterIP(); err == nil && ip != "" {
			cfg.CassandraHost = ip
			log.Printf("[Config] Auto-detected MICAPS.exe.config at %s, selected random ClusterIPAddress: %s", path, ip)
		}
	}

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
