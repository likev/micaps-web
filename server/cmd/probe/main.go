//go:build probe

package main

import (
	"bytes"
	"compress/gzip"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"micaps-web/db"
	"micaps-web/parser"
)

type ManifestEntry struct {
	ID       string   `json:"id"`
	NameEn   string   `json:"name_en"`
	NameZh   string   `json:"name_zh"`
	Table    string   `json:"table"`
	DataPath string   `json:"dataPath"`
	Tier     int      `json:"tier"`
	Format   string   `json:"format"`
	Levels   []int    `json:"levels"`
	Cadence  string   `json:"cadence"`
	Suffix   string   `json:"suffix"`
}

func decompressGzip(data []byte) ([]byte, error) {
	if len(data) >= 2 && data[0] == 0x1f && data[1] == 0x8b {
		gr, err := gzip.NewReader(bytes.NewReader(data))
		if err != nil {
			return nil, err
		}
		defer gr.Close()
		return io.ReadAll(gr)
	}
	return data, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	host := flag.String("host", "bore.pub", "Cassandra host")
	port := flag.Int("port", 59042, "Cassandra port")
	manifestPath := flag.String("manifest", "testdata/dataset_manifest.json", "Path to dataset manifest")
	outDir := flag.String("out", "testdata/probe", "Output directory for probe dumps")
	fixturesDir := flag.String("fixtures", "testdata", "Output directory for fixtures")
	flag.Parse()

	addr := fmt.Sprintf("%s:%d", *host, *port)
	log.Printf("Connecting to Cassandra at %s...", addr)
	client, err := db.NewCQLClient(addr, 10*time.Second)
	if err != nil {
		log.Fatalf("Failed to connect to Cassandra: %v", err)
	}
	defer client.Close()

	data, err := os.ReadFile(*manifestPath)
	if err != nil {
		log.Fatalf("Failed to read manifest %s: %v", *manifestPath, err)
	}

	var manifest []ManifestEntry
	if err := json.Unmarshal(data, &manifest); err != nil {
		log.Fatalf("Failed to parse manifest: %v", err)
	}

	if err := os.MkdirAll(*outDir, 0755); err != nil {
		log.Fatalf("Failed to create out dir: %v", err)
	}
	if err := os.MkdirAll(*fixturesDir, 0755); err != nil {
		log.Fatalf("Failed to create fixtures dir: %v", err)
	}

	// Representative families to probe and extract fixtures
	familyEntries := map[string]ManifestEntry{
		"mdfs_grid_ecmwf": {DataPath: "ECMWF_HR/CAPE", Format: "grid_type_4", Suffix: "*.240"},
		"mdfs_grid_grapes": {DataPath: "GRAPES_3KM/RAIN01", Format: "grid_type_4", Suffix: "*.036"},
		"mdfs_grid_nwfd": {DataPath: "NWFD_SCMOC/HAIL", Format: "grid_type_4", Suffix: "*.072"},
		"mdfs_grid_cldas": {DataPath: "CLDAS/RAIN01_BI_DATA_SOURCE", Format: "grid_type_4", Suffix: "*.000"},
		"mdfs_grid_ens": {DataPath: "ECMWF_ENSEMBLE_PRODUCT/GRID_PROBABILITY/RAIN24/10.0MM", Format: "grid_type_4", Suffix: "*.348"},
		"vector_grid_nmc": {DataPath: "FORECAST_PRODUCT/NMC/WIND", Format: "grid_type_11", Suffix: "*.048"},
		"station_traffic": {DataPath: "SURFACE/PLOT_TRAFFIC", Format: "station", Suffix: "*.000"},
		"station_pres_change": {DataPath: "SURFACE/PRES_CHANGE_3H_NATIONAL", Format: "station", Suffix: "*.000"},
		"diamond131_mcr": {DataPath: "SWAN_PRODUCT/LOCAL/NCRAD/TDPRODUCT/MCR", Format: "diamond_131", Suffix: "*.BZ2"},
		"diamond131_mvil": {DataPath: "SWAN_PRODUCT/LOCAL/NCRAD/TDPRODUCT/MVIL", Format: "diamond_131", Suffix: "*.BZ2"},
		"diamond131_tdmosaic": {DataPath: "SWAN_PRODUCT/LOCAL/NCRAD/TDMOSAIC", Format: "diamond_131", Suffix: "*.BZ2"},
		"swan_text_tvs": {DataPath: "SWAN_PRODUCT/LOCAL/SEVERE_STORM/NOWCASTING/TVS", Format: "swan_text", Suffix: "*.TXT"},
		"swan_text_hail": {DataPath: "SWAN_PRODUCT/LOCAL/SEVERE_STORM/NOWCASTING/HAIL", Format: "swan_text", Suffix: "*.TXT"},
		"lightning_10min": {DataPath: "SURFACE/LIGHTNING_10MIN", Format: "lightning", Suffix: "*.000"},
		"wind_profiler_robs": {DataPath: "WIND_PROFILER/ROBS/54511", Format: "wind_profiler", Suffix: "*.JSON"},
		"wind_profiler_rad": {DataPath: "WIND_PROFILER/RAD/54511", Format: "wind_profiler", Suffix: "*.JSON"},
		"awx_china_c006": {DataPath: "SATELLITE/FY4B/L1/CHINA/C006", Format: "awx", Suffix: "*.AWX"},
		"awx_fy2g_qpe": {DataPath: "SATELLITE/FY2G/L2/QPE001", Format: "awx", Suffix: "*.AWX"},
		"bmp_dust": {DataPath: "SATELLITE/FY2G/L2/DUST", Format: "bmp", Suffix: "*.BMP"},
		"marine_rocea": {DataPath: "MARINE/ROCEA_1H", Format: "station", Suffix: "*.000"},
		"surface_snow_depth": {DataPath: "SURFACE/SNOW_DEPTH_ALL_STATION", Format: "station", Suffix: "*.000"},
		"surface_vis": {DataPath: "SURFACE/HORIZONTAL_VISIBILITY_1MIN_ALL_STATION", Format: "station", Suffix: "*.000"},
		"lightning_1h": {DataPath: "SURFACE/LIGHTNING_1H", Format: "lightning", Suffix: "*.000"},
		"swan_extrap_qpf": {DataPath: "SWAN_PRODUCT/LOCAL/EXTRAPOLATION_IUM/QPF", Format: "diamond_131", Suffix: "*.BZ2"},
		"swan_gd_cotrecwind": {DataPath: "SWAN_PRODUCT/LOCAL/GD/COTRECWIND", Format: "diamond_131", Suffix: "*.BZ2"},
		"swan_gd_ref_fst": {DataPath: "SWAN_PRODUCT/LOCAL/GD/REF_FST", Format: "diamond_131", Suffix: "*.BZ2"},
	}

	for family, sample := range familyEntries {
		log.Printf("Probing family %s (%s)...", family, sample.DataPath)
		latest, err := db.GetLatestCycle(client, sample.DataPath, sample.Suffix)
		if err != nil {
			log.Printf("  GetLatestCycle failed for %s: %v", sample.DataPath, err)
		} else {
			log.Printf("  Latest cycle for %s: %s", sample.DataPath, latest)
		}

		files, err := db.GetFileList(client, sample.DataPath, 3)
		if err != nil || len(files) == 0 {
			log.Printf("  GetFileList failed for %s: %v", sample.DataPath, err)
			continue
		}
		targetFile := files[0].Name
		log.Printf("  Target file: %s (size %d)", targetFile, files[0].Size)

		blob, err := db.GetBlob(client, sample.DataPath, targetFile)
		if err != nil {
			log.Printf("  GetBlob failed for %s / %s: %v", sample.DataPath, targetFile, err)
			continue
		}

		// Wrapper detection
		outerWrapper := "plain"
		if len(blob) >= 2 && blob[0] == 0x1f && blob[1] == 0x8b {
			outerWrapper = "gzip"
		} else if len(blob) >= 3 && blob[0] == 'B' && blob[1] == 'Z' && blob[2] == 'h' {
			outerWrapper = "bzip2"
		}

		decomp, dErr := decompressGzip(blob)
		if dErr != nil {
			log.Printf("  Decompress error: %v", dErr)
			decomp = blob
		}

		innerWrapper := "plain"
		innerDecomp := decomp
		if len(decomp) >= 3 && decomp[0] == 'B' && decomp[1] == 'Z' && decomp[2] == 'h' {
			innerWrapper = "bzip2"
			if bz, bzErr := parser.DecompressBzip2(decomp); bzErr == nil {
				innerDecomp = bz
			} else {
				log.Printf("  Inner bzip2 decompress error: %v", bzErr)
			}
		}

		// Write probe text dump
		dumpFile := filepath.Join(*outDir, family+".txt")
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("Family: %s\nDataPath: %s\nFile: %s\n", family, sample.DataPath, targetFile))
		sb.WriteString(fmt.Sprintf("Raw Blob Size: %d bytes\nOuter Wrapper: %s\n", len(blob), outerWrapper))
		sb.WriteString(fmt.Sprintf("Decompressed Size: %d bytes\nInner Wrapper: %s\n", len(decomp), innerWrapper))
		if innerWrapper == "bzip2" {
			sb.WriteString(fmt.Sprintf("Inner Decompressed Size: %d bytes\n", len(innerDecomp)))
		}
		sb.WriteString("\n--- First 512 Bytes Hexdump (Payload) ---\n")
		sampleBytes := innerDecomp[:min(512, len(innerDecomp))]
		sb.WriteString(hex.Dump(sampleBytes))

		sb.WriteString("\n--- Text Preview (ASCII/UTF-8) ---\n")
		textPreview := strings.Map(func(r rune) rune {
			if r < 32 && r != '\n' && r != '\t' && r != '\r' {
				return '.'
			}
			return r
		}, string(sampleBytes[:min(256, len(sampleBytes))]))
		sb.WriteString(textPreview)
		sb.WriteString("\n")

		if err := os.WriteFile(dumpFile, []byte(sb.String()), 0644); err != nil {
			log.Printf("  Failed to write dump: %v", err)
		} else {
			log.Printf("  Dump written to %s", dumpFile)
		}

		// Save fixture (skip files > 1 MB)
		if len(blob) <= 1024*1024 {
			fixtureFile := filepath.Join(*fixturesDir, family+".bin")
			if err := os.WriteFile(fixtureFile, blob, 0644); err != nil {
				log.Printf("  Failed to write fixture: %v", err)
			} else {
				log.Printf("  Fixture written to %s (%d bytes)", fixtureFile, len(blob))
			}
		} else {
			log.Printf("  Skipping fixture for %s (size %d > 1MB)", family, len(blob))
		}
	}
	log.Println("Probe completed successfully.")
}
