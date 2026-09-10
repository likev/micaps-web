package config

import (
	"encoding/xml"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"sort"
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

// ExitWithError logs a fatal error message, informs the user, waits 30 seconds, and then exits.
// This prevents command windows (e.g. on Windows 10) from closing immediately before errors can be read.
func ExitWithError(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	log.Printf("[MICAPS-Web] FATAL ERROR: %s", msg)
	log.Printf("[MICAPS-Web] Waiting 30 seconds before exiting (so error messages can be read)...")
	time.Sleep(30 * time.Second)
	os.Exit(1)
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
		PMTilesPath:   getEnv("PMTILES_PATH", "../client/map/map-china.pmtiles"),
	}

	fs := flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
	hostFlag := fs.String("host", cfg.CassandraHost, "Cassandra host IP or hostname (auto-detects from MICAPS.exe.config if present)")
	cportFlag := fs.Int("cport", cfg.CassandraPort, "Cassandra CQL port")
	httpPortFlag := fs.String("port", cfg.HTTPPort, "HTTP server listening port")
	tunnelFlag := fs.Bool("tunnel", cfg.EnableTunnel, "Enable reverse proxy tunnel mode")
	mockFlag := fs.Bool("mock", cfg.MockMode, "Enable offline mock data generator (default: false, product mode)")
	staticDirFlag := fs.String("static", cfg.StaticDir, "Path to static frontend dist directory")
	pmtilesFlag := fs.String("pmtiles", cfg.PMTilesPath, "Path to local map-china.pmtiles file")

	if err := fs.Parse(os.Args[1:]); err != nil {
		if err == flag.ErrHelp {
			os.Exit(0)
		}
		ExitWithError("Invalid command-line argument: %v", err)
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

	// Validate HTTP port
	portNum, err := strconv.Atoi(cfg.HTTPPort)
	if err != nil || portNum <= 0 || portNum > 65535 {
		ExitWithError("Invalid HTTP port configured: '%s' (must be an integer between 1 and 65535)", cfg.HTTPPort)
	}

	// Validate Cassandra port
	if cfg.CassandraPort <= 0 || cfg.CassandraPort > 65535 {
		ExitWithError("Invalid Cassandra port configured: %d (must be an integer between 1 and 65535)", cfg.CassandraPort)
	}

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

// GetLocalIPs returns non-loopback, active IPv4 addresses suitable for local network access.
// Private network addresses (e.g. 192.168.x.x, 10.x.x.x) are prioritized first.
func GetLocalIPs() []string {
	var ips []string
	seen := make(map[string]bool)

	ifaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range ifaces {
			// Skip interfaces that are down or loopback devices
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}
			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}
			for _, addr := range addrs {
				var ip net.IP
				switch v := addr.(type) {
				case *net.IPNet:
					ip = v.IP
				case *net.IPAddr:
					ip = v.IP
				}
				if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
					continue
				}
				ip4 := ip.To4()
				if ip4 == nil {
					continue
				}
				ipStr := ip4.String()
				if !seen[ipStr] {
					seen[ipStr] = true
					ips = append(ips, ipStr)
				}
			}
		}
	}

	// Fallback to net.InterfaceAddrs() if no interfaces were discovered
	if len(ips) == 0 {
		addrs, err := net.InterfaceAddrs()
		if err == nil {
			for _, addr := range addrs {
				if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() && !ipNet.IP.IsLinkLocalUnicast() {
					if ip4 := ipNet.IP.To4(); ip4 != nil {
						ipStr := ip4.String()
						if !seen[ipStr] {
							seen[ipStr] = true
							ips = append(ips, ipStr)
						}
					}
				}
			}
		}
	}

	// Sort so private addresses (RFC 1918) appear first, followed by alphabetical order
	sort.Slice(ips, func(i, j int) bool {
		privI := net.ParseIP(ips[i]).IsPrivate()
		privJ := net.ParseIP(ips[j]).IsPrivate()
		if privI != privJ {
			return privI // true before false
		}
		return ips[i] < ips[j]
	})

	return ips
}

