import React from 'react';
import {
  Search,
  Play,
  Pause,
  ArrowDown,
  Trash2,
  Copy,
  Download,
  AlertTriangle,
  Check,
  CloudUpload,
  Layers,
} from 'lucide-react';
import { ViewerTab } from '../../types';
import { useViewerStore } from '../../stores/viewerStore';

interface LogToolbarProps {
  tab: ViewerTab;
  matchCount: number;
  showEvents: boolean;
  onToggleEvents: () => void;
  onExportS3: () => void;
  isExportingS3?: boolean;
}

export const LogToolbar: React.FC<LogToolbarProps> = ({
  tab,
  matchCount,
  showEvents,
  onToggleEvents,
  onExportS3,
  isExportingS3 = false,
}) => {
  const { setFilter, setPaused, setAutoScroll, clearLogs } = useViewerStore();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    const text = tab.logs.map((l) => `[${l.timestamp}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const text = tab.logs.map((l) => `[${l.timestamp}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tab.podName}-${tab.container}-${Date.now()}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-10 border-b border-slate-800 bg-slate-900/60 px-3 flex items-center justify-between gap-3 text-xs select-none">
      {/* Search box */}
      <div className="relative flex-1 max-w-md">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
        <input
          type="text"
          placeholder="Filter logs (client-side)..."
          value={tab.filterText}
          onChange={(e) => setFilter(tab.id, e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-16 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
        />
        {tab.filterText && (
          <span className="absolute right-2.5 top-2 text-[10px] text-slate-500 font-mono">
            {matchCount} matches
          </span>
        )}
      </div>

      {/* Control Actions */}
      <div className="flex items-center gap-1.5 font-mono">
        {/* Paused Queue Banner */}
        {tab.isPaused && tab.pausedQueue.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 mr-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Paused ({tab.pausedQueue.length} queued)
          </span>
        )}

        {/* Pause / Resume */}
        <button
          onClick={() => setPaused(tab.id, !tab.isPaused)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded transition text-xs font-medium border ${
            tab.isPaused
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
          }`}
          title={tab.isPaused ? 'Resume live log tailing' : 'Pause viewer'}
        >
          {tab.isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3" />}
          <span>{tab.isPaused ? 'Resume' : 'Pause'}</span>
        </button>

        {/* Auto Scroll toggle */}
        <button
          onClick={() => setAutoScroll(tab.id, !tab.autoScroll)}
          className={`p-1.5 rounded transition border ${
            tab.autoScroll
              ? 'bg-indigo-600 text-white border-indigo-500'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title={tab.autoScroll ? 'Auto-scroll enabled (pinned to bottom)' : 'Auto-scroll disabled'}
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>

        {/* Clear Buffer */}
        <button
          onClick={() => clearLogs(tab.id)}
          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition border border-slate-700"
          title="Clear current display buffer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Copy all */}
        <button
          onClick={handleCopy}
          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition border border-slate-700"
          title="Copy logs to clipboard"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>

        {/* Local .log Export */}
        <button
          onClick={handleExport}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700 font-sans"
          title="Download logs as local .log file"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>

        {/* S3 Export (V2) */}
        <button
          onClick={onExportS3}
          disabled={isExportingS3}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700 font-sans"
          title="Export logs to AWS S3 bucket"
        >
          <CloudUpload className="w-3.5 h-3.5 text-amber-400" />
          <span>{isExportingS3 ? 'Exporting...' : 'S3'}</span>
        </button>

        <div className="h-4 w-px bg-slate-800 mx-0.5"></div>

        {/* Pod Events Drawer Toggle (V2) */}
        <button
          onClick={onToggleEvents}
          className={`flex items-center gap-1 px-2.5 py-1 rounded transition border font-sans ${
            showEvents
              ? 'bg-indigo-600 text-white border-indigo-500'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
          }`}
          title="Toggle Kubernetes Pod Events Panel"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Events</span>
        </button>
      </div>
    </div>
  );
};

