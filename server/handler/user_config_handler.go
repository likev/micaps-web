package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

var validUserIDRegex = regexp.MustCompile(`^[a-z0-9_-]{1,32}$`)

var (
	reCompactColor         = regexp.MustCompile(`"color":\s*\[\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\]`)
	reCompactValColor      = regexp.MustCompile(`\{\s*"val":\s*(-?[\d.]+),\s*"color":\s*(\[[^\]]+\])\s*\}`)
	reColormapArray        = regexp.MustCompile(`\[\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\]`)
	reColormapValColor     = regexp.MustCompile(`\{\s*"color":\s*(\[[^\]]+\]),\s*"val":\s*(-?[\d.]+)\s*\}`)
	rePrimitiveArrayLines  = regexp.MustCompile(`\[\s*\n\s*(?:[0-9eE.+-]+|"[^"\n]*"|true|false|null)(?:,\s*\n\s*(?:[0-9eE.+-]+|"[^"\n]*"|true|false|null))*\s*\n\s*\]`)
)

// UserProfileMeta stores metadata about a workstation configuration profile.
type UserProfileMeta struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	IsDefault          bool     `json:"isDefault,omitempty"`
	HasCustomConfig    bool     `json:"hasCustomConfig"`
	HasCustomColormaps bool     `json:"hasCustomColormaps"`
	Favorites          []string `json:"favorites,omitempty"`
	UpdatedAt          string   `json:"updatedAt,omitempty"`
}

// SanitizeUserID normalizes and validates a user profile ID.
// Empty or "default" resolves to "default".
func SanitizeUserID(raw string) (string, error) {
	id := strings.ToLower(strings.TrimSpace(raw))
	if id == "" || id == "default" {
		return "default", nil
	}
	if !validUserIDRegex.MatchString(id) {
		return "", fmt.Errorf("invalid user id %q: must match ^[a-z0-9_-]{1,32}$", raw)
	}
	return id, nil
}

// ExtractRequestUserID resolves the user ID from X-Micaps-User header or ?user= query param.
func ExtractRequestUserID(r *http.Request) (string, error) {
	raw := strings.TrimSpace(r.Header.Get("X-Micaps-User"))
	if raw == "" {
		raw = strings.TrimSpace(r.URL.Query().Get("user"))
	}
	return SanitizeUserID(raw)
}

func (h *StaticHandler) usersBaseDir() string {
	if h != nil && h.Cfg != nil && strings.TrimSpace(h.Cfg.UsersDir) != "" {
		return h.Cfg.UsersDir
	}
	return "./users"
}

func (h *StaticHandler) userDirPath(userID string) string {
	return filepath.Join(h.usersBaseDir(), userID)
}

// FormatCompactConfigBytes formats config JSON keeping primitive arrays and color stops compact.
func FormatCompactConfigBytes(obj any) ([]byte, error) {
	formatted, err := json.MarshalIndent(obj, "", "  ")
	if err != nil {
		return nil, err
	}
	str := string(formatted)
	str = rePrimitiveArrayLines.ReplaceAllStringFunc(str, func(match string) string {
		var arr []any
		if err := json.Unmarshal([]byte(match), &arr); err == nil {
			parts := make([]string, 0, len(arr))
			for _, item := range arr {
				b, mErr := json.Marshal(item)
				if mErr != nil {
					return match
				}
				parts = append(parts, string(b))
			}
			return "[" + strings.Join(parts, ", ") + "]"
		}
		return match
	})
	str = reCompactColor.ReplaceAllString(str, `"color": [$1, $2, $3, $4]`)
	str = reCompactValColor.ReplaceAllString(str, `{ "val": $1, "color": $2 }`)
	return []byte(str), nil
}

// FormatCompactColormapsBytes formats colormaps JSON keeping RGBA arrays and stops on single lines.
func FormatCompactColormapsBytes(obj map[string]any) ([]byte, error) {
	formatted, err := json.MarshalIndent(obj, "", "  ")
	if err != nil {
		return nil, err
	}
	str := string(formatted)
	str = reColormapArray.ReplaceAllString(str, `[$1, $2, $3, $4]`)
	str = reColormapValColor.ReplaceAllString(str, `{ "color": $1, "val": $2 }`)
	str = reCompactValColor.ReplaceAllString(str, `{ "val": $1, "color": $2 }`)
	return []byte(str + "\n"), nil
}

