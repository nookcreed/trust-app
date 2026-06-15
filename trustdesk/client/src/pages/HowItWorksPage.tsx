import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Separator,
  Skeleton,
  Input,
} from '@databricks/appkit-ui/react';
import {
  ShieldCheck,
  Brain,
  ArrowRight,
  ArrowDown,
  Scale,
  Users,
  MapPin,
  Award,
  Globe,
  FileCheck,
  GitMerge,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  XCircle,
  Zap,
  Database,
  Layers,
  TestTube2,
} from 'lucide-react';
import { TrustGauge } from '../components/TrustGauge';
import { TrustDimensionBar } from '../components/TrustDimensionBar';
import type { TrustProfile } from '../lib/types';

interface StarFacility {
  id: string;
  name: string;
  why: string;
}

const STAR_FACILITIES: StarFacility[] = [
  { id: 'fadba1a4-dae8-4917-81f3-1dffbc9ee071', name: 'Shaurya Hospital', why: '2 doctors, 19 specialties' },
  { id: '58d49f6f-42fa-4172-9e3b-8fdeb5d056cf', name: 'Dr Jindal ENT & Superspeciality', why: 'Only a stethoscope' },
  { id: '2819fe14-ac78-46f6-93de-85e65a1634ac', name: 'Apollo Adlux Hospital', why: 'Well-equipped, high trust' },
];

const DIMENSIONS_TABLE = [
  {
    key: 'claims_vs_evidence',
    label: 'Claims vs Evidence',
    weight: 0.25,
    icon: Scale,
    description: 'Do the facility\'s claimed specialties match its staffing and equipment?',
    example: '19 specialties but only 2 doctors',
  },
  {
    key: 'staffing',
    label: 'Staffing Adequacy',
    weight: 0.2,
    icon: Users,
    description: 'Does the doctor-to-specialty ratio make medical sense?',
    example: 'Surgery department with no surgeons listed',
  },
  {
    key: 'location',
    label: 'Location Verification',
    weight: 0.15,
    icon: MapPin,
    description: 'Do the coordinates actually place the facility in the claimed state/district?',
    example: 'Claims to be in Kerala, coordinates show Atlantic Ocean',
  },
  {
    key: 'accreditation',
    label: 'Accreditation Status',
    weight: 0.15,
    icon: Award,
    description: 'Is the facility accredited by NABH or state health authorities?',
    example: 'Claims NABH but not in registry',
  },
  {
    key: 'digital',
    label: 'Digital Presence',
    weight: 0.05,
    icon: Globe,
    description: 'Does the facility have a website? Is it reachable?',
    example: 'Website URL returns 404',
  },
  {
    key: 'completeness',
    label: 'Data Completeness',
    weight: 0.1,
    icon: FileCheck,
    description: 'How many required fields are actually filled in?',
    example: 'Missing bed count, doctor count, and coordinates',
  },
  {
    key: 'consistency',
    label: 'Data Consistency',
    weight: 0.1,
    icon: GitMerge,
    description: 'Do the data points tell a coherent story?',
    example: '500 beds but listed as "clinic"',
  },
];

