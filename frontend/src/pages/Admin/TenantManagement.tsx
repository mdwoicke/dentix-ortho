/**
 * Tenant Management Page
 * Lists all tenants with status, allows editing/deactivating, links to create wizard
 * When rendered at /admin/tenants/:id, shows edit form for that tenant
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/layout';
import { Card, Button } from '../../components/ui';
import * as tenantApi from '../../services/api/tenantApi';
import { testConnection as testFabricConnection } from '../../services/api/fabricWorkflowApi';
import type { TenantFull } from '../../services/api/tenantApi';
import { ALL_TABS } from '../../types/auth.types';

const MAX_LOGO_SIZE = 128;
const MAX_FILE_BYTES = 256 * 1024;

function TenantEditForm({ tenantId, onBack }: { tenantId: number; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState<Partial<TenantFull>>({});
  const [enabledTabs, setEnabledTabs] = useState<string[]>([]);
  const [savingTabs, setSavingTabs] = useState(false);
  const [tabsSuccess, setTabsSuccess] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [fabricTesting, setFabricTesting] = useState(false);
  const [fabricTestResult, setFabricTestResult] = useState<{ connected: boolean; recordCount?: number; error?: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [tenantRes, tabsRes] = await Promise.all([
          tenantApi.getTenant(tenantId),
          tenantApi.getTenantTabs(tenantId),
        ]);
        setForm(tenantRes.data.tenant);
        setEnabledTabs(tabsRes.data.enabledTabs);
        if (tenantRes.data.tenant.logo_url) {
          setLogoPreview(tenantRes.data.tenant.logo_url);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load tenant');
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  const updateField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleLogoFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, SVG, etc.)');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      alert('Logo must be under 256KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > MAX_LOGO_SIZE || h > MAX_LOGO_SIZE) {
          const scale = Math.min(MAX_LOGO_SIZE / w, MAX_LOGO_SIZE / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/png');
        setLogoPreview(dataUrl);
        setForm(prev => ({ ...prev, logo_url: dataUrl }));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleLogoFile(file);
  };

  const removeLogo = () => {
    setLogoPreview(null);
    setForm(prev => ({ ...prev, logo_url: null }));
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      await tenantApi.updateTenant(tenantId, form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save tenant');
    } finally {
      setSaving(false);
    }
  };

  const toggleTab = (tabKey: string) => {
    setEnabledTabs(prev =>
      prev.includes(tabKey) ? prev.filter(k => k !== tabKey) : [...prev, tabKey]
    );
  };

  const handleSaveTabs = async () => {
    try {
      setSavingTabs(true);
      setTabsSuccess(false);
      await tenantApi.setTenantTabs(tenantId, enabledTabs);
      setTabsSuccess(true);
      setTimeout(() => setTabsSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save tabs');
    } finally {
      setSavingTabs(false);
    }
  };

  const TAB_GROUPS = [
    { label: 'Core', keys: ['dashboard', 'patients', 'appointments', 'calendar', 'settings'] },
    { label: 'Testing & Monitoring', keys: ['test_monitor', 'goal_tests', 'goal_test_generator', 'history', 'tuning'] },
    { label: 'Advanced', keys: ['ab_testing_sandbox', 'ai_prompting', 'api_testing', 'advanced'] },
    { label: 'Dominos Integration', keys: ['dominos_dashboard', 'dominos_orders', 'dominos_health', 'dominos_menu', 'dominos_sessions', 'dominos_errors'] },
    { label: 'Fabric Workflow', keys: ['list_management'] },
  ];

  const TAB_LABELS: Record<string, string> = {
    dashboard: 'Dashboard', patients: 'Patients', appointments: 'Appointments',
    calendar: 'Calendar', settings: 'Settings', test_monitor: 'Test Monitor',
    goal_tests: 'Goal Tests', goal_test_generator: 'Goal Test Generator',
    history: 'History', tuning: 'Tuning', ab_testing_sandbox: 'A/B Testing',
    ai_prompting: 'AI Prompting', api_testing: 'API Testing', advanced: 'Advanced',
    dominos_dashboard: 'Dominos Dashboard', dominos_orders: 'Dominos Orders',
    dominos_health: 'Dominos Health', dominos_menu: 'Dominos Menu',
    dominos_sessions: 'Dominos Sessions', dominos_errors: 'Dominos Errors',
    list_management: 'List Management',
  };

  const inputClass = "mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Edit: ${form.name || ''}`}
        subtitle={`Slug: ${form.slug || ''}`}
        actions={
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            Back to list
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 rounded-md bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
          <p className="text-sm text-green-600 dark:text-green-400">Tenant updated successfully.</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Basic Info */}
        <Card>
          <div className="p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Basic Info</h3>
            <div className="space-y-4 max-w-lg">
              <div>
                <label className={labelClass}>Practice Name</label>
                <input type="text" value={form.name || ''} onChange={(e) => updateField('name', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Short Name</label>
                <input type="text" value={form.short_name || ''} onChange={(e) => updateField('short_name', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Logo</label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Square image, max {MAX_LOGO_SIZE}x{MAX_LOGO_SIZE}px. PNG or JPG recommended.
                </p>
                <div className="flex items-start gap-4">
                  {logoPreview ? (
                    <div className="relative group">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="w-16 h-16 rounded-lg object-contain border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-800"
                      />
                      <button
                        type="button"
                        onClick={removeLogo}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove logo"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleLogoDrop}
                      onClick={() => logoInputRef.current?.click()}
                      className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors bg-gray-50 dark:bg-slate-800"
                    >
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="px-3 py-1.5 text-xs rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      {logoPreview ? 'Change' : 'Upload'}
                    </button>
                    <span className="text-xs text-gray-400">or drag & drop</span>
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoFile(file);
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <div>
                  <label className={labelClass}>Primary Color</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="color" value={form.color_primary || '#2563EB'} onChange={(e) => updateField('color_primary', e.target.value)} className="w-10 h-10 rounded cursor-pointer" />
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">{form.color_primary}</span>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Secondary Color</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="color" value={form.color_secondary || '#1E40AF'} onChange={(e) => updateField('color_secondary', e.target.value)} className="w-10 h-10 rounded cursor-pointer" />
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">{form.color_secondary}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Cloud9 Credentials */}
        <Card>
          <div className="p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Cloud9 Credentials</h3>
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Production
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                  <div className="md:col-span-2">
                    <label className={labelClass}>Endpoint</label>
                    <input type="text" value={form.cloud9_prod_endpoint || ''} onChange={(e) => updateField('cloud9_prod_endpoint', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Client ID</label>
                    <input type="text" value={form.cloud9_prod_client_id || ''} onChange={(e) => updateField('cloud9_prod_client_id', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Username</label>
                    <input type="text" value={form.cloud9_prod_username || ''} onChange={(e) => updateField('cloud9_prod_username', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Password</label>
                    <input type="password" value={form.cloud9_prod_password || ''} onChange={(e) => updateField('cloud9_prod_password', e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" /> Sandbox
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                  <div className="md:col-span-2">
                    <label className={labelClass}>Endpoint</label>
                    <input type="text" value={form.cloud9_sandbox_endpoint || ''} onChange={(e) => updateField('cloud9_sandbox_endpoint', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Client ID</label>
                    <input type="text" value={form.cloud9_sandbox_client_id || ''} onChange={(e) => updateField('cloud9_sandbox_client_id', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Username</label>
                    <input type="text" value={form.cloud9_sandbox_username || ''} onChange={(e) => updateField('cloud9_sandbox_username', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Password</label>
                    <input type="password" value={form.cloud9_sandbox_password || ''} onChange={(e) => updateField('cloud9_sandbox_password', e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Integrations */}
        <Card>
          <div className="p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Integrations</h3>
            <div className="space-y-6 max-w-2xl">
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-3">Node-RED</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={labelClass}>URL</label>
                    <input type="text" value={form.nodered_url || ''} onChange={(e) => updateField('nodered_url', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Username</label>
                    <input type="text" value={form.nodered_username || ''} onChange={(e) => updateField('nodered_username', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Password</label>
                    <input type="password" value={form.nodered_password || ''} onChange={(e) => updateField('nodered_password', e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-3">Flowise</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>URL</label>
                    <input type="text" value={form.flowise_url || ''} onChange={(e) => updateField('flowise_url', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>API Key</label>
                    <input type="password" value={form.flowise_api_key || ''} onChange={(e) => updateField('flowise_api_key', e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-3">Langfuse</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={labelClass}>Host</label>
                    <input type="text" value={form.langfuse_host || ''} onChange={(e) => updateField('langfuse_host', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Public Key</label>
                    <input type="text" value={form.langfuse_public_key || ''} onChange={(e) => updateField('langfuse_public_key', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Secret Key</label>
                    <input type="password" value={form.langfuse_secret_key || ''} onChange={(e) => updateField('langfuse_secret_key', e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Dominos Integration */}
        {enabledTabs.some(t => t.startsWith('dominos_')) && (
          <Card>
            <div className="p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Dominos Integration</h3>
              <div className="space-y-4 max-w-lg">
                <div>
                  <label className={labelClass}>Service URL</label>
                  <input type="text" value={(form as any).dominos_service_url || ''} onChange={(e) => updateField('dominos_service_url', e.target.value)} className={inputClass} placeholder="http://localhost:3000" />
                </div>
                <div>
                  <label className={labelClass}>Auth Token</label>
                  <input type="password" value={(form as any).dominos_service_auth_token || ''} onChange={(e) => updateField('dominos_service_auth_token', e.target.value)} className={inputClass} placeholder="Optional auth token" />
                </div>
                <div>
                  <label className={labelClass}>Default Store ID</label>
                  <input type="text" value={(form as any).dominos_default_store_id || ''} onChange={(e) => updateField('dominos_default_store_id', e.target.value)} className={inputClass} placeholder="e.g. 7539" />
                </div>
                <div>
                  <label className={labelClass}>Order Data Source URL</label>
                  <input type="text" value={(form as any).dominos_data_source_url || ''} onChange={(e) => updateField('dominos_data_source_url', e.target.value)} className={inputClass} placeholder="https://dominos-order-service-v4.replit.app" />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Base URL for importing order logs from the external order service</p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Fabric Workflow Integration */}
        {enabledTabs.includes('list_management') && (
          <Card>
            <div className="p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Fabric Workflow</h3>
              <div className="space-y-4 max-w-lg">
                <div>
                  <label className={labelClass}>Endpoint URL</label>
                  <input type="text" value={(form as any).fabric_workflow_url || ''} onChange={(e) => updateField('fabric_workflow_url', e.target.value)} className={inputClass} placeholder="https://..." />
                </div>
                <div>
                  <label className={labelClass}>Username</label>
                  <input type="text" value={(form as any).fabric_workflow_username || ''} onChange={(e) => updateField('fabric_workflow_username', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Password</label>
                  <input type="password" value={(form as any).fabric_workflow_password || ''} onChange={(e) => updateField('fabric_workflow_password', e.target.value)} className={inputClass} />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={fabricTesting || !(form as any).fabric_workflow_url}
                    onClick={async () => {
                      setFabricTesting(true);
                      setFabricTestResult(null);
                      try {
                        const result = await testFabricConnection({
                          url: (form as any).fabric_workflow_url || '',
                          username: (form as any).fabric_workflow_username || '',
                          password: (form as any).fabric_workflow_password || '',
                        });
                        setFabricTestResult(result);
                      } catch (err: any) {
                        setFabricTestResult({ connected: false, error: err.message || 'Test failed' });
                      } finally {
                        setFabricTesting(false);
                      }
                    }}
                    className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {fabricTesting ? 'Testing...' : 'Test Connection'}
                  </button>
                  {fabricTestResult && (
                    <span className={`text-xs ${fabricTestResult.connected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fabricTestResult.connected
                        ? `Connected (${fabricTestResult.recordCount} records)`
                        : fabricTestResult.error || 'Connection failed'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Enabled Features */}
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Enabled Features</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {enabledTabs.length} of {ALL_TABS.length} features enabled
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEnabledTabs([...ALL_TABS])}
                  className="px-3 py-1.5 text-xs rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setEnabledTabs([])}
                  className="px-3 py-1.5 text-xs rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>
            <div className="space-y-4">
              {TAB_GROUPS.map(group => (
                <div key={group.label}>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">{group.label}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {group.keys.map(key => (
                      <label
                        key={key}
                        className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                          enabledTabs.includes(key)
                            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={enabledTabs.includes(key)}
                          onChange={() => toggleTab(key)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-900 dark:text-gray-100">{TAB_LABELS[key] || key}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={handleSaveTabs} disabled={savingTabs}>
                {savingTabs ? 'Saving...' : 'Save Features'}
              </Button>
              {tabsSuccess && (
                <span className="text-sm text-green-600 dark:text-green-400">Features updated.</span>
              )}
            </div>
          </div>
        </Card>

        {/* Save button */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            Cancel
          </button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TenantManagement() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [tenants, setTenants] = useState<TenantFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await tenantApi.getTenants();
      setTenants(response.data.tenants);
    } catch (err: any) {
      setError(err.message || 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!id) {
      fetchTenants();
    }
  }, [fetchTenants, id]);

  const handleDeactivate = async (tenant: TenantFull) => {
    if (tenant.is_default) {
      alert('Cannot deactivate the default tenant.');
      return;
    }
    if (!confirm(`Are you sure you want to deactivate "${tenant.name}"? This tenant will no longer be accessible.`)) {
      return;
    }
    try {
      await tenantApi.deleteTenant(tenant.id);
      fetchTenants();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate tenant');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  // Edit mode: render edit form
  if (id) {
    const tenantId = parseInt(id);
    if (isNaN(tenantId)) {
      return <div className="text-center py-12 text-red-500">Invalid tenant ID</div>;
    }
    return (
      <TenantEditForm
        tenantId={tenantId}
        onBack={() => navigate('/admin?tab=tenants')}
      />
    );
  }

  // List mode
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <Button onClick={() => navigate('/admin/tenants/new')}>
          New Tenant
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No tenants found. Create your first tenant to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Practice</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Slug</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cloud9</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tenant.color_primary }}
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {tenant.name}
                          </div>
                          {tenant.short_name && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {tenant.short_name}
                            </div>
                          )}
                        </div>
                        {tenant.is_default && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400">
                            Default
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
                      {tenant.slug}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {tenant.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {tenant.cloud9_prod_client_id ? (
                        <span className="text-green-600 dark:text-green-400" title="Production credentials configured">Configured</span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(tenant.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
                          className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                          title="Edit tenant"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {!tenant.is_default && tenant.is_active && (
                          <button
                            onClick={() => handleDeactivate(tenant)}
                            className="p-1 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                            title="Deactivate tenant"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default TenantManagement;
