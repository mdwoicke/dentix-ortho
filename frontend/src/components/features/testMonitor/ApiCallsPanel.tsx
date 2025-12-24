/**
 * ApiCallsPanel Component
 * Displays API tool calls made during test execution
 * Patient names in responses are clickable and link to patient details
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../../ui';
import type { ApiCall } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';
import {
  extractPatientsFromApiCall,
  getPatientDetailUrl,
  type ExtractedPatient,
} from '../../../utils/patientLinkHelper';

interface ApiCallsPanelProps {
  apiCalls: ApiCall[];
  loading?: boolean;
}

interface ExpandedState {
  [key: number]: boolean;
}

/**
 * Get a display name for the tool call based on payload content
 */
function getToolDisplayName(call: ApiCall): string {
  // If it's a flowise_payload, try to get TC value
  if (call.toolName === 'flowise_payload' && call.responsePayload) {
    const tc = call.responsePayload.TC || call.responsePayload.tc;
    if (tc) {
      return `TC-${tc}`;
    }
  }
  return call.toolName;
}

/**
 * Patient Badge Component - Shows clickable patient name
 */
function PatientBadge({ patient }: { patient: ExtractedPatient }) {
  return (
    <Link
      to={getPatientDetailUrl(patient.patientGuid)}
      className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors text-xs font-medium"
      title={`View patient details: ${patient.patientGuid}`}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {patient.fullName}
    </Link>
  );
}

/**
 * Render JSON with patient names as clickable links
 */
function JsonWithPatientLinks({
  data,
  patients
}: {
  data: any;
  patients: ExtractedPatient[];
}) {
  const jsonString = JSON.stringify(data, null, 2);

  if (patients.length === 0) {
    return (
      <code className="text-gray-800 dark:text-gray-200">
        {jsonString}
      </code>
    );
  }

  // Create a regex pattern to match patient names and GUIDs
  const patientPatterns = patients.flatMap(p => {
    const patterns = [p.patientGuid];
    if (p.fullName) patterns.push(p.fullName);
    if (p.firstName && p.lastName) {
      patterns.push(`${p.firstName} ${p.lastName}`);
    }
    return patterns;
  });

  // Escape special regex characters
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(${patientPatterns.map(escapeRegex).join('|')})`, 'gi');

  // Split by pattern and render with links
  const parts = jsonString.split(pattern);

  return (
    <code className="text-gray-800 dark:text-gray-200">
      {parts.map((part, index) => {
        // Check if this part matches a patient
        const matchedPatient = patients.find(p =>
          p.patientGuid.toLowerCase() === part.toLowerCase() ||
          p.fullName?.toLowerCase() === part.toLowerCase() ||
          (p.firstName && p.lastName && `${p.firstName} ${p.lastName}`.toLowerCase() === part.toLowerCase())
        );

        if (matchedPatient) {
          return (
            <Link
              key={index}
              to={getPatientDetailUrl(matchedPatient.patientGuid)}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              title={`View patient: ${matchedPatient.fullName}`}
            >
              {part}
            </Link>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </code>
  );
}

export function ApiCallsPanel({ apiCalls, loading }: ApiCallsPanelProps) {
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const toggleExpand = (id: number) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (apiCalls.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No API calls recorded for this test.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {apiCalls.map((call) => {
        const isExpanded = expanded[call.id];
        const statusColor = call.status === 'completed'
          ? 'text-green-600 dark:text-green-400'
          : 'text-red-600 dark:text-red-400';

        // Extract patients from this API call
        const patients = extractPatientsFromApiCall(call);

        return (
          <div
            key={call.id}
            className="border rounded-lg dark:border-gray-700 overflow-hidden"
          >
            <div
              onClick={() => toggleExpand(call.id)}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
                  {getToolDisplayName(call)}
                </span>
                <span className={cn('text-xs font-medium', statusColor)}>
                  [{call.status || 'unknown'}]
                </span>
                {/* Show patient badge if found */}
                {patients.length > 0 && (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {patients.slice(0, 2).map((patient) => (
                      <PatientBadge key={patient.patientGuid} patient={patient} />
                    ))}
                    {patients.length > 2 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        +{patients.length - 2} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {call.durationMs && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {call.durationMs}ms
                  </span>
                )}
                <span className="text-gray-400">
                  {isExpanded ? '−' : '+'}
                </span>
              </div>
            </div>

            {isExpanded && (
              <div className="p-3 bg-white dark:bg-gray-900 border-t dark:border-gray-700">
                {/* Patient summary if found */}
                {patients.length > 0 && (
                  <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase mb-2">
                      Patients in this call
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {patients.map((patient) => (
                        <PatientBadge key={patient.patientGuid} patient={patient} />
                      ))}
                    </div>
                  </div>
                )}

                {call.requestPayload && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                      Request
                    </h4>
                    <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto max-h-40">
                      <JsonWithPatientLinks data={call.requestPayload} patients={patients} />
                    </pre>
                  </div>
                )}

                {call.responsePayload && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                      Response
                    </h4>
                    <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto max-h-40">
                      <JsonWithPatientLinks data={call.responsePayload} patients={patients} />
                    </pre>
                  </div>
                )}

                {!call.requestPayload && !call.responsePayload && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    No payload data available
                  </div>
                )}

                <div className="mt-2 text-xs text-gray-400">
                  {new Date(call.timestamp).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
