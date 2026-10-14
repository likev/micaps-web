//go:build live

package handler_test

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"testing"
	"time"

	"micaps-web/db"
)

// TestLiveSmoke executes live verification against Cassandra for manifest datasets.
// Usage: go test -v -tags live ./handler -run TestLiveSmoke
func TestLiveSmoke(t *testing.T) {
	host := os.Getenv("CASSANDRA_HOST")
	if host == "" {
		host = "bore.pub"
	}
	portStr := os.Getenv("CASSANDRA_PORT")
	port := 59042
	if portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			port = p
		}
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	t.Logf("Connecting to live Cassandra at %s...", addr)
	client, err := db.NewCQLClient(addr, 10*time.Second)
	if err != nil {
		t.Fatalf("Failed to connect to Cassandra at %s: %v", addr, err)
	}
	defer client.Close()

	data, err := os.ReadFile("../testdata/dataset_manifest.json")
	if err != nil {
		t.Fatalf("Failed to read dataset_manifest.json: %v", err)
	}

	var manifest []ManifestEntry
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatalf("Failed to unmarshal dataset_manifest.json: %v", err)
	}

	passCount := 0
	failCount := 0

	t.Logf("--------------------------------------------------------------------------------")
	t.Logf("%-35s %-12s %-10s %s", "DATA PATH", "FORMAT", "STATUS", "DETAILS")
	t.Logf("--------------------------------------------------------------------------------")

	for _, entry := range manifest {
		latest, err := db.GetLatestCycle(client, entry.DataPath, entry.Suffix)
		if err != nil || latest == "" {
			// Fallback check: query treeview
			files, fErr := db.GetFileList(client, entry.DataPath, 1)
			if fErr == nil && len(files) > 0 {
				latest = files[0].Name
			}
		}

		if latest != "" {
			passCount++
			t.Logf("%-35s %-12s PASS       latest=%s", entry.DataPath, entry.Format, latest)
		} else {
			failCount++
			t.Logf("%-35s %-12s FAIL       no file resolved", entry.DataPath, entry.Format)
		}
	}

	t.Logf("================================================================================")
	t.Logf("Live Scorecard: %d passed, %d failed out of %d audited datasets", passCount, failCount, len(manifest))
	t.Logf("================================================================================")

	if passCount < 140 {
		t.Errorf("Expected at least 140 active datasets to resolve from live Cassandra, got %d", passCount)
	}
}
