import React, { useEffect, useState } from 'react';
import { X, Activity, Server, Radio, RefreshCw, Cpu } from 'lucide-react';
import { AdminConnectionStats } from '../../types';
import { api } from '../../lib/api';

interface ConnectionMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectionMonitorModal: React.FC<ConnectionMonitorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [stats, setStats] = useState<AdminConnectionStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const data = await api.getAdminConnections();
      setStats(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch monitor stats');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-4xl w-full h-[600px] max-h-[90vh] flex flex-col overflow-hidden font-mono text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="font-bold text-sm text-slate-900 dark:text-slate-100 font-sans">
              Connection & Streaming Monitor
            </span>
            <span className="text-[10px] text-slate-500 font-mono">(auto-refresh: 3s)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStats}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
              title="Refresh now"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-4 gap-3 p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
          <div className="bg-white dark:bg-slate-950/60 p-3 rounded border border-slate-200 dark:border-slate-800/80 shadow-2xs">
            <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1 mb-1 font-sans">
              <Radio className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              Active K8s Streams
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {stats?.total_active_streams ?? 0}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-950/60 p-3 rounded border border-slate-200 dark:border-slate-800/80 shadow-2xs">
            <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1 mb-1 font-sans">
              <Server className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
              Total Subscribers
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {stats?.total_subscribers ?? 0}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-950/60 p-3 rounded border border-slate-200 dark:border-slate-800/80 shadow-2xs">
            <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1 mb-1 font-sans">
              <Cpu className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              Heap Allocated
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatBytes(stats?.memory_alloc_bytes ?? 0)}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-950/60 p-3 rounded border border-slate-200 dark:border-slate-800/80 shadow-2xs">
            <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1 mb-1 font-sans">
              <Cpu className="w-3 h-3 text-slate-400" />
              System Reserved
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatBytes(stats?.memory_sys_bytes ?? 0)}
            </div>
          </div>
        </div>

        {/* Active Streams Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 font-sans">
            Active Shared Pod Connections
          </div>

          {error && <div className="text-rose-600 dark:text-rose-400 mb-2">{error}</div>}

          {!stats || stats.streams.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No active Kubernetes log streams running currently.
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden shadow-2xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-sans">
                  <tr>
                    <th className="p-2">Cluster</th>
                    <th className="p-2">Namespace</th>
                    <th className="p-2">Pod</th>
                    <th className="p-2">Container</th>
                    <th className="p-2">Subscribers</th>
                    <th className="p-2">Buffer</th>
                    <th className="p-2">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900/40">
                  {stats.streams.map((s) => (
                    <tr key={s.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-2 text-indigo-700 dark:text-indigo-300 font-semibold">{s.cluster_id}</td>
                      <td className="p-2 text-slate-600 dark:text-slate-400">{s.namespace}</td>
                      <td className="p-2 text-slate-900 dark:text-slate-200 truncate max-w-[180px]">{s.pod_name}</td>
                      <td className="p-2 text-slate-700 dark:text-slate-300">{s.container}</td>
                      <td className="p-2 font-bold text-emerald-600 dark:text-emerald-400">{s.subscribers_count}</td>
                      <td className="p-2 text-slate-500 dark:text-slate-400">{s.buffer_entries} lines</td>
                      <td className="p-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-medium">
                          {s.state}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between text-slate-500 text-[10px] font-sans">
          <span>The Fan-Out Principle: 1 K8s stream per pod connection regardless of subscriber count.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded text-xs transition border border-slate-200 dark:border-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
