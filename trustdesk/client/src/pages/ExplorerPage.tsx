import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router';
import {
  Card,
  CardContent,
  Button,
  Input,
  Badge,
  Skeleton,
} from '@databricks/appkit-ui/react';
import {
  Search,
  ShieldCheck,
  Activity,
  Building2,
  AlertTriangle,
  Send,
  Sparkles,
  ArrowRight,
  Eye,
  Users,
} from 'lucide-react';
import { FacilityCard } from '../components/FacilityCard';
import type { Facility, TrustProfile } from '../lib/types';

interface StatsData {
  total_facilities: number;
  facilities_by_state?: Record<string, number>;
  facilities_by_type?: Record<string, number>;
  avg_doctors?: number | null;
  avg_beds?: number | null;
  facilities_with_website?: number;
}

interface FindingsData {
  staffing_anomalies: number;
  zero_doctors: number;
  zero_beds: number;
  no_accreditation_pct: number;
  total_facilities: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const STAR_FACILITIES = [
  {
    label: 'Shaurya Hospital — 2 doctors, 14 specialties',
    href: '/facility/fadba1a4-dae8-4917-81f3-1dffbc9ee071',
    icon: AlertTriangle,
  },
  {
    label: 'Jindal Nursing Home — 12 specialties, no equipment',
    href: '/facility/58d49f6f-42fa-4172-9e3b-8fdeb5d056cf',
    icon: AlertTriangle,
  },
  {
    label: 'Apollo Adlux — 150 doctors, NABH-accredited',
    href: '/facility/2819fe14-ac78-46f6-93de-85e65a1634ac',
    icon: ShieldCheck,
  },
];

const SEARCH_PROMPTS = [
  { label: 'Hospitals in Kerala with cardiology', icon: Activity },
  { label: 'Facilities in Bihar', icon: AlertTriangle },
  { label: 'Multispeciality clinics in Maharashtra', icon: Search },
];

export function ExplorerPage() {
  const [query, setQuery] = useState('');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [trustProfiles, setTrustProfiles] = useState<Record<string, TrustProfile>>({});
  const [stats, setStats] = useState<StatsData | null>(null);
  const [findings, setFindings] = useState<FindingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch stats and findings on mount
  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => setStats(data.stats ?? data))
      .catch(() => {});
    fetch('/api/findings')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const f = data.findings ?? data;
        if (f && typeof f.staffing_anomalies === 'number') {
          setFindings(f);
        }
      })
      .catch(() => {});
  }, []);

  const handleSearch = useCallback(
    async (searchQuery?: string) => {
      const q = searchQuery ?? query;
      if (!q.trim()) return;

      setLoading(true);
      setHasSearched(true);
      setChatMessages([]);

      try {
        // Try chat endpoint for natural language queries
        const chatRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: q }),
        });

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          if (chatData.reply) {
            setChatMessages([
              { role: 'user', content: q },
              { role: 'assistant', content: chatData.reply },
            ]);
          }
          if (chatData.facilities && Array.isArray(chatData.facilities)) {
            setFacilities(chatData.facilities);
            // Fetch trust profiles for results
            const profiles: Record<string, TrustProfile> = {};
            await Promise.allSettled(
              chatData.facilities.slice(0, 12).map(async (f: Facility) => {
                try {
                  const tpRes = await fetch('/api/trust-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ facility_id: f.id }),
                  });
                  if (tpRes.ok) {
                    const tpData = await tpRes.json();
                    profiles[f.id] = tpData.profile ?? tpData;
                  }
                } catch {
                  // skip
                }
              }),
            );
            setTrustProfiles(profiles);
            setLoading(false);
            return;
          }
        }

        // Fallback: direct search
        const searchRes = await fetch(
          `/api/facilities?q=${encodeURIComponent(q)}&page=1`,
        );
        if (searchRes.ok) {
          const data = await searchRes.json();
          const list = Array.isArray(data) ? data : data.facilities ?? [];
          setFacilities(list);

          const profiles: Record<string, TrustProfile> = {};
          await Promise.allSettled(
            list.slice(0, 12).map(async (f: Facility) => {
              try {
                const tpRes = await fetch('/api/trust-profile', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ facility_id: f.id }),
                });
                if (tpRes.ok) {
                  profiles[f.id] = await tpRes.json();
                }
              } catch {
                // skip
              }
            }),
          );
          setTrustProfiles(profiles);
        }
      } catch {
        // Handle gracefully
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  const handleQuickPrompt = (prompt: string) => {
    setQuery(prompt);
    handleSearch(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      {/* Hero section */}
      {!hasSearched && (
        <section className="relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-accent/[0.04]" />
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary/[0.05] rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-20 w-56 h-56 bg-accent/[0.05] rounded-full blur-3xl" />

          <div className="relative max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
            {/* Stats banner */}
            {stats && (
              <div className="flex items-center justify-center gap-6 mb-8">
                <StatPill
                  value={(stats.total_facilities ?? 0).toLocaleString()}
                  label="facilities"
                  icon={Building2}
                />
                <StatPill
                  value="51"
                  label="fields analyzed"
                  icon={Activity}
                />
                <StatPill
                  value={String(Object.keys(stats.facilities_by_type ?? {}).length)}
                  label="facility types"
                  icon={ShieldCheck}
                />
              </div>
            )}

            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground leading-tight tracking-tight">
              <span className="text-primary">10,000 facilities</span> claim capabilities.
              <br />
              Which claims hold up?
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Deterministic trust scoring across 7 dimensions. No AI hallucination
              — every score is explainable, every evidence item is traceable.
            </p>

            {/* Key Findings */}
            {findings && (
              <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl mx-auto text-left">
                <FindingCard
                  value={findings.staffing_anomalies.toLocaleString()}
                  description="facilities claim specialties their staffing can't support"
                  icon={Users}
                  tint="red"
                />
                <FindingCard
                  value={findings.zero_doctors.toLocaleString()}
                  description="facilities report zero doctors"
                  icon={AlertTriangle}
                  tint="red"
                />
                <FindingCard
                  value={findings.zero_beds.toLocaleString()}
                  description="facilities report zero beds"
                  icon={Building2}
                  tint="amber"
                />
                <FindingCard
                  value={`${findings.no_accreditation_pct}%`}
                  description="of facilities have no accreditation"
                  icon={ShieldCheck}
                  tint="amber"
                />
              </div>
            )}

            {/* Search input */}
            <div className="mt-10 max-w-2xl mx-auto">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-xl blur-sm opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
                <div className="relative flex items-center bg-card rounded-xl border shadow-lg">
                  <Search className="h-5 w-5 text-muted-foreground ml-4 shrink-0" />
                  <Input
                    ref={inputRef}
                    type="text"
                    placeholder="Ask anything about facility trust..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 border-0 bg-transparent text-base h-14 px-3 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleSearch()}
                    disabled={!query.trim()}
                    className="mr-2 gap-1.5"
                  >
                    <Sparkles className="h-4 w-4" />
                    Search
                  </Button>
                </div>
              </div>

              {/* Quick-start sections */}
              <div className="mt-8 space-y-4">
                {/* See It In Action */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    <Eye className="h-3 w-3 inline mr-1" />
                    See It In Action
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {STAR_FACILITIES.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          to={item.href}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-card text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-150 no-underline"
                        >
                          <Icon className="h-3 w-3" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>

                {/* Try a Search */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Try a Search
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {SEARCH_PROMPTS.map((prompt) => {
                      const Icon = prompt.icon;
                      return (
                        <button
                          key={prompt.label}
                          onClick={() => handleQuickPrompt(prompt.label)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-card text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-150"
                        >
                          <Icon className="h-3 w-3" />
                          {prompt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Compact search bar when results are showing */}
      {hasSearched && (
        <div className="sticky top-14 z-30 border-b bg-card/90 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center bg-background rounded-lg border">
                <Search className="h-4 w-4 text-muted-foreground ml-3 shrink-0" />
                <Input
                  type="text"
                  placeholder="Search facilities..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="border-0 bg-transparent h-10 text-sm px-2 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <Button
                size="sm"
                onClick={() => handleSearch()}
                disabled={!query.trim() || loading}
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                Search
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setHasSearched(false);
                  setFacilities([]);
                  setQuery('');
                  setChatMessages([]);
                }}
                className="text-xs text-muted-foreground"
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Results section */}
      {hasSearched && (
        <section className="max-w-7xl mx-auto px-6 py-6">
          {/* Chat response */}
          {chatMessages.length > 0 && (
            <Card className="mb-6 border-primary/20 bg-primary/[0.02]">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-medium text-primary">Trust Desk Analysis</p>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {chatMessages.find((m) => m.role === 'assistant')?.content}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading state */}
          {loading && (
            <div>
              <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 animate-pulse text-primary" />
                Analyzing 51 fields across 7 trust dimensions...
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <div className="flex gap-4">
                      <Skeleton className="w-[80px] h-[80px] rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-3 w-2/3" />
                        <div className="flex gap-2 pt-1">
                          <Skeleton className="h-5 w-12 rounded-full" />
                          <Skeleton className="h-5 w-12 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              </div>
            </div>
          )}

          {/* Results */}
          {!loading && facilities.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{facilities.length}</span>{' '}
                  facilities found
                </p>
                {loading && (
                  <Badge variant="outline" className="gap-1.5 text-xs animate-pulse">
                    <Sparkles className="h-3 w-3" />
                    Analyzing...
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {facilities.map((f) => {
                  const tp = trustProfiles[f.id] ?? null;
                  const insufficientCount = tp
                    ? (tp.dimensions ?? []).filter((d) => d.level === 'insufficient_data').length
                    : 0;
                  return (
                    <div key={f.id} className="space-y-0">
                      <FacilityCard
                        facility={f}
                        trustProfile={tp}
                      />
                      {tp && insufficientCount > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-1 ml-1">
                          {insufficientCount} of {tp.total_dimensions} dimension{insufficientCount !== 1 ? 's' : ''} had insufficient data
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && hasSearched && facilities.length === 0 && (
            <div className="text-center py-16">
              <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-1">No facilities found</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Try a different search query. You can search by facility name, state, district,
                or ask a natural language question.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SEARCH_PROMPTS.map((p) => (
                  <Button
                    key={p.label}
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickPrompt(p.label)}
                    className="text-xs gap-1"
                  >
                    <ArrowRight className="h-3 w-3" />
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function StatPill({
  value,
  label,
  icon: Icon,
}: {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border shadow-sm">
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-sm font-bold text-foreground tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

const FINDING_TINT_CLASSES = {
  red: 'border-red-200 bg-red-50/60 text-red-600',
  amber: 'border-amber-200 bg-amber-50/60 text-amber-600',
  blue: 'border-blue-200 bg-blue-50/60 text-blue-600',
} as const;

function FindingCard({
  value,
  description,
  icon: Icon,
  tint,
  prefix,
}: {
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: keyof typeof FINDING_TINT_CLASSES;
  prefix?: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${FINDING_TINT_CLASSES[tint]}`}>
      <Icon className="h-4 w-4 opacity-40 mb-1.5" />
      <p className="text-xl font-bold tabular-nums leading-none">
        {prefix && <span className="text-xs font-medium mr-1">{prefix}</span>}
        {value}
      </p>
      <p className="text-[11px] mt-1 leading-snug opacity-75">{description}</p>
    </div>
  );
}
