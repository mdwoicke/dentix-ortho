/**
 * SkillFileEditor Component
 * Right panel with Monaco Editor for viewing/editing skill files
 */

import { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type { SkillFileInfo } from '../../../services/api/skillsRunner';

interface SkillFileEditorProps {
  file: SkillFileInfo | null;
  content: string;
  editedContent: string;
  isEditing: boolean;
  hasUnsavedChanges: boolean;
  onContentChange: (content: string) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSave: () => Promise<void>;
  loading: boolean;
  saving: boolean;
}

export function SkillFileEditor({
  file,
  content,
  editedContent,
  isEditing,
  hasUnsavedChanges,
  onContentChange,
  onStartEditing,
  onCancelEditing,
  onSave,
  loading,
  saving
}: SkillFileEditorProps) {
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      onContentChange(value || '');
    },
    [onContentChange]
  );

  const handleSave = async () => {
    await onSave();
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to cancel?'
      );
      if (!confirmed) return;
    }
    onCancelEditing();
  };

  // Keyboard shortcut for save
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && isEditing) {
        e.preventDefault();
        handleSave();
      }
    },
    [isEditing]
  );

  // No file selected state
  if (!file) {
    return (
      <div className="h-full flex flex-col bg-gray-800 rounded-lg border border-gray-700">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <svg
              className="mx-auto h-16 w-16 text-gray-500 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-lg font-medium">Select a skill file</p>
            <p className="text-sm mt-1">Choose a file from the list to view or edit</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col bg-gray-800 rounded-lg border border-gray-700"
      onKeyDown={(e) => handleKeyDown(e.nativeEvent)}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-gray-400 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="text-lg font-medium text-white truncate">{file.name}</h3>
            {hasUnsavedChanges && (
              <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded">
                Unsaved
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1 font-mono truncate">{file.path}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 ml-4">
          {isEditing ? (
            <>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-3 py-1.5 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasUnsavedChanges}
                className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onStartEditing}
              disabled={loading}
              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4" />
              <p className="text-gray-400">Loading file...</p>
            </div>
          </div>
        ) : (
          <Editor
            height="100%"
            language="markdown"
            theme="vs-dark"
            value={isEditing ? editedContent : content}
            onChange={handleEditorChange}
            options={{
              readOnly: !isEditing,
              minimap: { enabled: true },
              lineNumbers: 'on',
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace",
              wordWrap: 'on',
              automaticLayout: true,
              scrollBeyondLastLine: false,
              folding: true,
              foldingStrategy: 'indentation',
              renderLineHighlight: isEditing ? 'all' : 'none',
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              padding: { top: 16, bottom: 16 },
              scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10
              }
            }}
          />
        )}
      </div>

      {/* Footer with status */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-700 text-xs text-gray-400">
        <div className="flex items-center gap-4">
          <span>Markdown</span>
          {isEditing && <span className="text-yellow-400">Editing Mode</span>}
        </div>
        <div className="flex items-center gap-4">
          {isEditing && (
            <span className="text-gray-500">
              Press <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">Ctrl+S</kbd> to save
            </span>
          )}
          <span>{editedContent.length.toLocaleString()} characters</span>
        </div>
      </div>
    </div>
  );
}

export default SkillFileEditor;
