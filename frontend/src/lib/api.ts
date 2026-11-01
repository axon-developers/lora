import {
  ClusterInfo,
  PodItem,
  ContainerItem,
  AdminConnectionStats,
  PodEvent,
  AuthStatus,
  RedactionRule,
  RedactionTestResult,
  S3ExportResult,
} from '../types';

const BASE_URL = '/api/v1';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.error) errorMsg = data.error;
      else if (data.message) errorMsg = data.message;
    } catch {
      // Non-JSON error body
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

export const api = {
  async getClusters(): Promise<ClusterInfo[]> {
    const res = await fetch(`${BASE_URL}/clusters`);
    return handleResponse<ClusterInfo[]>(res);
  },

  async getClusterConfig(clusterId: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/clusters/${encodeURIComponent(clusterId)}/config`);
    return handleResponse(res);
  },

  async discoverContexts(kubeconfigPath?: string): Promise<{ success: boolean; contexts: import('../types').DiscoveredContext[] }> {
    const res = await fetch(`${BASE_URL}/clusters/discover-contexts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kubeconfig_path: kubeconfigPath || '' }),
    });
    return handleResponse(res);
  },

  async addCluster(clusterData: any): Promise<any> {
    const res = await fetch(`${BASE_URL}/clusters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clusterData),
    });
    return handleResponse(res);
  },

  async updateCluster(clusterId: string, clusterData: any): Promise<any> {
    const res = await fetch(`${BASE_URL}/clusters/${encodeURIComponent(clusterId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clusterData),
    });
    return handleResponse(res);
  },

  async deleteCluster(clusterId: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/clusters/${encodeURIComponent(clusterId)}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async restartServer(): Promise<any> {
    const res = await fetch(`${BASE_URL}/admin/restart`, {
      method: 'POST',
    });
    return handleResponse(res);
  },

  async reconnectCluster(clusterId: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/clusters/${encodeURIComponent(clusterId)}/reconnect`, {
      method: 'POST',
    });
    return handleResponse(res);
  },

  async executeKconnect(clusterId: string, password?: string, mfaCode?: string, region?: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/clusters/${encodeURIComponent(clusterId)}/kconnect/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, mfa_code: mfaCode, region }),
    });
    return handleResponse(res);
  },

  async switchRegion(clusterId: string, region: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/clusters/${encodeURIComponent(clusterId)}/switch-region`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region }),
    });
    return handleResponse(res);
  },

  async getKconnectConfig(clusterId: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/clusters/${encodeURIComponent(clusterId)}/kconnect/config`);
    return handleResponse(res);
  },

  async getNamespaces(clusterId: string): Promise<string[]> {
    const res = await fetch(`${BASE_URL}/clusters/${encodeURIComponent(clusterId)}/namespaces`);
    const data = await handleResponse<{ namespaces: string[] }>(res);
    return data.namespaces || [];
  },

  async getPods(clusterId: string, namespace: string): Promise<PodItem[]> {
    const res = await fetch(
      `${BASE_URL}/clusters/${encodeURIComponent(clusterId)}/namespaces/${encodeURIComponent(namespace)}/pods`
    );
    const data = await handleResponse<{ pods: PodItem[] }>(res);
    return data.pods || [];
  },

  async getContainers(clusterId: string, namespace: string, podName: string): Promise<ContainerItem[]> {
    const res = await fetch(
      `${BASE_URL}/clusters/${encodeURIComponent(clusterId)}/namespaces/${encodeURIComponent(
        namespace
      )}/pods/${encodeURIComponent(podName)}/containers`
    );
    const data = await handleResponse<{ containers: ContainerItem[] }>(res);
    return data.containers || [];
  },

  async getAdminConnections(): Promise<AdminConnectionStats> {
    const res = await fetch(`${BASE_URL}/admin/connections`);
    return handleResponse<AdminConnectionStats>(res);
  },

  async getAdminSettings(): Promise<any> {
    const res = await fetch(`${BASE_URL}/admin/settings`);
    return handleResponse(res);
  },

  async updateAdminSettings(settings: any): Promise<any> {
    const res = await fetch(`${BASE_URL}/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return handleResponse(res);
  },

  // V2: Authentication & User Session
  async getAuthStatus(): Promise<AuthStatus> {
    const res = await fetch(`${BASE_URL}/auth/status`);
    return handleResponse<AuthStatus>(res);
  },

  async logout(): Promise<any> {
    const res = await fetch(`${BASE_URL}/auth/logout`, { method: 'POST' });
    return handleResponse(res);
  },

  // V2: Pod Events
  async getPodEvents(clusterId: string, namespace: string, podName: string): Promise<PodEvent[]> {
    const res = await fetch(
      `${BASE_URL}/clusters/${encodeURIComponent(clusterId)}/namespaces/${encodeURIComponent(
        namespace
      )}/pods/${encodeURIComponent(podName)}/events`
    );
    const data = await handleResponse<{ events: PodEvent[] }>(res);
    return data.events || [];
  },

  // V2: S3 Export
  async exportToS3(
    clusterId: string,
    namespace: string,
    podName: string,
    container: string,
    logContent: string
  ): Promise<S3ExportResult> {
    const res = await fetch(
      `${BASE_URL}/clusters/${encodeURIComponent(clusterId)}/namespaces/${encodeURIComponent(
        namespace
      )}/pods/${encodeURIComponent(podName)}/export-s3`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ container, log_content: logContent }),
      }
    );
    return handleResponse<S3ExportResult>(res);
  },

  // V2: Redaction Testing Sandbox
  async testRedaction(sampleText: string, rules: RedactionRule[]): Promise<RedactionTestResult> {
    const res = await fetch(`${BASE_URL}/admin/redaction/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample_text: sampleText, rules }),
    });
    return handleResponse<RedactionTestResult>(res);
  },
};

