import React, { useState, useMemo } from 'react';
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
  FolderTree,
  Globe,
} from 'lucide-react';
import { useClusterStore } from '../../stores/clusterStore';
import { useViewerStore } from '../../stores/viewerStore';
import { wsManager } from '../../lib/ws';
import { PodItem } from '../../types';

interface ResourceExplorerProps {
  onOpenClusterManager?: () => void;
}

// Extract base application/workload name by stripping deployment/replica hashes
function getAppGroupName(podName: string): string {
  // Pattern 1: <deployment>-<replicaset 8-10 alphanumeric>-<pod 5 alphanumeric>
  // e.g. payment-service-5998f49868-h78k8 -> payment-service
  const matchDeploy = podName.match(/^(.*?)-[a-z0-9]{8,10}-[a-z0-9]{5}$/);
  if (matchDeploy) return matchDeploy[1];

  // Pattern 2: StatefulSet <statefulset>-<digit>
  // e.g. redis-cluster-0 -> redis-cluster
  const matchSts = podName.match(/^(.*?)-\d+$/);
  if (matchSts) return matchSts[1];

  // Pattern 3: Common prefix before trailing 5+ character hash
  const matchHash = podName.match(/^(.*?)-[a-z0-9]{5,}$/);
  if (matchHash) return matchHash[1];

  return podName;
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
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [podSearch, setPodSearch] = useState('');
  const [isPodsExpanded, setIsPodsExpanded] = useState(true);
  const [groupByApp, setGroupByApp] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Extract all unique regions across configured clusters
  const availableRegions = useMemo(() => {
    const regSet = new Set<string>();
    clusters.forEach((c) => {
      if (c.regions && c.regions.length > 0) {
        c.regions.forEach((r) => regSet.add(r));
      } else if (c.region && c.region.trim() !== '') {
        regSet.add(c.region);
      }
    });
    return Array.from(regSet).sort();
  }, [clusters]);

  // Filter clusters by selected region
  const filteredClusters = useMemo(() => {
    if (selectedRegion === 'ALL') return clusters;
    return clusters.filter((c) => {
      if (c.regions && c.regions.length > 0) {
        return c.regions.includes(selectedRegion);
      }
      return c.region === selectedRegion;
    });
  }, [clusters, selectedRegion]);

  // Filter pods by search query
  const filteredPods = pods.filter(
    (p) =>
      p.name.toLowerCase().includes(podSearch.toLowerCase()) ||
      p.phase.toLowerCase().includes(podSearch.toLowerCase())
  );

  // Pod Groups
  const podGroups = useMemo(() => {
    if (!groupByApp) return null;

    const map = new Map<string, PodItem[]>();
    for (const pod of filteredPods) {
      const groupName = getAppGroupName(pod.name);
      if (!map.has(groupName)) {
        map.set(groupName, []);
      }
      map.get(groupName)!.push(pod);
    }

    return Array.from(map.entries()).map(([appName, groupPods]) => ({
      appName,
      pods: groupPods,
    }));
  }, [filteredPods, groupByApp]);

  const toggleGroupCollapse = (appName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(appName)) {
        next.delete(appName);
      } else {
        next.add(appName);
      }
      return next;
    });
  };

  const handleOpenStream = (targetPodName: string, containerName: string, isPrev = false) => {
    if (!selectedClusterId || !selectedNamespace) return;

    const tabId = addTab({
      clusterId: selectedClusterId,
      namespace: selectedNamespace,
      podName: targetPodName,
      container: containerName,
      previous: isPrev,
      sinceSeconds: 900,
    });

    wsManager.subscribe(
      tabId,
      selectedClusterId,
      selectedNamespace,
      targetPodName,
      containerName,
      isPrev,
      900
    );
  };

  const handleOpenGroupMergedStream = (groupPods: PodItem[], e: React.MouseEvent) => {
    e.stopPropagation();
    const commaSeparated = groupPods.map((p) => p.name).join(',');
    handleOpenStream(commaSeparated, '_all_', false);
  };

  const getPhaseBadge = (phase: string) => {
    switch (phase.toLowerCase()) {
      case 'running':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            Running
          </span>
        );
      case 'crashloopbackoff':
      case 'failed':
      case 'error':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 animate-pulse">
            {phase}
          </span>
        );
      case 'pending':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
            Pending
          </span>
        );
      default:
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            {phase}
          </span>
        );
    }
  };

  const renderPodItem = (pod: PodItem, isNested = false) => {
    const isSelected = pod.name === selectedPodName;

    return (
      <div
        key={pod.name}
        onClick={() => selectPod(pod.name)}
        className={`p-2 rounded cursor-pointer transition border ${isNested ? 'ml-2 mb-1' : 'mb-1'} ${
          isSelected
            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-500/50 text-indigo-950 dark:text-indigo-200 shadow-xs'
            : 'bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-300'
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
            <span className="text-amber-600 dark:text-amber-400 font-bold" title="Restart count">
              {pod.restart_count} restarts
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <aside className="w-80 h-full border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col select-none">
      {/* Cluster selection */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
            <span>Cluster</span>
          </label>
          <button
            onClick={onOpenClusterManager}
            className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline transition"
            title="Manage clusters"
          >
            + Manage
          </button>
        </div>

        {/* Region Filter Selector (When multiple regions like us-east-1 and us-east-2 are configured) */}
        {availableRegions.length > 0 && (
          <div className="mb-2 flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
            <Globe className="w-3 h-3 text-slate-400 shrink-0 mr-0.5" />
            <button
              onClick={() => setSelectedRegion('ALL')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition shrink-0 ${
                selectedRegion === 'ALL'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
              }`}
              title="Show clusters from all regions"
            >
              All Regions
            </button>
            {availableRegions.map((reg) => (
              <button
                key={reg}
                onClick={() => setSelectedRegion(reg)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition shrink-0 ${
                  selectedRegion === reg
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
                }`}
                title={`Filter to region: ${reg}`}
              >
                {reg}
              </button>
            ))}
          </div>
        )}

        {clusters.length === 0 ? (
          <button
            onClick={onOpenClusterManager}
            className="w-full bg-white dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded px-2.5 py-2 text-xs text-indigo-600 dark:text-indigo-300 font-medium transition text-center shadow-xs"
          >
            + Configure Cluster
          </button>
        ) : (
          <select
            value={selectedClusterId || ''}
            onChange={(e) => selectCluster(e.target.value)}
            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500 shadow-xs"
          >
            {filteredClusters.map((c) => {
              const activeReg = c.active_region || c.region;
              const regionsLabel = c.regions && c.regions.length > 1
                ? ` [Active: ${activeReg} | ${c.regions.join(', ')}]`
                : activeReg ? ` [${activeReg}]` : '';
              return (
                <option key={c.id} value={c.id}>
                  {c.name}{regionsLabel} ({c.status})
                </option>
              );
            })}
          </select>
        )}
      </div>

      {/* Namespace selection */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800">
        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
          <span>Namespace</span>
          <Layers className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
        </label>
        <select
          disabled={isLoadingNamespaces || namespaces.length === 0}
          value={selectedNamespace || ''}
          onChange={(e) => selectNamespace(e.target.value)}
          className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50 shadow-xs"
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
        <div className="mx-3 mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded text-xs text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-all">{errorMessage}</span>
        </div>
      )}

      {/* Pods list */}
      <div className="flex-1 overflow-hidden flex flex-col p-3 min-h-0">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setIsPodsExpanded(!isPodsExpanded)}
            className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
          >
            {isPodsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span>Pods ({filteredPods.length})</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setGroupByApp(!groupByApp)}
              className={`p-1 rounded transition text-[10px] flex items-center gap-1 border ${
                groupByApp
                  ? 'bg-indigo-50 dark:bg-indigo-600/30 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-500/40 font-medium'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title={groupByApp ? 'Grouping pods by App Name' : 'Flat pods list'}
            >
              <FolderTree className="w-3 h-3" />
              <span>Group</span>
            </button>
            {isLoadingPods && <span className="text-[10px] text-slate-500 animate-pulse">Loading...</span>}
          </div>
        </div>

        {/* Pod search input */}
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
          <input
            type="text"
            placeholder="Search pods..."
            value={podSearch}
            onChange={(e) => setPodSearch(e.target.value)}
            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded pl-8 pr-2.5 py-1 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500 shadow-xs"
          />
        </div>

        {/* Pods list container */}
        {isPodsExpanded && (
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 font-mono text-xs">
            {groupByApp && podGroups ? (
              // Grouped by App View
              podGroups.map((group) => {
                const isMulti = group.pods.length > 1;
                const isCollapsed = collapsedGroups.has(group.appName);

                if (!isMulti) {
                  return renderPodItem(group.pods[0], false);
                }

                return (
                  <div key={group.appName} className="mb-2 rounded border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50/40 dark:bg-indigo-950/10 overflow-hidden shadow-2xs">
                    {/* App Group Header */}
                    <div
                      onClick={(e) => toggleGroupCollapse(group.appName, e)}
                      className="p-2 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100/70 dark:hover:bg-indigo-950/50 flex items-center justify-between cursor-pointer transition border-b border-indigo-100 dark:border-indigo-950/40"
                    >
                      <div className="flex items-center gap-1.5 truncate flex-1 pr-2">
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        )}
                        <span className="font-bold text-indigo-950 dark:text-indigo-200 truncate">{group.appName}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-mono font-medium">
                          {group.pods.length} pods
                        </span>
                      </div>

                      {/* Merged Stream Action Button */}
                      <button
                        onClick={(e) => handleOpenGroupMergedStream(group.pods, e)}
                        className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold flex items-center gap-1 transition shrink-0 shadow-xs"
                        title={`Merge and stream logs from all ${group.pods.length} pods of ${group.appName}`}
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>Merged</span>
                      </button>
                    </div>

                    {/* Group Children Pods */}
                    {!isCollapsed && (
                      <div className="p-1 space-y-1">
                        {group.pods.map((p) => renderPodItem(p, true))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              // Flat View
              filteredPods.map((pod) => renderPodItem(pod, false))
            )}

            {!isLoadingPods && filteredPods.length === 0 && (
              <div className="text-center py-6 text-slate-500 text-xs">
                No pods found in namespace
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Pod's Containers & Quick Stream Launcher */}
      {selectedPodName && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/80">
          <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span className="truncate pr-1">Containers ({selectedPodName})</span>
            <Terminal className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          </div>

          {isLoadingContainers ? (
            <div className="text-xs text-slate-500 animate-pulse">Loading containers...</div>
          ) : (
            <div className="space-y-1.5">
              {containers.length > 1 && (
                <div className="flex items-center justify-between p-2 rounded bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 text-xs font-mono mb-2">
                  <div className="truncate flex-1 pr-2">
                    <div className="font-semibold text-indigo-950 dark:text-indigo-300">All Containers (Merged)</div>
                    <div className="text-[10px] text-indigo-700 dark:text-indigo-400/80">Stream & merge {containers.length} containers</div>
                  </div>
                  <button
                    onClick={() => handleOpenStream(selectedPodName, '_all_', false)}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition shadow-xs"
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
                  className="flex items-center justify-between p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono shadow-2xs"
                >
                  <div className="truncate flex-1 pr-2">
                    <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{c.name}</div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                      <span>{c.state}</span>
                      {c.restarts > 0 && <span className="text-amber-600 dark:text-amber-400">({c.restarts}r)</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenStream(selectedPodName, c.name, false)}
                      className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition"
                      title="Tail live logs"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Live</span>
                    </button>

                    {c.has_previous && (
                      <button
                        onClick={() => handleOpenStream(selectedPodName, c.name, true)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-amber-700 dark:text-amber-300 rounded text-[10px] font-semibold flex items-center gap-1 transition border border-amber-500/20"
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
