package appdirs

import (
	"os"
	"path/filepath"
)

// Base returns the directory of the running executable, or the working directory.
func Base() string {
	exe, err := os.Executable()
	if err != nil {
		wd, _ := os.Getwd()
		return wd
	}
	return filepath.Dir(exe)
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// ResolveDataDir uses flag when set; otherwise ./data next to the executable.
func ResolveDataDir(flag string) string {
	if flag != "" {
		return flag
	}
	return filepath.Join(Base(), "data")
}

// ResolveDist uses flag when set; otherwise ./dist next to the executable if it exists.
func ResolveDist(flag string) string {
	if flag != "" {
		return flag
	}
	candidate := filepath.Join(Base(), "dist")
	if dirExists(candidate) {
		return candidate
	}
	return ""
}
