package handler

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log"
	"net/http"
	"strconv"
	"strings"

	"micaps-web/db"
	"micaps-web/filecache"
	"micaps-web/mock"
	"micaps-web/model"
	"micaps-web/parser"
)

// ImageHandler handles /api/data/image for geo-registered satellite raster imagery (e.g. FY-2G Dust RGB)
type ImageHandler struct {
	Client   *db.CQLClient
	Cache    *filecache.Cache
	MockMode bool
}

// Handler handles /api/data/image returning either JSON image metadata or binary PNG stream
func (h *ImageHandler) Handler(w http.ResponseWriter, r *http.Request) {
	dataPath := SanitizeGridPath(r.URL.Query().Get("path"))
	file := SanitizeFile(r.URL.Query().Get("file"))
	format := strings.ToLower(r.URL.Query().Get("format"))

	// Default bounds for FY-2G East Asia regional dust products [minLon, minLat, maxLon, maxLat]
	bounds := []float64{45.0, 5.0, 155.0, 55.0}

	if format == "json" || strings.Contains(r.Header.Get("Accept"), "application/json") {
		w.Header().Set("Content-Type", "application/json")
		resp := model.ImageResponse{
			URL:    fmt.Sprintf("/api/data/image?path=%s&file=%s&format=png", dataPath, file),
			Bounds: bounds,
			Format: "png",
		}
		json.NewEncoder(w).Encode(resp)
		return
	}

	step := 1
	if stepStr := r.URL.Query().Get("step"); stepStr != "" {
		if s, err := strconv.Atoi(stepStr); err == nil && s > 0 {
			step = s
		}
	} else {
		// Default 2x decimation for web display performance (< 3s gate)
		step = 2
	}

	beforeDate, pErr := ParseHistoryDateParam(r)
	if pErr != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, pErr.Error()), http.StatusBadRequest)
		return
	}
	pngBytes, err := h.fetchAndConvertImage(dataPath, file, step, beforeDate)
	if err != nil {
		if h.MockMode {
			log.Printf("[ImageHandler] Mock fallback for image %s: %v", dataPath, err)
			pngBytes = mock.GenerateMockImagePNG(step)
		} else {
			log.Printf("[ImageHandler] Error fetching image: %v", err)
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte(err.Error()))
			return
		}
	}

	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Content-Length", strconv.Itoa(len(pngBytes)))
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Write(pngBytes)
}

func (h *ImageHandler) fetchAndConvertImage(dataPath, file string, step int, beforeDate ...string) ([]byte, error) {
	if dataPath == "" {
		return nil, fmt.Errorf("missing query parameter 'path'")
	}

	if file == "" || file == "latest" {
		if h.Client != nil && !h.MockMode {
			latest, err := db.GetLatestCycle(h.Client, dataPath, "*.BMP", beforeDate...)
			if err == nil && latest != "" {
				file = latest
			} else {
				files, fErr := db.GetFileList(h.Client, dataPath, 1, beforeDate...)
				if fErr == nil && len(files) > 0 {
					file = files[0].Name
				}
			}
		}
	}

	if file == "" {
		file = "latest"
	}

	var rawBlob []byte
	if h.Cache != nil {
		if cached, _, ok := h.Cache.Get("SATELLITE", dataPath, file); ok {
			rawBlob = cached
		}
	}

	if rawBlob == nil {
		if h.Client == nil {
			if h.MockMode {
				return mock.GenerateMockImagePNG(step), nil
			}
			return nil, fmt.Errorf("missing CQL client connection")
		}
		b, err := db.GetBlob(h.Client, dataPath, file)
		if err != nil {
			return nil, err
		}
		if h.Cache != nil {
			_ = h.Cache.Put("SATELLITE", dataPath, file, b, nil)
		}
		rawBlob = b
	}

	unwrapped, err := parser.UnwrapPayload(rawBlob)
	if err != nil {
		return nil, err
	}

	return decodeBMPToPNG(unwrapped, step)
}

// decodeBMPToPNG decodes an uncompressed 24-bit BMP image and encodes to PNG with decimation step.
func decodeBMPToPNG(bmpData []byte, step int) ([]byte, error) {
	if len(bmpData) < 54 {
		return nil, fmt.Errorf("BMP payload too short: %d bytes", len(bmpData))
	}
	if bmpData[0] != 'B' || bmpData[1] != 'M' {
		return nil, fmt.Errorf("not a BMP file: signature %c%c", bmpData[0], bmpData[1])
	}

	pixelOffset := int(binary.LittleEndian.Uint32(bmpData[10:14]))
	width := int(int32(binary.LittleEndian.Uint32(bmpData[18:22])))
	height := int(int32(binary.LittleEndian.Uint32(bmpData[22:26])))
	bpp := int(binary.LittleEndian.Uint16(bmpData[28:30]))

	if width <= 0 || height == 0 {
		return nil, fmt.Errorf("invalid BMP dimensions: %dx%d", width, height)
	}
	if bpp != 24 {
		return nil, fmt.Errorf("unsupported BMP bit depth: %d (expected 24-bit RGB)", bpp)
	}

	isBottomUp := height > 0
	absHeight := height
	if !isBottomUp {
		absHeight = -height
	}

	if step <= 0 {
		step = 1
	}

	outW := (width + step - 1) / step
	outH := (absHeight + step - 1) / step

	rowStride := ((width*3 + 3) / 4) * 4
	if pixelOffset+absHeight*rowStride > len(bmpData) {
		return nil, fmt.Errorf("truncated BMP data: needed %d bytes from %d, got %d", absHeight*rowStride, pixelOffset, len(bmpData))
	}

	img := image.NewRGBA(image.Rect(0, 0, outW, outH))

	for outY := 0; outY < outH; outY++ {
		origY := outY * step
		var bmpY int
		if isBottomUp {
			bmpY = (absHeight - 1) - origY
		} else {
			bmpY = origY
		}
		if bmpY < 0 {
			bmpY = 0
		}
		if bmpY >= absHeight {
			bmpY = absHeight - 1
		}

		rowStart := pixelOffset + bmpY*rowStride

		for outX := 0; outX < outW; outX++ {
			origX := outX * step
			if origX >= width {
				origX = width - 1
			}
			idx := rowStart + origX*3
			b := bmpData[idx]
			g := bmpData[idx+1]
			r := bmpData[idx+2]
			img.SetRGBA(outX, outY, color.RGBA{R: r, G: g, B: b, A: 255})
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("failed to encode PNG: %w", err)
	}

	return buf.Bytes(), nil
}
