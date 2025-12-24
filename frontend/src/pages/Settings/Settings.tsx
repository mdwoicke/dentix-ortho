/**
 * Settings Page
 * Application settings and cache management
 */

import React, { useState } from 'react';
import { PageHeader } from '../../components/layout';
import { Card, Button } from '../../components/ui';
import { CopyToPostmanButton } from '../../components/features/postman/CopyToPostmanButton';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectEnvironment, toggleEnvironment } from '../../store/slices/authSlice';
import { refreshAllCaches } from '../../store/slices/referenceSlice';
import { useToast } from '../../hooks';

export function Settings() {
  const dispatch = useAppDispatch();
  const environment = useAppSelector(selectEnvironment);
  const toast = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleToggleEnvironment = () => {
    dispatch(toggleEnvironment());
    const newEnv = environment === 'sandbox' ? 'production' : 'sandbox';
    toast.showSuccess(`Switched to ${newEnv} environment`);
  };

  const handleRefreshCaches = async () => {
    setIsRefreshing(true);
    try {
      await dispatch(refreshAllCaches()).unwrap();
      toast.showSuccess('Cache refreshed successfully');
    } catch (error) {
      toast.showError('Failed to refresh cache');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage application settings and preferences"
      />

      <div className="space-y-6">
        {/* Environment Settings */}
        <Card>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Environment
              </h3>
              <p className="text-sm text-gray-600">
                Switch between sandbox (test) and production environments
              </p>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-md">
              <div>
                <p className="font-medium text-gray-900">
                  Current Environment:
                  <span
                    className={`ml-2 px-3 py-1 rounded-md text-sm font-medium ${
                      environment === 'sandbox'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {environment === 'sandbox' ? 'Sandbox' : 'Production'}
                  </span>
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {environment === 'sandbox'
                    ? 'You are working with test data'
                    : 'You are working with live production data'}
                </p>
              </div>
              <Button onClick={handleToggleEnvironment}>
                Switch to {environment === 'sandbox' ? 'Production' : 'Sandbox'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Cache Management */}
        <Card>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Cache Management
              </h3>
              <p className="text-sm text-gray-600">
                Refresh cached reference data (locations, appointment types, providers)
              </p>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-md">
              <div>
                <p className="font-medium text-gray-900">Reference Data Cache</p>
                <p className="text-sm text-gray-600 mt-1">
                  Clear and reload all reference data from the server
                </p>
              </div>
              <Button
                onClick={handleRefreshCaches}
                isLoading={isRefreshing}
                variant="secondary"
              >
                Refresh Cache
              </Button>
            </div>

            {/* Copy Reference Data API Requests */}
            <div className="border-t border-gray-200 pt-4">
              <p className="font-medium text-gray-900 mb-2">
                Copy as cURL
              </p>
              <p className="text-sm text-gray-600 mb-3">
                Copy cURL commands for reference data endpoints
              </p>
              <div className="flex flex-wrap gap-2">
                <CopyToPostmanButton
                  procedure="GetLocations"
                  parameters={{ showDeleted: 'false' }}
                  variant="button"
                  size="sm"
                />
                <CopyToPostmanButton
                  procedure="GetAppointmentTypes"
                  parameters={{ showDeleted: 'false' }}
                  variant="button"
                  size="sm"
                />
                <CopyToPostmanButton
                  procedure="GetChairSchedules"
                  parameters={{}}
                  variant="button"
                  size="sm"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* About */}
        <Card>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                About
              </h3>
              <p className="text-sm text-gray-600">
                Application information
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700">Application</span>
                <span className="text-sm text-gray-600">Cloud 9 Ortho CRM</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700">Version</span>
                <span className="text-sm text-gray-600">1.0.0</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700">Backend API</span>
                <span className="text-sm text-gray-600">http://localhost:3001/api</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm font-medium text-gray-700">Frontend Framework</span>
                <span className="text-sm text-gray-600">React 19 + TypeScript</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
