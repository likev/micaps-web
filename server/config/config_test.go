package config

import (
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseClusterIPs(t *testing.T) {
	sampleXML := `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <appSettings>
    <add key="EnableWindowsFormsHighDpiAutoResizing" value="false"/>
    <add key="ReactUI" value="true"/>
    <add key="CassandraPrefix" value="mdfs"/>
    <add key="ClusterNumber" value="5" />
    <add key="ClusterPort" value="9170" />
    <add key="ClusterIPAddress1" value="10.69.72.113" />
    <add key="ClusterIPAddress2" value="10.69.72.114" />
    <add key="ClusterIPAddress3" value="10.69.72.115" />
    <add key="ClusterIPAddress4" value="10.69.72.116" />
    <add key="ClusterIPAddress5" value="10.69.72.117" />
  </appSettings>
</configuration>`

	ips := ParseClusterIPs([]byte(sampleXML))
	if len(ips) != 5 {
		t.Fatalf("expected 5 ClusterIPAddress entries, got %d: %v", len(ips), ips)
	}

	expected := map[string]bool{
		"10.69.72.113": true,
		"10.69.72.114": true,
		"10.69.72.115": true,
		"10.69.72.116": true,
		"10.69.72.117": true,
	}

	for _, ip := range ips {
		if !expected[ip] {
			t.Errorf("unexpected ip extracted: %s", ip)
		}
	}
}

func TestFindRandomClusterIP(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "MICAPS.exe.config")
	sampleXML := `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <appSettings>
    <add key="ClusterPort" value="9170" />
    <add key="ClusterIPAddress1" value="10.69.72.113" />
    <add key="ClusterIPAddress2" value="10.69.72.114" />
  </appSettings>
</configuration>`

	if err := os.WriteFile(configPath, []byte(sampleXML), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("failed to read test file: %v", err)
	}

	ips := ParseClusterIPs(data)
	if len(ips) != 2 {
		t.Fatalf("expected 2 ips, got %d", len(ips))
	}
}

func TestGetLocalIPs(t *testing.T) {
	ips := GetLocalIPs()
	t.Logf("GetLocalIPs() returned: %v", ips)

	seen := make(map[string]bool)
	for _, ipStr := range ips {
		ip := net.ParseIP(ipStr)
		if ip == nil {
			t.Errorf("GetLocalIPs() returned invalid IP string: %s", ipStr)
		}
		if ip.To4() == nil {
			t.Errorf("GetLocalIPs() returned non-IPv4 address: %s", ipStr)
		}
		if ip.IsLoopback() {
			t.Errorf("GetLocalIPs() returned loopback address: %s", ipStr)
		}
		if ip.IsLinkLocalUnicast() {
			t.Errorf("GetLocalIPs() returned link-local address: %s", ipStr)
		}
		if seen[ipStr] {
			t.Errorf("GetLocalIPs() returned duplicate IP: %s", ipStr)
		}
		seen[ipStr] = true
	}
}

func TestFormatServerBanner(t *testing.T) {
	testIPs := []string{"192.168.1.100", "10.0.0.5"}

	// 1. Test plain banner (no color)
	plainBanner := FormatServerBanner("8088", testIPs, false)
	if !strings.Contains(plainBanner, "http://localhost:8088") {
		t.Errorf("banner missing localhost url: %s", plainBanner)
	}
	if !strings.Contains(plainBanner, "http://192.168.1.100:8088") {
		t.Errorf("banner missing network url: %s", plainBanner)
	}
	if !strings.Contains(plainBanner, "http://10.0.0.5:8088") {
		t.Errorf("banner missing secondary network url: %s", plainBanner)
	}
	if !strings.Contains(plainBanner, "┌") || !strings.Contains(plainBanner, "┘") {
		t.Errorf("banner missing box border characters: %s", plainBanner)
	}

	// Verify all boxed lines have identical character width
	var bannerLines []string
	for _, l := range strings.Split(plainBanner, "\n") {
		if l != "" {
			bannerLines = append(bannerLines, l)
		}
	}
	if len(bannerLines) < 6 {
		t.Fatalf("expected at least 6 banner lines, got %d", len(bannerLines))
	}
	expectedWidth := -1
	for idx, line := range bannerLines {
		runeCount := 0
		for range line {
			runeCount++
		}
		if expectedWidth == -1 {
			expectedWidth = runeCount
		} else if runeCount != expectedWidth {
			t.Errorf("line %d width mismatch: got %d, expected %d. Line: %q", idx, runeCount, expectedWidth, line)
		}
	}

	// 2. Test colorful banner
	colorBanner := FormatServerBanner("8088", testIPs, true)
	if !strings.Contains(colorBanner, "\033[36m") { // Cyan escape code
		t.Errorf("colorful banner missing ANSI cyan escape code: %s", colorBanner)
	}
	if !strings.Contains(colorBanner, "\033[1;32m") { // Green escape code
		t.Errorf("colorful banner missing ANSI green escape code: %s", colorBanner)
	}
}

