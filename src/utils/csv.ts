export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}
