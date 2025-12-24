/**
 * Hooks Index
 * Central export for all custom hooks
 */

// Re-export Redux typed hooks
export { useAppDispatch, useAppSelector } from '../store/hooks';

export { useToast } from './useToast';
export { useDebounce } from './useDebounce';
export { useReference } from './useReference';
export type { UseReferenceOptions } from './useReference';
export { usePatients } from './usePatients';
export { useAppointments } from './useAppointments';
