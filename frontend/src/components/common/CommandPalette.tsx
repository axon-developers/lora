import React, { useState, useEffect, useRef } from 'react';
import { Search, Server, Globe, Box, Terminal, Sun, Moon, Trash2, Play, Pause, Columns, Settings, Activity } from 'lucide-react';
import { useClusterStore } from '../../stores/clusterStore';
import { useViewerStore } from '../../stores/viewerStore';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenClusterManager: () => void;
  onOpenMonitor: () => void;
  onOpenSettings: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

interface PaletteItem {
  id: string;
  category: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onOpenClusterManager,
  onOpenMonitor,
  onOpenSettings,
  isDark,
  onToggleTheme,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { clusters, selectedClusterId, selectCluster, namespaces, selectNamespace, pods, selectPod, switchRegion } =
    useClusterStore();
  const { tabs, activeTabId, setPaused, clearLogs, splitViewTabId, setSplitViewTabId } = useViewerStore();

  const currentCluster = clusters.find((c) => c.id === selectedClusterId);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Construct search items
  const items: PaletteItem[] = [];

  // 1. Clusters & Regions
  clusters.forEach((c) => {
    items.push({
      id: `cluster-${c.id}`,
      category: 'Clusters',
      title: c.name,
      subtitle: `Cluster ID: ${c.id} (${c.status})`,
      icon: <Server className="w-4 h-4 text-indigo-500" />,
      action: () => {
        selectCluster(c.id);
        onClose();
      },
    });

    if (c.regions && c.regions.length > 0) {
      c.regions.forEach((reg) => {
        items.push({
          id: `region-${c.id}-${reg}`,
          category: 'Regions',
          title: `Switch region: ${reg}`,
          subtitle: `${c.name} (Active: ${c.active_region || c.region})`,
          icon: <Globe className="w-4 h-4 text-cyan-500" />,
          action: async () => {
            await switchRegion(c.id, reg);
            onClose();
          },
        });
      });
    }
  });

  // 2. Namespaces
  namespaces.forEach((ns) => {
    items.push({
      id: `ns-${ns}`,
      category: 'Namespaces',
      title: `Namespace: ${ns}`,
      subtitle: currentCluster ? `in cluster ${currentCluster.name}` : undefined,
      icon: <Box className="w-4 h-4 text-emerald-500" />,
      action: () => {
        selectNamespace(ns);
        onClose();
      },
    });
  });

  // 3. Pods
  pods.forEach((p) => {
    items.push({
      id: `pod-${p.name}`,
      category: 'Pods',
      title: p.name,
      subtitle: `${p.phase} • ${p.containers.length} container(s)`,
      icon: <Terminal className="w-4 h-4 text-amber-500" />,
      action: () => {
        selectPod(p.name);
        onClose();
      },
    });
  });

  // 4. Quick Actions
  items.push({
    id: 'action-theme',
    category: 'Actions',
    title: isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme',
    subtitle: 'Toggle user interface appearance',
    icon: isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />,
    action: () => {
      onToggleTheme();
      onClose();
    },
  });

  if (activeTab) {
    items.push({
      id: 'action-pause',
      category: 'Actions',
      title: activeTab.isPaused ? 'Resume Active Log Stream' : 'Pause Active Log Stream',
      subtitle: `Tab: ${activeTab.title}`,
      icon: activeTab.isPaused ? <Play className="w-4 h-4 text-emerald-500" /> : <Pause className="w-4 h-4 text-amber-500" />,
      action: () => {
        setPaused(activeTab.id, !activeTab.isPaused);
        onClose();
      },
    });

    items.push({
      id: 'action-clear',
      category: 'Actions',
      title: 'Clear Active Log Buffer',
      subtitle: `Clear all lines in ${activeTab.title}`,
      icon: <Trash2 className="w-4 h-4 text-rose-500" />,
      action: () => {
        clearLogs(activeTab.id);
        onClose();
      },
    });
  }

  if (tabs.length > 1) {
    items.push({
      id: 'action-split',
      category: 'Actions',
      title: splitViewTabId ? 'Exit Split View (Single Viewer)' : 'Split View Side-by-Side',
      subtitle: 'Compare two log streams side-by-side',
      icon: <Columns className="w-4 h-4 text-indigo-500" />,
      action: () => {
        if (splitViewTabId) {
          setSplitViewTabId(null);
        } else {
          const other = tabs.find((t) => t.id !== activeTabId);
          if (other) setSplitViewTabId(other.id);
        }
        onClose();
      },
    });
  }

  items.push({
    id: 'action-clusters',
    category: 'Navigation',
    title: 'Open Cluster & Kconnect Manager',
    subtitle: 'Manage EKS clusters, kubeconfigs, and auto-discovery',
    icon: <Server className="w-4 h-4 text-indigo-500" />,
    action: () => {
      onOpenClusterManager();
      onClose();
    },
  });

  items.push({
    id: 'action-monitor',
    category: 'Navigation',
    title: 'Open Connection Monitor',
    subtitle: 'View live subscriber fan-out metrics and memory budget',
    icon: <Activity className="w-4 h-4 text-emerald-500" />,
    action: () => {
      onOpenMonitor();
      onClose();
    },
  });

  items.push({
    id: 'action-settings',
    category: 'Navigation',
    title: 'Open Application Settings',
    subtitle: 'Configure streaming, redaction rules, S3 export, and display',
    icon: <Settings className="w-4 h-4 text-slate-400" />,
    action: () => {
      onOpenSettings();
      onClose();
    },
  });

  // Filter items
  const filtered = query.trim() === ''
    ? items
    : items.filter(
        (it) =>
          it.title.toLowerCase().includes(query.toLowerCase()) ||
          it.category.toLowerCase().includes(query.toLowerCase()) ||
          (it.subtitle && it.subtitle.toLowerCase().includes(query.toLowerCase()))
      );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-slate-950/60 backdrop-blur-xs select-none">
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search clusters, regions, pods, namespaces..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none font-mono"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-500">
            Esc
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 font-mono">
              No matching commands or resources found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-3 py-2 rounded-lg flex items-center justify-between cursor-pointer transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className={isSelected ? 'text-white' : 'text-slate-400'}>{item.icon}</span>
                    <div className="truncate">
                      <div className="text-xs font-semibold truncate">{item.title}</div>
                      {item.subtitle && (
                        <div
                          className={`text-[10px] truncate ${
                            isSelected ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider shrink-0 ${
                      isSelected
                        ? 'bg-indigo-700 text-indigo-100'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="px-3 py-1.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <div className="flex items-center gap-2">
            <span>↑↓ Navigate</span>
            <span>•</span>
            <span>↵ Select</span>
            <span>•</span>
            <span>Esc Close</span>
          </div>
          <span>LORA Command Palette</span>
        </div>
      </div>
    </div>
  );
};
