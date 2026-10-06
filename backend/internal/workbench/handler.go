package workbench

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

const Route = "/api/db/workbench"

// Handler serves GET/PUT for workbench.json (same contract as the former Vite plugin).
type Handler struct {
	FilePath string
}

type putPayload struct {
	Version int   `json:"version"`
	Pages   []any `json:"pages"`
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != Route {
		http.NotFound(w, r)
		return
	}

	switch r.Method {
	case http.MethodGet:
		h.get(w)
	case http.MethodPut:
		h.put(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *Handler) get(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	raw, err := os.ReadFile(h.FilePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte("null"))
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}

func (h *Handler) put(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	var parsed putPayload
	if err := json.Unmarshal(body, &parsed); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("Invalid workbench payload"))
		return
	}
	if parsed.Version != 1 || parsed.Pages == nil {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("Invalid workbench payload"))
		return
	}

	dir := filepath.Dir(h.FilePath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	var doc any
	if err := json.Unmarshal(body, &doc); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	formatted, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	out := append(formatted, '\n')
	if err := os.WriteFile(h.FilePath, out, 0o644); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
