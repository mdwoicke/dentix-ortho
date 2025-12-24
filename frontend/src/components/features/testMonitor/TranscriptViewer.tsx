/**
 * TranscriptViewer Component
 * Displays conversation transcript in a chat-style format
 * Patient names are clickable and link to patient details
 */

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../../ui';
import type { ConversationTurn, ApiCall } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';
import {
  extractPatientsFromApiCalls,
  buildPatientNameMap,
  getPatientDetailUrl,
  type ExtractedPatient,
} from '../../../utils/patientLinkHelper';

interface TranscriptViewerProps {
  transcript: ConversationTurn[];
  apiCalls?: ApiCall[];
  loading?: boolean;
}

/**
 * Render text with patient names as clickable links
 */
function TextWithPatientLinks({
  text,
  patients,
  nameMap,
}: {
  text: string;
  patients: ExtractedPatient[];
  nameMap: Map<string, string>;
}) {
  if (patients.length === 0 || nameMap.size === 0) {
    return <>{text}</>;
  }

  // Create pattern from all patient names (sorted by length to match longest first)
  const names = Array.from(nameMap.keys()).sort((a, b) => b.length - a.length);

  // Build regex pattern - escape special chars and match case-insensitively
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Create a regex that matches any of the patient names (case insensitive)
  const patternString = names.map(n => escapeRegex(n)).join('|');
  if (!patternString) return <>{text}</>;

  const pattern = new RegExp(`(${patternString})`, 'gi');

  // Split text by pattern
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) => {
        const lowerPart = part.toLowerCase();
        const patientGuid = nameMap.get(lowerPart);

        if (patientGuid) {
          const patient = patients.find(p => p.patientGuid === patientGuid);
          return (
            <Link
              key={index}
              to={getPatientDetailUrl(patientGuid)}
              className="text-blue-400 hover:text-blue-300 underline decoration-dotted underline-offset-2 hover:decoration-solid font-medium"
              title={patient ? `View patient: ${patient.fullName}` : `View patient details`}
            >
              {part}
            </Link>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export function TranscriptViewer({ transcript, apiCalls = [], loading }: TranscriptViewerProps) {
  // Extract patients from API calls
  const { patients, nameMap } = useMemo(() => {
    const extractedPatients = extractPatientsFromApiCalls(apiCalls);
    const map = buildPatientNameMap(extractedPatients);
    return { patients: extractedPatients, nameMap: map };
  }, [apiCalls]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (transcript.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No transcript available. Select a test to view its conversation.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      {/* Patient legend if any patients found */}
      {patients.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400 self-center">
            Patients mentioned:
          </span>
          {patients.map((patient) => (
            <Link
              key={patient.patientGuid}
              to={getPatientDetailUrl(patient.patientGuid)}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {patient.fullName}
            </Link>
          ))}
        </div>
      )}

      {transcript.map((turn, index) => {
        const isUser = turn.role === 'user';

        return (
          <div
            key={index}
            className={cn(
              'flex flex-col',
              isUser ? 'items-end' : 'items-start'
            )}
          >
            <div className={cn(
              'max-w-[85%] rounded-lg px-4 py-2',
              isUser
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
            )}>
              <div className="text-sm whitespace-pre-wrap break-words">
                <TextWithPatientLinks
                  text={turn.content}
                  patients={patients}
                  nameMap={nameMap}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
              <span>{isUser ? 'User' : 'Assistant'}</span>
              {turn.responseTimeMs && (
                <span>({turn.responseTimeMs}ms)</span>
              )}
              {turn.validationPassed !== undefined && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded',
                  turn.validationPassed
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                )}>
                  {turn.validationPassed ? 'Passed' : 'Failed'}
                </span>
              )}
            </div>

            {turn.validationMessage && !turn.validationPassed && (
              <div className="text-xs text-red-600 dark:text-red-400 mt-1 max-w-[85%]">
                {turn.validationMessage}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
