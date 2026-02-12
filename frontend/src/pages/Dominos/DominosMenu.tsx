/**
 * Dominos Menu Page
 * Store ID input, fetch menu, category sections with jump-to dropdown and search
 */

import { useState, useRef, useMemo } from 'react';
import * as dominosApi from '../../services/api/dominosApi';
import type { DominosMenuItem } from '../../types/dominos.types';

export default function DominosMenu() {
  const [storeId, setStoreId] = useState('7539');
  const [items, setItems] = useState<DominosMenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fetched, setFetched] = useState(false);
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const fetchMenu = async () => {
    if (!storeId.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const res = await dominosApi.getStoreMenu(storeId.trim());
      setItems(res.items || []);
      setFetched(true);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch menu');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter(item =>
      item.name?.toLowerCase().includes(s) ||
      item.code?.toLowerCase().includes(s) ||
      item.category?.toLowerCase().includes(s) ||
      item.description?.toLowerCase().includes(s)
    );
  }, [items, search]);

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, DominosMenuItem[]> = {};
    for (const item of filteredItems) {
      const cat = item.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [filteredItems]);

  const sortedCategories = useMemo(() =>
    Object.keys(groupedByCategory).sort((a, b) => a.localeCompare(b)),
    [groupedByCategory]
  );

  const allCategories = useMemo(() =>
    [...new Set(items.map(i => i.category || 'Uncategorized'))].sort(),
    [items]
  );

  const scrollToCategory = (cat: string) => {
    const el = categoryRefs.current[cat];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Menu</h2>

      {/* Store selector */}
      <div className="flex items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Store ID</label>
          <input
            type="text"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            placeholder="e.g. 7539"
            className="px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-40"
          />
        </div>
        <button
          onClick={fetchMenu}
          disabled={loading || !storeId.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Loading...' : 'Fetch Menu'}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {fetched && items.length > 0 && (
        <>
          {/* Search, category jump, and stats */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-1.5 pl-8 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-64"
              />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <select
              onChange={(e) => { if (e.target.value) scrollToCategory(e.target.value); e.target.value = ''; }}
              defaultValue=""
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="" disabled>Jump to category...</option>
              {(search ? sortedCategories : allCategories).map(cat => (
                <option key={cat} value={cat}>{cat} ({groupedByCategory[cat]?.length ?? 0})</option>
              ))}
            </select>

            <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
              {filteredItems.length} of {items.length} products
              {` across ${sortedCategories.length} categories`}
            </span>
          </div>

          {/* Category sections */}
          <div className="space-y-6">
            {sortedCategories.map(category => (
              <div
                key={category}
                ref={(el) => { categoryRefs.current[category] = el; }}
                className="scroll-mt-4"
              >
                {/* Category header */}
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide">
                    {category}
                  </h3>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {groupedByCategory[category].length} items
                  </span>
                  <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
                </div>

                {/* Products table for this category */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Code</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Price</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Available</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {groupedByCategory[category].map((item) => (
                          <tr key={item.code} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-2 text-sm font-mono text-gray-600 dark:text-gray-400">{item.code}</td>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                              <div>{item.name}</div>
                              {item.description && <div className="text-xs text-gray-500 dark:text-gray-400">{item.description}</div>}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {item.price ? `$${item.price.toFixed(2)}` : '-'}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                item.available
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-400'
                              }`}>
                                {item.available ? 'Yes' : 'No'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredItems.length === 0 && search && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No items match "{search}"
            </div>
          )}
        </>
      )}

      {fetched && items.length === 0 && !error && !loading && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No menu items found for store {storeId}
        </div>
      )}
    </div>
  );
}
