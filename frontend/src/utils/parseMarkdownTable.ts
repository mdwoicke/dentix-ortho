/**
 * Auto-detect markdown pipe-tables in chat messages and extract them
 * into structured TableData for interactive rendering (sort + search).
 */

interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  copyable?: boolean;
}

interface TableData {
  columns: TableColumn[];
  rows: Record<string, any>[];
  searchableKeys?: string[];
}

/** Strip markdown formatting from a cell value. */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold**
    .replace(/__(.+?)__/g, '$1')        // __bold__
    .replace(/\*(.+?)\*/g, '$1')        // *italic*
    .replace(/_(.+?)_/g, '$1')          // _italic_
    .replace(/`(.+?)`/g, '$1')          // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url)
    .trim();
}

/** Slugify a header label into a stable column key. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'col';
}

/** Check if a line is a separator row (e.g. |---|---|) */
function isSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  const cells = trimmed.slice(1, -1).split('|');
  return cells.every(c => /^\s*:?-{1,}:?\s*$/.test(c));
}

/** Check if a line looks like a pipe-table row */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 3;
}

/** Parse cells from a pipe-table row. */
function parseCells(line: string): string[] {
  const trimmed = line.trim();
  // Remove leading and trailing pipes, then split
  return trimmed.slice(1, -1).split('|').map(c => c.trim());
}

export interface ParsedTable {
  tableData: TableData;
  strippedContent: string;
}

/**
 * Parse markdown pipe-tables from content.
 * Returns null if no table with >= minRows data rows is found.
 */
export function parseMarkdownTable(content: string, minRows: number = 3): ParsedTable | null {
  const lines = content.split('\n');
  let inCodeBlock = false;
  const tableLineIndices = new Set<number>();

  // Track the best (largest) table found
  let bestTable: { columns: TableColumn[]; rows: Record<string, any>[]; lineIndices: Set<number> } | null = null;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Toggle code block state
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      i++;
      continue;
    }

    if (inCodeBlock) {
      i++;
      continue;
    }

    // Look for table: header row, separator, then data rows
    if (isTableRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const headerLine = i;
      const sepLine = i + 1;
      const headerCells = parseCells(lines[headerLine]);

      // Collect data rows
      const dataRows: string[][] = [];
      const rowIndices: number[] = [];
      let j = sepLine + 1;
      while (j < lines.length && isTableRow(lines[j]) && !isSeparator(lines[j])) {
        dataRows.push(parseCells(lines[j]));
        rowIndices.push(j);
        j++;
      }

      if (dataRows.length >= minRows && (!bestTable || dataRows.length > bestTable.rows.length)) {
        // Build columns with unique keys
        const keyCounts: Record<string, number> = {};
        const columns: TableColumn[] = headerCells.map(label => {
          const cleanLabel = stripMarkdown(label);
          let key = slugify(cleanLabel);
          if (!key) key = 'col';
          keyCounts[key] = (keyCounts[key] || 0) + 1;
          if (keyCounts[key] > 1) key = `${key}_${keyCounts[key]}`;
          return { key, label: cleanLabel, sortable: true };
        });

        // Build row objects
        const rows = dataRows.map(cells => {
          const row: Record<string, string> = {};
          columns.forEach((col, idx) => {
            row[col.key] = stripMarkdown(cells[idx] ?? '');
          });
          return row;
        });

        const indices = new Set<number>();
        indices.add(headerLine);
        indices.add(sepLine);
        rowIndices.forEach(ri => indices.add(ri));

        bestTable = { columns, rows, lineIndices: indices };
      }

      // Also track these lines for potential stripping even if not the best
      tableLineIndices.add(headerLine);
      tableLineIndices.add(sepLine);
      rowIndices.forEach(ri => tableLineIndices.add(ri));

      i = j;
      continue;
    }

    i++;
  }

  if (!bestTable) return null;

  // Build stripped content: remove ALL table lines (not just the best one)
  // so no static markdown tables remain when the interactive one renders
  const strippedLines: string[] = [];
  inCodeBlock = false;
  for (let li = 0; li < lines.length; li++) {
    if (lines[li].trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      strippedLines.push(lines[li]);
      continue;
    }
    if (inCodeBlock) {
      strippedLines.push(lines[li]);
      continue;
    }
    if (!tableLineIndices.has(li)) {
      strippedLines.push(lines[li]);
    }
  }

  return {
    tableData: {
      columns: bestTable.columns,
      rows: bestTable.rows,
    },
    strippedContent: strippedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
  };
}
