/**
 * SkillBrowser Component
 * Main container for browsing and editing skill files
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { SkillFileList } from './SkillFileList';
import { SkillFileEditor } from './SkillFileEditor';
import {
  fetchSkillFiles,
  fetchSkillFileContent,
  saveSkillFileContent
} from '../../../services/api/skillsRunner';
import type { SkillFileInfo } from '../../../services/api/skillsRunner';

export function SkillBrowser() {
  // State
  const [skillFiles, setSkillFiles] = useState<SkillFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<SkillFileInfo | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [editedContent, setEditedContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computed state
  const hasUnsavedChanges = isEditing && editedContent !== fileContent;

  // Filter files based on search query
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return skillFiles;
    const q = searchQuery.toLowerCase();
    return skillFiles.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q) ||
        f.path.toLowerCase().includes(q)
    );
  }, [skillFiles, searchQuery]);

  // Load skill files on mount
  useEffect(() => {
    const loadSkillFiles = async () => {
      try {
        setLoadingFiles(true);
        setError(null);
        const files = await fetchSkillFiles();
        setSkillFiles(files);
      } catch (err) {
        console.error('Error loading skill files:', err);
        setError('Failed to load skill files');
      } finally {
        setLoadingFiles(false);
      }
    };

    loadSkillFiles();
  }, []);

  // Load file content when a file is selected
  const handleSelectFile = useCallback(async (file: SkillFileInfo) => {
    setSelectedFile(file);
    setIsEditing(false);
    setEditedContent('');
    setFileContent('');
    setError(null);

    try {
      setLoadingContent(true);
      const result = await fetchSkillFileContent(file.path);
      setFileContent(result.content);
      setEditedContent(result.content);
    } catch (err) {
      console.error('Error loading file content:', err);
      setError('Failed to load file content');
    } finally {
      setLoadingContent(false);
    }
  }, []);

  // Handle content change in editor
  const handleContentChange = useCallback((content: string) => {
    setEditedContent(content);
  }, []);

  // Start editing
  const handleStartEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  // Cancel editing
  const handleCancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditedContent(fileContent);
  }, [fileContent]);

  // Save file
  const handleSave = useCallback(async () => {
    if (!selectedFile) return;

    try {
      setSaving(true);
      setError(null);
      await saveSkillFileContent(selectedFile.path, editedContent);
      setFileContent(editedContent);
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving file:', err);
      setError('Failed to save file');
    } finally {
      setSaving(false);
    }
  }, [selectedFile, editedContent]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  return (
    <div className="h-full flex flex-col">
      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Main Content - Split Layout */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Left Panel - File List (4 columns) */}
        <div className="col-span-3 min-h-0">
          <SkillFileList
            skillFiles={filteredFiles}
            selectedFile={selectedFile}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectFile={handleSelectFile}
            loading={loadingFiles}
            hasUnsavedChanges={hasUnsavedChanges}
          />
        </div>

        {/* Right Panel - Editor (8 columns) */}
        <div className="col-span-9 min-h-0">
          <SkillFileEditor
            file={selectedFile}
            content={fileContent}
            editedContent={editedContent}
            isEditing={isEditing}
            hasUnsavedChanges={hasUnsavedChanges}
            onContentChange={handleContentChange}
            onStartEditing={handleStartEditing}
            onCancelEditing={handleCancelEditing}
            onSave={handleSave}
            loading={loadingContent}
            saving={saving}
          />
        </div>
      </div>
    </div>
  );
}

export default SkillBrowser;
