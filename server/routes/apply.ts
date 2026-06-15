// "How to Apply" RAG route — genuine retrieval-augmented generation for the RIGHT job.
//
// Eligibility stays deterministic (see benefits.ts). This route answers PROCEDURAL
// how-to-apply questions ("What documents do I need for SNAP in Georgia?") by:
//   1. RETRIEVING relevant, citation-backed chunks from the Databricks-synced table
//      public.apply_kb (loaded by scripts/build_apply_kb.py), and
//   2. COMPOSING a grounded, cited answer with Model Serving, constrained to that context.
//
// Retrieval degrades gracefully across three tiers:
//   Tier 1: Databricks Vector Search — managed ANN index, fastest, best recall.
//   Tier 2: In-process semantic cosine similarity over precomputed embeddings in Lakebase.
//   Tier 3: Lexical LIKE-based search — guaranteed fallback, needs no embedding service.
//
// The `retrieveChunks()` dispatcher cascades through these tiers automatically so the
// route never breaks even if Vector Search or embeddings are unavailable.

import type { Request } from 'express';
import type { AppKitLike } from './benefits';
import { WorkspaceClient } from '@databricks/sdk-experimental';

const VALID_PROGRAMS = new Set(['SNAP', 'MEDICAID', 'CHIP', 'WIC', 'LIHEAP', 'NSLP', 'TANF', 'SECTION8']);
const TOP_K = 5;

// Vector Search index name — configurable via env, defaults to the BenefitsIQ apply KB index.
const VS_INDEX_NAME = process.env.DATABRICKS_VS_INDEX_NAME || 'benefitsiq.app.apply_kb_vs_index';

// Columns to retrieve from the Vector Search index. Must match the KbChunk fields.
const VS_COLUMNS = ['id', 'program_short', 'title', 'chunk_text', 'source_name', 'source_url'];

interface KbChunk {
  id: number;
  program_short: string;
  title: string;
  chunk_text: string;
  source_name: string;
  source_url: string;
}

interface ApplyHelpResponse {
  answer: string;
  sources: Array<{ title: string; source_name: string; source_url: string }>;
  retrieved: number;
}

// Robust content extraction — copied from chat.ts logic (do NOT import a non-exported symbol).
function extractContent(resp: unknown): string {
  if (typeof resp === 'string') return resp;
  if (!resp || typeof resp !== 'object') return '';
  const top = resp as Record<string, unknown>;
  const data = (top.data && typeof top.data === 'object' ? top.data : top) as Record<string, unknown>;
  const choices = data.choices as Array<{ message?: { content?: string }; text?: string }> | undefined;
  if (choices && choices[0]) {
    const mc = choices[0].message?.content;
    if (typeof mc === 'string') return mc;
    if (typeof choices[0].text === 'string') return choices[0].text;
  }
  const msgs = data.messages as Array<{ content?: string }> | undefined;
  if (msgs && msgs.length) {
    const c = msgs[msgs.length - 1]?.content;
    if (typeof c === 'string') return c;
  }
  if (typeof data.content === 'string') return data.content;
  const preds = data.predictions;
  if (typeof preds === 'string') return preds;
  if (Array.isArray(preds) && typeof preds[0] === 'string') return preds[0];
  return '';
}

function asStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

// Bound a promise so a slow/hanging Model Serving call can never hang the HTTP
// request past the platform gateway timeout (which would surface as "Load failed").
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  // If the timeout wins the race, the underlying promise is still pending; swallow its
  // late settlement so a rejection can't become an unhandledRejection (which can crash
  // the worker and surface to the browser as a dropped connection / "Load failed").
  p.catch(() => undefined);
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function rowToChunk(r: Record<string, unknown>): KbChunk {
  return {
    id: Number(r.id) || 0,
    program_short: asStr(r.program_short),
    title: asStr(r.title),
    chunk_text: asStr(r.chunk_text),
    source_name: asStr(r.source_name),
    source_url: asStr(r.source_url),
  };
}

// Pull keyword tokens from the question for the lexical fallback ranker.
function tokenize(q: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of q.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out.slice(0, 12);
}

