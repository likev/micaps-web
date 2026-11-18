package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"micaps-web/config"
)

func setupIsolatedMultiUserHandler(t *testing.T) (*StaticHandler, string) {
	t.Helper()
	tmpDir := t.TempDir()
	origWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("chdir tmpDir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(origWD)
	})

	clientDir := filepath.Join(tmpDir, "client")
	if err := os.MkdirAll(clientDir, 0755); err != nil {
		t.Fatalf("mkdir client: %v", err)
	}
	defaultCfg := `{"name":"system-default","layers":[{"id":"t2m"}]}`
	if err := os.WriteFile(filepath.Join(clientDir, "config.json"), []byte(defaultCfg), 0644); err != nil {
		t.Fatalf("write system config: %v", err)
	}
	defaultColormaps := `{"rain":[{"val":0,"color":[0,0,0,0]},{"val":10,"color":[0,255,0,255]}]}`
	if err := os.WriteFile(filepath.Join(clientDir, "colormaps.json"), []byte(defaultColormaps), 0644); err != nil {
		t.Fatalf("write system colormaps: %v", err)
	}

	usersDir := filepath.Join(tmpDir, "users")
	h := &StaticHandler{
		Cfg: &config.Config{
			StaticDir: clientDir,
			UsersDir:  usersDir,
		},
	}
	return h, tmpDir
}

func TestUserConfigSanitizeUserID(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"", "default", false},
		{"  DEFAULT ", "default", false},
		{"Alice_01", "alice_01", false},
		{"forecaster-west", "forecaster-west", false},
		{"../etc/passwd", "", true},
		{"bad/id", "", true},
		{"has space", "", true},
	}
	for _, tc := range cases {
		got, err := SanitizeUserID(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("SanitizeUserID(%q) expected error, got %q", tc.in, got)
			}
		} else {
			if err != nil || got != tc.want {
				t.Errorf("SanitizeUserID(%q) = (%q, %v), want (%q, nil)", tc.in, got, err, tc.want)
			}
		}
	}
}

