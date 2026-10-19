import Anthropic from '@anthropic-ai/sdk';
import type { Provenance } from '@atlas/core';
import type { DataService } from '../providers/service.js';

/**
 * Retrieval-grounded research. Atlas first assembles an evidence pack from its
 * own providers (each item keeps its provenance), then asks Claude to answer
 * using only that pack, with the Citations API so every cited sentence points
 * at the exact source text. Without an API key the evidence pack is still
 * returned, so the user sees what is known without any AI interpretation.
 */

export interface EvidenceSource {
  id: string; // S1, S2...
  title: string;
  text: string;
  provenance: Provenance;
}

export interface ResearchAnswer {
  status: 'ok' | 'no-ai' | 'error';
  question: string;
  symbol: string | null;
  sources: EvidenceSource[];
  missing: string[];
  /** Answer segments; a segment may cite one or more sources by id. */
  segments: { text: string; citations: { sourceId: string; citedText: string }[] }[];
  model?: string;
  note: string;
  generatedAt: string;
}

const SYSTEM = `You are the research assistant inside Atlas, a financial research terminal.
Answer only from the documents provided. Each document is a data extract with its source and date.
Rules:
- Every factual or numerical claim must be supported by a citation to a provided document. If the documents do not contain something, say it is not available in the retrieved data; do not fill gaps from memory.
- Organise the answer under these headings, in this order: "Facts from the data", "Interpretation", "Missing data and limitations". Interpretation is your analysis and must be labelled as such; never present it as fact or as a prediction of returns.
- State the dates of the figures you use. Point out stale or synthetic data when the document says so.
- No investment advice and no price targets unless a document provides a sourced one.`;

export async function buildEvidence(data: DataService, symbol: string | null): Promise<{ sources: EvidenceSource[]; missing: string[] }> {
  const sources: EvidenceSource[] = [];
  const missing: string[] = [];
  const add = (title: string, text: string, provenance: Provenance) => sources.push({ id: `S${sources.length + 1}`, title, text, provenance });
  const stamp = (p: Provenance) => `Source: ${p.providerName}. As of: ${p.asOf ?? 'n/a'}. Retrieved: ${p.fetchedAt}. Timeliness: ${p.timeliness}.${p.sourceUrl ? ` URL: ${p.sourceUrl}` : ''}`;

  if (symbol) {
    const [profile, quote, fa, filings] = await Promise.all([
      data.call('profile', (p) => p.profile?.(symbol)),
      data.call('quote', (p) => p.quote?.(symbol)),
      data.call('fundamentals', (p) => p.fundamentals?.(symbol)),
      data.call('filings', (p) => p.filings?.(symbol, ['10-K', '10-Q', '8-K'])),
    ]);
    if (profile.status === 'ok') {
      const d = profile.data;
      add(`${symbol} company profile`, `${stamp(profile.provenance)}\nName: ${d.name}\nExchange: ${d.exchange ?? 'n/a'}\nSector: ${d.sector ?? 'n/a'}\nIndustry: ${d.industry ?? 'n/a'}\nFiscal year end (MMDD): ${d.fiscalYearEnd ?? 'n/a'}\n${d.description ?? ''}`, profile.provenance);
    } else missing.push(`Profile: ${profile.reason}`);
    if (quote.status === 'ok') {
      const q = quote.data;
      add(`${symbol} latest quote`, `${stamp(quote.provenance)}\nPrice: ${q.price} ${q.currency} for session ${q.sessionDate}\nPrevious close: ${q.previousClose ?? 'n/a'}\nChange: ${q.change ?? 'n/a'} (${q.changePercent ?? 'n/a'}%)\nVolume: ${q.volume ?? 'n/a'}`, quote.provenance);
    } else missing.push(`Quote: ${quote.reason}`);
    if (fa.status === 'ok') {
      const rows = fa.data.lines.map((l) => {
        const pts = l.annual.slice(-5).map((p) => `${p.fiscalYear ?? p.end.slice(0, 4)} (period end ${p.end}, ${p.form} filed ${p.filed}): ${p.value} ${p.unit}`);
        return `${l.label} [${l.concept}]\n  ${pts.join('\n  ')}`;
      });
      add(`${symbol} annual reported financials`, `${stamp(fa.provenance)}\nValues are as reported in annual filings, in the stated unit.\n${rows.join('\n')}`, fa.provenance);
    } else missing.push(`Financial statements: ${fa.reason}`);
    if (filings.status === 'ok') {
      const list = filings.data.slice(0, 25).map((f) => `${f.filingDate} ${f.form}${f.reportDate ? ` (period ${f.reportDate})` : ''}: ${f.description ?? ''} ${f.url}`);
      add(`${symbol} recent filings index`, `${stamp(filings.provenance)}\nThis is a list of filings, not their contents.\n${list.join('\n')}`, filings.provenance);
    } else missing.push(`Filings: ${filings.reason}`);
  }
  const news = await data.call('news', () => undefined);
  if (news.status === 'unavailable') missing.push(`News: ${news.reason}`);
  return { sources, missing };
}

export async function research(
  data: DataService,
  opts: { question: string; symbol: string | null; apiKey?: string; model: string },
): Promise<ResearchAnswer> {
  const { sources, missing } = await buildEvidence(data, opts.symbol);
  const base = { question: opts.question, symbol: opts.symbol, sources, missing, generatedAt: new Date().toISOString() };
  if (!opts.apiKey) {
    return { ...base, status: 'no-ai', segments: [], note: 'ANTHROPIC_API_KEY is not set, so no AI answer was generated. The retrieved evidence is shown instead.' };
  }
  if (sources.length === 0) {
    return { ...base, status: 'no-ai', segments: [], note: 'No data could be retrieved for this question, so Atlas did not ask the model (it would have nothing to cite).' };
  }

  const client = new Anthropic({ apiKey: opts.apiKey });
  try {
    const response = await client.beta.messages.create({
      model: opts.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            ...sources.map((s) => ({
              type: 'document' as const,
              source: { type: 'text' as const, media_type: 'text/plain' as const, data: s.text },
              title: `${s.id}: ${s.title}`,
              citations: { enabled: true },
            })),
            {
              type: 'text' as const,
              text: `Today is ${new Date().toISOString().slice(0, 10)}. Known gaps in the retrieved data:\n${missing.map((m) => `- ${m}`).join('\n') || '- none reported'}\n\nQuestion: ${opts.question}`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return { ...base, status: 'error', segments: [], model: response.model, note: 'The model declined to answer this question.' };
    }
    const segments: ResearchAnswer['segments'] = [];
    for (const block of response.content) {
      if (block.type !== 'text') continue;
      const cites = (block.citations ?? [])
        .filter((c): c is Anthropic.Beta.BetaCitationCharLocation => c.type === 'char_location')
        .map((c) => ({ sourceId: sources[c.document_index]?.id ?? '?', citedText: c.cited_text }));
      segments.push({ text: block.text, citations: cites });
    }
    return {
      ...base, status: 'ok', segments, model: response.model,
      note: 'AI-generated from the retrieved sources listed. Cited passages are quoted from those sources; uncited sentences are the model\'s own wording and should be treated as interpretation.',
    };
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `Claude API error ${e.status}: ${e.message}` : (e as Error).message;
    return { ...base, status: 'error', segments: [], note: msg };
  }
}
