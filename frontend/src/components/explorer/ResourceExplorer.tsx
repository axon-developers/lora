import React, { useState } from 'react';
import {
  Box,
  RotateCcw,
  Search,
  ChevronRight,
  ChevronDown,
  Layers,
  Terminal,
  AlertCircle,
  Play,
} from 'lucide-react';
import { useClusterStore } from '../../stores/clusterStore';
import { useViewerStore } from '../../stores/viewerStore';
import { wsManager } from '../../lib/ws';

interface ResourceExplorerProps {
  onOpenClusterManager?: () => void;
}

export const ResourceExplorer: React.FC<ResourceExplorerProps> = ({ onOpenClusterManager }) => {
  const {
    clusters,
    selectedClusterId,
    selectCluster,
    namespaces,
    selectedNamespace,
    selectNamespace,
    pods,
    selectedPodName,
    selectPod,
    containers,
    isLoadingNamespaces,
    isLoadingPods,
    isLoadingContainers,
    errorMessage,
  } = useClusterStore();

  const { addTab } = useViewerStore();
  const [podSearch, setPodSearch] = useState('');
  const [isPodsExpanded, setIsPodsExpanded] = useState(true);

  // Filter pods by search query
  const filteredPods = pods.filter(
    (p) =>
      p.name.toLowerCase().includes(podSearch.toLowerCase()) ||
      p.phase.toLowerCase().includes(podSearch.toLowerCase())
  );

  const handleOpenStream = (containerName: string, isPrev = false) => {
    if (!selectedClusterId || !selectedNamespace || !selectedPodName) return;

    const tabId = addTab({
      clusterId: selectedClusterId,
      namespace: selectedNamespace,
      podName: selectedPodName,
      container: containerName,
      previous: isPrev,
    });

    wsManager.subscribe(
      tabId,
      selectedClusterId,
      selectedNamespace,
      selectedPodName,
      containerName,
      isPrev
    );
  };

  const getPhaseBadge = (phase: string) => {
    switch (phase.toLowerCase()) {
      case 'running':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Running
          </span>
        );
      case 'crashloopbackoff':
      case 'failed':
      case 'error':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
            {phase}
          </span>
        );
      case 'pending':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Pending
          </span>
        );
      default:
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-500/10 text-slate-400 border border-slate-500/20">
            {phase}
          </span>
        );
    }
  };

  return (
    <aside className="w-80 h-full border-r border-slate-800 bg-slate-900/50 flex flex-col select-none">
      {/* Cluster selection */}
      <div className="p-3 border-b border-slate-800">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
          <span>Cluster</span>
          <button
            onClick={onOpenClusterManager}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 transition"
            title="Manage clusters"
          >
            + Add
          </button>
        </label>
        {clusters.length === 0 ? (
          <button
            onClick={onOpenClusterManager}
            className="w-full bg-slate-950 border border-dashed border-slate-700 hover:border-indigo-500 rounded px-2.5 py-2 text-xs text-indigo-300 font-medium transition text-center"
          >
            + Configure Cluster
          </button>
        ) : (
          <select
            value={selectedClusterId || ''}
            onChange={(e) => selectCluster(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.status})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Namespace selection */}
      <div className="p-3 border-b border-slate-800">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
          <span>Namespace</span>
          <Layers className="w-3.5 h-3.5 text-slate-500" />
        </label>
        <select
          disabled={isLoadingNamespaces || namespaces.length === 0}
          value={selectedNamespace || ''}
          onChange={(e) => selectNamespace(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        >
          {namespaces.map((ns) => (
            <option key={ns} value={ns}>
              {ns}
            </option>
          ))}
        </select>
      </div>

      {/* Error banner if any */}
      {errorMessage && (
        <div className="mx-3 mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded text-xs text-rose-400 flex items-start gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-all">{errorMessage}</span>
        </div>
      )}

      {/* Pods list */}
      <div className="flex-1 overflow-hidden flex flex-col p-3 min-h-0">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setIsPodsExpanded(!isPodsExpanded)}
            className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 hover:text-slate-200"
          >
            {isPodsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span>Pods ({filteredPods.length})</span>
          </button>
          {isLoadingPods && <span className="text-[10px] text-slate-500 animate-pulse">Loading...</span>}
        </div>

        {/* Pod search input */}
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
          <input
            type="text"
            placeholder="Search pods..."
            value={podSearch}
            onChange={(e) => setPodSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Pods list container */}
        {isPodsExpanded && (
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 font-mono text-xs">
            {filteredPods.map((pod) => {
              const isSelected = pod.name === selectedPodName;

              return (
                <div
                  key={pod.name}
                  onClick={() => selectPod(pod.name)}
                  className={`p-2 rounded cursor-pointer transition border ${
                    isSelected
                      ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200'
                      : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-800/40 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-semibold truncate flex-1" title={pod.name}>
                      {pod.name}
                    </span>
                    {getPhaseBadge(pod.phase)}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Box className="w-3 h-3" />
                      {pod.containers.length} container{pod.containers.length !== 1 ? 's' : ''}
                    </span>
                    {pod.restart_count > 0 && (
                      <span className="text-amber-400 font-bold" title="Restart count">
                        {pod.restart_count} restarts
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {!isLoadingPods && filteredPods.length === 0 && (
              <div className="text-center py-6 text-slate-600 text-xs">
                No pods found in namespace
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Pod's Containers & Quick Stream Launcher */}
      {selectedPodName && (
        <div className="p-3 border-t border-slate-800 bg-slate-950/80">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Containers</span>
            <Terminal className="w-3.5 h-3.5 text-slate-500" />
          </div>

          {isLoadingContainers ? (
            <div className="text-xs text-slate-500 animate-pulse">Loading containers...</div>
          ) : (
            <div className="space-y-1.5">
              {containers.length > 1 && (
                <div className="flex items-center justify-between p-2 rounded bg-indigo-950/40 border border-indigo-500/30 text-xs font-mono mb-2">
                  <div className="truncate flex-1 pr-2">
                    <div className="font-semibold text-indigo-300">All Containers (Merged)</div>
                    <div className="text-[10px] text-indigo-400/80">Stream & merge {containers.length} containers</div>
                  </div>
                  <button
                    onClick={() => handleOpenStream('_all_', false)}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition shadow-sm"
                    title="Tail merged logs from all containers in this pod"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Merged</span>
                  </button>
                </div>
              )}

              {containers.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800 text-xs font-mono"
                >
                  <div className="truncate flex-1 pr-2">
                    <div className="font-medium text-slate-200 truncate">{c.name}</div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                      <span>{c.state}</span>
                      {c.restarts > 0 && <span className="text-amber-400">({c.restarts}r)</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenStream(c.name, false)}
                      className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition"
                      title="Tail live logs"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Live</span>
                    </button>

                    {c.has_previous && (
                      <button
                        onClick={() => handleOpenStream(c.name, true)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded text-[10px] font-semibold flex items-center gap-1 transition border border-amber-500/20"
                        title="Stream logs from previously terminated/crashed container"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Prev</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