func TestUserConfigCRUDAndFallbackIsolation(t *testing.T) {
	h, tmpDir := setupIsolatedMultiUserHandler(t)

	// 1. Named user without overrides falls back to system default config & colormaps
	req := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	req.Header.Set("X-Micaps-User", "alice")
	rec := httptest.NewRecorder()
	h.ConfigHandler(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/config status = %d, want 200", rec.Code)
	}
	if src := rec.Header().Get("X-Micaps-Config-Source"); src != "system" {
		t.Fatalf("X-Micaps-Config-Source = %q, want system", src)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("system-default")) {
		t.Fatalf("expected system default config body, got %s", rec.Body.String())
	}

	// 2. Save alice's custom config -> isolated under users/alice/config.json
	aliceCfg := map[string]any{"name": "alice-workspace", "layers": []any{"radar"}}
	body, _ := json.Marshal(aliceCfg)
	saveReq := httptest.NewRequest(http.MethodPost, "/api/config", bytes.NewReader(body))
	saveReq.Header.Set("X-Micaps-User", "alice")
	saveRec := httptest.NewRecorder()
	h.ConfigHandler(saveRec, saveReq)
	if saveRec.Code != http.StatusOK {
		t.Fatalf("POST /api/config status = %d, want 200: %s", saveRec.Code, saveRec.Body.String())
	}
	if src := saveRec.Header().Get("X-Micaps-Config-Source"); src != "user" {
		t.Fatalf("POST X-Micaps-Config-Source = %q, want user", src)
	}

	// Verify system client/config.json was untouched
	sysBytes, err := os.ReadFile(filepath.Join(tmpDir, "client", "config.json"))
	if err != nil || !bytes.Contains(sysBytes, []byte("system-default")) {
		t.Fatalf("system config should remain untouched, got %q (err=%v)", string(sysBytes), err)
	}

	// Verify GET for alice returns user override, while bob still receives system fallback
	aliceGet := httptest.NewRequest(http.MethodGet, "/api/config?user=alice", nil)
	aliceRec := httptest.NewRecorder()
	h.ConfigHandler(aliceRec, aliceGet)
	if aliceRec.Header().Get("X-Micaps-Config-Source") != "user" || !bytes.Contains(aliceRec.Body.Bytes(), []byte("alice-workspace")) {
		t.Fatalf("alice GET expected user config, got source=%q body=%s", aliceRec.Header().Get("X-Micaps-Config-Source"), aliceRec.Body.String())
	}

	bobGet := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	bobGet.Header.Set("X-Micaps-User", "bob")
	bobRec := httptest.NewRecorder()
	h.ConfigHandler(bobRec, bobGet)
	if bobRec.Header().Get("X-Micaps-Config-Source") != "system" || !bytes.Contains(bobRec.Body.Bytes(), []byte("system-default")) {
		t.Fatalf("bob GET expected system fallback, got source=%q body=%s", bobRec.Header().Get("X-Micaps-Config-Source"), bobRec.Body.String())
	}

	// 3. Save alice's custom colormaps
	cmBody := []byte(`{"customRain":[{"val":5,"color":[255,0,0,255]}]}`)
	cmReq := httptest.NewRequest(http.MethodPut, "/api/colormaps", bytes.NewReader(cmBody))
	cmReq.Header.Set("X-Micaps-User", "alice")
	cmRec := httptest.NewRecorder()
	h.ColormapsHandler(cmRec, cmReq)
	if cmRec.Code != http.StatusOK || cmRec.Header().Get("X-Micaps-Config-Source") != "user" {
		t.Fatalf("PUT /api/colormaps failed: code=%d source=%q body=%s", cmRec.Code, cmRec.Header().Get("X-Micaps-Config-Source"), cmRec.Body.String())
	}

	cmGet := httptest.NewRequest(http.MethodGet, "/api/colormaps?user=alice", nil)
	cmGetRec := httptest.NewRecorder()
	h.ColormapsHandler(cmGetRec, cmGet)
	if cmGetRec.Header().Get("X-Micaps-Config-Source") != "user" || !bytes.Contains(cmGetRec.Body.Bytes(), []byte("customRain")) {
		t.Fatalf("GET /api/colormaps for alice failed: source=%q body=%s", cmGetRec.Header().Get("X-Micaps-Config-Source"), cmGetRec.Body.String())
	}

	// 4. Create user bob cloned from alice
	createReq := httptest.NewRequest(http.MethodPost, "/api/users", bytes.NewReader([]byte(`{"id":"bob","name":"Forecaster Bob","cloneFrom":"alice"}`)))
	createRec := httptest.NewRecorder()
	h.UsersHandler(createRec, createReq)
	if createRec.Code != http.StatusOK {
		t.Fatalf("POST /api/users clone failed: code=%d body=%s", createRec.Code, createRec.Body.String())
	}

	bobClonedGet := httptest.NewRequest(http.MethodGet, "/api/config?user=bob", nil)
	bobClonedRec := httptest.NewRecorder()
	h.ConfigHandler(bobClonedRec, bobClonedGet)
	if bobClonedRec.Header().Get("X-Micaps-Config-Source") != "user" || !bytes.Contains(bobClonedRec.Body.Bytes(), []byte("alice-workspace")) {
		t.Fatalf("cloned bob expected alice's config, got source=%q body=%s", bobClonedRec.Header().Get("X-Micaps-Config-Source"), bobClonedRec.Body.String())
	}

	// 5. GET /api/users lists default, alice, bob
	listReq := httptest.NewRequest(http.MethodGet, "/api/users", nil)
	listRec := httptest.NewRecorder()
	h.UsersHandler(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("GET /api/users failed: %d", listRec.Code)
	}
	var listResp struct {
		Status string            `json:"status"`
		Users  []UserProfileMeta `json:"users"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("decode users list: %v", err)
	}
	if len(listResp.Users) != 3 || listResp.Users[0].ID != "default" {
		t.Fatalf("unexpected users list: %+v", listResp.Users)
	}

	// 6. Reset alice back to system defaults
	resetReq := httptest.NewRequest(http.MethodPost, "/api/config/reset", bytes.NewReader([]byte(`{"user":"alice","target":"all"}`)))
	resetRec := httptest.NewRecorder()
	h.ConfigResetHandler(resetRec, resetReq)
	if resetRec.Code != http.StatusOK {
		t.Fatalf("POST /api/config/reset failed: code=%d body=%s", resetRec.Code, resetRec.Body.String())
	}
	aliceAfterReset := httptest.NewRequest(http.MethodGet, "/api/config?user=alice", nil)
	aliceAfterRec := httptest.NewRecorder()
	h.ConfigHandler(aliceAfterRec, aliceAfterReset)
	if aliceAfterRec.Header().Get("X-Micaps-Config-Source") != "system" {
		t.Fatalf("alice after reset expected system source, got %q", aliceAfterRec.Header().Get("X-Micaps-Config-Source"))
	}

	// 7. Delete bob; default cannot be deleted
	delDefault := httptest.NewRequest(http.MethodDelete, "/api/users?user=default", nil)
	delDefaultRec := httptest.NewRecorder()
	h.UsersHandler(delDefaultRec, delDefault)
	if delDefaultRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 deleting default, got %d", delDefaultRec.Code)
	}

	delBob := httptest.NewRequest(http.MethodDelete, "/api/users?user=bob", nil)
	delBobRec := httptest.NewRecorder()
	h.UsersHandler(delBobRec, delBob)
	if delBobRec.Code != http.StatusOK {
		t.Fatalf("DELETE /api/users?user=bob failed: %d", delBobRec.Code)
	}
}
