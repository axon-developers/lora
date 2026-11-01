import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ViewerTab, PodEvent } from '../../types';
import { LogLine } from './LogLine';
import { LogToolbar } from './LogToolbar';
import { LogDetailPanel } from './LogDetailPanel';
import { useViewerStore } from '../../stores/viewerStore';
import { api } from '../../lib/api';
import { ArrowDown, RefreshCw, X, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface LogViewerProps {
  tab: ViewerTab;
}

export const LogViewer: React.FC<LogViewerProps> = ({ tab }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const { setAutoScroll, setSelectedLog } = useViewerStore();
  const [newLinesSinceScroll, setNewLinesSinceScroll] = useState(0);
  const prevLogsLength = useRef(tab.logs.length);

  // V2: Pod Events drawer state
  const [showEvents, setShowEvents] = useState(false);
  const [events, setEvents] = useState<PodEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  // V2: S3 export status state
  const [isExportingS3, setIsExportingS3] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const isMultiPod = tab.podName.includes(',');

  // Filter logs by text search
  const filteredLogs = useMemo(() => {
    if (!tab.filterText || tab.filterText.trim() === '') {
      return tab.logs;
    }
    const q = tab.filterText.toLowerCase();
    return tab.logs.filter((l) => l.message.toLowerCase().includes(q));
  }, [tab.logs, tab.filterText]);

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 25,
  });

  // Track new lines when scrolled up
  useEffect(() => {
    const diff = tab.logs.length - prevLogsLength.current;
    if (diff > 0 && !tab.autoScroll) {
      setNewLinesSinceScroll((prev) => prev + diff);
    }
    prevLogsLength.current = tab.logs.length;
  }, [tab.logs.length, tab.autoScroll]);

  // Auto-scroll logic
  useEffect(() => {
    if (tab.autoScroll && filteredLogs.length > 0) {
      rowVirtualizer.scrollToIndex(filteredLogs.length - 1, { align: 'end' });
      setNewLinesSinceScroll(0);
    }
  }, [filteredLogs.length, tab.autoScroll, rowVirtualizer]);

  // Load Pod Events when drawer opened
  const loadEvents = async () => {
    if (isMultiPod) return;
    setIsLoadingEvents(true);
    setEventsError(null);
    try {
      const data = await api.getPodEvents(tab.clusterId, tab.namespace, tab.podName);
      setEvents(data);
    } catch (err: any) {
      setEventsError(err.message || 'Failed to fetch pod events');
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (showEvents && !isMultiPod) {
      loadEvents();
    }
  }, [showEvents, tab.clusterId, tab.namespace, tab.podName, isMultiPod]);

  // Handle S3 Export
  const handleExportS3 = async () => {
    setIsExportingS3(true);
    setNotification(null);
    try {
      const content = tab.logs.map((l) => `[${l.timestamp}] ${l.container ? `[${l.container}] ` : ''}${l.message}`).join('\n');
      const res = await api.exportToS3(tab.clusterId, tab.namespace, tab.podName, tab.container, content);
      setNotification({
        message: `Successfully uploaded ${res.bytes_written} bytes to ${res.s3_uri}`,
        type: 'success',
      });
      setTimeout(() => setNotification(null), 8000);
    } catch (err: any) {
      setNotification({
        message: err.message || 'S3 Export failed. Check AWS credentials and S3 config in Settings.',
        type: 'error',
      });
      setTimeout(() => setNotification(null), 8000);
    } finally {
      setIsExportingS3(false);
    }
  };

  // Scroll detection
  const handleScroll = () => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;

    if (isAtBottom && !tab.autoScroll) {
      setAutoScroll(tab.id, true);
      setNewLinesSinceScroll(0);
    } else if (!isAtBottom && tab.autoScroll) {
      setAutoScroll(tab.id, false);
    }
  };

  const handleJumpToBottom = () => {
    setAutoScroll(tab.id, true);
    setNewLinesSinceScroll(0);
    if (filteredLogs.length > 0) {
      rowVirtualizer.scrollToIndex(filteredLogs.length - 1, { align: 'end' });
    }
  };

  const handleToggleInspector = () => {
    if (tab.selectedLog) {
      setSelectedLog(tab.id, null);
    } else {
      const fallback = filteredLogs.length > 0 ? filteredLogs[filteredLogs.length - 1] : null;
      setSelectedLog(tab.id, fallback);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden relative">
      <LogToolbar
        tab={tab}
        matchCount={filteredLogs.length}
        showEvents={showEvents}
        onToggleEvents={() => setShowEvents((prev) => !prev)}
        onExportS3={handleExportS3}
        isExportingS3={isExportingS3}
        isInspectorOpen={Boolean(tab.selectedLog)}
        onToggleInspector={handleToggleInspector}
      />

      {/* Notification Banner */}
      {notification && (
        <div
          className={`px-3 py-2 text-xs flex items-center justify-between border-b z-20 ${notification.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
            : 'bg-rose-50 dark:bg-rose-950/80 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-300'
            }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <span className="font-mono text-[11px] font-medium">{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-0.5 text-slate-500 hover:text-slate-900 dark:hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content: Logs Virtualizer + Slide-over Log Detail Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Virtualized List Container */}
        <div
          ref={parentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-800 scrollbar-track-transparent select-text"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-600 font-mono">
              {tab.status === 'CONNECTING' ? (
                <span className="flex items-center gap-2 animate-pulse text-indigo-600 dark:text-indigo-400">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-500"></span>
                  Connecting to Kubernetes log stream...
                </span>
              ) : tab.filterText ? (
                'No logs match current filter'
              ) : (
                'Waiting for container logs...'
              )}
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const entry = filteredLogs[virtualRow.index];
                const isSelected =
                  tab.selectedLog?.seq === entry.seq &&
                  tab.selectedLog?.timestamp === entry.timestamp;

                return (
                  <div
                    key={virtualRow.index}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <LogLine
                      entry={entry}
                      filterText={tab.filterText}
                      showContainerBadge={tab.container === '_all_' || isMultiPod}
                      showPodBadge={isMultiPod}
                      isSelected={isSelected}
                      onSelect={(sel) => setSelectedLog(tab.id, sel)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Slide-over Log Detail Inspector Panel */}
        {tab.selectedLog && (
          <LogDetailPanel
            entry={tab.selectedLog}
            onClose={() => setSelectedLog(tab.id, null)}
          />
        )}
      </div>

      {/* Jump to bottom / new lines pill */}
      {!tab.autoScroll && newLinesSinceScroll > 0 && (
        <button
          onClick={handleJumpToBottom}
          className="absolute bottom-4 right-6 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-semibold shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 animate-bounce z-10 transition"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>↓ {newLinesSinceScroll} new lines</span>
        </button>
      )}

      {/* V2: Pod Events Drawer */}
      {showEvents && !isMultiPod && (
        <div className="h-64 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 flex flex-col z-20 shadow-xl">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-950/60">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Kubernetes Events for {tab.podName}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">({events.length} events)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadEvents}
                disabled={isLoadingEvents}
                className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition"
                title="Refresh events"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEvents ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowEvents(false)}
                className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition"
                title="Close events drawer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] space-y-1.5">
            {eventsError && (
              <div className="p-2 rounded bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400">
                {eventsError}
              </div>
            )}

            {isLoadingEvents && events.length === 0 && (
              <div className="text-center py-6 text-slate-500 animate-pulse">Loading pod events...</div>
            )}

            {!isLoadingEvents && events.length === 0 && !eventsError && (
              <div className="text-center py-6 text-slate-500">No events found for this pod.</div>
            )}

            {events.map((ev, idx) => {
              const isWarning = ev.type.toLowerCase() === 'warning';
              return (
                <div
                  key={idx}
                  className={`p-2 rounded border flex flex-col gap-1 ${isWarning
                    ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200'
                    : 'bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300 shadow-2xs'
                    }`}
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.2 rounded font-bold uppercase text-[9px] ${isWarning ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
                          }`}
                      >
                        {ev.type}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-200">{ev.reason}</span>
                      {ev.count > 1 && (
                        <span className="text-amber-700 dark:text-amber-400 font-bold">(x{ev.count})</span>
                      )}
                      {ev.source_component && (
                        <span className="text-slate-500 text-[9px]">[{ev.source_component}]</span>
                      )}
                    </div>
                    <span className="text-slate-500">
                      {new Date(ev.last_timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-slate-800 dark:text-slate-300 break-all leading-relaxed">{ev.message}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
