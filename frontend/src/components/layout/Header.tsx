import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw, Settings, Sun, Moon, Server, AlertCircle, User, LogIn, LogOut } from 'lucide-react';
import { useClusterStore } from '../../stores/clusterStore';
import { api } from '../../lib/api';
import { AuthStatus } from '../../types';

interface HeaderProps {
  onOpenMonitor: () => void;
  onOpenSettings: () => void;
  onOpenClusterManager: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenMonitor,
  onOpenSettings,
  onOpenClusterManager,
  isDark,
  onToggleTheme,
}) => {
  const { clusters, selectedClusterId, reconnectCluster } = useClusterStore();
  const currentCluster = clusters.find((c) => c.id === selectedClusterId);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    api
      .getAuthStatus()
      .then(setAuthStatus)
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const getStatusBadge = () => {
    if (!currentCluster) return null;

    switch (currentCluster.status) {
      case 'HEALTHY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            {currentCluster.name}
          </span>
        );
      case 'AUTH_EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3.5 h-3.5" />
            Auth Expired
            <button
              onClick={async () => {
                try {
                  await useClusterStore.getState().executeKconnect(currentCluster.id);
                } catch {
                  useClusterStore.getState().reconnectCluster(currentCluster.id);
                }
              }}
              className="ml-1 bg-rose-500/20 hover:bg-rose-500/30 px-1.5 py-0.5 rounded text-[11px] font-semibold text-rose-200 transition"
              title="Run kconnect command to renew session without restarting"
            >
              Run kconnect
            </button>
            <button
              onClick={() => reconnectCluster(currentCluster.id)}
              className="underline hover:text-rose-300 text-[11px]"
              title="Reload existing kubeconfig from disk"
            >
              Reload
            </button>
          </span>
        );
      case 'UNREACHABLE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Server className="w-3.5 h-3.5" />
            Unreachable
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
            {currentCluster.name} ({currentCluster.status})
          </span>
        );
    }
  };

  return (
    <header className="h-12 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between z-20">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center font-black text-xs text-white tracking-widest shadow-lg shadow-indigo-500/30">
            LO
          </div>
          <span className="font-bold text-sm tracking-wide text-slate-100">LORA</span>
          <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider font-mono border border-indigo-500/30 bg-indigo-950/30 px-1.5 py-0.5 rounded">
            v2.0
          </span>
        </div>

        <div className="h-4 w-px bg-slate-800 mx-1"></div>
        {getStatusBadge()}
      </div>

      <div className="flex items-center gap-2">
        {/* User Session Info */}
        {authStatus && (
          <div className="flex items-center gap-1.5 mr-2">
            {authStatus.enabled && authStatus.user ? (
              <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-800/80 border border-slate-700/60 text-xs">
                <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                  {authStatus.user.name ? authStatus.user.name[0].toUpperCase() : 'U'}
                </div>
                <div className="hidden md:flex flex-col text-[10px]">
                  <span className="font-medium text-slate-200 truncate max-w-[120px]">{authStatus.user.name || authStatus.user.email}</span>
                  <span className="text-slate-400 text-[9px]">{authStatus.user.is_admin ? 'Admin' : 'Viewer'}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1 text-slate-400 hover:text-rose-400 transition"
                  title="Sign out of Azure AD"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : authStatus.enabled ? (
              <a
                href="/api/v1/auth/login"
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Azure AD Sign In</span>
              </a>
            ) : (
              <span className="hidden lg:flex items-center gap-1 text-[10px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                <User className="w-3 h-3 text-slate-600" />
                Local Mode
              </span>
            )}
          </div>
        )}
        <button
          onClick={onOpenClusterManager}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition border border-slate-700/50"
          title="Manage EKS & Kubernetes Clusters"
        >
          <Server className="w-3.5 h-3.5 text-indigo-400" />
          <span>Clusters</span>
        </button>

        {currentCluster && (
          <button
            onClick={() => reconnectCluster(currentCluster.id)}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
            title="Reload Kubeconfig & Reconnect"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={onOpenMonitor}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition border border-slate-700/50"
          title="Open Connection Monitor"
        >
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
          <span>Monitor</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
          title="Application Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleTheme}
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
          title="Toggle Theme"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};

