package db

import (
	"fmt"
	"regexp"
	"strings"
)

var validTableRegex = regexp.MustCompile(`^[A-Za-z0-9_]+$`)

// GetBlob queries the data blob from the appropriate Cassandra table
func GetBlob(client *CQLClient, fullDirectory string, fileName string) ([]byte, error) {
	fullDirectory = strings.Trim(fullDirectory, "/")
	parts := strings.Split(fullDirectory, "/")
	if len(parts) < 1 || parts[0] == "" {
		return nil, fmt.Errorf("invalid directory path: %s", fullDirectory)
	}

	table := parts[0]
	if !validTableRegex.MatchString(table) {
		return nil, fmt.Errorf("invalid table name: %s", table)
	}

	var dataPath string
	if len(parts) > 1 {
		dataPath = strings.Join(parts[1:], "/")
	} else {
		dataPath = ""
	}

	query := fmt.Sprintf(`SELECT value FROM micapsdataserver."%s" WHERE "dataPath" = '%s' AND column1 = '%s' LIMIT 1`, table, dataPath, fileName)

	rows, err := client.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query table %s failed: %w", table, err)
	}

	if len(rows) == 0 || rows[0].Columns["value"] == nil {
		return nil, fmt.Errorf("record not found in %s (dataPath=%s, file=%s)", table, dataPath, fileName)
	}

	blob := rows[0].Columns["value"]
	if len(blob) == 0 {
		return nil, fmt.Errorf("empty payload in %s", fullDirectory)
	}

	return blob, nil
}
