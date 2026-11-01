import React, { useState } from 'react';
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
  Clock,
  Code2,
  Bell,
  Columns,
} from 'lucide-react';
import { ViewerTab } from '../../types';
import { useViewerStore } from '../../stores/viewerStore';
import { wsManager } from '../../lib/ws';

interface LogToolbarProps {
  tab: ViewerTab;
  matchCount: number;
  showEvents: boolean;
  onToggleEvents: () => void;
  onExportS3: () => void;
  isExportingS3?: boolean;
  onToggleInspector?: () => void;
  isInspectorOpen?: boolean;
}

const TIME_RANGES = [
  { label: '5m', value: 300, full: 'Last 5 minutes' },
  { label: '15m', value: 900, full: 'Last 15 minutes (Default)' },
  { label: '30m', value: 1800, full: 'Last 30 minutes' },
  { label: '1h', value: 3600, full: 'Last 1 hour' },
  { label: '6h', value: 21600, full: 'Last 6 hours' },
  { label: '24h', value: 86400, full: 'Last 24 hours' },
  { label: 'All', value: 0, full: 'All logs (no time limit)' },
];

export const LogToolbar: React.FC<LogToolbarProps> = ({
  tab,
  matchCount,
  showEvents,
  onToggleEvents,
  onExportS3,
  isExportingS3 = false,
  onToggleInspector,
  isInspectorOpen = false,
}) => {
  const {
    setFilter,
    setPaused,
    setAutoScroll,
    clearLogs,
    setSinceSeconds,
    setSeverityFilter,
    setAlertKeyword,
    splitViewTabId,
    setSplitViewTabId,
    tabs,
  } = useViewerStore();
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const currentSince = tab.sinceSeconds ?? 900;
  const currentSeverity = tab.severityFilter || 'ALL';

  const errorCount = React.useMemo(() => {
    return tab.logs.filter((l) => /error|fatal|exception|panic/i.test(l.message)).length;
  }, [tab.logs]);

  const warnCount = React.useMemo(() => {
    return tab.logs.filter((l) => /warn/i.test(l.message)).length;
  }, [tab.logs]);

  const handleTimeRangeChange = (valStr: string) => {
    const seconds = parseInt(valStr, 10);
    setSinceSeconds(tab.id, seconds);
    clearLogs(tab.id);

    // Resubscribe with new sinceSeconds filter
    wsManager.subscribe(
      tab.id,
      tab.clusterId,
      tab.namespace,
      tab.podName,
      tab.container,
      tab.previous,
      seconds
    );
  };

  const handleCopy = () => {
    const text = tab.logs.map((l) => `[${l.timestamp}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = (format: 'log' | 'json' | 'csv') => {
    let text = '';
    let mimeType = 'text/plain';
    const ext = format;

    if (format === 'json') {
      text = JSON.stringify(tab.logs, null, 2);
      mimeType = 'application/json';
    } else if (format === 'csv') {
      const headers = ['sequence', 'timestamp', 'pod', 'container', 'message'];
      const rows = tab.logs.map((l) => [
        l.seq,
        `"${l.timestamp}"`,
        `"${l.pod_name || ''}"`,
        `"${l.container || ''}"`,
        `"${l.message.replace(/"/g, '""')}"`,
      ]);
      text = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      mimeType = 'text/csv';
    } else {
      text = tab.logs.map((l) => `[${l.timestamp}] ${l.message}`).join('\n');
    }

    const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tab.podName}-${tab.container}-${Date.now()}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const toggleSplitView = () => {
    if (splitViewTabId) {
      setSplitViewTabId(null);
    } else {
      const otherTab = tabs.find((t) => t.id !== tab.id);
      if (otherTab) {
        setSplitViewTabId(otherTab.id);
      }
    }
  };

  return (
    <div className="h-10 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/60 px-3 flex items-center justify-between gap-3 text-xs select-none backdrop-blur-xs">
      {/* Search box & Quick Severity Pills */}
      <div className="flex items-center gap-2 flex-1 max-w-xl">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Filter logs (use !keyword to exclude, or regex)..."
            value={tab.filterText}
            onChange={(e) => setFilter(tab.id, e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded pl-8 pr-16 py-1 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono shadow-2xs"
          />
          {tab.filterText && (
            <span className="absolute right-2.5 top-2 text-[10px] text-slate-500 font-mono">
              {matchCount} matches
            </span>
          )}
        </div>

        {/* Severity Filter Pills */}
        <div className="flex items-center gap-1 shrink-0 font-sans">
          <button
            onClick={() => setSeverityFilter(tab.id, 'ALL')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
              currentSeverity === 'ALL'
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Show all log levels"
          >
            All
          </button>
          <button
            onClick={() => setSeverityFilter(tab.id, currentSeverity === 'ERROR' ? 'ALL' : 'ERROR')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition flex items-center gap-1 ${
              currentSeverity === 'ERROR'
                ? 'bg-rose-600 text-white shadow-2xs font-semibold'
                : errorCount > 0
                ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                : 'text-slate-400 dark:text-slate-600 opacity-60'
            }`}
            title="Filter only errors, exceptions, panics"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            <span>Errors ({errorCount})</span>
          </button>
          <button
            onClick={() => setSeverityFilter(tab.id, currentSeverity === 'WARN' ? 'ALL' : 'WARN')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition flex items-center gap-1 ${
              currentSeverity === 'WARN'
                ? 'bg-amber-600 text-white shadow-2xs font-semibold'
                : warnCount > 0
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                : 'text-slate-400 dark:text-slate-600 opacity-60'
            }`}
            title="Filter warnings"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>Warns ({warnCount})</span>
          </button>
        </div>
      </div>

      {/* Control Actions */}
      <div className="flex items-center gap-1.5 font-mono">
        {/* Paused Queue Banner */}
        {tab.isPaused && tab.pausedQueue.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 mr-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Paused ({tab.pausedQueue.length} queued)
          </span>
        )}

        {/* Keyword Alert Button */}
        <button
          onClick={() => {
            const kw = prompt('Enter keyword for audio chime and browser notification (e.g. OOMKilled, Exception, panic):', tab.alertKeyword || '');
            if (kw !== null) {
              setAlertKeyword(tab.id, kw.trim());
            }
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition border shadow-2xs font-sans ${
            tab.alertKeyword
              ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
          }`}
          title={tab.alertKeyword ? `Sound & push alert active for keyword: "${tab.alertKeyword}"` : 'Set keyword sound alert'}
        >
          <Bell className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">{tab.alertKeyword ? `Alert: ${tab.alertKeyword}` : 'Alert'}</span>
        </button>

        {/* Time-Range Dropdown */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 text-slate-700 dark:text-slate-300 shadow-2xs">
          <Clock className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <select
            value={currentSince}
            onChange={(e) => handleTimeRangeChange(e.target.value)}
            className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer pr-1"
            title="Time-based tail window"
          >
            {TIME_RANGES.map((tr) => (
              <option key={tr.value} value={tr.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                {tr.full}
              </option>
            ))}
          </select>
        </div>

        {/* Pause / Resume */}
        <button
          onClick={() => setPaused(tab.id, !tab.isPaused)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded transition text-xs font-medium border shadow-2xs ${
            tab.isPaused
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
          }`}
          title={tab.isPaused ? 'Resume live log tailing (Space)' : 'Pause viewer (Space)'}
        >
          {tab.isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3" />}
          <span>{tab.isPaused ? 'Resume' : 'Pause'}</span>
        </button>

        {/* Auto Scroll toggle */}
        <button
          onClick={() => setAutoScroll(tab.id, !tab.autoScroll)}
          className={`p-1.5 rounded transition border shadow-2xs ${
            tab.autoScroll
              ? 'bg-indigo-600 text-white border-indigo-500'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
          title={tab.autoScroll ? 'Auto-scroll enabled (pinned to bottom)' : 'Auto-scroll disabled'}
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>

        {/* Clear Buffer */}
        <button
          onClick={() => clearLogs(tab.id)}
          className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition border border-slate-300 dark:border-slate-700 shadow-2xs"
          title="Clear current display buffer (Ctrl+L)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Copy all */}
        <button
          onClick={handleCopy}
          className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition border border-slate-300 dark:border-slate-700 shadow-2xs"
          title="Copy logs to clipboard"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>

        {/* Multi-Format Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition border border-slate-300 dark:border-slate-700 font-sans shadow-2xs"
            title="Download logs in .log, .json, or .csv format"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded shadow-lg py-1 z-30 font-sans">
              <button
                onClick={() => handleExport('log')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs"
              >
                Log File (.log)
              </button>
              <button
                onClick={() => handleExport('json')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs"
              >
                JSON (.json)
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs"
              >
                CSV (.csv)
              </button>
            </div>
          )}
        </div>

        {/* S3 Export (V2) */}
        <button
          onClick={onExportS3}
          disabled={isExportingS3}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition border border-slate-300 dark:border-slate-700 font-sans shadow-2xs"
          title="Export logs to AWS S3 bucket"
        >
          <CloudUpload className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>{isExportingS3 ? 'Exporting...' : 'S3'}</span>
        </button>

        {/* Side-by-Side Split View Button */}
        {tabs.length > 1 && (
          <button
            onClick={toggleSplitView}
            className={`flex items-center gap-1 px-2 py-1 rounded transition border font-sans shadow-2xs ${
              splitViewTabId
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-slate-300 dark:border-slate-700'
            }`}
            title="Toggle Split View side-by-side with another tab"
          >
            <Columns className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{splitViewTabId ? 'Single' : 'Split'}</span>
          </button>
        )}

        <div className="h-4 w-px bg-slate-300 dark:bg-slate-800 mx-0.5"></div>

        {/* Inspector Toggle */}
        <button
          onClick={onToggleInspector}
          className={`flex items-center gap-1 px-2.5 py-1 rounded transition border font-sans shadow-2xs ${
            isInspectorOpen
              ? 'bg-indigo-600 text-white border-indigo-500'
              : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-slate-300 dark:border-slate-700'
          }`}
          title="Toggle Log Detail Inspector side panel"
        >
          <Code2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Inspector</span>
        </button>

        {/* Pod Events Drawer Toggle (V2) */}
        <button
          onClick={onToggleEvents}
          className={`flex items-center gap-1 px-2.5 py-1 rounded transition border font-sans shadow-2xs ${
            showEvents
              ? 'bg-indigo-600 text-white border-indigo-500'
              : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-slate-300 dark:border-slate-700'
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
