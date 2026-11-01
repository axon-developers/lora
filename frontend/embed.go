package frontend

import (
	"embed"
	"io/fs"
)

//go:embed dist/*
//go:embed dist/assets/*
var distFS embed.FS

func GetFS() (fs.FS, error) {
	return fs.Sub(distFS, "dist")
}

