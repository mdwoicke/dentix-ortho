/**
 * usePlaybackAnimation Hook
 * Manages the playback animation state for the call flow navigator
 *
 * Uses a fixed visualization duration (not actual trace time) so users can
 * observe the flow at a readable pace regardless of how fast the actual trace was.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { FlowNode, PlaybackSpeed, PlaybackState } from './types';
import { getTimelineEvents } from './flowTransformers';

// Fixed visualization duration at 1x speed (45 seconds)
// This ensures the animation is always viewable regardless of actual trace duration
// Slowed down significantly for better observation of data flow
const BASE_VISUALIZATION_DURATION_MS = 45000;

// Minimum duration per step to ensure visibility (1.5 seconds per step)
const MIN_STEP_DURATION_MS = 1500;

export interface UsePlaybackAnimationOptions {
  nodes: FlowNode[];
  totalDurationMs: number;
  onNodeActivate?: (nodeId: string) => void;
  onComplete?: () => void;
}

export interface UsePlaybackAnimationResult {
  playbackState: PlaybackState;
  isPlaying: boolean;
  currentTimeMs: number;
  speed: PlaybackSpeed;
  activeNodeIds: Set<string>;
  completedNodeIds: Set<string>;
  play: () => void;
  pause: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  jumpToStart: () => void;
  jumpToEnd: () => void;
  jumpToTime: (timeMs: number) => void;
  jumpToStep: (stepIndex: number) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  canStepForward: boolean;
  canStepBackward: boolean;
  // Additional exports for UI display
  visualizationDurationMs: number;
  currentStepIndex: number;
  totalSteps: number;
  // Events for stage mapping
  events: Array<{ nodeId: string; timeMs: number; type: string }>;
}

/**
 * Hook for managing playback animation
 *
 * The animation uses a normalized timeline where:
 * - The total visualization duration is fixed (20 seconds at 1x)
 * - Each node/event gets equal time for visibility
 * - Speed controls adjust the visualization pace, not real-time
 */
