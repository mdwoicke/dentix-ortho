/**
 * TenantSelector Component
 * Dropdown in the navbar that allows switching between tenants.
 * Only shown when the user has access to 2+ tenants.
 */

import { useState, useRef, useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import {
  selectCurrentTenant,
  selectAvailableTenants,
  selectHasMultipleTenants,
  switchTenant,
} from '../../store/slices/tenantSlice';
import { ROUTES } from '../../utils/constants';

/** Map enabled tabs to a default landing route for the tenant */
function getDefaultRouteForTabs(enabledTabs: string[]): string {
  // Priority order: if dominos is the primary feature, land there
  if (enabledTabs.includes('dominos_dashboard') && !enabledTabs.includes('dashboard')) {
    return ROUTES.DOMINOS_DASHBOARD;
  }
  if (enabledTabs.includes('test_monitor') && !enabledTabs.includes('dashboard') && !enabledTabs.includes('dominos_dashboard')) {
    return ROUTES.TEST_MONITOR;
  }
  // Default: home dashboard
  return ROUTES.DASHBOARD;
}

export function TenantSelector() {
  const dispatch = useAppDispatch();
  const currentTenant = useAppSelector(selectCurrentTenant);
  const availableTenants = useAppSelector(selectAvailableTenants);
  const hasMultiple = useAppSelector(selectHasMultipleTenants);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!hasMultiple || !currentTenant) {
    return null;
  }

  const handleSwitch = async (tenantId: number) => {
    if (tenantId !== currentTenant.id) {
      const result = await dispatch(switchTenant(tenantId)).unwrap();
      // Navigate to the default page for the new tenant based on enabled tabs
      const tabs = result.enabledTabs || [];
      const defaultRoute = getDefaultRouteForTabs(tabs);
      window.location.href = defaultRoute;
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
          bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300
          hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-200 dark:border-blue-700"
        aria-label="Switch tenant"
        style={{ borderLeftColor: currentTenant.color_primary, borderLeftWidth: 3 }}
      >
        {currentTenant.logo_url ? (
          <img src={currentTenant.logo_url} alt="" className="w-5 h-5 rounded object-contain" />
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        )}
        <span className="hidden md:inline max-w-[120px] truncate">
          {currentTenant.short_name || currentTenant.name}
        </span>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-800 rounded-md shadow-lg border border-gray-200 dark:border-slate-700 z-50 py-1">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Switch Practice
          </div>
          {availableTenants.map((tenant) => (
            <button
              key={tenant.id}
              onClick={() => handleSwitch(tenant.id)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                tenant.id === currentTenant.id
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt="" className="w-5 h-5 rounded flex-shrink-0 object-contain" />
              ) : (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tenant.color_primary }}
                />
              )}
              <span className="truncate">{tenant.name}</span>
              {tenant.id === currentTenant.id && (
                <svg className="w-4 h-4 ml-auto text-blue-600 dark:text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
