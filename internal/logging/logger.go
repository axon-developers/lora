package logging

import (
	"log/slog"
	"os"
)

var Logger *slog.Logger

func InitLogger(isJSON bool, level slog.Level) *slog.Logger {
	var handler slog.Handler
	opts := &slog.HandlerOptions{
		Level: level,
	}

	if isJSON {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		handler = slog.NewTextHandler(os.Stdout, opts)
	}

	Logger = slog.New(handler)
	slog.SetDefault(Logger)
	return Logger
}

func Get() *slog.Logger {
	if Logger == nil {
		return InitLogger(false, slog.LevelInfo)
	}
	return Logger
}

