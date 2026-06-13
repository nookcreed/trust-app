import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Separator,
} from '@databricks/appkit-ui/react';
import { Bot, TrendingUp, Send, ShieldCheck, Search, Database } from 'lucide-react';

// Profile shape sent to the deterministic engine (mirrors server Profile contract).
interface Profile {
  state?: string | null;
  household_size?: number | null;
  monthly_income?: number | null;
  recently_lost_job?: boolean;
  has_children?: boolean;
  has_young_children?: boolean;
  is_pregnant?: boolean;
  receives_tanf?: boolean;
  receives_ssi?: boolean;
  income_uncertain?: boolean;
}

// Explicit response contract from POST /api/explain.
interface ExplainResult {
  short_name: string;
  name: string;
  eligible: boolean;
  confidence: string;
  reason: string;
  estimated_annual_value: number | null;
  notes: string | null;
}

interface ExplainResponse {
  profile: Profile;
  fpl: { household_size: number; annual_amount: number } | null;
  results: ExplainResult[];
}

interface Preset {
  label: string;
  profile: Profile;
}

const PRESETS: Preset[] = [
  {
    label: 'Lost job in GA, 2 kids, $0 income',
    profile: { state: 'GA', household_size: 3, monthly_income: 0, has_children: true, recently_lost_job: true },
  },
  {
    label: 'Pregnant in CA, $1,500/mo',
    profile: { state: 'CA', household_size: 1, monthly_income: 1500, is_pregnant: true },
  },
  {
    label: 'Family of 4 in TX, $4,000/mo',
    profile: { state: 'TX', household_size: 4, monthly_income: 4000, has_children: true },
  },
];

// Narrowing helper so we never put a non-string straight into a template/JSX text node.
function asStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function isExplainResponse(data: unknown): data is ExplainResponse {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return Array.isArray(obj.results);
}

const CONFIDENCE_LABEL: Record<string, string> = {
  likely: 'Likely',
  borderline: 'Borderline',
  unlikely: 'Unlikely',
  requires_verification: 'Verify',
};

function confidenceVariant(c: string): 'default' | 'secondary' | 'outline' {
  if (c === 'likely') return 'default';
  if (c === 'borderline') return 'secondary';
  return 'outline';
}

