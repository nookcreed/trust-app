import { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Separator,
  Input,
  Label,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@databricks/appkit-ui/react';
import {
  Bot,
  TrendingUp,
  Send,
  ShieldCheck,
  Search,
  Database,
  UserPen,
  DollarSign,
  Scale,
  MessageCircleWarning,
  Sparkles,
} from 'lucide-react';

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

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',
  FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',
  IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',
  WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
};

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

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function HowItWorksPage() {
  const [results, setResults] = useState<ExplainResult[] | null>(null);
  const [fplData, setFplData] = useState<{ household_size: number; annual_amount: number } | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom form state
  const [formState, setFormState] = useState<string>('GA');
  const [formHouseholdSize, setFormHouseholdSize] = useState<number>(3);
  const [formMonthlyIncome, setFormMonthlyIncome] = useState<number>(2000);
  const [formHasChildren, setFormHasChildren] = useState(false);
  const [formHasYoungChildren, setFormHasYoungChildren] = useState(false);
  const [formIsPregnant, setFormIsPregnant] = useState(false);
  const [formReceivesTanf, setFormReceivesTanf] = useState(false);
  const [formReceivesSsi, setFormReceivesSsi] = useState(false);
  const [formRecentlyLostJob, setFormRecentlyLostJob] = useState(false);
  const [formIncomeUncertain, setFormIncomeUncertain] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);

  const runExplain = useCallback(async (profile: Profile, label: string) => {
    setIsLoading(true);
    setError(null);
    setActiveLabel(label);
    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: unknown = await response.json();
      if (!isExplainResponse(data)) {
        throw new Error('Unexpected response shape');
      }
      setResults(data.results);
      setFplData(data.fpl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setResults(null);
      setFplData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runPreset = useCallback((preset: Preset) => {
    setShowCustomForm(false);
    void runExplain(preset.profile, preset.label);
  }, [runExplain]);

  const runCustomProfile = useCallback(() => {
    const profile: Profile = {
      state: formState,
      household_size: formHouseholdSize,
      monthly_income: formMonthlyIncome,
      has_children: formHasChildren,
      has_young_children: formHasChildren && formHasYoungChildren,
      is_pregnant: formIsPregnant,
      receives_tanf: formReceivesTanf,
      receives_ssi: formReceivesSsi,
      recently_lost_job: formRecentlyLostJob,
      income_uncertain: formIncomeUncertain,
    };
    void runExplain(profile, '__custom__');
  }, [
    formState, formHouseholdSize, formMonthlyIncome, formHasChildren,
    formHasYoungChildren, formIsPregnant, formReceivesTanf, formReceivesSsi,
    formRecentlyLostJob, formIncomeUncertain, runExplain,
  ]);

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
            Pick an example profile or build your own. We POST it to the deterministic engine and show
            the exact rule that fired for every program — including the ones it rules out, each with a reason.
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant={activeLabel === preset.label ? 'default' : 'outline'}
                size="sm"
                onClick={() => { runPreset(preset); }}
                disabled={isLoading}
                className="text-xs"
              >
                {preset.label}
              </Button>
            ))}
            <Button
              variant={showCustomForm ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowCustomForm((v) => !v)}
              disabled={isLoading}
              className="text-xs"
            >
              <UserPen className="h-3.5 w-3.5 mr-1" />
              Try it yourself
            </Button>
          </div>

          {/* Custom profile form */}
          {showCustomForm && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <UserPen className="h-4 w-4 text-primary" />
                Build a custom profile
              </div>

              {/* Row 1: State, Household, Income */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="custom-state" className="text-xs font-medium">State</Label>
                  <Select value={formState} onValueChange={setFormState}>
                    <SelectTrigger id="custom-state" className="h-9 text-sm">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s} — {STATE_NAMES[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="custom-hh" className="text-xs font-medium">Household size</Label>
                  <Input
                    id="custom-hh"
                    type="number"
                    min={1}
                    max={10}
                    value={formHouseholdSize}
                    onChange={(e) => setFormHouseholdSize(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="custom-income" className="text-xs font-medium">Monthly income ($)</Label>
                  <Input
                    id="custom-income"
                    type="number"
                    min={0}
                    step={100}
                    value={formMonthlyIncome}
                    onChange={(e) => setFormMonthlyIncome(Math.max(0, Number(e.target.value) || 0))}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {/* Row 2: Checkboxes */}
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={formHasChildren}
                    onCheckedChange={(v) => {
                      setFormHasChildren(!!v);
                      if (!v) setFormHasYoungChildren(false);
                    }}
                  />
                  Has children
                </label>
                <label className={`flex items-center gap-2 text-sm cursor-pointer ${!formHasChildren ? 'opacity-40 pointer-events-none' : ''}`}>
                  <Checkbox
                    checked={formHasYoungChildren}
                    onCheckedChange={(v) => setFormHasYoungChildren(!!v)}
                    disabled={!formHasChildren}
                  />
                  Has young children (under 5)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={formIsPregnant}
                    onCheckedChange={(v) => setFormIsPregnant(!!v)}
                  />
                  Is pregnant
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={formRecentlyLostJob}
                    onCheckedChange={(v) => setFormRecentlyLostJob(!!v)}
                  />
                  Recently lost job
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={formReceivesTanf}
                    onCheckedChange={(v) => setFormReceivesTanf(!!v)}
                  />
                  Receives TANF
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={formReceivesSsi}
                    onCheckedChange={(v) => setFormReceivesSsi(!!v)}
                  />
                  Receives SSI
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={formIncomeUncertain}
                    onCheckedChange={(v) => setFormIncomeUncertain(!!v)}
                  />
                  Income is approximate
                </label>
              </div>

              {/* Submit */}
              <Button
                onClick={runCustomProfile}
                disabled={isLoading}
                size="sm"
                className="w-full sm:w-auto"
              >
                <Search className="h-3.5 w-3.5 mr-1.5" />
                Check eligibility
              </Button>
            </div>
          )}

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
              {/* FPL threshold display */}
              {fplData && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
                  <DollarSign className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      Federal Poverty Level for a household of {fplData.household_size}
                    </p>
                    <p className="text-lg font-bold text-primary stmt-total">
                      {formatCurrency(fplData.annual_amount)}/year
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        ({formatCurrency(Math.round(fplData.annual_amount / 12))}/month)
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      2024 HHS guideline, contiguous U.S. — most programs use a percentage of this threshold.
                    </p>
                  </div>
                </div>
              )}

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

      {/* Chatbot comparison callout */}
      <Card className="card-civic">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Why deterministic eligibility matters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A generic chatbot generates plausible-sounding answers. BenefitsIQ runs auditable rules
            on your exact profile. Here is the difference for the same question: &ldquo;I lost my job
            in Georgia. I have two kids and no income. What help can I get?&rdquo;
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Generic chatbot */}
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MessageCircleWarning className="h-4 w-4 text-muted-foreground" />
                A generic chatbot
              </div>
              <div className="rounded-md bg-muted p-3 space-y-2 text-xs text-muted-foreground italic">
                <p>
                  &ldquo;I&apos;m sorry to hear about your situation. You may qualify for several
                  government assistance programs. I&apos;d recommend looking into SNAP benefits,
                  Medicaid, and possibly unemployment insurance. Each program has different
                  eligibility requirements, so I suggest contacting your local Department of Family
                  and Children Services or visiting benefits.gov for more details. You might also
                  want to check with local nonprofits in your area.&rdquo;
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">Vague</Badge>
                  <span className="text-xs text-muted-foreground">&ldquo;You may qualify&rdquo;</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">No amounts</Badge>
                  <span className="text-xs text-muted-foreground">No dollar estimates</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">Deflects</Badge>
                  <span className="text-xs text-muted-foreground">&ldquo;Contact your local office&rdquo;</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">No citations</Badge>
                  <span className="text-xs text-muted-foreground">Could be hallucinated</span>
                </div>
              </div>
            </div>

            {/* BenefitsIQ */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                BenefitsIQ
              </div>
              <div className="rounded-md bg-card p-3 space-y-2 text-xs text-foreground">
                <p className="font-semibold">
                  <span className="text-success">✓</span> SNAP: Likely eligible.
                  <span className="text-primary font-bold ml-1">$7,692/year.</span>
                </p>
                <p className="text-muted-foreground">
                  Household of 3, $0 gross monthly income is under the $2,311 limit (130% FPL).
                  Categorical: recently lost job.
                </p>
                <Separator className="my-1" />
                <p className="font-semibold">
                  <span className="text-success">✓</span> Medicaid: Likely eligible.
                </p>
                <p className="text-muted-foreground">
                  Income at 0% of FPL, below 138% threshold for GA expansion.
                </p>
                <Separator className="my-1" />
                <p className="font-semibold">
                  <span className="text-muted-foreground">✕</span> WIC: Not eligible.
                </p>
                <p className="text-muted-foreground">
                  Requires pregnancy, infant, or child under 5 — no qualifying member in profile.
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Badge variant="default" className="text-[10px]">Specific</Badge>
                  <span className="text-xs text-foreground">&ldquo;Likely eligible&rdquo; with confidence</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="default" className="text-[10px]">Dollar values</Badge>
                  <span className="text-xs text-foreground">Estimated $7,692/year for SNAP</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="default" className="text-[10px]">Shows its work</Badge>
                  <span className="text-xs text-foreground">Income vs. threshold, rule that fired</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="default" className="text-[10px]">Rules OUT too</Badge>
                  <span className="text-xs text-foreground">WIC ineligible with a specific reason</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-muted/60 p-3 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <strong>The creative insight:</strong> Most AI benefit tools try to make the LLM smarter.
              BenefitsIQ makes it irrelevant for the critical decision. The model handles language; a
              deterministic engine handles eligibility. This means <em>zero hallucinated benefits</em>,
              reproducible results, and full auditability — exactly what a government system requires.
            </p>
          </div>
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
