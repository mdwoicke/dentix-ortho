/**
 * New Tenant Wizard
 * Multi-step form for creating a new practice tenant
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/layout';
import { Card, Button } from '../../components/ui';
import { useAppSelector } from '../../store/hooks';
import { selectUser } from '../../store/slices/authSlice';
import * as tenantApi from '../../services/api/tenantApi';
import * as adminApi from '../../services/api/adminApi';
import type { CreateTenantRequest } from '../../services/api/tenantApi';
import type { User } from '../../types/auth.types';
import { ALL_TABS } from '../../types/auth.types';

const MAX_LOGO_SIZE = 128; // 4x the ~32px display size
const MAX_FILE_BYTES = 256 * 1024; // 256KB max file size

const STEPS = ['Basic Info', 'Cloud9 Credentials', 'Integrations', 'Features', 'User Access', 'Review'];

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

interface UserSelection {
  userId: number;
  role: 'member' | 'admin' | 'owner';
}

export function NewTenantWizard() {
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectUser);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Feature tabs
  const [selectedTabs, setSelectedTabs] = useState<string[]>([]);

  // All users for User Access step
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserSelection[]>([]);

  // Form state
  const [form, setForm] = useState<CreateTenantRequest>({
    slug: '',
    name: '',
    short_name: '',
    color_primary: '#2563EB',
    color_secondary: '#1E40AF',
    cloud9_prod_endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    cloud9_prod_client_id: '',
    cloud9_prod_username: '',
    cloud9_prod_password: '',
    cloud9_sandbox_endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    cloud9_sandbox_client_id: '',
    cloud9_sandbox_username: '',
    cloud9_sandbox_password: '',
    nodered_url: '',
    nodered_username: '',
    nodered_password: '',
    flowise_url: '',
    flowise_api_key: '',
    langfuse_host: '',
    langfuse_public_key: '',
    langfuse_secret_key: '',
  });

  const [testResults, setTestResults] = useState<{
    prodCloud9?: boolean;
    sandboxCloud9?: boolean;
  }>({});
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

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
        // Resize to MAX_LOGO_SIZE if larger
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > MAX_LOGO_SIZE || h > MAX_LOGO_SIZE) {
          const scale = Math.min(MAX_LOGO_SIZE / w, MAX_LOGO_SIZE / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
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
    setForm(prev => ({ ...prev, logo_url: undefined }));
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  // Initialize current user as owner
  useEffect(() => {
    if (currentUser && selectedUsers.length === 0) {
      setSelectedUsers([{ userId: currentUser.id, role: 'owner' }]);
    }
  }, [currentUser]);

  // Fetch users when entering User Access step
  useEffect(() => {
    if (step === 4 && allUsers.length === 0) {
      (async () => {
        try {
          setLoadingUsers(true);
          const response = await adminApi.getUsers();
          setAllUsers(response.data.users);
        } catch {
          // Non-critical, user can still proceed
        } finally {
          setLoadingUsers(false);
        }
      })();
    }
  }, [step]);

  const updateField = (key: string, value: string) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'name' && !prev.slug || key === 'name' && prev.slug === slugify(prev.name || '')) {
        next.slug = slugify(value);
      }
      return next;
    });
  };

  const handleTestCloud9 = async (env: 'prod' | 'sandbox') => {
    const endpoint = env === 'prod' ? form.cloud9_prod_endpoint : form.cloud9_sandbox_endpoint;
    const clientId = env === 'prod' ? form.cloud9_prod_client_id : form.cloud9_sandbox_client_id;
    const username = env === 'prod' ? form.cloud9_prod_username : form.cloud9_sandbox_username;
    const password = env === 'prod' ? form.cloud9_prod_password : form.cloud9_sandbox_password;

    if (!endpoint || !clientId || !username || !password) {
      alert('Please fill all Cloud9 fields before testing.');
      return;
    }

    try {
      const result = await tenantApi.testCloud9Connection({
        endpoint: endpoint!,
        clientId: clientId!,
        username: username!,
        password: password!,
      });
      setTestResults(prev => ({
        ...prev,
        [env === 'prod' ? 'prodCloud9' : 'sandboxCloud9']: result.data.connected,
      }));
      if (!result.data.connected) {
        alert(`Connection failed: ${result.message}`);
      }
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [env === 'prod' ? 'prodCloud9' : 'sandboxCloud9']: false,
      }));
      alert(`Connection test failed: ${err.message}`);
    }
  };

  const toggleUser = (userId: number) => {
    if (currentUser && userId === currentUser.id) return; // Can't uncheck self
    setSelectedUsers(prev => {
      const existing = prev.find(u => u.userId === userId);
      if (existing) {
        return prev.filter(u => u.userId !== userId);
      }
      return [...prev, { userId, role: 'member' }];
    });
  };

  const setUserRole = (userId: number, role: 'member' | 'admin' | 'owner') => {
    if (currentUser && userId === currentUser.id) return; // Can't change own role
    setSelectedUsers(prev =>
      prev.map(u => u.userId === userId ? { ...u, role } : u)
    );
  };

  const handleSubmit = async () => {
    if (!form.slug || !form.name) {
      setError('Name and slug are required.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await tenantApi.createTenant({
        ...form,
        users: selectedUsers,
        tabKeys: selectedTabs,
      });
      navigate('/admin?tab=tenants');
    } catch (err: any) {
      setError(err.message || 'Failed to create tenant');
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    if (step === 0) return !!form.name && !!form.slug;
    return true;
  };

  const inputClass = "mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <div>
      <PageHeader
        title="Create New Tenant"
        subtitle={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
      />

      {/* Step indicators */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                i === step
                  ? 'bg-blue-600 text-white'
                  : i < step
                  ? 'bg-green-500 text-white cursor-pointer'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
            >
              {i < step ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                i + 1
              )}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-12 h-0.5 ${i < step ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <Card>
        <div className="p-6 space-y-6">
          {/* Step 0: Basic Info */}
          {step === 0 && (
            <div className="space-y-4 max-w-lg">
              <div>
                <label className={labelClass}>Practice Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className={inputClass}
                  placeholder="Acme Orthodontics"
                />
              </div>
              <div>
                <label className={labelClass}>URL Slug *</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => updateField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className={inputClass}
                  placeholder="acme-ortho"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lowercase letters, numbers, and hyphens only</p>
              </div>
              <div>
                <label className={labelClass}>Short Name</label>
                <input
                  type="text"
                  value={form.short_name || ''}
                  onChange={(e) => updateField('short_name', e.target.value)}
                  className={inputClass}
                  placeholder="Acme"
                />
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
                    <input
                      type="color"
                      value={form.color_primary}
                      onChange={(e) => updateField('color_primary', e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">{form.color_primary}</span>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Secondary Color</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={form.color_secondary}
                      onChange={(e) => updateField('color_secondary', e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">{form.color_secondary}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Cloud9 Credentials */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Production */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Production
                </h3>
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
                  <div className="flex items-end">
                    <button
                      onClick={() => handleTestCloud9('prod')}
                      className="px-3 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Test Connection
                      {testResults.prodCloud9 !== undefined && (
                        <span className={`ml-2 ${testResults.prodCloud9 ? 'text-green-600' : 'text-red-600'}`}>
                          {testResults.prodCloud9 ? 'OK' : 'Failed'}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Sandbox */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  Sandbox
                </h3>
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
                  <div className="flex items-end">
                    <button
                      onClick={() => handleTestCloud9('sandbox')}
                      className="px-3 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Test Connection
                      {testResults.sandboxCloud9 !== undefined && (
                        <span className={`ml-2 ${testResults.sandboxCloud9 ? 'text-green-600' : 'text-red-600'}`}>
                          {testResults.sandboxCloud9 ? 'OK' : 'Failed'}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Integrations */}
          {step === 2 && (
            <div className="space-y-6 max-w-2xl">
              {/* Node-RED */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Node-RED</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={labelClass}>URL</label>
                    <input type="text" value={form.nodered_url || ''} onChange={(e) => updateField('nodered_url', e.target.value)} className={inputClass} placeholder="http://localhost:1880" />
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

              {/* Flowise */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Flowise</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>URL</label>
                    <input type="text" value={form.flowise_url || ''} onChange={(e) => updateField('flowise_url', e.target.value)} className={inputClass} placeholder="http://localhost:3000" />
                  </div>
                  <div>
                    <label className={labelClass}>API Key</label>
                    <input type="password" value={form.flowise_api_key || ''} onChange={(e) => updateField('flowise_api_key', e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Langfuse */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Langfuse</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={labelClass}>Host</label>
                    <input type="text" value={form.langfuse_host || ''} onChange={(e) => updateField('langfuse_host', e.target.value)} className={inputClass} placeholder="https://langfuse.example.com" />
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
          )}

          {/* Step 3: Features */}
          {step === 3 && (() => {
            const TAB_GROUPS = [
              { label: 'Core', keys: ['dashboard', 'patients', 'appointments', 'calendar', 'settings'] },
              { label: 'Testing & Monitoring', keys: ['test_monitor', 'goal_tests', 'goal_test_generator', 'history', 'tuning'] },
              { label: 'Advanced', keys: ['ab_testing_sandbox', 'ai_prompting', 'api_testing', 'advanced'] },
              { label: 'Dominos Integration', keys: ['dominos_dashboard', 'dominos_orders', 'dominos_health', 'dominos_menu', 'dominos_sessions', 'dominos_errors'] },
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
            };
            const toggleTab = (key: string) => {
              setSelectedTabs(prev =>
                prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
              );
            };
            return (
              <div className="space-y-4 max-w-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Enabled Features</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Select which features to enable for this tenant. None are enabled by default.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTabs([...ALL_TABS])}
                      className="px-3 py-1.5 text-xs rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTabs([])}
                      className="px-3 py-1.5 text-xs rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedTabs.length} of {ALL_TABS.length} features selected
                </p>
                <div className="space-y-4">
                  {TAB_GROUPS.map(group => (
                    <div key={group.label}>
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">{group.label}</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {group.keys.map(key => (
                          <label
                            key={key}
                            className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                              selectedTabs.includes(key)
                                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedTabs.includes(key)}
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
              </div>
            );
          })()}

          {/* Step 4: User Access */}
          {step === 4 && (
            <div className="space-y-4 max-w-2xl">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">User Access</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Select which users should have access to this tenant and their roles.
              </p>

              {loadingUsers ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              ) : (
                <div className="space-y-2">
                  {allUsers.filter(u => u.is_active).map(user => {
                    const isCurrentUser = currentUser?.id === user.id;
                    const selection = selectedUsers.find(s => s.userId === user.id);
                    const isSelected = !!selection;

                    return (
                      <div
                        key={user.id}
                        className={`flex items-center justify-between p-3 rounded-md border transition-colors ${
                          isSelected
                            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        }`}
                      >
                        <label className="flex items-center gap-3 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleUser(user.id)}
                            disabled={isCurrentUser}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {user.display_name || user.email}
                              {isCurrentUser && (
                                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(you)</span>
                              )}
                            </div>
                            {user.display_name && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                            )}
                          </div>
                        </label>

                        {isSelected && (
                          <select
                            value={selection!.role}
                            onChange={(e) => setUserRole(user.id, e.target.value as 'member' | 'admin' | 'owner')}
                            disabled={isCurrentUser}
                            className="ml-3 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 px-2 py-1 text-gray-900 dark:text-gray-100"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="owner">Owner</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Review */}
          {step === 5 && (
            <div className="space-y-4 max-w-2xl">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Review Configuration</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="w-8 h-8 rounded-md object-contain" />
                  ) : (
                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: form.color_primary }} />
                  )}
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{form.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{form.slug}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Cloud9 Production:</span>
                    <span className={`ml-2 ${form.cloud9_prod_client_id ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                      {form.cloud9_prod_client_id ? 'Configured' : 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Cloud9 Sandbox:</span>
                    <span className={`ml-2 ${form.cloud9_sandbox_client_id ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                      {form.cloud9_sandbox_client_id ? 'Configured' : 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Node-RED:</span>
                    <span className={`ml-2 ${form.nodered_url ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                      {form.nodered_url ? 'Configured' : 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Flowise:</span>
                    <span className={`ml-2 ${form.flowise_url ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                      {form.flowise_url ? 'Configured' : 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Langfuse:</span>
                    <span className={`ml-2 ${form.langfuse_host ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                      {form.langfuse_host ? 'Configured' : 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Features:</span>
                    <span className="ml-2 text-gray-900 dark:text-gray-100">
                      {selectedTabs.length} of {ALL_TABS.length} enabled
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Users:</span>
                    <span className="ml-2 text-gray-900 dark:text-gray-100">
                      {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {selectedUsers.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Assigned users:</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {selectedUsers.map(s => {
                        const user = allUsers.find(u => u.id === s.userId);
                        return (
                          <span key={s.userId} className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                            {user?.display_name || user?.email || `User #${s.userId}`}
                            <span className="ml-1 text-gray-400">({s.role})</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                  V1 files will be created at: <code className="font-mono">tenants/{form.slug}/v1/</code>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : navigate('/admin?tab=tenants')}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            {step > 0 ? 'Back' : 'Cancel'}
          </button>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                Next
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={saving || !canProceed()}>
                {saving ? 'Creating...' : 'Create Tenant'}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default NewTenantWizard;
