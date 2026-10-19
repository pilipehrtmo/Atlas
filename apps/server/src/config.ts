import { z } from 'zod';

const schema = z.object({
  ATLAS_PRODUCT_NAME: z.string().default('Atlas'),
  ATLAS_DATA_MODE: z.enum(['demo', 'live']).default('demo'),
  PORT: z.coerce.number().int().default(8787),
  HOST: z.string().default('127.0.0.1'),
  ATLAS_DB_PATH: z.string().default('./data/atlas.db'),
  /** Optional shared bearer token. When set, every /api request must send it. */
  ATLAS_ACCESS_TOKEN: z.string().optional(),
  /** SEC requires a descriptive User-Agent with contact details: "Company Name admin@example.com". */
  SEC_USER_AGENT: z.string().optional(),
  FRED_API_KEY: z.string().optional(),
  ALPHAVANTAGE_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ATLAS_AI_MODEL: z.string().default("claude-opus-5-5"),
  FRANKFURTER_BASE_URL: z.string().default('https://api.frankfurter.app'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  return schema.parse(cleaned);
}