func writeFileAtomic(targetPath string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	return os.Rename(tmpName, targetPath)
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func readUserMeta(userDir, userID string) UserProfileMeta {
	meta := UserProfileMeta{
		ID:                 userID,
		Name:               userID,
		HasCustomConfig:    fileExists(filepath.Join(userDir, "config.json")),
		HasCustomColormaps: fileExists(filepath.Join(userDir, "colormaps.json")),
	}
	metaPath := filepath.Join(userDir, "meta.json")
	if data, err := os.ReadFile(metaPath); err == nil {
		var stored UserProfileMeta
		if err := json.Unmarshal(data, &stored); err == nil {
			if strings.TrimSpace(stored.Name) != "" {
				meta.Name = stored.Name
			}
			if len(stored.Favorites) > 0 {
				meta.Favorites = stored.Favorites
			}
			meta.UpdatedAt = stored.UpdatedAt
		}
	}
	return meta
}

func writeUserMeta(userDir string, meta UserProfileMeta) error {
	meta.ID = strings.ToLower(strings.TrimSpace(meta.ID))
	if strings.TrimSpace(meta.Name) == "" {
		meta.Name = meta.ID
	}
	meta.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	meta.HasCustomConfig = fileExists(filepath.Join(userDir, "config.json"))
	meta.HasCustomColormaps = fileExists(filepath.Join(userDir, "colormaps.json"))
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(filepath.Join(userDir, "meta.json"), append(data, '\n'), 0644)
}

func touchUserMetaTimestamp(userDir, userID string) {
	meta := readUserMeta(userDir, userID)
	_ = writeUserMeta(userDir, meta)
}

func copyFileIfExists(srcPath, dstPath string) error {
	data, err := os.ReadFile(srcPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return writeFileAtomic(dstPath, data, 0644)
}

func resolveSystemFilePath(candidates []string, fallback string) string {
	for _, p := range candidates {
		if fileExists(p) {
			return p
		}
	}
	return fallback
}

// UsersHandler lists, creates/clones, and deletes workstation user profiles.
func (h *StaticHandler) UsersHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Micaps-User")
	w.Header().Set("Access-Control-Expose-Headers", "X-Micaps-Config-Source, X-Micaps-User")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case http.MethodGet:
		users := []UserProfileMeta{
			{
				ID:        "default",
				Name:      "System Default",
				IsDefault: true,
			},
		}
		baseDir := h.usersBaseDir()
		entries, err := os.ReadDir(baseDir)
		if err == nil {
			var custom []UserProfileMeta
			for _, entry := range entries {
				if !entry.IsDir() {
					continue
				}
				uid, uErr := SanitizeUserID(entry.Name())
				if uErr != nil || uid == "default" {
					continue
				}
				custom = append(custom, readUserMeta(filepath.Join(baseDir, uid), uid))
			}
			sort.Slice(custom, func(i, j int) bool {
				return custom[i].ID < custom[j].ID
			})
			users = append(users, custom...)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "ok",
			"users":  users,
		})

	case http.MethodPost, http.MethodPut:
		var req struct {
			ID         string   `json:"id"`
			Name       string   `json:"name"`
			CloneFrom  string   `json:"cloneFrom"`
			CopySystem bool     `json:"copySystem"`
			Favorites  []string `json:"favorites"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"Invalid JSON: `+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		uid, err := SanitizeUserID(req.ID)
		if err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		if uid == "default" {
			http.Error(w, `{"error":"Cannot create or overwrite reserved profile 'default'"}`, http.StatusBadRequest)
			return
		}

		targetDir := h.userDirPath(uid)
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			http.Error(w, `{"error":"Failed to create user directory: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		if strings.TrimSpace(req.CloneFrom) != "" {
			srcID, sErr := SanitizeUserID(req.CloneFrom)
			if sErr != nil {
				http.Error(w, `{"error":"Invalid cloneFrom user: `+sErr.Error()+`"}`, http.StatusBadRequest)
				return
			}
			if srcID == "default" {
				if req.CopySystem {
					if err := copyFileIfExists(resolveSystemFilePath(systemConfigCandidates(), "client/config.json"), filepath.Join(targetDir, "config.json")); err != nil {
						http.Error(w, `{"error":"Clone error: `+err.Error()+`"}`, http.StatusInternalServerError)
						return
					}
					if err := copyFileIfExists(resolveSystemFilePath(systemColormapsCandidates(), "client/colormaps.json"), filepath.Join(targetDir, "colormaps.json")); err != nil {
						http.Error(w, `{"error":"Clone error: `+err.Error()+`"}`, http.StatusInternalServerError)
						return
					}
				}
			} else if srcID != uid {
				srcDir := h.userDirPath(srcID)
				if err := copyFileIfExists(filepath.Join(srcDir, "config.json"), filepath.Join(targetDir, "config.json")); err != nil {
					http.Error(w, `{"error":"Clone config error: `+err.Error()+`"}`, http.StatusInternalServerError)
					return
				}
				if err := copyFileIfExists(filepath.Join(srcDir, "colormaps.json"), filepath.Join(targetDir, "colormaps.json")); err != nil {
					http.Error(w, `{"error":"Clone colormaps error: `+err.Error()+`"}`, http.StatusInternalServerError)
					return
				}
			}
		}

		existing := readUserMeta(targetDir, uid)
		if strings.TrimSpace(req.Name) != "" {
			existing.Name = strings.TrimSpace(req.Name)
		}
		if req.Favorites != nil {
			existing.Favorites = req.Favorites
		}
		if err := writeUserMeta(targetDir, existing); err != nil {
			http.Error(w, `{"error":"Failed to write user metadata: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		updated := readUserMeta(targetDir, uid)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "ok",
			"user":   updated,
		})

	case http.MethodDelete:
		uid, err := ExtractRequestUserID(r)
		if err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		if uid == "default" {
			http.Error(w, `{"error":"Cannot delete reserved 'default' profile"}`, http.StatusBadRequest)
			return
		}
		if err := os.RemoveAll(h.userDirPath(uid)); err != nil {
			http.Error(w, `{"error":"Failed to delete user profile: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":  "ok",
			"deleted": uid,
		})

	default:
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// ConfigResetHandler removes custom user config/colormaps overrides so the user reverts to system defaults.
func (h *StaticHandler) ConfigResetHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Micaps-User")
	w.Header().Set("Access-Control-Expose-Headers", "X-Micaps-Config-Source, X-Micaps-User")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost && r.Method != http.MethodDelete {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		User   string `json:"user"`
		Target string `json:"target"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	rawUser := strings.TrimSpace(req.User)
	var uid string
	var err error
	if rawUser != "" {
		uid, err = SanitizeUserID(rawUser)
	} else {
		uid, err = ExtractRequestUserID(r)
	}
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}
	if uid == "default" {
		http.Error(w, `{"error":"Cannot reset system default configuration"}`, http.StatusBadRequest)
		return
	}

	target := strings.ToLower(strings.TrimSpace(req.Target))
	if target == "" {
		target = "all"
	}
	if target != "all" && target != "config" && target != "colormaps" {
		http.Error(w, `{"error":"Invalid reset target; expected all, config, or colormaps"}`, http.StatusBadRequest)
		return
	}

	userDir := h.userDirPath(uid)
	if target == "all" || target == "config" {
		if err := os.Remove(filepath.Join(userDir, "config.json")); err != nil && !os.IsNotExist(err) {
			http.Error(w, `{"error":"Failed to reset config: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
	}
	if target == "all" || target == "colormaps" {
		if err := os.Remove(filepath.Join(userDir, "colormaps.json")); err != nil && !os.IsNotExist(err) {
			http.Error(w, `{"error":"Failed to reset colormaps: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
	}
	if _, statErr := os.Stat(userDir); statErr == nil {
		touchUserMetaTimestamp(userDir, uid)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Micaps-User", uid)
	w.Header().Set("X-Micaps-Config-Source", "system")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status": "ok",
		"user":   uid,
		"target": target,
	})
}
