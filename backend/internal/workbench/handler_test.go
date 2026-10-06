package workbench

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGetMissingReturnsNull(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "workbench.json")
	h := &Handler{FilePath: path}

	req := httptest.NewRequest(http.MethodGet, Route, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if body := rec.Body.String(); body != "null" {
		t.Fatalf("body = %q, want null", body)
	}
}

func TestPutValidatesVersion(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "workbench.json")
	h := &Handler{FilePath: path}

	req := httptest.NewRequest(http.MethodPut, Route, strings.NewReader(`{"version":2,"pages":[]}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestPutRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "workbench.json")
	h := &Handler{FilePath: path}

	body := `{"version":1,"pages":[],"activePageId":"p1"}`
	req := httptest.NewRequest(http.MethodPut, Route, strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("put status = %d", rec.Code)
	}

	req = httptest.NewRequest(http.MethodGet, Route, nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get status = %d", rec.Code)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
}
