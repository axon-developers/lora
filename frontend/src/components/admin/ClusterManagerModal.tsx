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
  Globe,
  Compass,
} from 'lucide-react';
import { useClusterStore } from '../../stores/clusterStore';
import { api } from '../../lib/api';
import { ClusterInfo, DiscoveredContext } from '../../types';

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
    region: 'us-east-1',
    regions: ['us-east-1', 'us-east-2'],
    active_region: 'us-east-1',
    regional_contexts: {} as Record<string, string>,
    context: '',
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

  // Discovered contexts from kubeconfig
  const [discoveredContexts, setDiscoveredContexts] = useState<DiscoveredContext[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchClusters();
      setIsAdding(false);
      setEditingId(null);
      setStatusMessage(null);
      setErrorMessage(null);
      setDiscoveredContexts([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setFormData({
      id: '',
      name: '',
      environment: 'development',
      region: 'us-east-1',
      regions: ['us-east-1', 'us-east-2'],
      active_region: 'us-east-1',
      regional_contexts: {},
      context: '',
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
    setDiscoveredContexts([]);
  };

  const handleStartEdit = async (cluster: ClusterInfo) => {
    setIsAdding(false);
    setEditingId(cluster.id);
    setErrorMessage(null);
    setDiscoveredContexts([]);

    try {
      const fullConfig = await api.getClusterConfig(cluster.id);
      const configuredRegions = fullConfig.regions && fullConfig.regions.length > 0
        ? fullConfig.regions
        : (cluster.regions && cluster.regions.length > 0 ? cluster.regions : ['us-east-1', 'us-east-2']);
      const activeReg = fullConfig.active_region || cluster.active_region || fullConfig.region || cluster.region || 'us-east-1';

      setFormData({
        id: fullConfig.id,
        name: fullConfig.name,
        environment: fullConfig.environment || 'development',
        region: activeReg,
        regions: configuredRegions,
        active_region: activeReg,
        regional_contexts: fullConfig.regional_contexts || cluster.regional_contexts || {},
        context: fullConfig.kubeconfig?.context || cluster.context || '',
        managed_kubeconfig: fullConfig.managed_kubeconfig ?? true,
        kubeconfig_path: fullConfig.kubeconfig?.path || '',
        kconnect_enabled: fullConfig.kconnect?.enabled ?? true,
        kconnect_command: fullConfig.kconnect?.command || 'kconnect',
        kconnect_args: (fullConfig.kconnect?.args || []).join(' '),
        auto_refresh: fullConfig.kconnect?.auto_refresh ?? true,
        enabled: fullConfig.enabled ?? true,
      });
    } catch {
      const clusterRegions = cluster.regions && cluster.regions.length > 0 ? cluster.regions : ['us-east-1', 'us-east-2'];
      const activeReg = cluster.active_region || cluster.region || 'us-east-1';

      setFormData({
        id: cluster.id,
        name: cluster.name,
        environment: cluster.environment,
        region: activeReg,
        regions: clusterRegions,
        active_region: activeReg,
        regional_contexts: cluster.regional_contexts || {},
        context: cluster.context || '',
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

  const toggleRegion = (reg: string) => {
    setFormData((prev) => {
      const exists = prev.regions.includes(reg);
      const nextRegions = exists ? prev.regions.filter((r) => r !== reg) : [...prev.regions, reg];
      const activeReg = nextRegions.includes(prev.active_region) ? prev.active_region : (nextRegions[0] || 'us-east-1');
      return {
        ...prev,
        regions: nextRegions,
        active_region: activeReg,
        region: activeReg,
      };
    });
  };

  const handleDiscoverContexts = async () => {
    setIsDiscovering(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await api.discoverContexts(formData.kubeconfig_path);
      const contexts = res.contexts || [];
      setDiscoveredContexts(contexts);
      if (contexts.length === 0) {
        setStatusMessage('No contexts found in kubeconfig file.');
      } else {
        // Auto-map discovered regions into regional_contexts
        setFormData((prev) => {
          const regContexts = { ...prev.regional_contexts };
          const discoveredRegions = new Set(prev.regions);
          for (const c of contexts) {
            if (c.region) {
              regContexts[c.region] = c.name;
              discoveredRegions.add(c.region);
            }
          }
          return {
            ...prev,
            regional_contexts: regContexts,
            regions: Array.from(discoveredRegions),
          };
        });
        setStatusMessage(`Discovered ${contexts.length} context(s) and mapped regions!`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to inspect kubeconfig contexts');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleApplyContext = (ctx: DiscoveredContext) => {
    setFormData((prev) => ({
      ...prev,
      context: ctx.name,
      region: ctx.region || prev.region,
      name: prev.name || ctx.cluster || ctx.name,
      id: prev.id || (ctx.region ? `${ctx.cluster || 'cluster'}-${ctx.region}` : ctx.name).toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
    }));
  };

  const handleImportAllContexts = async () => {
    if (discoveredContexts.length === 0) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      for (const ctx of discoveredContexts) {
        const clusterId = (ctx.region ? `${ctx.cluster || 'cluster'}-${ctx.region}` : ctx.name)
          .toLowerCase()
          .replace(/[^a-z0-9-_]/g, '-');
        const clusterName = ctx.region ? `${ctx.cluster || ctx.name} (${ctx.region})` : ctx.name;

        await api.addCluster({
          id: clusterId,
          name: clusterName,
          environment: formData.environment,
          region: ctx.region || '',
          managed_kubeconfig: formData.managed_kubeconfig,
          kubeconfig: {
            path: formData.kubeconfig_path.trim(),
            context: ctx.name,
          },
          kconnect: {
            enabled: formData.kconnect_enabled,
            command: formData.kconnect_command.trim(),
            args: ctx.cluster ? ['use', 'eks', '--cluster', ctx.cluster] : [],
            auto_refresh: formData.auto_refresh,
          },
          enabled: true,
        });
      }
      setStatusMessage(`Successfully imported ${discoveredContexts.length} cluster context(s)!`);
      await fetchClusters();
      setDiscoveredContexts([]);
      setIsAdding(false);
      setEditingId(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to import all contexts');
    } finally {
      setIsSaving(false);
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

    const selectedContext = (formData.regional_contexts && formData.regional_contexts[formData.active_region])
      || formData.context.trim();

    const payload = {
      id: formData.id.trim(),
      name: formData.name.trim(),
      environment: formData.environment,
      region: formData.active_region.trim() || formData.region.trim() || 'us-east-1',
      regions: formData.regions && formData.regions.length > 0 ? formData.regions : ['us-east-1', 'us-east-2'],
      active_region: formData.active_region.trim() || 'us-east-1',
      regional_contexts: formData.regional_contexts,
      managed_kubeconfig: formData.managed_kubeconfig,
      kubeconfig: {
        path: formData.kubeconfig_path.trim(),
        context: selectedContext,
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
    <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-4xl w-full h-[640px] max-h-[92vh] flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">Cluster & Kconnect Management</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleStartAdd}
              className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium transition shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Cluster</span>
            </button>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Clusters List */}
          <div className="w-1/3 border-r border-slate-200 dark:border-slate-800 p-3 overflow-y-auto space-y-2 bg-slate-50/70 dark:bg-slate-950/30">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Configured Clusters ({clusters.length})</span>
              <button onClick={() => fetchClusters()} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            {clusters.length === 0 ? (
              <div className="text-center py-8 text-slate-500 font-mono">
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
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-500/60 text-indigo-950 dark:text-indigo-200 shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-800 dark:text-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1 font-semibold truncate">
                      <span className="truncate">{c.name}</span>
                      <span className="text-[10px] text-slate-500 uppercase font-mono">{c.environment}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mb-1">
                      <span>ID: {c.id}</span>
                      <span
                        className={`font-bold ${
                          c.status === 'HEALTHY'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : c.status === 'AUTH_EXPIRED'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>

                    {c.regions && c.regions.length > 0 ? (
                      <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono flex items-center gap-1 flex-wrap mt-1">
                        <Globe className="w-2.5 h-2.5 shrink-0" />
                        <span className="font-sans text-slate-500 text-[9px]">Regions:</span>
                        {c.regions.map((reg) => (
                          <span
                            key={reg}
                            className={`px-1 py-0.2 rounded text-[9px] ${
                              (c.active_region || c.region) === reg
                                ? 'bg-indigo-600 text-white font-bold'
                                : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40'
                            }`}
                          >
                            {reg}
                          </span>
                        ))}
                      </div>
                    ) : c.region ? (
                      <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono flex items-center gap-1 mt-1">
                        <Globe className="w-2.5 h-2.5" />
                        <span>Region: {c.region}</span>
                      </div>
                    ) : null}

                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-end gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          reconnectCluster(c.id);
                        }}
                        className="p-1 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-400 transition"
                        title="Test & Reconnect"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(c.id, c.name);
                        }}
                        className="p-1 hover:text-rose-600 dark:hover:text-rose-400 text-slate-400 transition"
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
          <div className="flex-1 p-4 overflow-y-auto bg-white dark:bg-slate-900">
            {isAdding || editingId ? (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <Edit2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{isAdding ? 'Configure New EKS / Kubernetes Cluster' : `Edit Cluster: ${formData.name}`}</span>
                </div>

                {errorMessage && (
                  <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {statusMessage && (
                  <div className="p-2.5 rounded bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-400 flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{statusMessage}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-600 dark:text-slate-400 block mb-1">Cluster ID (Unique slug)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. dev-us-east-1"
                      disabled={!isAdding}
                      value={formData.id}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1.5 text-slate-900 dark:text-slate-200 font-mono disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="text-slate-600 dark:text-slate-400 block mb-1">Display Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dev EKS (US East 1)"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1.5 text-slate-900 dark:text-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-600 dark:text-slate-400 block mb-1">Environment</label>
                    <select
                      value={formData.environment}
                      onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1.5 text-slate-900 dark:text-slate-200"
                    >
                      <option value="development">Development</option>
                      <option value="staging">Staging</option>
                      <option value="production">Production</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id="enabledToggle"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      className="rounded bg-slate-100 dark:bg-slate-950 border-slate-300 dark:border-slate-800"
                    />
                    <label htmlFor="enabledToggle" className="text-slate-700 dark:text-slate-300 font-medium">
                      Cluster Enabled
                    </label>
                  </div>
                </div>

                {/* AWS Account Multi-Region Configuration */}
                <div className="p-3 rounded bg-slate-50/70 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                        AWS Account Multi-Region (Default: us-east-1 & us-east-2)
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Shared credentials across regions
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    By default, your AWS account can host clusters in both <strong>us-east-1</strong> and <strong>us-east-2</strong> under the same credential. Select the regions to support, and choose which region to connect with kubectl / kconnect:
                  </p>

                  <div className="flex items-center gap-2 flex-wrap">
                    {['us-east-1', 'us-east-2', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'].map((reg) => {
                      const isSelected = formData.regions.includes(reg);
                      return (
                        <button
                          key={reg}
                          type="button"
                          onClick={() => toggleRegion(reg)}
                          className={`px-2.5 py-1 rounded text-xs font-mono font-medium flex items-center gap-1.5 transition ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                          }`}
                        >
                          <span>{isSelected ? '✓' : '+'}</span>
                          <span>{reg}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                    <div>
                      <label className="text-slate-600 dark:text-slate-400 block mb-1 text-xs font-medium">
                        Active Connection Region
                      </label>
                      <select
                        value={formData.active_region}
                        onChange={(e) => {
                          const newReg = e.target.value;
                          setFormData({
                            ...formData,
                            active_region: newReg,
                            region: newReg,
                            context: (formData.regional_contexts && formData.regional_contexts[newReg]) || formData.context,
                          });
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1.5 text-slate-900 dark:text-slate-200 font-mono text-xs"
                      >
                        {formData.regions.map((reg) => (
                          <option key={reg} value={reg}>
                            {reg} {formData.regional_contexts && formData.regional_contexts[reg] ? `(Context: ${formData.regional_contexts[reg]})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-600 dark:text-slate-400 block mb-1 text-xs font-medium">
                        Add Custom Region
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="e.g. ca-central-1"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const input = e.currentTarget;
                              const val = input.value.trim().toLowerCase();
                              if (val && !formData.regions.includes(val)) {
                                toggleRegion(val);
                                input.value = '';
                              }
                            }
                          }}
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded px-2 py-1 text-slate-900 dark:text-slate-200 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Kubeconfig Configuration & Context Discovery */}
                <div className="p-3 rounded bg-slate-50/70 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>Kubeconfig Storage & Context</span>
                    <Layers className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="managedKubeconfig"
                      checked={formData.managed_kubeconfig}
                      onChange={(e) => setFormData({ ...formData, managed_kubeconfig: e.target.checked })}
                      className="rounded bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    />
                    <label htmlFor="managedKubeconfig" className="text-slate-800 dark:text-slate-200 font-medium">
                      Self-Managed by LORA (Auto-stored in <code className="text-indigo-600 dark:text-indigo-400">./data/kubeconfigs/{formData.id || '<id>'}.config</code>)
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-slate-600 dark:text-slate-400 block mb-1">Custom Kubeconfig Path (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. C:\Users\user\.kube\config (empty = default)"
                        value={formData.kubeconfig_path}
                        onChange={(e) => setFormData({ ...formData, kubeconfig_path: e.target.value })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1.5 text-slate-900 dark:text-slate-200 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-slate-600 dark:text-slate-400 block mb-1">Target Context Name (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. arn:aws:eks:us-east-1:..."
                        value={formData.context}
                        onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1.5 text-slate-900 dark:text-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  {/* Context Discovery Action */}
                  <div className="pt-1 flex items-center justify-between border-t border-slate-200 dark:border-slate-800/80">
                    <button
                      type="button"
                      onClick={handleDiscoverContexts}
                      disabled={isDiscovering}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 font-medium transition"
                    >
                      <Compass className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
                      <span>{isDiscovering ? 'Detecting Contexts...' : 'Detect Contexts & Regions from Kubeconfig'}</span>
                    </button>

                    {discoveredContexts.length > 1 && (
                      <button
                        type="button"
                        onClick={handleImportAllContexts}
                        disabled={isSaving}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Import All ({discoveredContexts.length} Contexts / Regions)</span>
                      </button>
                    )}
                  </div>

                  {/* Discovered Contexts List */}
                  {discoveredContexts.length > 0 && (
                    <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                        Found {discoveredContexts.length} context(s) in kubeconfig:
                      </div>
                      {discoveredContexts.map((ctx) => (
                        <div
                          key={ctx.name}
                          className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shadow-2xs"
                        >
                          <div className="truncate flex-1">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{ctx.name}</div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-2">
                              {ctx.region && (
                                <span className="text-indigo-600 dark:text-indigo-400 font-mono font-medium">Region: {ctx.region}</span>
                              )}
                              {ctx.cluster && <span>Cluster: {ctx.cluster}</span>}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleApplyContext(ctx)}
                            className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-300 hover:text-indigo-600 font-mono text-[10px] border border-slate-300 dark:border-slate-700 transition"
                          >
                            Use Context
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Kconnect Configuration */}
                <div className="p-3 rounded bg-slate-50/70 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>Kconnect Automatic Execution</span>
                    <Terminal className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="kconnectEnabled"
                      checked={formData.kconnect_enabled}
                      onChange={(e) => setFormData({ ...formData, kconnect_enabled: e.target.checked })}
                      className="rounded bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    />
                    <label htmlFor="kconnectEnabled" className="text-slate-800 dark:text-slate-200 font-medium">
                      Enable Kconnect Runner for this cluster
                    </label>
                  </div>

                  {formData.kconnect_enabled && (
                    <div className="space-y-3 pt-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <label className="text-slate-600 dark:text-slate-400 block mb-1">Kconnect Executable</label>
                          <input
                            type="text"
                            placeholder="kconnect"
                            value={formData.kconnect_command}
                            onChange={(e) => setFormData({ ...formData, kconnect_command: e.target.value })}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1.5 text-slate-900 dark:text-slate-200 font-mono"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="text-slate-600 dark:text-slate-400 block mb-1">CLI Arguments (Template)</label>
                          <input
                            type="text"
                            placeholder="use eks --cluster my-cluster-name"
                            value={formData.kconnect_args}
                            onChange={(e) => setFormData({ ...formData, kconnect_args: e.target.value })}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1.5 text-slate-900 dark:text-slate-200 font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="autoRefreshToggle"
                          checked={formData.auto_refresh}
                          onChange={(e) => setFormData({ ...formData, auto_refresh: e.target.checked })}
                          className="rounded bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                        />
                        <label htmlFor="autoRefreshToggle" className="text-slate-700 dark:text-slate-300">
                          Auto-renew token in background on 401 Unauthorized (No manual click required)
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setEditingId(null);
                    }}
                    className="px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition shadow-xs disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : isAdding ? 'Save & Connect Cluster' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 font-mono">
                <Server className="w-8 h-8 mb-2 text-slate-400 dark:text-slate-600" />
                <p>Select a cluster on the left to edit or click "Add Cluster" above.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
