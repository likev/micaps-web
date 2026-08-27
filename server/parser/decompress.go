package parser

import (
	"bytes"
	"compress/bzip2"
	"compress/gzip"
	"fmt"
	"io"
)

// DecompressGzip extracts gzip-compressed payload, locating magic bytes 0x1f 0x8b
func DecompressGzip(data []byte) ([]byte, error) {
	if len(data) < 2 {
		return nil, fmt.Errorf("data too short for gzip decompression")
	}

	// Locate gzip magic header 0x1f, 0x8b
	gzipOffset := -1
	for i := 0; i < len(data)-1; i++ {
		if data[i] == 0x1f && data[i+1] == 0x8b {
			gzipOffset = i
			break
		}
	}

	if gzipOffset == -1 {
		// Attempt direct decompression in case no offset
		r, err := gzip.NewReader(bytes.NewReader(data))
		if err != nil {
			return nil, fmt.Errorf("gzip magic header not found: %w", err)
		}
		defer r.Close()
		return io.ReadAll(r)
	}

	r, err := gzip.NewReader(bytes.NewReader(data[gzipOffset:]))
	if err != nil {
		return nil, fmt.Errorf("failed to create gzip reader: %w", err)
	}
	defer r.Close()

	decompressed, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("gzip read error: %w", err)
	}
	return decompressed, nil
}

// DecompressBzip2 extracts bz2-compressed payload
func DecompressBzip2(data []byte) ([]byte, error) {
	r := bzip2.NewReader(bytes.NewReader(data))
	return io.ReadAll(r)
}
