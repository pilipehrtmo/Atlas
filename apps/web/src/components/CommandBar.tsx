import { suggest, type Suggestion } from '@atlas/core';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { api } from '../api';

export interface CommandBarHandle { focus: (prefill?: string) => void }

/** Global command line: autocomplete over functions, symbols (from the active provider) and recent commands. */
export const CommandBar = forwardRef<CommandBarHandle, { onRun: (cmd: string) => string | null; recent: string[] }>(function CommandBar({ onRun, recent }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<{ symbol: string; name: string }[]>([]);

  useImperativeHandle(ref, () => ({
    focus: (prefill) => {
      if (prefill !== undefined) setValue(prefill);
      input.current?.focus();
      input.current?.select();
      setOpen(true);
    },
  }));

  // Symbol lookup for the first token, debounced.
  useEffect(() => {
    const first = value.trim().split(/\s+/)[0] ?? '';
    if (value.includes(' ') || first.length < 1) { setSymbols([]); return; }
    const t = setTimeout(() => {
      api<{ status: string; data?: { symbol: string; name: string }[] }>(`/api/search?q=${encodeURIComponent(first)}`)
        .then((r) => setSymbols(r.status === 'ok' ? r.data! : []))
        .catch(() => setSymbols([]));
    }, 150);
    return () => clearTimeout(t);
  }, [value]);

  const items: Suggestion[] = suggest(value, { symbols, recent, limit: 12 });

  const execute = (text: string) => {
    const err = onRun(text);
    if (err) { setError(err); return; }
    setError(null);
    setValue('');
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="cmd">
      <span className="cmd-prompt">›</span>
      <input
        ref={input}
        className="cmd-input"
        value={value}
        placeholder="Type a command or symbol: AAPL, VOO GP, MSFT FA, ECO UNRATE, PORT, HELP"
        aria-label="Command"
        spellCheck={false}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setValue(e.target.value); setSel(0); setError(null); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
          else if (e.key === 'Tab' && items[sel]) { e.preventDefault(); setValue(items[sel].value + ' '); }
          else if (e.key === 'Escape') { setValue(''); setError(null); input.current?.blur(); }
          else if (e.key === 'Enter') {
            e.preventDefault();
            // Enter runs what was typed; a highlighted suggestion is used only after arrow navigation.
            const chosen = sel > 0 && items[sel] ? items[sel].value : value.trim() || items[0]?.value;
            if (chosen) execute(chosen);
          }
        }}
      />
      {error && <div className="cmd-error">{error}</div>}
      {open && !error && items.length > 0 && (
        <div className="suggest" role="listbox">
          {items.map((s, i) => (
            <div key={s.value + i} role="option" aria-selected={i === sel} className={`suggest-row ${i === sel ? 'sel' : ''}`} onMouseDown={(e) => { e.preventDefault(); execute(s.value); }} onMouseEnter={() => setSel(i)}>
              <span className="k">{s.label}</span>
              <span>{s.detail}</span>
              <span className="t">{s.kind}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
