import { describe, expect, it } from 'vitest';
import { parseCommand, suggest } from '../src/index.js';

const p = (s: string) => {
  const r = parseCommand(s);
  if (!r.ok) throw new Error(r.error);
  return r.command;
};

describe('command parser', () => {
  it('opens the company overview for a bare symbol', () => {
    expect(p('aapl').fn.id).toBe('DES');
    expect(p('aapl').symbol).toBe('AAPL');
  });
  it('ignores GO terminators', () => {
    expect(p('AAPL <GO>').fn.id).toBe('DES');
    expect(p('AAPL FA GO').fn.id).toBe('FA');
  });
  it('accepts function then symbol and aliases', () => {
    expect(p('FILINGS MSFT').fn.id).toBe('FIL');
    expect(p('FILINGS MSFT').symbol).toBe('MSFT');
    expect(p('NEWS').symbol).toBeUndefined();
    expect(p('PORTFOLIO').fn.id).toBe('PORT');
  });
  it('passes text args', () => {
    expect(p('ECO UNRATE').args).toEqual(['UNRATE']);
    expect(p('FX EURUSD').args).toEqual(['EURUSD']);
  });
  it('lets $ force a symbol that collides with a function', () => {
    expect(p('$FX').fn.id).toBe('DES');
    expect(p('$FX').symbol).toBe('FX');
  });
  it('reports errors instead of guessing', () => {
    expect(parseCommand('').ok).toBe(false);
    expect(parseCommand('FA').ok).toBe(false);
    expect(parseCommand('AAPL NOPE').ok).toBe(false);
    expect(parseCommand('AAPL PORT').ok).toBe(false);
    expect(parseCommand('!!!').ok).toBe(false);
  });
  it('supports class-share and index symbols', () => {
    expect(p('BRK.B').symbol).toBe('BRK.B');
  });
});

describe('suggest', () => {
  it('completes functions and symbol functions', () => {
    expect(suggest('NE')[0].value).toBe('NEWS');
    expect(suggest('AAPL F').map((s) => s.value)).toEqual(['AAPL FA', 'AAPL FIL']);
  });
  it('shows recents first for empty input', () => {
    expect(suggest('', { recent: ['MSFT FA'] })[0]).toMatchObject({ value: 'MSFT FA', kind: 'recent' });
  });
});

import { parseCsv } from '../src/index.js';
describe('parseCsv', () => {
  it('reads quoted fields, escaped quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿Date,Type,Note\r\n2026-10-20,buy,"a, ""b"""\r\n\r\n')).toEqual([{ date: '2026-10-20', type: 'buy', note: 'a, "b"' }]);
  });
});
