// Simple CSV export helper — no external dependencies.
// Uses ";" as separator (BR Excel default) and BOM for UTF-8 recognition.

const escapeCell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Normalize line breaks and escape quotes
  s = s.replace(/\r?\n/g, " ").replace(/"/g, '""');
  if (/[";]/.test(s)) s = `"${s}"`;
  return s;
};

export function exportToCsv(
  filename: string,
  rows: Array<Record<string, unknown>>,
  headers?: Array<{ key: string; label: string }>,
) {
  const cols =
    headers ??
    (rows[0] ? Object.keys(rows[0]).map((k) => ({ key: k, label: k })) : []);
  const headerLine = cols.map((c) => escapeCell(c.label)).join(";");
  const bodyLines = rows.map((r) => cols.map((c) => escapeCell(r[c.key])).join(";"));
  const csv = "\uFEFF" + [headerLine, ...bodyLines].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
