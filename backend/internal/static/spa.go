package static

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Dir serves files from root and falls back to index.html for non-API paths (SPA).
func Dir(root string) http.Handler {
	root = filepath.Clean(root)
	fileServer := http.FileServer(http.Dir(root))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		path := r.URL.Path
		if path == "/" {
			http.ServeFile(w, r, filepath.Join(root, "index.html"))
			return
		}

		candidate := filepath.Join(root, filepath.Clean(strings.TrimPrefix(path, "/")))
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}

		http.ServeFile(w, r, filepath.Join(root, "index.html"))
	})
}
