package handler

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestColormapsHandlerPostWritesFile(t *testing.T) {
	dir := t.TempDir()
	old, _ := os.Getwd()
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	defer os.Chdir(old)
	os.MkdirAll("client", 0o755)
	os.WriteFile("client/colormaps.json", []byte("{}"), 0o644)

	h := &StaticHandler{}
	body := `{"TMP":[{"val":0,"color":[1,2,3,255]},{"val":10,"color":[4,5,6,255]}]}`
	w := httptest.NewRecorder()
	h.ColormapsHandler(w, httptest.NewRequest(http.MethodPost, "/api/colormaps", strings.NewReader(body)))
	if w.Code != http.StatusOK {
		t.Fatalf("POST status %d: %s", w.Code, w.Body.String())
	}
	data, _ := os.ReadFile("client/colormaps.json")
	if !strings.Contains(string(data), `"TMP"`) || !strings.Contains(string(data), "[1, 2, 3, 255]") {
		t.Fatalf("unexpected file: %s", data)
	}

	w = httptest.NewRecorder()
	h.ColormapsHandler(w, httptest.NewRequest(http.MethodGet, "/api/colormaps", nil))
	if !strings.Contains(w.Body.String(), `"TMP"`) {
		t.Fatalf("GET did not return saved colormaps: %s", w.Body.String())
	}

	w = httptest.NewRecorder()
	h.ColormapsHandler(w, httptest.NewRequest(http.MethodPost, "/api/colormaps", strings.NewReader("[1")))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("bad JSON status %d", w.Code)
	}
}
