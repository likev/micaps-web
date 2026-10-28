package handler

import (
	"bytes"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"micaps-web/filecache"
)

func TestCanonicalGridRef_GoldenTable(t *testing.T) {
	cases := []struct {
		name     string
		path     string
		file     string
		level    string
		wantTbl  string
		wantSub  string
		wantData string
		wantFile string
		wantErr  bool
	}{
		{
			name:     "FY4B CHINA with level number 12",
			path:     "SATELLITE/FY4B/L1/CHINA",
			file:     "C012_20261028120000_FY4B.AWX",
			level:    "12",
			wantTbl:  "SATELLITE",
			wantSub:  "FY4B/L1/CHINA/C012",
			wantData: "SATELLITE/FY4B/L1/CHINA/C012",
			wantFile: "C012_20261028120000_FY4B.AWX",
		},
		{
			name:     "FY4B CHINA with level C012",
			path:     "SATELLITE/FY4B/L1/CHINA",
			file:     "C012_20261028120000_FY4B.AWX",
			level:    "C012",
			wantTbl:  "SATELLITE",
			wantSub:  "FY4B/L1/CHINA/C012",
			wantData: "SATELLITE/FY4B/L1/CHINA/C012",
			wantFile: "C012_20261028120000_FY4B.AWX",
		},
		{
			name:     "FY4B CHINA with channel in path already",
			path:     "SATELLITE/FY4B/L1/CHINA/C013",
			file:     "C013_20261028120000_FY4B.AWX",
			level:    "13",
			wantTbl:  "SATELLITE",
			wantSub:  "FY4B/L1/CHINA/C013",
			wantData: "SATELLITE/FY4B/L1/CHINA/C013",
			wantFile: "C013_20261028120000_FY4B.AWX",
		},
		{
			name:     "FY4B CHINA channel prefix mismatch in file is rewritten to target channel",
			path:     "SATELLITE/FY4B/L1/CHINA/C014",
			file:     "C012_20261028120000_FY4B.AWX",
			level:    "14",
			wantTbl:  "SATELLITE",
			wantSub:  "FY4B/L1/CHINA/C014",
			wantData: "SATELLITE/FY4B/L1/CHINA/C014",
			wantFile: "C014_20261028120000_FY4B.AWX",
		},
		{
			name:     "FY4B DISK without level defaults to C012",
			path:     "SATELLITE/FY4B/L1/DISK",
			file:     "20261028120000_FY4B.AWX",
			level:    "",
			wantTbl:  "SATELLITE",
			wantSub:  "FY4B/L1/DISK/C012",
			wantData: "SATELLITE/FY4B/L1/DISK/C012",
			wantFile: "20261028120000_FY4B.AWX",
		},
		{
			name:     "NWP ECMWF TMP 500",
			path:     "ECMWF_HR/TMP/500",
			file:     "26091808.024",
			level:    "500",
			wantTbl:  "ECMWF_HR",
			wantSub:  "TMP/500",
			wantData: "ECMWF_HR/TMP/500",
			wantFile: "26091808.024",
		},
		{
			name:     "TLOGP Upper Air",
			path:     "UPPER_AIR/TLOGP",
			file:     "20260320200000.000",
			level:    "",
			wantTbl:  "UPPER_AIR",
			wantSub:  "TLOGP",
			wantData: "UPPER_AIR/TLOGP",
			wantFile: "20260320200000.000",
		},
		{
			name:    "Missing file returns error",
			path:    "SATELLITE/FY4B/L1/CHINA",
			file:    "",
			wantErr: true,
		},
		{
			name:    "Unresolved latest returns error",
			path:    "SATELLITE/FY4B/L1/CHINA",
			file:    "latest",
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ref, err := CanonicalGridRef(tc.path, tc.file, tc.level)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if ref.Table != tc.wantTbl {
				t.Errorf("Table: got %q, want %q", ref.Table, tc.wantTbl)
			}
			if ref.SubDataPath != tc.wantSub {
				t.Errorf("SubDataPath: got %q, want %q", ref.SubDataPath, tc.wantSub)
			}
			if ref.DataPath != tc.wantData {
				t.Errorf("DataPath: got %q, want %q", ref.DataPath, tc.wantData)
			}
			if ref.File != tc.wantFile {
				t.Errorf("File: got %q, want %q", ref.File, tc.wantFile)
			}
		})
	}
}

func TestCanonicalImageRef(t *testing.T) {
	ref, err := CanonicalImageRef("SATELLITE/FY2G/L2/DUST", "FY2G_DST_RGB_20261028_0400.BMP")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ref.Table != "SATELLITE" {
		t.Errorf("expected Table SATELLITE, got %s", ref.Table)
	}
	if ref.SubDataPath != "FY2G/L2/DUST" {
		t.Errorf("expected SubDataPath FY2G/L2/DUST, got %s", ref.SubDataPath)
	}
	if ref.DataPath != "SATELLITE/FY2G/L2/DUST" {
		t.Errorf("expected DataPath SATELLITE/FY2G/L2/DUST, got %s", ref.DataPath)
	}
	if ref.File != "FY2G_DST_RGB_20261028_0400.BMP" {
		t.Errorf("expected File FY2G_DST_RGB_20261028_0400.BMP, got %s", ref.File)
	}
}

func TestBlobSource_Singleflight(t *testing.T) {
	tempDir := t.TempDir()
	c, err := filecache.New(filecache.Config{
		Dir:      tempDir,
		CapBytes: 10 * 1024 * 1024,
		TTL:      1 * time.Hour,
	})
	if err != nil {
		t.Fatalf("failed to init cache: %v", err)
	}
	defer c.Close()

	var fetchCalls atomic.Int32
	fakeFetcher := BlobFetcherFunc(func(dataPath, file string) ([]byte, error) {
		fetchCalls.Add(1)
		time.Sleep(30 * time.Millisecond) // simulate I/O delay
		return []byte("sample-blob-data"), nil
	})

	source := NewBlobSource(fakeFetcher, c)
	ref := BlobRef{
		Table:       "SATELLITE",
		SubDataPath: "FY4B/L1/CHINA/C012",
		DataPath:    "SATELLITE/FY4B/L1/CHINA/C012",
		File:        "C012_20261028120000_FY4B.AWX",
	}

	// 5 concurrent GetOrFetch + 5 concurrent Warm calls for the same ref
	const n = 10
	var wg sync.WaitGroup
	wg.Add(n)

	for i := 0; i < n; i++ {
		go func(idx int) {
			defer wg.Done()
			if idx%2 == 0 {
				data, err := source.GetOrFetch(ref)
				if err != nil || !bytes.Equal(data, []byte("sample-blob-data")) {
					t.Errorf("GetOrFetch failed: %v", err)
				}
			} else {
				err := source.Warm(ref)
				if err != nil {
					t.Errorf("Warm failed: %v", err)
				}
			}
		}(i)
	}
	wg.Wait()

	// Exactly 1 fetch should have occurred
	if calls := fetchCalls.Load(); calls != 1 {
		t.Fatalf("expected exactly 1 fetch call across %d concurrent callers, got %d", n, calls)
	}

	// Now cache should hit without calling fetcher
	data, err := source.GetOrFetch(ref)
	if err != nil || !bytes.Equal(data, []byte("sample-blob-data")) {
		t.Fatalf("subsequent GetOrFetch failed")
	}
	if calls := fetchCalls.Load(); calls != 1 {
		t.Fatalf("expected cache hit to make 0 additional calls, got %d", calls)
	}
}
