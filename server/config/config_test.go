package config

import (
	"os"
	"path/filepath"
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
