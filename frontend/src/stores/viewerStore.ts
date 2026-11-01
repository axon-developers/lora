import { create } from 'zustand';
import { LogEntry, ViewerTab } from '../types';

interface ViewerState {
  tabs: ViewerTab[];
  activeTabId: string | null;
  splitViewTabId: string | null;

  addTab: (tabParams: {
    clusterId: string;
    namespace: string;
    podName: string;
    container: string;
    previous: boolean;
    sinceSeconds?: number;
  }) => string;

  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setSplitViewTabId: (id: string | null) => void;
  appendLogs: (tabId: string, newEntries: LogEntry[]) => void;
  setPaused: (tabId: string, paused: boolean) => void;
  setAutoScroll: (tabId: string, enabled: boolean) => void;
  setFilter: (tabId: string, text: string) => void;
  setSeverityFilter: (tabId: string, severity: 'ALL' | 'ERROR' | 'WARN' | 'INFO') => void;
  setAlertKeyword: (tabId: string, keyword: string) => void;
  setHighlightedSeq: (tabId: string, seq: number | null) => void;
  clearLogs: (tabId: string) => void;
  setTabStatus: (tabId: string, status: ViewerTab['status'], errMsg?: string) => void;
  setSelectedLog: (tabId: string, log: LogEntry | null) => void;
  setSinceSeconds: (tabId: string, seconds: number) => void;
}

function playAlertChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

function notifyAlert(keyword: string, podName: string, message: string) {
  playAlertChime();
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`LORA Alert: ${keyword} in ${podName}`, {
      body: message.slice(0, 120),
    });
  }
}

const MAX_CLIENT_LINES = 50000;
const MAX_PAUSE_QUEUE = 5000;

export const useViewerStore = create<ViewerState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  splitViewTabId: null,

  addTab: (params) => {
    const existing = get().tabs.find(
      (t) =>
        t.clusterId === params.clusterId &&
        t.namespace === params.namespace &&
        t.podName === params.podName &&
        t.container === params.container &&
        t.previous === params.previous
    );

    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }

    const id = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newTab: ViewerTab = {
      id,
      title: `${params.podName.includes(',') ? 'group' : params.podName}:${params.container}${params.previous ? ' (prev)' : ''}`,
      clusterId: params.clusterId,
      namespace: params.namespace,
      podName: params.podName,
      container: params.container,
      previous: params.previous,
      sinceSeconds: params.sinceSeconds ?? 900,
      isPaused: false,
      autoScroll: true,
      filterText: '',
      unreadCount: 0,
      logs: [],
      pausedQueue: [],
      droppedCount: 0,
      status: 'CONNECTING',
      selectedLog: null,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: id,
    }));

    return id;
  },

  closeTab: (id) => {
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      let newActiveId = state.activeTabId;

      if (state.activeTabId === id) {
        newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
      }

      return {
        tabs: newTabs,
        activeTabId: newActiveId,
      };
    });
  },

  setActiveTab: (id) => {
    set((state) => ({
      activeTabId: id,
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, unreadCount: 0 } : t)),
    }));
  },

  setSplitViewTabId: (id) => set({ splitViewTabId: id }),

  appendLogs: (tabId, newEntries) => {
    if (!newEntries || newEntries.length === 0) return;

    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;

        // Check for alert keyword
        if (tab.alertKeyword && tab.alertKeyword.trim() !== '') {
          const kw = tab.alertKeyword.toLowerCase();
          const match = newEntries.find((e) => e.message.toLowerCase().includes(kw));
          if (match) {
            notifyAlert(tab.alertKeyword, tab.podName, match.message);
          }
        }

        if (tab.isPaused) {
          // In pause mode: buffer into pausedQueue up to MAX_PAUSE_QUEUE
          const available = MAX_PAUSE_QUEUE - tab.pausedQueue.length;
          const accepted = newEntries.slice(0, Math.max(0, available));
          const dropped = newEntries.length - accepted.length;

          return {
            ...tab,
            pausedQueue: [...tab.pausedQueue, ...accepted],
            droppedCount: tab.droppedCount + dropped,
            unreadCount: tab.unreadCount + newEntries.length,
          };
        }

        // Live mode: append to logs and cap at MAX_CLIENT_LINES
        const combined = [...tab.logs, ...newEntries];
        const trimmed = combined.length > MAX_CLIENT_LINES ? combined.slice(combined.length - MAX_CLIENT_LINES) : combined;

        const isCurrentActive = state.activeTabId === tabId;
        return {
          ...tab,
          logs: trimmed,
          unreadCount: isCurrentActive ? 0 : tab.unreadCount + newEntries.length,
          status: 'STREAMING',
        };
      }),
    }));
  },

  setPaused: (tabId, paused) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;

        if (!paused && tab.pausedQueue.length > 0) {
          // Resuming: flush pausedQueue into main logs
          const combined = [...tab.logs, ...tab.pausedQueue];
          const trimmed = combined.length > MAX_CLIENT_LINES ? combined.slice(combined.length - MAX_CLIENT_LINES) : combined;

          return {
            ...tab,
            isPaused: false,
            logs: trimmed,
            pausedQueue: [],
            unreadCount: 0,
            status: 'STREAMING',
          };
        }

        return {
          ...tab,
          isPaused: paused,
          status: paused ? 'PAUSED' : 'STREAMING',
        };
      }),
    }));
  },

  setAutoScroll: (tabId, enabled) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, autoScroll: enabled } : tab)),
    }));
  },

  setFilter: (tabId, text) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, filterText: text } : tab)),
    }));
  },

  setSeverityFilter: (tabId, severity) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, severityFilter: severity } : tab)),
    }));
  },

  setAlertKeyword: (tabId, keyword) => {
    if (keyword && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, alertKeyword: keyword } : tab)),
    }));
  },

  setHighlightedSeq: (tabId, seq) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, highlightedSeq: seq } : tab)),
    }));
  },

  clearLogs: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, logs: [], pausedQueue: [], unreadCount: 0 } : tab)),
    }));
  },

  setTabStatus: (tabId, status, errMsg) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, status, errorMessage: errMsg } : tab
      ),
    }));
  },

  setSelectedLog: (tabId, log) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, selectedLog: log } : tab
      ),
    }));
  },

  setSinceSeconds: (tabId, seconds) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, sinceSeconds: seconds } : tab
      ),
    }));
  },
}));

