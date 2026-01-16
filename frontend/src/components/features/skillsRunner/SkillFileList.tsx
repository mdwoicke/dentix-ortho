/**
 * SkillFileList Component
 * Left panel showing searchable list of skill files
 */

import type { SkillFileInfo } from '../../../services/api/skillsRunner';

interface SkillFileListProps {
  skillFiles: SkillFileInfo[];
  selectedFile: SkillFileInfo | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectFile: (file: SkillFileInfo) => void;
  loading: boolean;
  hasUnsavedChanges?: boolean;
}

export function SkillFileList({
  skillFiles,
  selectedFile,
  searchQuery,
  onSearchChange,
  onSelectFile,
  loading,
  hasUnsavedChanges = false
}: SkillFileListProps) {
  const handleSelectFile = (file: SkillFileInfo) => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to switch files?'
      );
      if (!confirmed) return;
    }
    onSelectFile(file);
  };

  return (
    <div className="h-full flex flex-col bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-medium text-white mb-3">Skill Files</h3>

        {/* Search Input */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search skills..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
          </div>
        ) : skillFiles.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            {searchQuery ? (
              <>
                <svg className="mx-auto h-12 w-12 text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No skills match "{searchQuery}"</p>
              </>
            ) : (
              <>
                <svg className="mx-auto h-12 w-12 text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>No skill files found</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {skillFiles.map((file) => {
              const isSelected = selectedFile?.path === file.path;
              return (
                <button
                  key={file.path}
                  onClick={() => handleSelectFile(file)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    isSelected
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-700/50 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {/* File Icon */}
                    <svg
                      className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        isSelected ? 'text-primary-200' : 'text-gray-400'
                      }`}
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
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{file.name}</span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            isSelected
                              ? 'bg-primary-500/50 text-primary-100'
                              : 'bg-gray-600 text-gray-300'
                          }`}
                        >
                          .md
                        </span>
                      </div>
                      {file.description && (
                        <p
                          className={`text-xs mt-1 truncate ${
                            isSelected ? 'text-primary-200' : 'text-gray-400'
                          }`}
                        >
                          {file.description}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer with count */}
      <div className="p-3 border-t border-gray-700 text-xs text-gray-400">
        {skillFiles.length} skill{skillFiles.length !== 1 ? 's' : ''} found
      </div>
    </div>
  );
}

export default SkillFileList;
