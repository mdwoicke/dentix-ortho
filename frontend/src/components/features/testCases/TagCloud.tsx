/**
 * TagCloud Component
 * Clickable tag cloud for filtering test cases
 */

import React from 'react';

interface TagCloudProps {
  tags: string[];
  selectedTags: string[];
  onToggle: (tag: string) => void;
  maxVisible?: number;
}

export function TagCloud({
  tags,
  selectedTags,
  onToggle,
  maxVisible = 10,
}: TagCloudProps) {
  const [showAll, setShowAll] = React.useState(false);

  const visibleTags = showAll ? tags : tags.slice(0, maxVisible);
  const hasMore = tags.length > maxVisible;

  if (tags.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 italic">
        No tags available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Tags
      </h4>
      <div className="flex flex-wrap gap-2">
        {visibleTags.map((tag) => {
          const isSelected = selectedTags.includes(tag);

          return (
            <button
              key={tag}
              onClick={() => onToggle(tag)}
              className={`
                px-2 py-1 text-xs rounded-full transition-all
                ${isSelected
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }
              `}
            >
              {tag}
            </button>
          );
        })}
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-2 py-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
          >
            {showAll ? 'Show less' : `+${tags.length - maxVisible} more`}
          </button>
        )}
      </div>
      {selectedTags.length > 0 && (
        <button
          onClick={() => selectedTags.forEach(tag => onToggle(tag))}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Clear all tags
        </button>
      )}
    </div>
  );
}

export default TagCloud;