// --- Tier 1: Databricks Vector Search retrieval (fastest, best recall) ----------------------

/**
 * Query the Databricks Vector Search index using the workspace SDK. The index is a
 * Delta Sync index backed by `databricks-gte-large-en`, so we can use `query_text`
 * directly (the index embeds the query automatically via its configured embedding
 * endpoint). Falls back to `query_vector` if the caller already has embeddings.
 *
 * Returns null if Vector Search is not configured, the index does not exist, or any
 * error occurs — the caller will cascade to the next retrieval tier.
 */
async function retrieveVectorSearch(
  _appkit: AppKitLike,
  _req: Request,
  question: string,
  programShort: string | null,
): Promise<KbChunk[] | null> {
  // Skip if explicitly disabled (empty env var).
  if (process.env.DATABRICKS_VS_INDEX_NAME === '') return null;

  try {
    const client = new WorkspaceClient({});

    // Build the query request. Delta Sync indexes with a configured embedding model
    // accept `query_text`; self-managed embedding indexes need `query_vector`.
    // We try query_text first since our index uses databricks-gte-large-en.
    const filtersJson = programShort
      ? JSON.stringify({ program_short: programShort })
      : undefined;

    const resp = await withTimeout(
      client.vectorSearchIndexes.queryIndex({
        index_name: VS_INDEX_NAME,
        columns: VS_COLUMNS,
        query_text: question,
        num_results: TOP_K,
        filters_json: filtersJson,
      }),
      10000,
      'vector-search',
    );

    // Parse the response: result.data_array is string[][] with columns aligned to
    // manifest.columns. Convert to KbChunk[] using the column order from the manifest.
    const dataArray = resp.result?.data_array;
    const manifestCols = resp.manifest?.columns;
    if (!dataArray || !dataArray.length || !manifestCols) return null;

    // Build a column-name-to-index mapping from the manifest.
    const colIdx: Record<string, number> = {};
    for (let i = 0; i < manifestCols.length; i++) {
      const name = (manifestCols[i] as Record<string, unknown>).name as string | undefined;
      if (name) colIdx[name] = i;
    }

    const chunks: KbChunk[] = [];
    for (const row of dataArray) {
      const get = (col: string): string => {
        const idx = colIdx[col];
        return idx !== undefined && row[idx] != null ? String(row[idx]) : '';
      };
      chunks.push({
        id: Number(get('id')) || 0,
        program_short: get('program_short'),
        title: get('title'),
        chunk_text: get('chunk_text'),
        source_name: get('source_name'),
        source_url: get('source_url'),
      });
    }

    if (!chunks.length || !chunks.some((c) => c.chunk_text)) return null;
    console.log(`[apply] Vector Search returned ${chunks.length} chunks`);
    return chunks;
  } catch (e) {
    // Graceful degradation: log and fall through to the next retrieval tier.
    console.warn('[apply] Vector Search unavailable, falling back:', (e as Error).message);
    return null;
  }
}

// --- Tier 2: In-process semantic retrieval ---------------------------------------------------

// Extract a 1024-dim embedding from the Databricks embedding endpoint response.
// Shape: { data: [{ embedding: number[] }] } (possibly wrapped under .data).
function extractEmbedding(resp: unknown): number[] | null {
  const pickFromArray = (d: unknown): number[] | null => {
    if (!Array.isArray(d) || d.length === 0) return null;
    const first: unknown = d[0];
    if (first && typeof first === 'object') {
      const emb: unknown = (first as Record<string, unknown>).embedding;
      if (Array.isArray(emb)) {
        const nums = (emb as unknown[])
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x));
        return nums.length ? nums : null;
      }
    }
    return null;
  };
  if (!resp || typeof resp !== 'object') return null;
  const top = resp as Record<string, unknown>;
  let out = pickFromArray(top.data);
  if (out) return out;
  if (top.data && typeof top.data === 'object') {
    out = pickFromArray((top.data as Record<string, unknown>).data);
    if (out) return out;
  }
  if (Array.isArray(top.embedding)) {
    const nums = (top.embedding as unknown[])
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x));
    return nums.length ? nums : null;
  }
  return null;
}

