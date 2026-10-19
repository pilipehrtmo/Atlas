import { D, dec, type Dec } from './decimal.js';

/**
 * Portfolio ledger engine.
 *
 * Cost basis method: weighted average cost per instrument. Buy fees are added to
 * cost; sell fees reduce proceeds. Splits change quantity, never total cost.
 * Cash is tracked per currency; instruments are valued in their own currency and
 * converted to the base currency only at valuation time with an explicit FX rate.
 */

export type TxType = 'BUY' | 'SELL' | 'DIVIDEND' | 'DEPOSIT' | 'WITHDRAWAL' | 'FEE' | 'SPLIT';

export interface Transaction {
  id?: number | string;
  date: string; // YYYY-MM-DD
  type: TxType;
  symbol?: string; // BUY, SELL, DIVIDEND, SPLIT
  quantity?: string; // BUY, SELL
  price?: string; // BUY, SELL, per share
  amount?: string; // DIVIDEND, DEPOSIT, WITHDRAWAL, FEE: cash amount (positive)
  fee?: string; // BUY, SELL
  currency: string;
  /** SPLIT: new shares per old share, e.g. "4" for a 4-for-1, "0.1" for 1-for-10. */
  splitRatio?: string;
  note?: string;
}

export interface Position {
  symbol: string;
  currency: string;
  quantity: string;
  totalCost: string;
  averageCost: string | null;
  realizedPnl: string;
  dividends: string;
}

export interface LedgerState {
  positions: Position[];
  cash: Record<string, string>;
  realizedPnl: Record<string, string>;
}

export class LedgerError extends Error {
  constructor(message: string, public readonly transaction: Transaction) {
    super(message);
  }
}

interface MutablePosition {
  symbol: string;
  currency: string;
  quantity: Dec;
  totalCost: Dec;
  realizedPnl: Dec;
  dividends: Dec;
}

function req(tx: Transaction, field: keyof Transaction): Dec {
  const v = tx[field];
  if (v === undefined || v === null || v === '') throw new LedgerError(`${tx.type} on ${tx.date} is missing ${String(field)}`, tx);
  const d = dec(v as string);
  return d;
}

/** Orders by date; same-day transactions keep their input order. */
export function sortTransactions(txs: Transaction[]): Transaction[] {
  return txs.map((t, i) => ({ t, i })).sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.i - b.i)).map((x) => x.t);
}

export function buildLedger(transactions: Transaction[]): LedgerState {
  const positions = new Map<string, MutablePosition>();
  const cash = new Map<string, Dec>();
  const realized = new Map<string, Dec>();
  const addCash = (ccy: string, amt: Dec) => cash.set(ccy, (cash.get(ccy) ?? new D(0)).plus(amt));

  for (const tx of sortTransactions(transactions)) {
    const ccy = tx.currency.toUpperCase();
    const getPos = () => {
      if (!tx.symbol) throw new LedgerError(`${tx.type} on ${tx.date} is missing symbol`, tx);
      const sym = tx.symbol.toUpperCase();
      let p = positions.get(sym);
      if (!p) {
        p = { symbol: sym, currency: ccy, quantity: new D(0), totalCost: new D(0), realizedPnl: new D(0), dividends: new D(0) };
        positions.set(sym, p);
      }
      if (p.currency !== ccy && !(p.quantity.isZero() && p.totalCost.isZero())) {
        throw new LedgerError(`${sym} is held in ${p.currency}; ${tx.type} in ${ccy} is not supported`, tx);
      }
      p.currency = ccy;
      return p;
    };

    switch (tx.type) {
      case 'DEPOSIT':
        addCash(ccy, req(tx, 'amount'));
        break;
      case 'WITHDRAWAL':
        addCash(ccy, req(tx, 'amount').neg());
        break;
      case 'FEE':
        addCash(ccy, req(tx, 'amount').neg());
        break;
      case 'BUY': {
        const p = getPos();
        const qty = req(tx, 'quantity');
        const price = req(tx, 'price');
        const fee = tx.fee ? dec(tx.fee) : new D(0);
        if (qty.lte(0)) throw new LedgerError('BUY quantity must be positive', tx);
        if (price.lt(0) || fee.lt(0)) throw new LedgerError('BUY price and fee must not be negative', tx);
        const cost = qty.times(price).plus(fee);
        p.quantity = p.quantity.plus(qty);
        p.totalCost = p.totalCost.plus(cost);
        addCash(ccy, cost.neg());
        break;
      }
      case 'SELL': {
        const p = getPos();
        const qty = req(tx, 'quantity');
        const price = req(tx, 'price');
        const fee = tx.fee ? dec(tx.fee) : new D(0);
        if (qty.lte(0)) throw new LedgerError('SELL quantity must be positive', tx);
        if (qty.gt(p.quantity)) {
          throw new LedgerError(`SELL of ${qty} ${p.symbol} on ${tx.date} exceeds the ${p.quantity} held (short positions are not supported)`, tx);
        }
        const avg = p.totalCost.div(p.quantity);
        const costRemoved = avg.times(qty);
        const proceeds = qty.times(price).minus(fee);
        const pnl = proceeds.minus(costRemoved);
        p.quantity = p.quantity.minus(qty);
        p.totalCost = p.quantity.isZero() ? new D(0) : p.totalCost.minus(costRemoved);
        p.realizedPnl = p.realizedPnl.plus(pnl);
        realized.set(ccy, (realized.get(ccy) ?? new D(0)).plus(pnl));
        addCash(ccy, proceeds);
        break;
      }
      case 'DIVIDEND': {
        const p = getPos();
        const amt = req(tx, 'amount');
        p.dividends = p.dividends.plus(amt);
        addCash(ccy, amt);
        break;
      }
      case 'SPLIT': {
        const p = getPos();
        const r = req(tx, 'splitRatio');
        if (r.lte(0)) throw new LedgerError('Split ratio must be positive', tx);
        p.quantity = p.quantity.times(r);
        break;
      }
      default:
        throw new LedgerError(`Unknown transaction type ${(tx as Transaction).type}`, tx);
    }
  }

  return {
    // Closed positions are kept so realized P&L and dividend history stay visible.
    positions: [...positions.values()].map((p) => ({
        symbol: p.symbol,
        currency: p.currency,
        quantity: p.quantity.toString(),
        totalCost: p.totalCost.toString(),
        averageCost: p.quantity.isZero() ? null : p.totalCost.div(p.quantity).toString(),
        realizedPnl: p.realizedPnl.toString(),
        dividends: p.dividends.toString(),
      })),
    cash: Object.fromEntries([...cash].map(([k, v]) => [k, v.toString()])),
    realizedPnl: Object.fromEntries([...realized].map(([k, v]) => [k, v.toString()])),
  };
}

