/**
 * Cancellation Progress Modal
 * Shows real-time progress of appointment cancellations with rate limiting
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Button, Badge, Spinner } from '../../ui';
import {
  startStreamingCancellation,
  subscribeToCancellation,
  getCancellationStatus,
  type StreamingCancellationItem,
  type StreamingCancellationSummary,
} from '../../../services/api/testMonitorApi';

interface CancellationProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: Array<{
    id: number;
    appointmentGuid?: string | null;
    patientFirstName?: string | null;
    patientLastName?: string | null;
    appointmentDatetime?: string | null;
  }>;
  onComplete?: (summary: StreamingCancellationSummary) => void;
}

const DELAY_BETWEEN_CANCELLATIONS_MS = 5000;

export function CancellationProgressModal({
  isOpen,
  onClose,
  records,
  onComplete,
}: CancellationProgressModalProps) {
  const [operationId, setOperationId] = useState<string | null>(null);
  const [items, setItems] = useState<StreamingCancellationItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [summary, setSummary] = useState<StreamingCancellationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number | null>(null);

  // Start cancellation when modal opens
  useEffect(() => {
    if (isOpen && records.length > 0 && !operationId) {
      startCancellation();
    }

    return () => {
      // Cleanup event source on unmount
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isOpen, records]);

  // Auto-scroll to current item
  useEffect(() => {
    if (queueRef.current && currentIndex >= 0) {
      const currentItem = queueRef.current.querySelector(`[data-index="${currentIndex}"]`);
      if (currentItem) {
        currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentIndex]);

  const startCancellation = async () => {
    setIsProcessing(true);
    setError(null);
    startTimeRef.current = Date.now();

    try {
      // Initialize items from records
      const initialItems: StreamingCancellationItem[] = records.map(r => ({
        id: r.id,
        appointmentGuid: r.appointmentGuid || '',
        patientName: `${r.patientFirstName || ''} ${r.patientLastName || ''}`.trim() || 'Unknown',
        appointmentDate: r.appointmentDatetime || null,
        status: 'pending',
      }));
      setItems(initialItems);

      // Start the streaming cancellation
      const result = await startStreamingCancellation(records.map(r => r.id));

      if (!result.success) {
        throw new Error('Failed to start cancellation');
      }

      setOperationId(result.operationId);

      // Subscribe to SSE events
      const eventSource = subscribeToCancellation(result.operationId, {
        onStarted: (data) => {
          console.log('[CancellationModal] Started:', data);
          setItems(data.items);
        },
        onProgress: (data) => {
          console.log('[CancellationModal] Progress:', data);
          setCurrentIndex(data.currentIndex);
          setItems(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(i => i.id === data.item.id);
            if (idx !== -1) {
              updated[idx] = data.item;
            }
            return updated;
          });
        },
        onCompleted: (data) => {
          console.log('[CancellationModal] Completed:', data);
          setSummary(data);
          setIsProcessing(false);
          setIsCompleted(true);
          onComplete?.(data);
        },
        onError: (err) => {
          console.error('[CancellationModal] Error:', err);
          setError(err.message);
          setIsProcessing(false);
        },
      });

      eventSourceRef.current = eventSource;
    } catch (err: any) {
      console.error('[CancellationModal] Start error:', err);
      setError(err.message || 'Failed to start cancellation');
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    // Close the event source (operation continues in background)
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    onClose();
  };

  // Calculate progress
  const completed = items.filter(i => ['success', 'failed', 'already_cancelled'].includes(i.status)).length;
  const progressPercent = items.length > 0 ? Math.round((completed / items.length) * 100) : 0;

  // Calculate estimated time remaining
  const getEstimatedTimeRemaining = () => {
    const remaining = items.length - completed - 1; // -1 because current is being processed
    if (remaining <= 0) return null;
    const seconds = Math.ceil((remaining * DELAY_BETWEEN_CANCELLATIONS_MS) / 1000);
    if (seconds < 60) return `~${seconds}s remaining`;
    const minutes = Math.ceil(seconds / 60);
    return `~${minutes}m remaining`;
  };

  // Get status badge for an item
  const getStatusBadge = (status: StreamingCancellationItem['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="default">Pending</Badge>;
      case 'processing':
        return <Badge variant="info" className="animate-pulse">Processing</Badge>;
      case 'success':
        return <Badge variant="success">Cancelled</Badge>;
      case 'failed':
        return <Badge variant="danger">Failed</Badge>;
      case 'already_cancelled':
        return <Badge variant="warning">Already Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Format date for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Cancelling Appointments"
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>{completed} of {items.length} completed</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isCompleted
                  ? 'bg-green-500'
                  : error
                    ? 'bg-red-500'
                    : 'bg-blue-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {isProcessing && (
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                Processing with 5s delay between each...
              </span>
              <span>{getEstimatedTimeRemaining()}</span>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Completion Summary */}
        {isCompleted && summary && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">
              Cancellation Complete
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Successfully Cancelled:</span>
                <span className="font-medium text-green-600">{summary.succeeded}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Already Cancelled:</span>
                <span className="font-medium text-yellow-600">{summary.alreadyCancelled}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Failed:</span>
                <span className="font-medium text-red-600">{summary.failed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Total:</span>
                <span className="font-medium">{summary.total}</span>
              </div>
            </div>
          </div>
        )}

        {/* Queue List */}
        <div
          ref={queueRef}
          className="max-h-80 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg"
        >
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Patient
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((item, idx) => (
                <tr
                  key={item.id}
                  data-index={idx}
                  className={`
                    ${idx === currentIndex ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    ${item.status === 'success' ? 'bg-green-50/50 dark:bg-green-900/10' : ''}
                    ${item.status === 'failed' ? 'bg-red-50/50 dark:bg-red-900/10' : ''}
                    ${item.status === 'already_cancelled' ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''}
                  `}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {item.patientName}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                      {item.appointmentGuid?.substring(0, 8) || '-'}...
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                    {formatDate(item.appointmentDate)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      {getStatusBadge(item.status)}
                      {item.error && (
                        <span className="text-xs text-red-500" title={item.error}>
                          {item.error.length > 30 ? item.error.substring(0, 30) + '...' : item.error}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
          {isProcessing && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Closing this modal will not stop the cancellation process.
            </p>
          )}
          {!isProcessing && <div />}
          <Button
            variant={isCompleted ? 'primary' : 'ghost'}
            onClick={handleClose}
          >
            {isCompleted ? 'Done' : 'Close'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default CancellationProgressModal;
