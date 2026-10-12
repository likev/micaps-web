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
	THCacheDir    string `json:"th_cache_dir"`
	THCacheMB     int64  `json:"th_cache_mb"`
	THCacheTTL    string `json:"th_cache_ttl"`
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

// ParseClusterPort extracts ClusterPort from XML data if present
func ParseClusterPort(data []byte) int {
	var xmlCfg xmlConfiguration
	if err := xml.Unmarshal(data, &xmlCfg); err == nil {
		for _, entry := range xmlCfg.AppSettings.AddEntries {
			if strings.EqualFold(entry.Key, "clusterport") {
				if p, err := strconv.Atoi(strings.TrimSpace(entry.Value)); err == nil && p > 0 {
					return p
				}
			}
		}
	}
	re := regexp.MustCompile(`(?i)<add\s+[^>]*key=["']ClusterPort["'][^>]*value=["'](\d+)["']`)
	if m := re.FindSubmatch(data); len(m) > 1 {
		if p, err := strconv.Atoi(string(m[1])); err == nil && p > 0 {
			return p
		}
	}
	return 0
}

// NetDialTimeoutFunc is the dial function used for verifying IP accessibility.
// Can be substituted in tests for deterministic mocking.
var NetDialTimeoutFunc = net.DialTimeout

// IsIPAccessible checks whether a host/IP is accessible via TCP on any of the specified ports
// within the timeout duration.
func IsIPAccessible(ip string, timeout time.Duration, ports ...int) bool {
	if timeout <= 0 {
		timeout = 800 * time.Millisecond
	}
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return false
	}

	// If ip already specifies both host and port
	if host, portStr, err := net.SplitHostPort(ip); err == nil {
		target := net.JoinHostPort(host, portStr)
		conn, err := NetDialTimeoutFunc("tcp", target, timeout)
		if err == nil {
			_ = conn.Close()
			return true
		}
		return false
	}

	// Deduplicate valid port list
	var uniquePorts []int
	seen := make(map[int]bool)
	for _, p := range ports {
		if p > 0 && !seen[p] {
			seen[p] = true
			uniquePorts = append(uniquePorts, p)
		}
	}
	if len(uniquePorts) == 0 {
		uniquePorts = []int{9042, 9170}
	}

	for _, p := range uniquePorts {
		target := net.JoinHostPort(ip, strconv.Itoa(p))
		conn, err := NetDialTimeoutFunc("tcp", target, timeout)
		if err == nil {
			_ = conn.Close()
			return true
		}
	}
	return false
}

// SelectAccessibleClusterIP verifies accessibility of candidate IPs and selects a random accessible one.
// Dead/unreachable IPs are verified and excluded. Returns an error if none of the candidates are accessible.
func SelectAccessibleClusterIP(ips []string, timeout time.Duration, ports ...int) (string, error) {
	if len(ips) == 0 {
		return "", fmt.Errorf("no candidate IPs provided")
	}

	var uniqueIPs []string
	seen := make(map[string]bool)
	for _, ip := range ips {
		trimmed := strings.TrimSpace(ip)
		if trimmed != "" && !seen[trimmed] {
			seen[trimmed] = true
			uniqueIPs = append(uniqueIPs, trimmed)
		}
	}
	if len(uniqueIPs) == 0 {
		return "", fmt.Errorf("no candidate IPs provided")
	}

	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	shuffled := make([]string, len(uniqueIPs))
	copy(shuffled, uniqueIPs)
	r.Shuffle(len(shuffled), func(i, j int) {
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	})

	type checkResult struct {
		ip         string
		accessible bool
	}

	ch := make(chan checkResult, len(shuffled))
	for _, ip := range shuffled {
		go func(targetIP string) {
			ok := IsIPAccessible(targetIP, timeout, ports...)
			ch <- checkResult{ip: targetIP, accessible: ok}
		}(ip)
	}

	var accessible []string
	for range shuffled {
		res := <-ch
		if res.accessible {
			accessible = append(accessible, res.ip)
		}
	}

	if len(accessible) == 0 {
		return "", fmt.Errorf("none of the %d ClusterIPAddress entries are accessible", len(uniqueIPs))
	}

	return accessible[r.Intn(len(accessible))], nil
}

// FindAccessibleClusterIP checks if MICAPS.exe.config exists in candidate locations
// and selects an accessible ClusterIPAddress from it.
func FindAccessibleClusterIP() (string, string, error) {
	return FindRandomClusterIP()
}

// FindRandomClusterIP checks if MICAPS.exe.config exists in the same directory as the executable
// or in the working directory, and selects one accessible ClusterIPAddress from it.
// Dead/unreachable IPs are tested and excluded.
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
			var checkPorts []int
			if p := ParseClusterPort(data); p > 0 {
				checkPorts = append(checkPorts, p)
			}
			checkPorts = append(checkPorts, 9042, 9170)

			selected, err := SelectAccessibleClusterIP(ips, 800*time.Millisecond, checkPorts...)
			if err == nil {
				return selected, path, nil
			}
			log.Printf("[Config] Candidate IPs at %s checked but none were accessible: %v", path, err)
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
		THCacheDir:    getEnv("TH_CACHE_DIR", "./th-cache"),
		THCacheMB:     int64(getEnvInt("TH_CACHE_MB", 2000)),
		THCacheTTL:    getEnv("TH_CACHE_TTL", "6h"),
	}

	fs := flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
	hostFlag := fs.String("host", cfg.CassandraHost, "Cassandra host IP or hostname (auto-detects from MICAPS.exe.config if present)")
	cportFlag := fs.Int("cport", cfg.CassandraPort, "Cassandra CQL port")
	httpPortFlag := fs.String("port", cfg.HTTPPort, "HTTP server listening port")
	tunnelFlag := fs.Bool("tunnel", cfg.EnableTunnel, "Enable reverse proxy tunnel mode")
	mockFlag := fs.Bool("mock", cfg.MockMode, "Enable offline mock data generator (default: false, product mode)")
	staticDirFlag := fs.String("static", cfg.StaticDir, "Path to static frontend dist directory")
	pmtilesFlag := fs.String("pmtiles", cfg.PMTilesPath, "Path to local map-china.pmtiles file")
	thCacheDirFlag := fs.String("th-cache-dir", cfg.THCacheDir, "Path to server file cache directory (default: ./th-cache)")
	thCacheMBFlag := fs.Int64("th-cache-mb", cfg.THCacheMB, "Maximum disk cache size in MB (default: 2000)")
	thCacheTTLFlag := fs.String("th-cache-ttl", cfg.THCacheTTL, "Disk cache retention TTL (default: 6h)")

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
	if strings.Contains(cfg.CassandraHost, ":") {
		if host, portStr, err := net.SplitHostPort(cfg.CassandraHost); err == nil {
			cfg.CassandraHost = host
			if p, err := strconv.Atoi(portStr); err == nil {
				cfg.CassandraPort = p
			}
		}
	}
	cfg.HTTPPort = *httpPortFlag
	cfg.EnableTunnel = *tunnelFlag
	cfg.MockMode = *mockFlag
	cfg.StaticDir = *staticDirFlag
	cfg.PMTilesPath = *pmtilesFlag
	cfg.THCacheDir = *thCacheDirFlag
	cfg.THCacheMB = *thCacheMBFlag
	cfg.THCacheTTL = *thCacheTTLFlag

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