export function HowItWorksPage() {
  const [demoProfile, setDemoProfile] = useState<TrustProfile | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [selectedStar, setSelectedStar] = useState<string>(STAR_FACILITIES[0].id);
  const [customSearch, setCustomSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string }>>([]);
  const [searching, setSearching] = useState(false);

  const loadProfile = useCallback((facilityId: string) => {
    setDemoLoading(true);
    setDemoProfile(null);
    fetch('/api/trust-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facility_id: facilityId }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const p = data.profile ?? data;
        if (p && typeof p.composite_score === 'number') {
          setDemoProfile(p);
        }
        setDemoLoading(false);
      })
      .catch(() => setDemoLoading(false));
  }, []);

  useEffect(() => {
    loadProfile(STAR_FACILITIES[0].id);
  }, [loadProfile]);

  const handleStarClick = (id: string) => {
    setSelectedStar(id);
    setSearchResults([]);
    loadProfile(id);
  };

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSearch = useCallback((query: string) => {
    setCustomSearch(query);
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      fetch(`/api/facilities?q=${encodeURIComponent(query.trim())}&limit=5`)
        .then((r) => r.json())
        .then((data) => {
          const facilities = data.facilities ?? [];
          setSearchResults(
            facilities.map((f: { id: string; facility_name: string }) => ({
              id: f.id,
              name: f.facility_name,
            })),
          );
          setSearching(false);
        })
        .catch(() => setSearching(false));
    }, 300);
  }, []);

  const handleSearchSelect = (id: string) => {
    setSelectedStar('');
    setSearchResults([]);
    setCustomSearch('');
    loadProfile(id);
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-16">
      {/* Section 1: Architecture */}
      <section className="text-center space-y-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <Badge variant="outline" className="text-xs px-3 py-1">
            Architecture
          </Badge>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground leading-tight">
            The Model reads language.{' '}
            <span className="text-primary">The Engine decides trust.</span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Trust Desk separates AI language understanding from trust scoring.
            The LLM extracts structured data; the deterministic engine applies rules.
          </p>
        </div>

        {/* Architecture diagram */}
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            {/* Input */}
            <Card className="border-2 border-dashed border-muted-foreground/20">
              <CardContent className="p-5 text-center space-y-2">
                <Database className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="font-semibold text-sm">Raw Facility Data</p>
                <p className="text-xs text-muted-foreground">
                  10K+ facilities from NHM, NABH, state registries
                </p>
              </CardContent>
            </Card>

            <div className="hidden md:flex items-center justify-center">
              <ArrowRight className="h-6 w-6 text-primary" />
            </div>
            <div className="flex md:hidden items-center justify-center">
              <ArrowDown className="h-6 w-6 text-primary" />
            </div>

            {/* LLM Layer */}
            <Card className="border-2 border-primary/30 bg-primary/[0.03]">
              <CardContent className="p-5 text-center space-y-2">
                <Brain className="h-8 w-8 text-primary mx-auto" />
                <p className="font-semibold text-sm text-primary">LLM Layer</p>
                <p className="text-xs text-muted-foreground">
                  Extracts structured data, parses specialties, normalizes text
                </p>
                <Badge variant="secondary" className="text-[10px]">
                  Language understanding only
                </Badge>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-center py-4">
            <ArrowDown className="h-6 w-6 text-primary" />
          </div>

          <Card className="border-2 border-primary bg-primary/[0.05] shadow-lg">
            <CardContent className="p-6 text-center space-y-3">
              <div className="flex items-center justify-center gap-2">
                <ShieldCheck className="h-8 w-8 text-primary" />
                <h3 className="font-display text-xl font-bold text-primary">
                  Deterministic Trust Engine
                </h3>
              </div>
              <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                Rule-based scoring with no randomness. Same input always produces the same output.
                Every score is explainable, every evidence item is traceable.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                {DIMENSIONS_TABLE.map((d) => {
                  const Icon = d.icon;
                  return (
                    <Badge key={d.key} variant="outline" className="text-[10px] gap-1">
                      <Icon className="h-3 w-3" />
                      {d.label}
                    </Badge>
                  );
                })}
                <Badge variant="outline" className="text-[10px] gap-1 border-green-300 bg-green-50 text-green-700">
                  <TestTube2 className="h-3 w-3" />
                  129 tests passing
                </Badge>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-center py-4">
            <ArrowDown className="h-6 w-6 text-primary" />
          </div>

          <Card className="border-2 border-dashed border-success/30 bg-success/[0.03]">
            <CardContent className="p-5 text-center space-y-2">
              <Layers className="h-8 w-8 text-success mx-auto" />
              <p className="font-semibold text-sm">Trust Profile</p>
              <p className="text-xs text-muted-foreground">
                Composite score + 7 dimension breakdown + flags + evidence chain
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      {/* Section 2: Seven Dimensions */}
      <section className="space-y-6">
        <div className="text-center space-y-3">
          <Badge variant="outline" className="text-xs px-3 py-1">
            Scoring Framework
          </Badge>
          <h2 className="font-display text-3xl font-bold text-foreground">
            Seven Dimensions of Trust
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Each dimension is independently scored and weighted. Together, they produce
            a composite trust score from 0 to 100.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DIMENSIONS_TABLE.map((dim) => {
            const Icon = dim.icon;
            return (
              <Card key={dim.key} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{dim.label}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                          {Math.round(dim.weight * 100)}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{dim.description}</p>
                      <p className="text-xs text-destructive/80 mt-1 italic">
                        e.g., "{dim.example}"
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* Section 3: Live Demo */}
      <section className="space-y-6">
        <div className="text-center space-y-3">
          <Badge variant="outline" className="text-xs px-3 py-1 gap-1">
            <Zap className="h-3 w-3" />
            Interactive Demo
          </Badge>
          <h2 className="font-display text-3xl font-bold text-foreground">
            Live Engine Demo
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Pick a facility or search for any of the 10,000 records — the trust engine scores it in real time.
          </p>
        </div>

        {/* Star facility buttons */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {STAR_FACILITIES.map((sf) => (
            <Button
              key={sf.id}
              variant={selectedStar === sf.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleStarClick(sf.id)}
              className="gap-1.5"
            >
              {sf.name}
              <span className="text-[10px] opacity-70">— {sf.why}</span>
            </Button>
          ))}
        </div>

        {/* Search any facility */}
        <div className="max-w-md mx-auto">
          <div className="flex gap-2">
            <Input
              placeholder="Search any facility by name..."
              value={customSearch}
              onChange={(e) => handleSearch(e.target.value)}
              className="text-sm"
            />
            {searching && (
              <div className="flex items-center px-2">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 rounded-lg border bg-background shadow-sm divide-y">
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                  onClick={() => handleSearchSelect(r.id)}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Demo result */}
        <div>
          {demoLoading ? (
            <Card className="border-primary/20">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start gap-6">
                  <Skeleton className="w-[160px] h-[160px] rounded-full shrink-0" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </CardContent>
            </Card>
          ) : demoProfile ? (
          <Card className="border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-6 mb-6">
                <TrustGauge
                  score={demoProfile.composite_score}
                  level={demoProfile.composite_level}
                  size="lg"
                />
                <div className="flex-1 space-y-2">
                  <h3 className="font-display text-xl font-bold text-foreground">
                    {demoProfile.facility_name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Scored {demoProfile.scored_dimensions} of {demoProfile.total_dimensions}{' '}
                    dimensions
                  </p>
                  {(demoProfile.flags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(demoProfile.flags ?? []).map((f, i) => (
                        <Badge
                          key={i}
                          variant={f.severity === 'critical' ? 'destructive' : 'outline'}
                          className={`text-[10px] gap-1 ${
                            f.severity === 'warning'
                              ? 'border-amber-300 bg-amber-50 text-amber-700'
                              : f.severity === 'info'
                                ? 'border-blue-300 bg-blue-50 text-blue-700'
                                : ''
                          }`}
                        >
                          <AlertCircle className="h-3 w-3" />
                          {f.message}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {(demoProfile.dimensions ?? []).map((dim) => (
                  <TrustDimensionBar key={dim.key} dimension={dim} />
                ))}
              </div>
            </CardContent>
          </Card>
          ) : (
            <Card className="border-primary/20">
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Select a facility above to see the trust engine in action.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <Separator />

      {/* Section 4: Why Not Just Ask the AI? */}
      <section className="space-y-6">
        <div className="text-center space-y-3">
          <Badge variant="outline" className="text-xs px-3 py-1">
            Why This Matters
          </Badge>
          <h2 className="font-display text-3xl font-bold text-foreground">
            Why Not Just Ask the AI?
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Generic AI */}
          <Card className="border-red-200 bg-red-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-red-700">
                <XCircle className="h-5 w-5" />
                Generic AI Response
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-white border p-4 space-y-3">
                <p className="text-sm text-muted-foreground italic">
                  "Based on the available data, this facility appears to offer a comprehensive
                  range of medical services. It lists multiple specialties and has some
                  medical staff. The facility seems to be operating in the healthcare sector
                  in Kerala. Overall, it looks like a reasonable healthcare provider."
                </p>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-red-600 font-medium">
                    No specific scores. No evidence chain. No flags. Vague and unverifiable.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trust Desk */}
          <Card className="border-green-200 bg-green-50/30 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5" />
                Trust Desk Response
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-white border p-4 space-y-3">
                <p className="text-sm text-foreground">
                  <span className="font-bold text-red-600">Score: 34/100.</span>{' '}
                  2 doctors covering 19 specialties — medically implausible.
                  Coordinates place facility in the North Atlantic Ocean, not Kerala.
                  Claims NABH accreditation but not found in registry.
                  Website returns HTTP 503.
                </p>
                <div className="space-y-1.5 pt-2 border-t">
                  <p className="text-xs font-semibold text-green-700">Every claim is verifiable:</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    Deterministic scoring engine — same input, same output
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    Evidence chain links claim to finding to source
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    Flags surface specific, actionable issues
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      {/* Section 5: Honest Uncertainty */}
      <section className="space-y-6 pb-8">
        <div className="text-center space-y-3">
          <Badge variant="outline" className="text-xs px-3 py-1">
            Design Principle
          </Badge>
          <h2 className="font-display text-3xl font-bold text-foreground">
            Honest Uncertainty
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            When a dimension cannot be scored because data is missing, Trust Desk says so.
            No invented scores. No false confidence. The system knows what it doesn't know.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <Lightbulb className="h-6 w-6 text-accent shrink-0 mt-0.5" />
                  <div className="space-y-3">
                    <p className="text-sm text-foreground leading-relaxed">
                      If a facility has no website listed, the Digital Presence dimension
                      is marked as{' '}
                      <Badge
                        variant="outline"
                        className="text-[10px] text-gray-400 bg-gray-50 ring-1 ring-gray-200 mx-0.5"
                      >
                        Insufficient Data
                      </Badge>{' '}
                      — not zero, not penalized. The composite score is recalculated using only
                      the scored dimensions, with weights renormalized.
                    </p>
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-xs font-mono text-muted-foreground">
                        scored_dimensions = 5 of 7<br />
                        renormalized_weights = remaining weights / sum(remaining weights)<br />
                        composite = weighted_average(scored_dimensions_only)
                      </p>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">
                      This means a facility scored on 5 of 7 dimensions at 80/100 each
                      gets a composite of 80 — not 57 (which is what you get if you zero
                      out missing dimensions). Honest math, honest scoring.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