export interface PriceInput {
  price: string;
  asOf: string | null;
  provider: string;
}

export interface ValuedPosition extends Position {
  price: PriceInput | null;
  marketValue: string | null;
  unrealizedPnl: string | null;
  unrealizedPct: string | null;
  /** Market value in base currency; null if price or FX rate is unavailable. */
  marketValueBase: string | null;
  weight: string | null;
}

export interface PortfolioValuation {
  baseCurrency: string;
  positions: ValuedPosition[];
  cash: { currency: string; amount: string; amountBase: string | null }[];
  /** Total in base currency. Null whenever any component could not be valued. */
  totalValue: string | null;
  /** Sum of what could be valued, for display alongside the missing list. */
  valuedSubtotal: string;
  missing: { item: string; reason: string }[];
  allocationByCurrency: Record<string, string>;
}

/**
 * Values a ledger. `fxToBase[ccy]` is the number of base-currency units per one
 * unit of `ccy`. Weights are computed over valued items only and only when the
 * total is complete.
 */
export function valuePortfolio(
  ledger: LedgerState,
  prices: Record<string, PriceInput | undefined>,
  baseCurrency: string,
  fxToBase: Record<string, string | undefined>,
): PortfolioValuation {
  const base = baseCurrency.toUpperCase();
  const missing: PortfolioValuation['missing'] = [];
  const toBase = (amount: Dec, ccy: string): Dec | null => {
    if (ccy === base) return amount;
    const r = fxToBase[ccy];
    return r === undefined ? null : amount.times(dec(r));
  };
  let subtotal = new D(0);
  const byCcy = new Map<string, Dec>();

  const valued = ledger.positions
    .filter((p) => !dec(p.quantity).isZero())
    .map((p): ValuedPosition => {
      const price = prices[p.symbol] ?? null;
      if (!price) {
        missing.push({ item: p.symbol, reason: 'No price available' });
        return { ...p, price: null, marketValue: null, unrealizedPnl: null, unrealizedPct: null, marketValueBase: null, weight: null };
      }
      const mv = dec(p.quantity).times(dec(price.price));
      const pnl = mv.minus(dec(p.totalCost));
      const cost = dec(p.totalCost);
      const mvBase = toBase(mv, p.currency);
      if (mvBase === null) missing.push({ item: p.symbol, reason: `No ${p.currency}/${base} FX rate` });
      else {
        subtotal = subtotal.plus(mvBase);
        byCcy.set(p.currency, (byCcy.get(p.currency) ?? new D(0)).plus(mvBase));
      }
      return {
        ...p,
        price,
        marketValue: mv.toString(),
        unrealizedPnl: pnl.toString(),
        unrealizedPct: cost.isZero() ? null : pnl.div(cost).toString(),
        marketValueBase: mvBase?.toString() ?? null,
        weight: null,
      };
    });

  const cash = Object.entries(ledger.cash).map(([currency, amount]) => {
    const b = toBase(dec(amount), currency);
    if (b === null) missing.push({ item: `${currency} cash`, reason: `No ${currency}/${base} FX rate` });
    else {
      subtotal = subtotal.plus(b);
      byCcy.set(currency, (byCcy.get(currency) ?? new D(0)).plus(b));
    }
    return { currency, amount, amountBase: b?.toString() ?? null };
  });

  const complete = missing.length === 0;
  if (complete && !subtotal.isZero()) {
    for (const v of valued) if (v.marketValueBase !== null) v.weight = dec(v.marketValueBase).div(subtotal).toString();
  }
  return {
    baseCurrency: base,
    positions: valued,
    cash,
    totalValue: complete ? subtotal.toString() : null,
    valuedSubtotal: subtotal.toString(),
    missing,
    allocationByCurrency: complete && !subtotal.isZero() ? Object.fromEntries([...byCcy].map(([k, v]) => [k, v.div(subtotal).toString()])) : {},
  };
}
