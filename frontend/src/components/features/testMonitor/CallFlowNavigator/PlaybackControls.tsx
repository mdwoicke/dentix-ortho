/**
 * PlaybackControls Component
 * Controls for playing back the call flow animation
 */

import { cn } from '../../../../utils/cn';
import type { PlaybackControlsProps, PlaybackSpeed } from './types';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  Play: () => (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
    </svg>
  ),
  Pause: () => (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  SkipBack: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
    </svg>
  ),
  SkipForward: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
    </svg>
  ),
  StepBack: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  ),
  StepForward: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
};

/**
 * Speed button component
 */
interface SpeedButtonProps {
  speed: PlaybackSpeed;
  currentSpeed: PlaybackSpeed;
  onClick: (speed: PlaybackSpeed) => void;
}

function SpeedButton({ speed, currentSpeed, onClick }: SpeedButtonProps) {
  const isActive = speed === currentSpeed;

  return (
    <button
      onClick={() => onClick(speed)}
      className={cn(
        'px-2 py-1 text-xs font-medium rounded transition-all',
        isActive
          ? 'bg-blue-500 text-white shadow-sm'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
      )}
    >
      {speed}x
    </button>
  );
}

/**
 * Control button component
 */
interface ControlButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
}

function ControlButton({ icon, onClick, disabled, primary, title }: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-2 rounded-lg transition-all',
        primary
          ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm disabled:bg-blue-300 dark:disabled:bg-blue-800'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      {icon}
    </button>
  );
}

/**
 * PlaybackControls Component
 */
export function PlaybackControls({
  isPlaying,
  speed,
  canStepBackward,
  canStepForward,
  onPlay,
  onPause,
  onStepBackward,
  onStepForward,
  onJumpToStart,
  onJumpToEnd,
  onSpeedChange,
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2">
      {/* Main Controls */}
      <div className="flex items-center gap-1">
        {/* Jump to Start */}
        <ControlButton
          icon={<Icons.SkipBack />}
          onClick={onJumpToStart}
          title="Jump to start (Home)"
        />

        {/* Step Backward */}
        <ControlButton
          icon={<Icons.StepBack />}
          onClick={onStepBackward}
          disabled={!canStepBackward}
          title="Step backward (←)"
        />

        {/* Play/Pause */}
        <ControlButton
          icon={isPlaying ? <Icons.Pause /> : <Icons.Play />}
          onClick={isPlaying ? onPause : onPlay}
          primary
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        />

        {/* Step Forward */}
        <ControlButton
          icon={<Icons.StepForward />}
          onClick={onStepForward}
          disabled={!canStepForward}
          title="Step forward (→)"
        />

        {/* Jump to End */}
        <ControlButton
          icon={<Icons.SkipForward />}
          onClick={onJumpToEnd}
          title="Jump to end (End)"
        />
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

      {/* Speed Controls */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Speed:</span>
        <SpeedButton speed={0.5} currentSpeed={speed} onClick={onSpeedChange} />
        <SpeedButton speed={1} currentSpeed={speed} onClick={onSpeedChange} />
        <SpeedButton speed={2} currentSpeed={speed} onClick={onSpeedChange} />
        <SpeedButton speed={4} currentSpeed={speed} onClick={onSpeedChange} />
      </div>

      {/* Keyboard Hints */}
      <div className="hidden md:flex items-center gap-2 ml-auto text-xs text-gray-400 dark:text-gray-500">
        <span>Space: Play/Pause</span>
        <span>•</span>
        <span>←/→: Step</span>
        <span>•</span>
        <span>E: Error</span>
        <span>•</span>
        <span>B: Bottleneck</span>
      </div>
    </div>
  );
}

export default PlaybackControls;
