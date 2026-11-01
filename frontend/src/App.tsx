import React, { useEffect, useState } from 'react';
import { Header } from './components/layout/Header';
import { TabBar } from './components/layout/TabBar';
import { ResourceExplorer } from './components/explorer/ResourceExplorer';
import { LogViewer } from './components/viewer/LogViewer';
import { ConnectionMonitorModal } from './components/admin/ConnectionMonitorModal';
import { SettingsModal } from './components/admin/SettingsModal';
import { ClusterManagerModal } from './components/admin/ClusterManagerModal';
import { CommandPalette } from './components/common/CommandPalette';
import { useClusterStore } from './stores/clusterStore';
import { useViewerStore } from './stores/viewerStore';
import { wsManager } from './lib/ws';
import { Terminal, Server, Plus } from 'lucide-react';

export const App: React.FC = () => {
  const { clusters, fetchClusters, selectedClusterId, selectedNamespace } = useClusterStore();
  const { tabs, activeTabId, setPaused, closeTab, clearLogs, setActiveTab, addTab, setHighlightedSeq, splitViewTabId } =
    useViewerStore();

  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('lora-theme');
    return saved ? saved === 'dark' : true;
  });
  const [isMonitorOpen, setIsMonitorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isClusterManagerOpen, setIsClusterManagerOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Sync theme to document.documentElement for global styling
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('lora-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      localStorage.setItem('lora-theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    fetchClusters();
    wsManager.connect();

    // Check for deep link hash on startup: #pod=...&container=...&seq=...
    const hash = window.location.hash;
    if (hash && hash.startsWith('#')) {
      const params = new URLSearchParams(hash.substring(1));
      const pod = params.get('pod');
      const container = params.get('container') || '';
      const seqStr = params.get('seq');
      const clusterId = params.get('cluster') || selectedClusterId || 'local-kind';
      const ns = params.get('ns') || selectedNamespace || 'default';

      if (pod && container) {
        const tabId = addTab({
          clusterId,
          namespace: ns,
          podName: pod,
          container,
          previous: false,
          sinceSeconds: 3600,
        });

        wsManager.subscribe(tabId, clusterId, ns, pod, container, false, 3600);

        if (seqStr) {
          const seq = parseInt(seqStr, 10);
          if (!isNaN(seq)) {
            setTimeout(() => setHighlightedSeq(tabId, seq), 800);
          }
        }
      }
    }

    return () => {
      wsManager.destroy();
    };
  }, []);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + K / Cmd + K: Open Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Don't intercept single-letter shortcuts when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Space: Toggle Pause/Resume
      if (e.code === 'Space') {
        e.preventDefault();
        if (activeTabId) {
          const tab = tabs.find((t) => t.id === activeTabId);
          if (tab) {
            setPaused(tab.id, !tab.isPaused);
          }
        }
      }

      // Ctrl + L: Clear Active Tab Buffer
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (activeTabId) {
          clearLogs(activeTabId);
        }
      }

      // Alt + W or Ctrl + W: Close Active Tab
      if ((e.altKey && e.key.toLowerCase() === 'w') || (e.ctrlKey && e.key.toLowerCase() === 'w')) {
        e.preventDefault();
        if (activeTabId) {
          wsManager.unsubscribe(activeTabId);
          closeTab(activeTabId);
        }
      }

      // Alt + 1 ... Alt + 9: Switch active tab
      if (e.altKey && !isNaN(parseInt(e.key, 10))) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= tabs.length) {
          e.preventDefault();
          setActiveTab(tabs[num - 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, tabs]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const splitTab = splitViewTabId ? tabs.find((t) => t.id === splitViewTabId) : null;

  return (
    <div className={`h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${isDark ? 'dark' : 'light'}`}>
      <Header
        onOpenMonitor={() => setIsMonitorOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenClusterManager={() => setIsClusterManagerOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Explorer */}
        <ResourceExplorer onOpenClusterManager={() => setIsClusterManagerOpen(true)} />

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
          <TabBar />

          {clusters.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none bg-slate-50 dark:bg-slate-950">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center mb-4 text-indigo-600 dark:text-indigo-400 shadow-xl shadow-indigo-500/10 dark:shadow-indigo-950/50">
                <Server className="w-8 h-8" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">Welcome to LORA</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md font-mono mb-6 leading-relaxed">
                No Kubernetes clusters are configured yet. You can configure and connect your clusters directly through the UI without touching YAML files or restarting the server.
              </p>
              <button
                onClick={() => setIsClusterManagerOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-600/30 transition transform hover:-translate-y-0.5"
              >
                <Plus className="w-4 h-4" />
                <span>Configure Your First Cluster</span>
              </button>
            </div>
          ) : activeTab ? (
            splitTab ? (
              /* Side-by-Side Split View */
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col border-r border-slate-300 dark:border-slate-800 overflow-hidden">
                  <LogViewer key={activeTab.id} tab={activeTab} />
                </div>
                <div className="flex-1 flex flex-col overflow-hidden">
                  <LogViewer key={splitTab.id} tab={splitTab} />
                </div>
              </div>
            ) : (
              <LogViewer key={activeTab.id} tab={activeTab} />
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-slate-50 dark:bg-slate-950">
              <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center mb-3 text-indigo-600 dark:text-indigo-400 shadow-sm dark:shadow-inner">
                <Terminal className="w-6 h-6" />
              </div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">No Active Pod Stream</h2>
              <p className="text-xs text-slate-500 max-w-sm font-mono mb-4">
                Select a cluster, namespace, pod, and click "Live" on a container to start streaming real-time logs.
              </p>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-600 font-mono">
                <span>[Ctrl+K] Search / Jump</span>
                <span>•</span>
                <span>[Space] Pause</span>
                <span>•</span>
                <span>[Ctrl+W] Close Tab</span>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenClusterManager={() => setIsClusterManagerOpen(true)}
        onOpenMonitor={() => setIsMonitorOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
      />

      {/* Admin Modals */}
      <ClusterManagerModal isOpen={isClusterManagerOpen} onClose={() => setIsClusterManagerOpen(false)} />
      <ConnectionMonitorModal isOpen={isMonitorOpen} onClose={() => setIsMonitorOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

