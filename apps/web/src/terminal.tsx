import { FUNCTIONS, parseCommand, type FunctionDef } from '@atlas/core';
import { createContext, useContext } from 'react';

/** What a pane is showing. Serializable so layouts can be saved. */
export interface PaneCmd {
  fn: string;
  symbol?: string;
  args: string[];
}

export interface Meta {
  productName: string;
  mode: 'demo' | 'live';
  aiConfigured: boolean;
  aiModel: string;
  providers: { id: string; name: string; homepage: string; terms: string; requiresKey: boolean; configured: boolean; capabilities: string[] }[];
  routes: Record<string, string | null>;
  unavailableReasons: Record<string, string>;
}

export interface TerminalApi {
  meta: Meta;
  /** Runs a command string (as typed in the command bar) in the active pane, or `pane` if given. */
  run: (command: string, pane?: number) => string | null;
  open: (cmd: PaneCmd, pane?: number) => void;
}

export const TerminalCtx = createContext<TerminalApi | null>(null);
export const useTerminal = () => useContext(TerminalCtx)!;

export function fnDef(id: string): FunctionDef {
  return FUNCTIONS.find((f) => f.id === id) ?? FUNCTIONS[0];
}

export function toPaneCmd(input: string): { ok: true; cmd: PaneCmd } | { ok: false; error: string } {
  const r = parseCommand(input);
  if (!r.ok) return r;
  return { ok: true, cmd: { fn: r.command.fn.id, symbol: r.command.symbol, args: r.command.args } };
}

export function cmdLabel(c: PaneCmd): string {
  return [c.symbol, c.fn, ...c.args].filter(Boolean).join(' ');
}