export function HowItWorksPage() {
  const [results, setResults] = useState<ExplainResult[] | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPreset = async (preset: Preset) => {
    setIsLoading(true);
    setError(null);
    setActiveLabel(preset.label);
    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: preset.profile }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: unknown = await response.json();
      if (!isExplainResponse(data)) {
        throw new Error('Unexpected response shape');
      }
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  };

  const eligibleResults = results?.filter((r) => r.eligible) ?? [];
  const ineligibleResults = results?.filter((r) => !r.eligible) ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <header className="text-center space-y-3 reveal">
        <h1 className="text-3xl font-bold text-foreground">How It Works</h1>
        <p className="text-muted-foreground">
          Why you can trust this: the language model only reads your words. A deterministic engine
          decides what you qualify for — so it cannot invent a benefit.
        </p>
        <div className="flex justify-center">
          <Badge variant="default" className="text-xs">
            Deterministic &amp; auditable — same input always gives the same result
          </Badge>
        </div>
      </header>

      {/* Architecture explainer */}
      <Card className="card-civic">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Two jobs, two right tools
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            BenefitsIQ uses AI to understand language — and deliberately keeps it out of the one
            place it could do harm: deciding what you qualify for.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Bot className="h-4 w-4 text-primary" />
                Language model
              </div>
              <p className="text-xs text-muted-foreground">
                Llama 3.3 70B (Databricks Model Serving) turns your words into a structured profile —
                state, household size, income, situation — and writes the replies.
              </p>
            </div>
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Eligibility engine
              </div>
              <p className="text-xs text-muted-foreground">
                A <strong>deterministic</strong> engine decides what you qualify for from real
                federal rules. Pure functions, no model in the loop — so it cannot invent a benefit.
              </p>
            </div>
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Search className="h-4 w-4 text-primary" />
                Semantic search (RAG)
              </div>
              <p className="text-xs text-muted-foreground">
                For <em>&ldquo;How to apply&rdquo;</em>, your question is embedded with GTE-Large and
                cosine-matched to curated, <strong>cited</strong> agency guidance — the LLM answers
                only from those passages.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/60 p-4 flex items-start gap-2">
            <Database className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              All of it reads from <strong>Unity Catalog</strong> Delta tables synced into{' '}
              <strong>Lakebase</strong> (serverless Postgres), on behalf of each signed-in user:
              federal rules &amp; FPL thresholds, &ldquo;families like you&rdquo; cohorts, U.S. Census
              context, and the how-to-apply knowledge base + its embeddings.
            </p>
          </div>

          <Separator />
          <p className="text-sm text-foreground">
            <strong>The model never decides whether you qualify</strong> — so it can&apos;t invent a
            benefit. Every result below is produced by the engine from auditable rules, not generated
            text.
          </p>
        </CardContent>
      </Card>

      {/* Live interactive demo */}
      <Card className="card-civic">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Live demo — watch the engine rule in and out
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pick an example profile. We POST it to the deterministic engine and show the exact rule
            that fired for every program — including the ones it rules out, each with a reason.
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant={activeLabel === preset.label ? 'default' : 'outline'}
                size="sm"
                onClick={() => { void runPreset(preset); }}
                disabled={isLoading}
                className="text-xs"
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {isLoading && (
            <div className="flex gap-1 text-primary">
              <span className="animate-bounce">●</span>
              <span className="animate-bounce delay-100">●</span>
              <span className="animate-bounce delay-200">●</span>
            </div>
          )}

          {error && (
            <p className="text-sm text-accent">Could not run the engine: {asStr(error)}</p>
          )}

          {results && !isLoading && (
            <div className="space-y-6">
              {/* Eligible */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="text-success">✓</span>
                  Ruled IN ({eligibleResults.length})
                </div>
                {eligibleResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No programs matched this profile.
                  </p>
                )}
                {eligibleResults.map((r) => (
                  <TraceRow key={r.short_name} result={r} />
                ))}
              </div>

              <Separator />

              {/* Ineligible — the anti-hallucination proof */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="text-muted-foreground">✕</span>
                  Ruled OUT ({ineligibleResults.length})
                  <span className="text-xs font-normal text-muted-foreground">
                    — each with a deterministic reason
                  </span>
                </div>
                {ineligibleResults.map((r) => (
                  <TraceRow key={r.short_name} result={r} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer reassurance */}
      <div className="text-xs text-muted-foreground text-center space-y-1">
        <p>
          <strong>Estimate only</strong> — verify with your state agency. Amounts are modeled from
          published federal figures.
        </p>
      </div>
    </div>
  );
}

function TraceRow({ result }: { result: ExplainResult }) {
  const value = result.estimated_annual_value;
  return (
    <div className="flex justify-between items-start gap-4 rounded-lg bg-muted/50 p-3">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={result.eligible ? 'text-success' : 'text-muted-foreground'}>
            {result.eligible ? '✓' : '✕'}
          </span>
          <p className="font-semibold text-sm">{asStr(result.short_name)}</p>
          <span className="text-xs text-muted-foreground">{asStr(result.name)}</span>
          <Badge variant={confidenceVariant(result.confidence)} className="text-[10px]">
            {CONFIDENCE_LABEL[result.confidence] ?? asStr(result.confidence)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{asStr(result.reason)}</p>
        {result.notes && (
          <p className="text-xs text-muted-foreground/70">{asStr(result.notes)}</p>
        )}
      </div>
      {result.eligible && value !== null && (
        <div className="text-right shrink-0">
          <p className="font-semibold text-primary">${value.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">/year</p>
        </div>
      )}
    </div>
  );
}
