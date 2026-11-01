import React, { useEffect, useState } from 'react';
import {
  X,
  Settings,
  Save,
  Check,
  AlertCircle,
  Shield,
  CloudUpload,
  Lock,
  Sliders,
  Terminal,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { RedactionRule, RedactionTestResult } from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'general' | 'auth' | 's3' | 'redaction' | 'system';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [config, setConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redaction sandbox state
  const [sampleText, setSampleText] = useState(
    'Failed to authenticate using AKIAIOSFODNN7EXAMPLE with password="MySecretPassword123" and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.fake'
  );
  const [testResult, setTestResult] = useState<RedactionTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    api
      .getAdminSettings()
      .then((data) => {
        // Ensure V2 nested structures exist with default fallback objects
        const enriched = {
          ...data,
          auth: data.auth || {
            enabled: false,
            provider: 'azure_ad',
            azure_ad: { tenant_id: '', client_id: '', client_secret: '', redirect_url: 'http://localhost:8080/api/v1/auth/callback', scopes: ['openid', 'profile', 'email'] },
            jwt_secret: 'lora-secret-key-change-in-prod',
            session_ttl: '24h',
            admin_roles: ['admin', 'lora-admin'],
          },
          s3_export: data.s3_export || {
            enabled: false,
            bucket: '',
            region: 'us-east-1',
            prefix: 'lora-exports/',
            endpoint: '',
            access_key_id: '',
            secret_access_key: '',
            use_iam_role: true,
          },
          redaction: data.redaction || {
            enabled: false,
            rules: [
              { id: 'aws-key', name: 'AWS Access Key', pattern: 'AKIA[0-9A-Z]{16}', mask: '[REDACTED_AWS_KEY]', enabled: true },
              { id: 'bearer-token', name: 'Bearer Token', pattern: 'Bearer\\s+[a-zA-Z0-9_\\-\\.]+', mask: 'Bearer [REDACTED_TOKEN]', enabled: true },
              { id: 'password-key', name: 'Password in KV', pattern: '(?i)(password|passwd|secret)\\s*[:=]\\s*["\']?([^"\'\\s]+)["\']?', mask: '$1=[REDACTED]', enabled: true },
            ],
          },
        };
        setConfig(enriched);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load settings');
        setIsLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.updateAdminSettings(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    }
  };

  const handleRunRedactionTest = async () => {
    if (!config?.redaction?.rules) return;
    setIsTesting(true);
    try {
      const res = await api.testRedaction(sampleText, config.redaction.rules);
      setTestResult(res);
    } catch (err: any) {
      setError(err.message || 'Redaction test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddRule = () => {
    const newRule: RedactionRule = {
      id: `rule-${Date.now()}`,
      name: 'Custom Pattern',
      pattern: '',
      mask: '[REDACTED]',
      enabled: true,
    };
    setConfig({
      ...config,
      redaction: {
        ...config.redaction,
        rules: [...(config.redaction?.rules || []), newRule],
      },
    });
  };

  const handleRemoveRule = (index: number) => {
    const rules = [...(config.redaction?.rules || [])];
    rules.splice(index, 1);
    setConfig({
      ...config,
      redaction: { ...config.redaction, rules },
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-4xl w-full h-[620px] max-h-[90vh] flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/50 shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-sm text-slate-100">Application & Platform Settings</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-3 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-1.5 px-3 py-2.5 font-medium border-b-2 transition ${
              activeTab === 'general'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>General & Buffers</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('auth')}
            className={`flex items-center gap-1.5 px-3 py-2.5 font-medium border-b-2 transition ${
              activeTab === 'auth'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Azure AD / SSO</span>
            {config?.auth?.enabled && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('s3')}
            className={`flex items-center gap-1.5 px-3 py-2.5 font-medium border-b-2 transition ${
              activeTab === 's3'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CloudUpload className="w-3.5 h-3.5" />
            <span>AWS S3 Export</span>
            {config?.s3_export?.enabled && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('redaction')}
            className={`flex items-center gap-1.5 px-3 py-2.5 font-medium border-b-2 transition ${
              activeTab === 'redaction'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Data Redaction</span>
            {config?.redaction?.enabled && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-1.5 px-3 py-2.5 font-medium border-b-2 transition ${
              activeTab === 'system'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Server Operations</span>
          </button>
        </div>

        {/* Content & Pinned Footer Form */}
        <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && (
              <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {isLoading ? (
              <div className="text-center py-16 text-slate-500">Loading settings...</div>
            ) : config ? (
            <>
              {/* TAB 1: GENERAL */}
              {activeTab === 'general' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Log Viewer & Ring Buffer
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Default Tail Lines</label>
                        <input
                          type="number"
                          value={config.streaming?.default_tail_lines ?? 500}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              streaming: { ...config.streaming, default_tail_lines: parseInt(e.target.value) || 100 },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-slate-400 block mb-1">Ring Buffer Max Entries</label>
                        <input
                          type="number"
                          value={config.streaming?.ring_buffer_max_entries ?? 1000}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              streaming: { ...config.streaming, ring_buffer_max_entries: parseInt(e.target.value) || 500 },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-slate-400 block mb-1">Max Tabs Soft Limit</label>
                        <input
                          type="number"
                          value={config.viewer?.max_tabs_soft_limit ?? 10}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              viewer: { ...config.viewer, max_tabs_soft_limit: parseInt(e.target.value) || 5 },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-slate-400 block mb-1">WebSocket Batch Interval (ms)</label>
                        <input
                          type="number"
                          value={config.websocket?.batch_interval_ms ?? 200}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              websocket: { ...config.websocket, batch_interval_ms: parseInt(e.target.value) || 100 },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Network Binding
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Server Host</label>
                        <input
                          type="text"
                          value={config.server?.host ?? '0.0.0.0'}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              server: { ...config.server, host: e.target.value },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Server Port</label>
                        <input
                          type="number"
                          value={config.server?.port ?? 8080}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              server: { ...config.server, port: parseInt(e.target.value) || 8080 },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: AZURE AD / OIDC SSO */}
              {activeTab === 'auth' && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Enable Azure AD Authentication</div>
                      <div className="text-[11px] text-slate-500">
                        When disabled, LORA runs in open local/intranet mode without requiring sign-in.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.auth?.enabled ?? false}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            auth: { ...config.auth, enabled: e.target.checked },
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-slate-400 block mb-1">Azure AD Tenant ID (Directory ID)</label>
                      <input
                        type="text"
                        placeholder="e.g. 72f988bf-86f1-41af-91ab-2d7cd011db47"
                        value={config.auth?.azure_ad?.tenant_id ?? ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            auth: {
                              ...config.auth,
                              azure_ad: { ...config.auth?.azure_ad, tenant_id: e.target.value },
                            },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Azure AD Client ID (Application ID)</label>
                      <input
                        type="text"
                        placeholder="e.g. 00000000-0000-0000-0000-000000000000"
                        value={config.auth?.azure_ad?.client_id ?? ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            auth: {
                              ...config.auth,
                              azure_ad: { ...config.auth?.azure_ad, client_id: e.target.value },
                            },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Client Secret</label>
                      <input
                        type="password"
                        placeholder="••••••••••••••••••••••••••••"
                        value={config.auth?.azure_ad?.client_secret ?? ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            auth: {
                              ...config.auth,
                              azure_ad: { ...config.auth?.azure_ad, client_secret: e.target.value },
                            },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">OAuth2 Redirect URL</label>
                      <input
                        type="text"
                        value={config.auth?.azure_ad?.redirect_url ?? 'http://localhost:8080/api/v1/auth/callback'}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            auth: {
                              ...config.auth,
                              azure_ad: { ...config.auth?.azure_ad, redirect_url: e.target.value },
                            },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: AWS S3 EXPORT */}
              {activeTab === 's3' && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Enable On-Demand S3 Log Export</div>
                      <div className="text-[11px] text-slate-500">
                        Export raw or filtered log buffers directly to an AWS S3 bucket as compressed .log.gz files.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.s3_export?.enabled ?? false}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            s3_export: { ...config.s3_export, enabled: e.target.checked },
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">S3 Bucket Name</label>
                      <input
                        type="text"
                        placeholder="my-company-lora-logs"
                        value={config.s3_export?.bucket ?? ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            s3_export: { ...config.s3_export, bucket: e.target.value },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">AWS Region</label>
                      <input
                        type="text"
                        placeholder="us-east-1"
                        value={config.s3_export?.region ?? 'us-east-1'}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            s3_export: { ...config.s3_export, region: e.target.value },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Target S3 Prefix</label>
                      <input
                        type="text"
                        placeholder="lora-exports/"
                        value={config.s3_export?.prefix ?? 'lora-exports/'}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            s3_export: { ...config.s3_export, prefix: e.target.value },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Custom S3 / MinIO Endpoint (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. https://minio.local:9000"
                        value={config.s3_export?.endpoint ?? ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            s3_export: { ...config.s3_export, endpoint: e.target.value },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <input
                        type="checkbox"
                        checked={config.s3_export?.use_iam_role ?? true}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            s3_export: { ...config.s3_export, use_iam_role: e.target.checked },
                          })
                        }
                        className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-0"
                      />
                      <span className="text-slate-300">Use Ambient AWS IAM Role / Instance Profile</span>
                    </label>

                    {!config.s3_export?.use_iam_role && (
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <label className="text-slate-400 block mb-1">AWS Access Key ID</label>
                          <input
                            type="text"
                            value={config.s3_export?.access_key_id ?? ''}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                s3_export: { ...config.s3_export, access_key_id: e.target.value },
                              })
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-1">AWS Secret Access Key</label>
                          <input
                            type="password"
                            value={config.s3_export?.secret_access_key ?? ''}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                s3_export: { ...config.s3_export, secret_access_key: e.target.value },
                              })
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: REDACTION & MASKING */}
              {activeTab === 'redaction' && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Enable Log Redaction Engine</div>
                      <div className="text-[11px] text-slate-500">
                        Automatically mask sensitive tokens, credentials, or keys before streaming or exporting.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.redaction?.enabled ?? false}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            redaction: { ...config.redaction, enabled: e.target.checked },
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {/* Rules List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">
                        Active Masking Rules
                      </span>
                      <button
                        type="button"
                        onClick={handleAddRule}
                        className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Pattern</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {config.redaction?.rules?.map((rule: RedactionRule, idx: number) => (
                        <div key={rule.id || idx} className="p-2.5 bg-slate-950 border border-slate-800 rounded flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(e) => {
                              const rules = [...config.redaction.rules];
                              rules[idx].enabled = e.target.checked;
                              setConfig({ ...config, redaction: { ...config.redaction, rules } });
                            }}
                            className="rounded border-slate-700 bg-slate-900 text-indigo-600"
                          />
                          <input
                            type="text"
                            placeholder="Rule Name"
                            value={rule.name}
                            onChange={(e) => {
                              const rules = [...config.redaction.rules];
                              rules[idx].name = e.target.value;
                              setConfig({ ...config, redaction: { ...config.redaction, rules } });
                            }}
                            className="w-48 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-200 shrink-0"
                          />
                          <input
                            type="text"
                            placeholder="Regex Pattern"
                            value={rule.pattern}
                            onChange={(e) => {
                              const rules = [...config.redaction.rules];
                              rules[idx].pattern = e.target.value;
                              setConfig({ ...config, redaction: { ...config.redaction, rules } });
                            }}
                            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 font-mono text-slate-200 min-w-[200px]"
                          />
                          <input
                            type="text"
                            placeholder="Mask"
                            value={rule.mask}
                            onChange={(e) => {
                              const rules = [...config.redaction.rules];
                              rules[idx].mask = e.target.value;
                              setConfig({ ...config, redaction: { ...config.redaction, rules } });
                            }}
                            className="w-48 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 font-mono text-slate-300 shrink-0"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveRule(idx)}
                            className="p-1 text-slate-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Redaction Testing Sandbox */}
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">
                        Live Redaction Sandbox
                      </span>
                      <button
                        type="button"
                        onClick={handleRunRedactionTest}
                        disabled={isTesting}
                        className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium text-[11px]"
                      >
                        <Play className="w-3 h-3 text-emerald-400" />
                        <span>{isTesting ? 'Testing...' : 'Test Rules'}</span>
                      </button>
                    </div>

                    <textarea
                      rows={2}
                      value={sampleText}
                      onChange={(e) => setSampleText(e.target.value)}
                      placeholder="Enter sample log line to test patterns..."
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 font-mono text-[11px]"
                    />

                    {testResult && (
                      <div className="p-2.5 bg-slate-950 rounded border border-slate-800 space-y-1">
                        <div className="text-[10px] text-slate-500">Redacted Output:</div>
                        <div className="font-mono text-emerald-300 bg-slate-900/50 p-1.5 rounded">
                          {testResult.redacted}
                        </div>
                        {testResult.matches.length > 0 && (
                          <div className="text-[10px] text-indigo-400">
                            ✓ {testResult.matches.length} sensitive item(s) masked: {testResult.matches.map(m => m.rule_name).join(', ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: SYSTEM & RESTART */}
              {activeTab === 'system' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Restart Application Server</div>
                      <div className="text-[11px] text-slate-500">
                        Gracefully restarts the background LORA process to apply port, network, or auth changes.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm('Restart the LORA server process? The UI will reconnect automatically in 3 seconds.')) {
                          try {
                            await api.restartServer();
                            alert('Server restart initiated. Page will reload in 3 seconds.');
                            setTimeout(() => window.location.reload(), 3000);
                          } catch {
                            setTimeout(() => window.location.reload(), 3000);
                          }
                        }
                      }}
                      className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded font-medium transition"
                    >
                      Restart Server
                    </button>
                  </div>

                  <div className="p-3 bg-slate-950 rounded border border-slate-800 text-[11px] text-slate-400 space-y-1">
                    <div className="font-semibold text-slate-300">Persistence Architecture</div>
                    <div>• Settings are stored in both SQLite WAL database (<span className="text-slate-200 font-mono">./data/lora.db</span>) and YAML (<span className="text-slate-200 font-mono">lora-config.yaml</span>).</div>
                    <div>• Clusters connected via kconnect refresh tokens automatically in the background.</div>
                  </div>
                </div>
              )}
            </>
          ) : null}
          </div>

          {/* Fixed Pinned Footer */}
          <div className="h-14 border-t border-slate-800 bg-slate-950/40 px-4 flex items-center justify-between shrink-0">
            <span className="text-[10px] text-slate-500">All configurations take effect immediately upon saving.</span>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium transition shadow-sm text-xs"
            >
              {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saved ? 'Saved!' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
