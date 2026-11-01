import React from 'react';
import { X, Pause, AlertTriangle, Layers } from 'lucide-react';
import { useViewerStore } from '../../stores/viewerStore';
import { wsManager } from '../../lib/ws';

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, setActiveTab, closeTab } = useViewerStore();

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    wsManager.unsubscribe(tabId);
    closeTab(tabId);
  };

  if (tabs.length === 0) {
    return (
      <div className="h-9 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 text-xs text-slate-500 font-mono">
        <Layers className="w-3.5 h-3.5 mr-2 text-slate-400 dark:text-slate-600" />
        No active streams. Select a pod and container from the explorer on the left.
      </div>
    );
  }

  return (
    <div className="h-9 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center overflow-x-auto scrollbar-none px-2 gap-1 z-10">
      {tabs.length >= 10 && (
        <div className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap">
          Soft tab limit reached ({tabs.length}/20)
        </div>
      )}

      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;

        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group h-7 px-3 rounded-t flex items-center gap-2 cursor-pointer transition text-xs font-mono select-none border-t border-x ${
              isActive
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700/80 shadow-sm dark:shadow-none'
                : 'bg-slate-200/60 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-900/50 border-transparent'
            }`}
          >
            {/* Status icon */}
            {tab.status === 'STREAMING' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" title="Streaming" />
            )}
            {tab.status === 'PAUSED' && (
              <span title="Paused">
                <Pause className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              </span>
            )}
            {tab.status === 'CONNECTING' && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-ping" title="Connecting" />
            )}
            {tab.status === 'ERROR' && (
              <span title={tab.errorMessage || 'Error'}>
                <AlertTriangle className="w-3 h-3 text-rose-500 dark:text-rose-400" />
              </span>
            )}

            {/* Title */}
            <span className="max-w-[180px] truncate" title={tab.title}>
              {tab.title}
            </span>

            {/* Unread badge */}
            {tab.unreadCount > 0 && !isActive && (
              <span className="px-1 py-0.2 bg-indigo-600 text-white text-[10px] rounded-full font-bold">
                {tab.unreadCount > 99 ? '99+' : tab.unreadCount}
              </span>
            )}

            {/* Close button */}
            <button
              onClick={(e) => handleClose(e, tab.id)}
              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
              title="Close Tab"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