export function usePlaybackAnimation({
  nodes,
  totalDurationMs,
  onNodeActivate,
  onComplete,
}: UsePlaybackAnimationOptions): UsePlaybackAnimationResult {
  // Playback state - currentTimeMs is now in visualization time, not trace time
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0); // 0-1 progress within current step
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);

  // Animation frame reference
  const animationFrameRef = useRef<number>();
  const lastTimestampRef = useRef<number>(0);

  // Timeline events for stepping (sorted by time)
  const events = useMemo(() => getTimelineEvents(nodes), [nodes]);
  const totalSteps = events.length;

  // Calculate visualization duration based on number of steps
  // Each step gets at least MIN_STEP_DURATION_MS, but we cap at BASE_VISUALIZATION_DURATION_MS
  const visualizationDurationMs = useMemo(() => {
    if (totalSteps === 0) return 0;
    const stepDuration = Math.max(
      MIN_STEP_DURATION_MS,
      BASE_VISUALIZATION_DURATION_MS / totalSteps
    );
    return stepDuration * totalSteps;
  }, [totalSteps]);

  // Duration per step
  const stepDurationMs = useMemo(() => {
    return totalSteps > 0 ? visualizationDurationMs / totalSteps : 0;
  }, [visualizationDurationMs, totalSteps]);

  // Calculate currentTimeMs for display (visualization time)
  const currentTimeMs = useMemo(() => {
    return (currentStepIndex + stepProgress) * stepDurationMs;
  }, [currentStepIndex, stepProgress, stepDurationMs]);

  // Map visualization progress to actual trace time for node highlighting
  const traceTimeMs = useMemo(() => {
    if (totalSteps === 0 || events.length === 0) return 0;

    // Get the trace time at the current step
    if (currentStepIndex >= events.length) {
      return totalDurationMs;
    }

    const currentEvent = events[currentStepIndex];
    const nextEvent = events[currentStepIndex + 1];

    if (!nextEvent) {
      // At the last step, interpolate to the end
      return currentEvent.timeMs + (totalDurationMs - currentEvent.timeMs) * stepProgress;
    }

    // Interpolate between current and next event times
    return currentEvent.timeMs + (nextEvent.timeMs - currentEvent.timeMs) * stepProgress;
  }, [currentStepIndex, stepProgress, events, totalDurationMs, totalSteps]);

  // Calculate active and completed nodes based on trace time
  const activeNodeIds = useMemo(() => {
    const active = new Set<string>();
    nodes.forEach(node => {
      // A node is active if we're within its time range
      const nodeEndTime = node.startMs + node.durationMs;
      if (node.startMs <= traceTimeMs && nodeEndTime >= traceTimeMs) {
        active.add(node.id);
      }
    });
    // Also mark the current event's node as active
    if (currentStepIndex < events.length) {
      active.add(events[currentStepIndex].nodeId);
    }
    return active;
  }, [nodes, traceTimeMs, events, currentStepIndex]);

  const completedNodeIds = useMemo(() => {
    const completed = new Set<string>();
    nodes.forEach(node => {
      if (node.startMs + node.durationMs < traceTimeMs) {
        completed.add(node.id);
      }
    });
    // Mark all events before current as completed
    for (let i = 0; i < currentStepIndex; i++) {
      completed.add(events[i].nodeId);
    }
    return completed;
  }, [nodes, traceTimeMs, events, currentStepIndex]);

  // Can step forward/backward
  const canStepForward = currentStepIndex < totalSteps - 1 || stepProgress < 1;
  const canStepBackward = currentStepIndex > 0 || stepProgress > 0;

  // Animation loop - advances through steps at visualization speed
  const animate = useCallback((timestamp: number) => {
    if (!lastTimestampRef.current) {
      lastTimestampRef.current = timestamp;
    }

    const deltaMs = (timestamp - lastTimestampRef.current) * speed;
    lastTimestampRef.current = timestamp;

    // Calculate progress increment
    const progressIncrement = stepDurationMs > 0 ? deltaMs / stepDurationMs : 0;

    setStepProgress(prev => {
      let newProgress = prev + progressIncrement;

      // Check if we need to advance to next step
      if (newProgress >= 1) {
        setCurrentStepIndex(prevStep => {
          const nextStep = prevStep + 1;
          if (nextStep >= totalSteps) {
            // Animation complete
            setIsPlaying(false);
            onComplete?.();
            return totalSteps - 1;
          }
          return nextStep;
        });
        newProgress = newProgress - 1; // Carry over excess progress
      }

      return Math.min(1, Math.max(0, newProgress));
    });

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  }, [speed, stepDurationMs, totalSteps, isPlaying, onComplete]);

  // Start/stop animation
  useEffect(() => {
    if (isPlaying) {
      lastTimestampRef.current = 0;
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, animate]);

  // Notify when active nodes change
  useEffect(() => {
    if (onNodeActivate && activeNodeIds.size > 0) {
      const firstActiveId = Array.from(activeNodeIds)[0];
      onNodeActivate(firstActiveId);
    }
  }, [activeNodeIds, onNodeActivate]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsPlaying(prev => !prev);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          stepBackward();
          break;
        case 'ArrowRight':
          e.preventDefault();
          stepForward();
          break;
        case 'Home':
          e.preventDefault();
          jumpToStart();
          break;
        case 'End':
          e.preventDefault();
          jumpToEnd();
          break;
        case '1':
          setSpeed(0.5);
          break;
        case '2':
          setSpeed(1);
          break;
        case '3':
          setSpeed(2);
          break;
        case '4':
          setSpeed(4);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Control functions
  const play = useCallback(() => {
    // If at the end, restart from beginning
    if (currentStepIndex >= totalSteps - 1 && stepProgress >= 1) {
      setCurrentStepIndex(0);
      setStepProgress(0);
    }
    setIsPlaying(true);
  }, [currentStepIndex, totalSteps, stepProgress]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const stepForward = useCallback(() => {
    setIsPlaying(false);
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex(prev => prev + 1);
      setStepProgress(0);
    } else {
      setStepProgress(1);
    }
  }, [currentStepIndex, totalSteps]);

  const stepBackward = useCallback(() => {
    setIsPlaying(false);
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
      setStepProgress(0);
    } else {
      setStepProgress(0);
    }
  }, [currentStepIndex]);

  const jumpToStart = useCallback(() => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
    setStepProgress(0);
  }, []);

  const jumpToEnd = useCallback(() => {
    setIsPlaying(false);
    setCurrentStepIndex(totalSteps - 1);
    setStepProgress(1);
  }, [totalSteps]);

  const jumpToTime = useCallback((timeMs: number) => {
    // Convert visualization time to step index
    const targetStep = stepDurationMs > 0 ? Math.floor(timeMs / stepDurationMs) : 0;
    const targetProgress = stepDurationMs > 0 ? (timeMs % stepDurationMs) / stepDurationMs : 0;
    setCurrentStepIndex(Math.max(0, Math.min(totalSteps - 1, targetStep)));
    setStepProgress(Math.max(0, Math.min(1, targetProgress)));
  }, [stepDurationMs, totalSteps]);

  const jumpToStep = useCallback((stepIndex: number) => {
    setIsPlaying(false);
    setCurrentStepIndex(Math.max(0, Math.min(totalSteps - 1, stepIndex)));
    setStepProgress(0);
  }, [totalSteps]);

  // Create playback state object
  const playbackState: PlaybackState = {
    isPlaying,
    currentTimeMs,
    speed,
    activeNodeIds,
    completedNodeIds,
  };

  return {
    playbackState,
    isPlaying,
    currentTimeMs,
    speed,
    activeNodeIds,
    completedNodeIds,
    play,
    pause,
    stepForward,
    stepBackward,
    jumpToStart,
    jumpToEnd,
    jumpToTime,
    jumpToStep,
    setSpeed,
    canStepForward,
    canStepBackward,
    // Additional exports for UI display
    visualizationDurationMs,
    currentStepIndex,
    totalSteps,
    // Events for stage mapping
    events,
  };
}

export default usePlaybackAnimation;
