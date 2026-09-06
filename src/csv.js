'use strict';
/**
 * Minimal, dependency-free CSV codec (RFC-4180 style).
 * Handles quoted fields, embedded commas / quotes / newlines.
 */

const COLUMNS = [
  'record_type', 'id', 'name', 'player_id', 'team_id',
  'primary_category', 'secondary_category', 'role', 'base_price',
  'status', 'sold_price', 'purse', 'starting_purse', 'squad_size',
  'captain', 'timestamp', 'action', 'value', 'metadata',
];

function escapeField(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s === '') return '';
  if (/[",\r\n]/.test(s) || s !== s.trim()) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function serializeRows(rows) {
  const lines = [COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(COLUMNS.map((c) => escapeField(row[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

function parseCsv(text) {
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/^\uFEFF/, '');

  const pushField = () => { record.push(field); field = ''; };
  const pushRecord = () => {
    pushField();
    if (!(record.length === 1 && record[0].trim() === '')) rows.push(record);
    record = [];
  };

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { pushField(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { pushRecord(); i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || record.length) pushRecord();

  if (!rows.length) return { header: COLUMNS.slice(), records: [] };
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx] === undefined ? '' : r[idx]; });
    return obj;
  });
  return { header, records };
}

module.exports = { COLUMNS, serializeRows, parseCsv, escapeField };
