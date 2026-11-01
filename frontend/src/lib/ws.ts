import { useViewerStore } from '../stores/viewerStore';

class LogWebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimeout: any = null;
  private isDestroyed = false;
  private activeSubscriptions = new Set<string>();

  connect() {
    if (this.isDestroyed || (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/v1/logs`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // Resubscribe all currently open tabs
        const { tabs } = useViewerStore.getState();
        this.activeSubscriptions.clear();

        tabs.forEach((tab) => {
          this.subscribe(tab.id, tab.clusterId, tab.namespace, tab.podName, tab.container, tab.previous, tab.sinceSeconds);
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch {
          // Ignore malformed message
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (!this.isDestroyed) {
          this.reconnectTimeout = setTimeout(() => this.connect(), 2000);
        }
      };

      this.ws.onerror = () => {
        if (this.ws) {
          this.ws.close();
        }
      };
    } catch {
      this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
    }
  }

  private handleMessage(msg: any) {
    const { appendLogs, setTabStatus } = useViewerStore.getState();

    switch (msg.type) {
      case 'subscription.created':
        setTabStatus(msg.viewer_id, 'STREAMING');
        break;

      case 'logs':
        if (msg.viewer_id && msg.entries) {
          appendLogs(msg.viewer_id, msg.entries);
        }
        break;

      case 'subscription.error':
        setTabStatus(msg.viewer_id, 'ERROR', msg.message || 'Subscription error');
        break;

      case 'logs.gap':
        // Gap notification
        break;

      case 'pong':
        break;
    }
  }

  subscribe(viewerId: string, clusterId: string, namespace: string, podName: string, container: string, previous = false, sinceSeconds?: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = {
      type: 'subscribe',
      request_id: `sub-${Date.now()}`,
      viewer_id: viewerId,
      cluster_id: clusterId,
      namespace,
      pod_name: podName,
      container,
      previous,
      tail_lines: 500,
      since_seconds: sinceSeconds !== undefined ? sinceSeconds : 900,
      timestamps: true,
    };

    this.ws.send(JSON.stringify(payload));
    this.activeSubscriptions.add(viewerId);
  }

  unsubscribe(viewerId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = {
      type: 'unsubscribe',
      request_id: `unsub-${Date.now()}`,
      viewer_id: viewerId,
    };

    this.ws.send(JSON.stringify(payload));
    this.activeSubscriptions.delete(viewerId);
  }

  destroy() {
    this.isDestroyed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const wsManager = new LogWebSocketManager();

