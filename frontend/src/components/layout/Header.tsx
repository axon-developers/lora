import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw, Settings, Sun, Moon, Server, AlertCircle, User, LogIn, LogOut, Globe, Search } from 'lucide-react';
import { useClusterStore } from '../../stores/clusterStore';
import { api } from '../../lib/api';
import { AuthStatus } from '../../types';

interface HeaderProps {
  onOpenMonitor: () => void;
  onOpenSettings: () => void;
  onOpenClusterManager: () => void;
  onOpenCommandPalette: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenMonitor,
  onOpenSettings,
  onOpenClusterManager,
  onOpenCommandPalette,
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
            <span>{currentCluster.name}</span>
            {currentCluster.regions && currentCluster.regions.length > 1 ? (
              <span className="flex items-center gap-1 ml-1 bg-white dark:bg-slate-800 rounded px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 shadow-2xs">
                <Globe className="w-3 h-3 text-indigo-500 shrink-0" />
                <select
                  value={currentCluster.active_region || currentCluster.region || 'us-east-1'}
                  onChange={async (e) => {
                    const newReg = e.target.value;
                    try {
                      await useClusterStore.getState().switchRegion(currentCluster.id, newReg);
                    } catch (err: any) {
                      alert(err.message || 'Failed to switch region');
                    }
                  }}
                  className="bg-transparent text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 border-none outline-none cursor-pointer"
                  title="Switch Active Region for this Cluster"
                >
                  {currentCluster.regions.map((reg) => (
                    <option key={reg} value={reg} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                      {reg}
                    </option>
                  ))}
                </select>
              </span>
            ) : currentCluster.region ? (
              <span className="text-[10px] px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono">
                {currentCluster.region}
              </span>
            ) : null}
          </span>
        );
      case 'AUTH_EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Auth Expired</span>
            {currentCluster.regions && currentCluster.regions.length > 1 ? (
              <span className="flex items-center gap-1 ml-1">
                <span className="text-[10px] text-slate-500 font-medium">Connect:</span>
                {currentCluster.regions.map((reg) => (
                  <button
                    key={reg}
                    onClick={async () => {
                      try {
                        await useClusterStore.getState().executeKconnect(currentCluster.id, undefined, undefined, reg);
                      } catch {
                        useClusterStore.getState().reconnectCluster(currentCluster.id);
                      }
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition ${
                      (currentCluster.active_region || currentCluster.region) === reg
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-700 dark:text-rose-200'
                    }`}
                    title={`Run kconnect for ${reg}`}
                  >
                    {reg}
                  </button>
                ))}
              </span>
            ) : (
              <button
                onClick={async () => {
                  try {
                    await useClusterStore.getState().executeKconnect(currentCluster.id);
                  } catch {
                    useClusterStore.getState().reconnectCluster(currentCluster.id);
                  }
                }}
                className="ml-1 bg-rose-500/20 hover:bg-rose-500/30 px-1.5 py-0.5 rounded text-[11px] font-semibold text-rose-700 dark:text-rose-200 transition"
                title="Run kconnect command to renew session without restarting"
              >
                Run kconnect
              </button>
            )}
            <button
              onClick={() => reconnectCluster(currentCluster.id)}
              className="underline hover:text-rose-800 dark:hover:text-rose-300 text-[11px] ml-1"
              title="Reload existing kubeconfig from disk"
            >
              Reload
            </button>
          </span>
        );
      case 'UNREACHABLE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
            <Server className="w-3.5 h-3.5" />
            Unreachable
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            {currentCluster.name} ({currentCluster.status})
          </span>
        );
    }
  };

  return (
    <header className="h-12 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between z-20 shadow-sm dark:shadow-none">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center font-black text-xs text-white tracking-widest shadow-md shadow-indigo-500/30">
            LO
          </div>
          <span className="font-bold text-sm tracking-wide text-slate-900 dark:text-slate-100">LORA</span>
          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider font-mono border border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded">
            v2.0
          </span>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>
        {getStatusBadge()}
      </div>

      <div className="flex items-center gap-2">
        {/* User Session Info */}
        {authStatus && (
          <div className="flex items-center gap-1.5 mr-2">
            {authStatus.enabled && authStatus.user ? (
              <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-xs">
                <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                  {authStatus.user.name ? authStatus.user.name[0].toUpperCase() : 'U'}
                </div>
                <div className="hidden md:flex flex-col text-[10px]">
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[120px]">{authStatus.user.name || authStatus.user.email}</span>
                  <span className="text-slate-500 dark:text-slate-400 text-[9px]">{authStatus.user.is_admin ? 'Admin' : 'Viewer'}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition"
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
              <span className="hidden lg:flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-500 bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                <User className="w-3 h-3 text-slate-500 dark:text-slate-600" />
                Local Mode
              </span>
            )}
          </div>
        )}

        {/* Command Palette Trigger Button */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition border border-slate-200 dark:border-slate-700/60 shadow-2xs"
          title="Open Quick Search / Command Palette (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline font-sans text-xs">Jump to...</span>
          <kbd className="px-1 py-0.2 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[10px] font-mono text-slate-500 font-semibold">
            Ctrl K
          </kbd>
        </button>

        <button
          onClick={onOpenClusterManager}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition border border-slate-200 dark:border-slate-700/50"
          title="Manage EKS & Kubernetes Clusters"
        >
          <Server className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Clusters</span>
        </button>

        {currentCluster && (
          <button
            onClick={() => reconnectCluster(currentCluster.id)}
            className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition"
            title="Reload Kubeconfig & Reconnect"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={onOpenMonitor}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition border border-slate-200 dark:border-slate-700/50"
          title="Open Connection Monitor"
        >
          <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Monitor</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition"
          title="Application Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleTheme}
          className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition"
          title="Toggle Theme"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
