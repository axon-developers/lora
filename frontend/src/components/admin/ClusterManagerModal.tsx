import React, { useState, useEffect } from 'react';
import {
  X,
  Server,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  RefreshCw,
  Terminal,
  Layers,
} from 'lucide-react';
import { useClusterStore } from '../../stores/clusterStore';
import { api } from '../../lib/api';
import { ClusterInfo } from '../../types';

interface ClusterManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ClusterManagerModal: React.FC<ClusterManagerModalProps> = ({ isOpen, onClose }) => {
  const { clusters, fetchClusters, reconnectCluster } = useClusterStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    environment: 'development',
    managed_kubeconfig: true,
    kubeconfig_path: '',
    kconnect_enabled: true,
    kconnect_command: 'kconnect',
    kconnect_args: 'use eks --cluster my-cluster',
    auto_refresh: true,
    enabled: true,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchClusters();
      setIsAdding(false);
      setEditingId(null);
      setStatusMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setFormData({
      id: '',
      name: '',
      environment: 'development',
      managed_kubeconfig: true,
      kubeconfig_path: '',
      kconnect_enabled: true,
      kconnect_command: 'kconnect',
      kconnect_args: 'use eks --cluster dev-eks',
      auto_refresh: true,
      enabled: true,
    });
    setIsAdding(true);
    setEditingId(null);
    setErrorMessage(null);
  };

  const handleStartEdit = async (cluster: ClusterInfo) => {
    setIsAdding(false);
    setEditingId(cluster.id);
    setErrorMessage(null);

    try {
      const fullConfig = await api.getClusterConfig(cluster.id);
      setFormData({
        id: fullConfig.id,
        name: fullConfig.name,
        environment: fullConfig.environment || 'development',
        managed_kubeconfig: fullConfig.managed_kubeconfig ?? true,
        kubeconfig_path: fullConfig.kubeconfig?.path || '',
        kconnect_enabled: fullConfig.kconnect?.enabled ?? true,
        kconnect_command: fullConfig.kconnect?.command || 'kconnect',
        kconnect_args: (fullConfig.kconnect?.args || []).join(' '),
        auto_refresh: fullConfig.kconnect?.auto_refresh ?? true,
        enabled: fullConfig.enabled ?? true,
      });
    } catch {
      setFormData({
        id: cluster.id,
        name: cluster.name,
        environment: cluster.environment,
        managed_kubeconfig: true,
        kubeconfig_path: '',
        kconnect_enabled: true,
        kconnect_command: 'kconnect',
        kconnect_args: 'use eks --cluster dev-cluster',
        auto_refresh: true,
        enabled: cluster.enabled,
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id.trim() || !formData.name.trim()) {
      setErrorMessage('Cluster ID and Name are required');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const argsArray = formData.kconnect_args
      .split(' ')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const payload = {
      id: formData.id.trim(),
      name: formData.name.trim(),
      environment: formData.environment,
      managed_kubeconfig: formData.managed_kubeconfig,
      kubeconfig: {
        path: formData.kubeconfig_path.trim(),
        context: '',
      },
      kconnect: {
        enabled: formData.kconnect_enabled,
        command: formData.kconnect_command.trim(),
        args: argsArray,
        auto_refresh: formData.auto_refresh,
      },
      enabled: formData.enabled,
    };

    try {
      if (isAdding) {
        await api.addCluster(payload);
        setStatusMessage(`Cluster '${formData.name}' added successfully!`);
      } else if (editingId) {
        await api.updateCluster(editingId, payload);
        setStatusMessage(`Cluster '${formData.name}' updated successfully!`);
      }

      await fetchClusters();
      setIsAdding(false);
      setEditingId(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save cluster');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove cluster '${name}'?`)) {
      return;
    }

    try {
      await api.deleteCluster(id);
      setStatusMessage(`Cluster '${name}' removed`);
      await fetchClusters();
      if (editingId === id) {
        setEditingId(null);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete cluster');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-4xl w-full h-[600px] max-h-[90vh] flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-sm text-slate-100">Cluster & Kconnect Management</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleStartAdd}
              className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Cluster</span>
            </button>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Clusters List */}
          <div className="w-1/3 border-r border-slate-800 p-3 overflow-y-auto space-y-2 bg-slate-950/30">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Configured Clusters ({clusters.length})</span>
              <button onClick={() => fetchClusters()} className="text-slate-500 hover:text-slate-300">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            {clusters.length === 0 ? (
              <div className="text-center py-8 text-slate-600 font-mono">
                No clusters configured. Click "Add Cluster" to configure one.
              </div>
            ) : (
              clusters.map((c) => {
                const isSelected = editingId === c.id;

                return (
                  <div
                    key={c.id}
                    onClick={() => handleStartEdit(c)}
                    className={`p-2.5 rounded border cursor-pointer transition select-none ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500/60 text-indigo-200'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1 font-semibold truncate">
                      <span className="truncate">{c.name}</span>
                      <span className="text-[10px] text-slate-500 uppercase font-mono">{c.environment}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>ID: {c.id}</span>
                      <span
                        className={`font-bold ${
                          c.status === 'HEALTHY'
                            ? 'text-emerald-400'
                            : c.status === 'AUTH_EXPIRED'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-end gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          reconnectCluster(c.id);
                        }}
                        className="p-1 hover:text-indigo-400 text-slate-500 transition"
                        title="Test & Reconnect"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(c.id, c.name);
                        }}
                        className="p-1 hover:text-rose-400 text-slate-500 transition"
                        title="Delete Cluster"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Add / Edit Form */}
          <div className="flex-1 p-4 overflow-y-auto bg-slate-900">
            {isAdding || editingId ? (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="text-sm font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Edit2 className="w-4 h-4 text-indigo-400" />
                  <span>{isAdding ? 'Configure New EKS / Kubernetes Cluster' : `Edit Cluster: ${formData.name}`}</span>
                </div>

                {errorMessage && (
                  <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {statusMessage && (
                  <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{statusMessage}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Cluster ID (Unique slug)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. dev, staging, prod-us"
                      disabled={!isAdding}
                      value={formData.id}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Display Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Development EKS Cluster"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Environment</label>
                    <select
                      value={formData.environment}
                      onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    >
                      <option value="development">Development</option>
                      <option value="staging">Staging</option>
                      <option value="production">Production</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      id="enabledToggle"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      className="rounded bg-slate-950 border-slate-800"
                    />
                    <label htmlFor="enabledToggle" className="text-slate-300">
                      Cluster Enabled
                    </label>
                  </div>
                </div>

                {/* Kubeconfig Mode */}
                <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>Kubeconfig Storage</span>
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="managedKubeconfig"
                      checked={formData.managed_kubeconfig}
                      onChange={(e) => setFormData({ ...formData, managed_kubeconfig: e.target.checked })}
                      className="rounded bg-slate-900 border-slate-700"
                    />
                    <label htmlFor="managedKubeconfig" className="text-slate-200 font-medium">
                      Self-Managed by LORA (Auto-stored in <code className="text-indigo-400">./data/kubeconfigs/{formData.id || '<id>'}.config</code>)
                    </label>
                  </div>

                  {!formData.managed_kubeconfig && (
                    <div className="pt-2">
                      <label className="text-slate-400 block mb-1">Custom Kubeconfig Path on PC</label>
                      <input
                        type="text"
                        placeholder="C:\Users\username\.kube\config"
                        value={formData.kubeconfig_path}
                        onChange={(e) => setFormData({ ...formData, kubeconfig_path: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>
                  )}
                </div>

                {/* Kconnect Configuration */}
                <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-3">
                  <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>Kconnect Automatic Execution</span>
                    <Terminal className="w-3.5 h-3.5 text-slate-500" />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="kconnectEnabled"
                      checked={formData.kconnect_enabled}
                      onChange={(e) => setFormData({ ...formData, kconnect_enabled: e.target.checked })}
                      className="rounded bg-slate-900 border-slate-700"
                    />
                    <label htmlFor="kconnectEnabled" className="text-slate-200 font-medium">
                      Enable Kconnect Runner for this cluster
                    </label>
                  </div>

                  {formData.kconnect_enabled && (
                    <div className="space-y-3 pt-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <label className="text-slate-400 block mb-1">Kconnect Executable</label>
                          <input
                            type="text"
                            placeholder="kconnect"
                            value={formData.kconnect_command}
                            onChange={(e) => setFormData({ ...formData, kconnect_command: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="text-slate-400 block mb-1">CLI Arguments (Template)</label>
                          <input
                            type="text"
                            placeholder="use eks --cluster my-cluster-name"
                            value={formData.kconnect_args}
                            onChange={(e) => setFormData({ ...formData, kconnect_args: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="autoRefreshToggle"
                          checked={formData.auto_refresh}
                          onChange={(e) => setFormData({ ...formData, auto_refresh: e.target.checked })}
                          className="rounded bg-slate-900 border-slate-700"
                        />
                        <label htmlFor="autoRefreshToggle" className="text-slate-300">
                          Auto-renew token in background on 401 Unauthorized (No manual click required)
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Form Actions */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setEditingId(null);
                    }}
                    className="px-3 py-1.5 text-slate-400 hover:text-slate-200 transition"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium transition shadow-sm disabled:opacity-50"
                  >
                    {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>{isSaving ? 'Saving...' : 'Save & Register Cluster'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
                <Server className="w-12 h-12 mb-3 text-slate-700" />
                <h3 className="font-semibold text-slate-300 mb-1">Cluster Management</h3>
                <p className="max-w-xs text-xs mb-4">
                  Select a cluster on the left to edit its connection and kconnect parameters, or add a new cluster.
                </p>
                <button
                  onClick={handleStartAdd}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium transition text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add First Cluster</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-slate-500 text-[10px]">
          <span>All cluster definitions are saved immediately to both SQLite and <code className="text-slate-400">lora-config.yaml</code>.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
