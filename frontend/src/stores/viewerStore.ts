import { create } from 'zustand';
import { LogEntry, ViewerTab } from '../types';

interface ViewerState {
  tabs: ViewerTab[];
  activeTabId: string | null;

  addTab: (tabParams: {
    clusterId: string;
    namespace: string;
    podName: string;
    container: string;
    previous: boolean;
  }) => string;

  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  appendLogs: (tabId: string, newEntries: LogEntry[]) => void;
  setPaused: (tabId: string, paused: boolean) => void;
  setAutoScroll: (tabId: string, enabled: boolean) => void;
  setFilter: (tabId: string, text: string) => void;
  clearLogs: (tabId: string) => void;
  setTabStatus: (tabId: string, status: ViewerTab['status'], errMsg?: string) => void;
}

const MAX_CLIENT_LINES = 50000;
const MAX_PAUSE_QUEUE = 5000;

export const useViewerStore = create<ViewerState>((set, get) => ({
  tabs: [],
  activeTabId: null,

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
      title: `${params.podName}:${params.container}${params.previous ? ' (prev)' : ''}`,
      clusterId: params.clusterId,
      namespace: params.namespace,
      podName: params.podName,
      container: params.container,
      previous: params.previous,
      isPaused: false,
      autoScroll: true,
      filterText: '',
      unreadCount: 0,
      logs: [],
      pausedQueue: [],
      droppedCount: 0,
      status: 'CONNECTING',
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

  appendLogs: (tabId, newEntries) => {
    if (!newEntries || newEntries.length === 0) return;

    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;

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
}));

