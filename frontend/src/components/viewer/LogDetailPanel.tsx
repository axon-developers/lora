import React, { useState, useEffect, useRef } from 'react';
import { LogEntry } from '../../types';
import {
  X,
  Copy,
  Check,
  Code2,
  FileText,
  Image as ImageIcon,
  Clock,
  Box,
  Layers,
  Hash,
} from 'lucide-react';

interface LogDetailPanelProps {
  entry: LogEntry | null;
  onClose: () => void;
}

export const LogDetailPanel: React.FC<LogDetailPanelProps> = ({ entry, onClose }) => {
  const [activeTab, setActiveTab] = useState<'json' | 'raw'>('json');
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [isCapturingImage, setIsCapturingImage] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!entry) return null;

  // Try extracting JSON from message
  let parsedJson: any = null;
  let isJson = false;

  try {
    parsedJson = JSON.parse(entry.message);
    isJson = typeof parsedJson === 'object' && parsedJson !== null;
  } catch {
    // If not pure JSON, check if there's an embedded JSON object inside the log line
    const firstBrace = entry.message.indexOf('{');
    const lastBrace = entry.message.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        const potentialJson = entry.message.substring(firstBrace, lastBrace + 1);
        parsedJson = JSON.parse(potentialJson);
        isJson = typeof parsedJson === 'object' && parsedJson !== null;
      } catch {
        isJson = false;
      }
    }
  }

  const jsonString = isJson ? JSON.stringify(parsedJson, null, 2) : '';

  const handleCopyRaw = () => {
    navigator.clipboard.writeText(entry.message);
    setCopiedType('raw');
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonString || entry.message);
    setCopiedType('json');
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCopyAsImage = async () => {
    setIsCapturingImage(true);
    try {
      const isDark = document.documentElement.classList.contains('dark') || !document.documentElement.classList.contains('light');
      const textToRender = isJson ? jsonString : entry.message;
      const lines = textToRender.split('\n');

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const lineHeight = 20;
      const font = '12px "JetBrains Mono", Menlo, Monaco, Consolas, "Courier New", monospace';
      ctx.font = font;

      // Calculate width
      let maxLineWidth = 0;
      for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > maxLineWidth) maxLineWidth = w;
      }

      const paddingX = 28;
      const paddingTop = 50;
      const paddingBottom = 28;
      const lineGutterWidth = 40;

      const canvasWidth = Math.max(540, Math.ceil(maxLineWidth + paddingX * 2 + lineGutterWidth));
      const canvasHeight = Math.ceil(paddingTop + lines.length * lineHeight + paddingBottom);

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      // Theme Colors
      const bgColor = isDark ? '#0f172a' : '#ffffff';
      const borderColor = isDark ? '#334155' : '#e2e8f0';
      const headerBg = isDark ? '#1e293b' : '#f8fafc';
      const textColor = isDark ? '#e2e8f0' : '#1e293b';
      const gutterColor = isDark ? '#475569' : '#94a3b8';
      const stringColor = isDark ? '#34d399' : '#047857';
      const keyColor = isDark ? '#a78bfa' : '#6d28d9';
      const numColor = isDark ? '#fbbf24' : '#b45309';
      const boolColor = isDark ? '#60a5fa' : '#0284c7';

      // Background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Header Bar
      ctx.fillStyle = headerBg;
      ctx.fillRect(0, 0, canvasWidth, 38);

      // Border outline
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, canvasWidth - 1, canvasHeight - 1);
      ctx.beginPath();
      ctx.moveTo(0, 38);
      ctx.lineTo(canvasWidth, 38);
      ctx.stroke();

      // Mac Window Dots
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(18, 19, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(34, 19, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(50, 19, 5, 0, Math.PI * 2);
      ctx.fill();

      // Title in Header
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      const titleText = `LORA Log Inspector • ${entry.pod_name || 'pod'} • ${entry.container || 'container'}`;
      ctx.fillText(titleText, 70, 23);

      // Render Text Lines
      ctx.font = font;

      lines.forEach((line, idx) => {
        const y = paddingTop + idx * lineHeight;

        // Line number in gutter
        ctx.fillStyle = gutterColor;
        ctx.textAlign = 'right';
        ctx.fillText(String(idx + 1), paddingX + lineGutterWidth - 12, y);

        // Code content
        ctx.textAlign = 'left';
        const startX = paddingX + lineGutterWidth;

        // Simple token colorization for JSON
        if (isJson) {
          const matchKey = line.match(/^(\s*)(".*?")(\s*:\s*)(.*)$/);
          if (matchKey) {
            const [, indent, key, colon, val] = matchKey;
            let curX = startX + ctx.measureText(indent).width;

            // Key
            ctx.fillStyle = keyColor;
            ctx.fillText(key, curX, y);
            curX += ctx.measureText(key).width;

            // Colon
            ctx.fillStyle = textColor;
            ctx.fillText(colon, curX, y);
            curX += ctx.measureText(colon).width;

            // Value color
            const trimmedVal = val.trim();
            if (trimmedVal.startsWith('"')) {
              ctx.fillStyle = stringColor;
            } else if (trimmedVal === 'true' || trimmedVal === 'false') {
              ctx.fillStyle = boolColor;
            } else if (!isNaN(Number(trimmedVal.replace(/,$/, '')))) {
              ctx.fillStyle = numColor;
            } else {
              ctx.fillStyle = textColor;
            }
            ctx.fillText(val, curX, y);
            return;
          }
        }

        ctx.fillStyle = textColor;
        ctx.fillText(line, startX, y);
      });

      // Write to Clipboard
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          if (navigator.clipboard && (window as any).ClipboardItem) {
            await navigator.clipboard.write([
              new (window as any).ClipboardItem({ 'image/png': blob }),
            ]);
            setCopiedType('image');
            setTimeout(() => setCopiedType(null), 2500);
          } else {
            // Fallback download if clipboard image write unsupported
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `log-${entry.pod_name}-${entry.seq}.png`;
            a.click();
            URL.revokeObjectURL(url);
            setCopiedType('image');
            setTimeout(() => setCopiedType(null), 2500);
          }
        } catch {
          // Fallback download on error
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `log-${entry.pod_name}-${entry.seq}.png`;
          a.click();
          URL.revokeObjectURL(url);
          setCopiedType('image');
          setTimeout(() => setCopiedType(null), 2500);
        }
      }, 'image/png');
    } finally {
      setIsCapturingImage(false);
    }
  };

  // Syntax-highlighted JSON rendering
  const renderHighlightedJson = (json: string) => {
    return json.split('\n').map((line, index) => {
      // Check for key-value pair: "key": value
      const match = line.match(/^(\s*)("(?:\\.|[^"\\])*")(\s*:\s*)(.*)$/);

      if (match) {
        const [, indent, key, colon, value] = match;

        let valElement = <span className="text-slate-800 dark:text-slate-200">{value}</span>;
        const trimmedVal = value.trim();

        if (trimmedVal.startsWith('"')) {
          valElement = <span className="text-emerald-700 dark:text-emerald-400">{value}</span>;
        } else if (trimmedVal === 'true' || trimmedVal === 'false') {
          valElement = <span className="text-sky-700 dark:text-sky-400 font-bold">{value}</span>;
        } else if (trimmedVal === 'null') {
          valElement = <span className="text-rose-700 dark:text-rose-400 italic">{value}</span>;
        } else if (!isNaN(Number(trimmedVal.replace(/,$/, '')))) {
          valElement = <span className="text-amber-800 dark:text-amber-400 font-medium">{value}</span>;
        }

        return (
          <div key={index} className="flex hover:bg-slate-100 dark:hover:bg-slate-800/40 px-2 py-0.5 rounded">
            <span className="w-8 shrink-0 select-none text-slate-400 dark:text-slate-500 text-right pr-2 text-[10px]">{index + 1}</span>
            <span className="flex-1 whitespace-pre-wrap break-all font-mono">
              {indent}
              <span className="text-indigo-700 dark:text-indigo-300 font-semibold">{key}</span>
              <span className="text-slate-500 dark:text-slate-400">{colon}</span>
              {valElement}
            </span>
          </div>
        );
      }

      return (
        <div key={index} className="flex hover:bg-slate-100 dark:hover:bg-slate-800/40 px-2 py-0.5 rounded">
          <span className="w-8 shrink-0 select-none text-slate-400 dark:text-slate-500 text-right pr-2 text-[10px]">{index + 1}</span>
          <span className="flex-1 whitespace-pre-wrap break-all text-slate-800 dark:text-slate-300 font-mono">
            {line}
          </span>
        </div>
      );
    });
  };

  return (
    <aside className="w-[520px] max-w-full h-full border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col z-30 shadow-2xl transition-all duration-200 select-text">
      {/* Panel Header */}
      <div className="h-12 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between bg-slate-50 dark:bg-slate-950/70">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">Log Inspector</span>
          {isJson && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 font-bold">
              JSON
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title="Close Inspector (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Metadata Bar */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 space-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {entry.pod_name && (
            <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 font-mono text-[11px] flex items-center gap-1">
              <Box className="w-3 h-3" />
              {entry.pod_name}
            </span>
          )}
          {entry.container && (
            <span className="px-2 py-0.5 rounded bg-cyan-50 dark:bg-cyan-500/10 text-cyan-800 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 font-mono text-[11px] flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {entry.container}
            </span>
          )}
          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono text-[11px] flex items-center gap-1">
            <Hash className="w-3 h-3 text-slate-400 dark:text-slate-500" />
            Seq: {entry.seq}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 font-mono">
          <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
          <span>{entry.timestamp}</span>
        </div>
      </div>

      {/* Actions & Tab Switcher Bar */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-950/20">
        <div className="flex items-center gap-1">
          {isJson && (
            <button
              onClick={() => setActiveTab('json')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 transition shadow-2xs ${
                activeTab === 'json'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Formatted</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('raw')}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 transition shadow-2xs ${
              activeTab === 'raw' || !isJson
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Raw</span>
          </button>
        </div>

        {/* Action Buttons: Copy Raw, Copy JSON, Copy as Image */}
        <div className="flex items-center gap-1.5 font-mono text-xs">
          {isJson && (
            <button
              onClick={handleCopyJson}
              className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition border border-slate-300 dark:border-slate-700 flex items-center gap-1 shadow-2xs"
              title="Copy formatted JSON to clipboard"
            >
              {copiedType === 'json' ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedType === 'json' ? 'Copied' : 'JSON'}</span>
            </button>
          )}

          <button
            onClick={handleCopyRaw}
            className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition border border-slate-300 dark:border-slate-700 flex items-center gap-1 shadow-2xs"
            title="Copy raw message string"
          >
            {copiedType === 'raw' ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedType === 'raw' ? 'Copied' : 'Raw'}</span>
          </button>

          <button
            onClick={handleCopyAsImage}
            disabled={isCapturingImage}
            className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1 font-semibold shadow-xs"
            title="Copy / export styled snippet image"
          >
            {copiedType === 'image' ? (
              <Check className="w-3.5 h-3.5 text-emerald-200" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5" />
            )}
            <span>{copiedType === 'image' ? 'Copied Image!' : 'Image'}</span>
          </button>
        </div>
      </div>

      {/* Main Body Content */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed select-text">
        {activeTab === 'json' && isJson ? (
          <div className="space-y-0.5">{renderHighlightedJson(jsonString)}</div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all shadow-2xs">
            {entry.message}
          </div>
        )}
      </div>

      {/* Hidden Canvas for Image Generation */}
      <canvas ref={canvasRef} className="hidden" />
    </aside>
  );
};
