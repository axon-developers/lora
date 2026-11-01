import { create } from 'zustand';
import { ClusterInfo, PodItem, ContainerItem } from '../types';
import { api } from '../lib/api';

interface ClusterState {
  clusters: ClusterInfo[];
  selectedClusterId: string | null;
  namespaces: string[];
  selectedNamespace: string | null;
  pods: PodItem[];
  selectedPodName: string | null;
  containers: ContainerItem[];
  selectedContainer: string | null;
  isPreviousSelected: boolean;

  isLoadingClusters: boolean;
  isLoadingNamespaces: boolean;
  isLoadingPods: boolean;
  isLoadingContainers: boolean;
  errorMessage: string | null;

  fetchClusters: () => Promise<void>;
  selectCluster: (id: string) => Promise<void>;
  selectNamespace: (ns: string) => Promise<void>;
  selectPod: (podName: string) => Promise<void>;
  selectContainer: (container: string, isPrevious?: boolean) => void;
  reconnectCluster: (id: string) => Promise<void>;
  executeKconnect: (id: string, password?: string, mfaCode?: string, region?: string) => Promise<void>;
  switchRegion: (id: string, region: string) => Promise<void>;
}

export const useClusterStore = create<ClusterState>((set, get) => ({
  clusters: [],
  selectedClusterId: null,
  namespaces: [],
  selectedNamespace: null,
  pods: [],
  selectedPodName: null,
  containers: [],
  selectedContainer: null,
  isPreviousSelected: false,

  isLoadingClusters: false,
  isLoadingNamespaces: false,
  isLoadingPods: false,
  isLoadingContainers: false,
  errorMessage: null,

  fetchClusters: async () => {
    set({ isLoadingClusters: true, errorMessage: null });
    try {
      const data = await api.getClusters();
      set({ clusters: data, isLoadingClusters: false });
      if (!get().selectedClusterId && data.length > 0) {
        // Default to first enabled/healthy cluster
        const first = data.find((c) => c.enabled) || data[0];
        get().selectCluster(first.id);
      }
    } catch (err: any) {
      set({ isLoadingClusters: false, errorMessage: err.message || 'Failed to load clusters' });
    }
  },

  selectCluster: async (id: string) => {
    set({
      selectedClusterId: id,
      namespaces: [],
      selectedNamespace: null,
      pods: [],
      selectedPodName: null,
      containers: [],
      selectedContainer: null,
      isLoadingNamespaces: true,
      errorMessage: null,
    });

    try {
      const namespaces = await api.getNamespaces(id);
      set({ namespaces, isLoadingNamespaces: false });
      if (namespaces.length > 0) {
        // Default to 'default' or first namespace
        const defaultNs = namespaces.includes('default') ? 'default' : namespaces[0];
        get().selectNamespace(defaultNs);
      }
    } catch (err: any) {
      set({ isLoadingNamespaces: false, errorMessage: err.message || 'Failed to load namespaces' });
    }
  },

  selectNamespace: async (ns: string) => {
    const clusterId = get().selectedClusterId;
    if (!clusterId) return;

    set({
      selectedNamespace: ns,
      pods: [],
      selectedPodName: null,
      containers: [],
      selectedContainer: null,
      isLoadingPods: true,
      errorMessage: null,
    });

    try {
      const pods = await api.getPods(clusterId, ns);
      set({ pods, isLoadingPods: false });
    } catch (err: any) {
      set({ isLoadingPods: false, errorMessage: err.message || 'Failed to load pods' });
    }
  },

  selectPod: async (podName: string) => {
    const clusterId = get().selectedClusterId;
    const ns = get().selectedNamespace;
    if (!clusterId || !ns) return;

    set({
      selectedPodName: podName,
      containers: [],
      selectedContainer: null,
      isLoadingContainers: true,
      errorMessage: null,
    });

    try {
      const containers = await api.getContainers(clusterId, ns, podName);
      set({
        containers,
        isLoadingContainers: false,
        selectedContainer: containers.length > 0 ? containers[0].name : null,
      });
    } catch (err: any) {
      set({ isLoadingContainers: false, errorMessage: err.message || 'Failed to load containers' });
    }
  },

  selectContainer: (container: string, isPrevious = false) => {
    set({ selectedContainer: container, isPreviousSelected: isPrevious });
  },

  reconnectCluster: async (id: string) => {
    set({ errorMessage: null });
    try {
      await api.reconnectCluster(id);
      await get().fetchClusters();
      if (get().selectedClusterId === id) {
        const ns = get().selectedNamespace;
        if (ns) {
          get().selectNamespace(ns);
        } else {
          get().selectCluster(id);
        }
      }
    } catch (err: any) {
      set({ errorMessage: err.message || 'Reconnect failed' });
    }
  },

  executeKconnect: async (id: string, password?: string, mfaCode?: string, region?: string) => {
    set({ errorMessage: null });
    try {
      await api.executeKconnect(id, password, mfaCode, region);
      await get().fetchClusters();
      if (get().selectedClusterId === id) {
        const ns = get().selectedNamespace;
        if (ns) {
          get().selectNamespace(ns);
        } else {
          get().selectCluster(id);
        }
      }
    } catch (err: any) {
      set({ errorMessage: err.message || 'Kconnect execution failed' });
      throw err;
    }
  },

  switchRegion: async (id: string, region: string) => {
    set({ errorMessage: null });
    try {
      await api.switchRegion(id, region);
      await get().fetchClusters();
      if (get().selectedClusterId === id) {
        const ns = get().selectedNamespace;
        if (ns) {
          get().selectNamespace(ns);
        } else {
          get().selectCluster(id);
        }
      }
    } catch (err: any) {
      set({ errorMessage: err.message || 'Failed to switch region' });
      throw err;
    }
  },
}));

