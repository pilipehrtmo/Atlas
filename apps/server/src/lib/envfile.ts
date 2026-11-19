/** Keys the in-app settings may write. Everything else in .env is left untouched. */
export const EDITABLE_KEYS = ['TIINGO_API_KEY', 'FRED_API_KEY', 'SEC_USER_AGENT', 'ANTHROPIC_API_KEY'] as const;
export type EditableKey = (typeof EDITABLE_KEYS)[number];

/**
 * Sets or replaces `KEY=value` lines in .env text, keeping comments, order and other keys.
 * Values are double-quoted when they contain spaces or #; newlines are rejected by the caller.
 */
export function upsertEnv(text: string, updates: Partial<Record<EditableKey, string>>): string {
  const lines = text === '' ? [] : text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const v = /[\s#"']/.test(value) ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : value;
    const line = `${key}=${v}`;
    const i = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
    if (i >= 0) lines[i] = line;
    else lines.push(line);
  }
  return lines.join('\n') + '\n';
}
