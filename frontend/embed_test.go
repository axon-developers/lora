package frontend

import (
	"io/fs"
	"testing"
)

func TestGetFS(t *testing.T) {
	sub, err := GetFS()
	if err != nil {
		t.Fatalf("GetFS returned error: %v", err)
	}

	err = fs.WalkDir(sub, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		t.Logf("Embedded file: %s (isDir=%t)", path, d.IsDir())
		return nil
	})
	if err != nil {
		t.Fatalf("WalkDir failed: %v", err)
	}

	index, err := sub.Open("index.html")
	if err != nil {
		t.Fatalf("Failed to open index.html: %v", err)
	}
	defer index.Close()
}