function parseEmbedding(v: unknown): number[] | null {
  if (typeof v !== 'string') return null;
  try {
    const arr: unknown = JSON.parse(v);
    if (!Array.isArray(arr)) return null;
    const nums = arr.map((x) => Number(x)).filter((x) => Number.isFinite(x));
    return nums.length ? nums : null;
  } catch {
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embedQuery(
  appkit: AppKitLike,
  _req: Request,
  text: string,
): Promise<number[] | null> {
  try {
    const resp = await withTimeout(
      appkit.serving('embed').invoke({ input: text }), // SP context (FM endpoints are workspace-queryable)
      12000,
      'embed',
    );
    return extractEmbedding(resp);
  } catch {
    return null;
  }
}

/**
 * Semantic retrieval: embed the question with the Databricks embedding endpoint, read the
 * precomputed chunk vectors from the Lakebase-synced public.apply_kb_emb (loaded by
 * scripts/embed_apply_kb.py), and cosine-rank. So "emergency food" matches "expedited SNAP".
 * Returns null if embeddings are unavailable (caller falls back to lexical).
 */
async function retrieveSemantic(
  appkit: AppKitLike,
  req: Request,
  question: string,
  programShort: string | null,
): Promise<KbChunk[] | null> {
  const qvec = await embedQuery(appkit, req, question);
  if (!qvec) return null;

  const db = appkit.lakebase; // SP read (granted SELECT on public.*)
  const params: unknown[] = [];
  let where = '';
  if (programShort) {
    params.push(programShort);
    where = 'WHERE program_short = $1';
  }
  let rows: Record<string, unknown>[];
  try {
    const r = await db.query(
      `SELECT id, program_short, title, chunk_text, source_name, source_url, embedding ` +
        `FROM public.apply_kb_emb ${where}`,
      params,
    );
    rows = r.rows;
  } catch {
    return null; // apply_kb_emb not present -> lexical fallback
  }
  if (!rows.length) return null;

  const scored = rows
    .map((r) => {
      const emb = parseEmbedding(r.embedding);
      return emb ? { chunk: rowToChunk(r), score: cosine(qvec, emb) } : null;
    })
    .filter((x): x is { chunk: KbChunk; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  return scored.length ? scored.map((s) => s.chunk) : null;
}

// --- Tier 3: Lexical retrieval (guaranteed fallback) ----------------------------------------
async function retrieveLexical(
  appkit: AppKitLike,
  _req: Request,
  question: string,
  programShort: string | null,
): Promise<KbChunk[]> {
  const db = appkit.lakebase; // SP read (granted SELECT on public.*)
  const tokens = tokenize(question);
  const params: unknown[] = [];
  const filters: string[] = [];

  if (programShort) {
    params.push(programShort);
    filters.push(`program_short = $${params.length}`);
  }

  let scoreExpr = '0';
  if (tokens.length) {
    const haystack = "lower(title || ' ' || chunk_text)";
    scoreExpr = tokens
      .map((t) => {
        params.push(`%${t}%`);
        return `(CASE WHEN ${haystack} LIKE $${params.length} THEN 1 ELSE 0 END)`;
      })
      .join(' + ');
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  params.push(TOP_K);
  const limitIdx = params.length;

  const sql =
    `SELECT id, program_short, title, chunk_text, source_name, source_url, ` +
    `(${scoreExpr}) AS relevance ` +
    `FROM public.apply_kb ${where} ` +
    `ORDER BY relevance DESC, id ASC ` +
    `LIMIT $${limitIdx}`;

  try {
    const { rows } = await db.query(sql, params);
    return rows.map(rowToChunk);
  } catch {
    return []; // read failed (e.g., grant lapsed) — degrade gracefully instead of 500
  }
}

// Dispatcher: Vector Search -> semantic cosine -> lexical. Three tiers of graceful degradation.
async function retrieveChunks(
  appkit: AppKitLike,
  req: Request,
  question: string,
  programShort: string | null,
): Promise<KbChunk[]> {
  // Tier 1: Databricks Vector Search (managed ANN index).
  const vs = await retrieveVectorSearch(appkit, req, question, programShort);
  if (vs && vs.length) return vs;

  // Tier 2: In-process cosine similarity over precomputed embeddings in Lakebase.
  const semantic = await retrieveSemantic(appkit, req, question, programShort);
  if (semantic && semantic.length) return semantic;

  // Tier 3: Lexical LIKE-based search — always available.
  return retrieveLexical(appkit, req, question, programShort);
}

const SYS = `You are BenefitsIQ's "How to Apply" helper. Answer the user's question ONLY using the
provided context passages about how to apply for U.S. benefit programs. Follow these rules strictly:
- Use ONLY facts found in the context. Do not add steps, numbers, or requirements that are not present.
- Give a short, clear, step-by-step answer in plain language.
- After each step or claim, cite the source in brackets using its source name, e.g. [USDA FNS — SNAP Eligibility].
- If the context does not cover the question, say plainly that you don't have that information here and
  suggest contacting the relevant state agency or calling 211. Do not guess.
- Be calm, kind, and concise.`;

function buildContext(chunks: KbChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] (${c.program_short}) ${c.title}\n${c.chunk_text}\nSource: ${c.source_name} (${c.source_url})`,
    )
    .join('\n\n');
}

function dedupeSources(
  chunks: KbChunk[],
): Array<{ title: string; source_name: string; source_url: string }> {
  const seen = new Set<string>();
  const out: Array<{ title: string; source_name: string; source_url: string }> = [];
  for (const c of chunks) {
    const key = `${c.title}::${c.source_url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: c.title, source_name: c.source_name, source_url: c.source_url });
  }
  return out;
}

export function setupApplyRoute(appkit: AppKitLike) {
  appkit.server.extend((app) => {
    app.post('/api/apply-help', async (req: Request, res) => {
      try {
        const body = (req.body ?? {}) as {
          program_short?: unknown;
          question?: unknown;
          profile?: unknown;
        };

        const question = (typeof body.question === 'string' ? body.question : '').trim().slice(0, 1000);
        if (!question) {
          res.status(400).json({ error: 'A question is required.' });
          return;
        }

        const rawProg = typeof body.program_short === 'string' ? body.program_short.toUpperCase() : '';
        const programShort = VALID_PROGRAMS.has(rawProg) ? rawProg : null;

        // 1) RETRIEVE from the Databricks-synced KB (self-contained, no external service).
        const chunks = await withTimeout(
          retrieveChunks(appkit, req, question, programShort),
          15000,
          'retrieval',
        );

        if (chunks.length === 0) {
          const out: ApplyHelpResponse = {
            answer:
              "I don't have how-to-apply guidance for that here. Please contact your state agency or call 211 for help.",
            sources: [],
            retrieved: 0,
          };
          res.json(out);
          return;
        }

        // 2) COMPOSE a grounded, cited answer constrained to the retrieved context.
        const context = buildContext(chunks);
        const stateHint =
          body.profile && typeof body.profile === 'object' && body.profile !== null
            ? ` (User profile: ${JSON.stringify(body.profile).slice(0, 300)})`
            : '';

        let answer = '';
        try {
          const resp = await withTimeout(
            appkit
              .serving('default')
              .invoke({
                messages: [
                  { role: 'system', content: SYS },
                  {
                    role: 'user',
                    content: `Context passages:\n\n${context}\n\nQuestion: ${question}${stateHint}`,
                  },
                ],
                temperature: 0,
                max_tokens: 512,
              }),
            25000,
            'serving',
          );
          answer = extractContent(resp).trim();
        } catch (e) {
          console.warn('[apply] LLM compose failed:', (e as Error).message);
        }

        if (!answer) {
          // Grounded fallback if the model call is unavailable: surface the retrieved guidance
          // verbatim with citations so the feature still answers from real, cited data.
          answer = chunks
            .map((c) => `• ${c.chunk_text} [${c.source_name}]`)
            .join('\n\n');
        }

        const out: ApplyHelpResponse = {
          answer,
          sources: dedupeSources(chunks),
          retrieved: chunks.length,
        };
        res.json(out);
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });
  });
}
