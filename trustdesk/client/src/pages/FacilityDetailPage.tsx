import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@databricks/appkit-ui/react';
import {
  ArrowLeft,
  MapPin,
  Users,
  BedDouble,
  Stethoscope,
  Globe,
  AlertCircle,
  AlertTriangle,
  Info,
  Activity,
  ClipboardCheck,
  Printer,
} from 'lucide-react';
import { TrustGauge } from '../components/TrustGauge';
import { TrustDimensionBar } from '../components/TrustDimensionBar';
import { FlagBadge } from '../components/FlagBadge';
import { PlannerNotePanel } from '../components/PlannerNotePanel';
import type { Facility, TrustProfile, Flag } from '../lib/types';

interface DistrictContext {
  district: string;
  state: string;
  indicators: Record<string, string | number>;
}

export function FacilityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [facility, setFacility] = useState<Facility | null>(null);
  const [trustProfile, setTrustProfile] = useState<TrustProfile | null>(null);
  const [districtCtx, setDistrictCtx] = useState<DistrictContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    // Fetch facility
    fetch(`/api/facilities/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const f = data.facility ?? data;
        setFacility(f);
        setLoading(false);

        // Fetch district context
        if (f.state && f.district) {
          fetch(`/api/district-context/${encodeURIComponent(f.state)}/${encodeURIComponent(f.district)}`)
            .then((r) => r.json())
            .then((data) => setDistrictCtx(data.context ?? data))
            .catch(() => {});
        }
      })
      .catch(() => setLoading(false));

    // Fetch trust profile
    fetch('/api/trust-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facility_id: id }),
    })
      .then((r) => r.json())
      .then((data) => {
        setTrustProfile(data.profile ?? data);
        setProfileLoading(false);
      })
      .catch(() => setProfileLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-[200px] rounded-xl" />
          <Skeleton className="h-[200px] rounded-xl col-span-2" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!facility) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <h2 className="text-xl font-semibold text-foreground mb-2">Facility not found</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The facility you are looking for does not exist or has been removed.
        </p>
        <Link to="/" className="text-sm text-primary hover:underline">
          Back to Explorer
        </Link>
      </div>
    );
  }

  const specialtiesList = (() => {
    const raw: string[] = (facility as Record<string, unknown>).specialties_list as string[]
      ?? (facility.specialties
        ? facility.specialties.split(',').map((s) => s.trim()).filter(Boolean)
        : []);
    const seen = new Set<string>();
    return raw.filter((s) => {
      const lower = s.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
  })();

  const sortedFlags: Flag[] = trustProfile
    ? [...(trustProfile.flags ?? [])].sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      })
    : [];

  const criticalCount = sortedFlags.filter((f) => f.severity === 'critical').length;
  const warningCount = sortedFlags.filter((f) => f.severity === 'warning').length;
  const infoCount = sortedFlags.filter((f) => f.severity === 'info').length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      {/* Print-only report header */}
      <div className="print-header hidden" style={{ display: 'none' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '0.04em', margin: 0, color: '#1e293b' }}>
          FACILITY TRUST DESK
        </h1>
        <p style={{ fontSize: '14px', color: '#64748b', margin: '2px 0 0 0' }}>
          Trust Profile Report
        </p>
        <p style={{ fontSize: '16px', fontWeight: 700, margin: '8px 0 0 0', color: '#0f172a' }}>
          {facility.facility_name}
        </p>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 12px 0' }}>
          Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <hr style={{ border: 'none', borderTop: '2px solid #e2e8f0', margin: '0 0 16px 0' }} />
      </div>

      {/* Navigation bar */}
      <div className="flex items-center justify-between print:hidden" data-print-hide>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Explorer
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          className="gap-1.5"
        >
          <Printer className="h-3.5 w-3.5" />
          Download Report
        </Button>
      </div>

      {/* Header section */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
        {/* Facility info */}
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="font-display text-2xl font-bold text-foreground">
                    {facility.facility_name}
                  </h1>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="secondary">{facility.facility_type}</Badge>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {facility.district}, {facility.state}
                      {facility.pincode && ` - ${facility.pincode}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniStat
                  icon={Users}
                  label="Doctors"
                  value={facility.num_doctors != null ? facility.num_doctors.toString() : '--'}
                />
                <MiniStat
                  icon={BedDouble}
                  label="Beds"
                  value={facility.num_beds != null ? facility.num_beds.toString() : '--'}
                />
                <MiniStat
                  icon={Stethoscope}
                  label="Specialties"
                  value={specialtiesList.length.toString()}
                />
                <MiniStat
                  icon={Globe}
                  label="Website"
                  value={facility.website ? 'Yes' : 'None'}
                />
              </div>

              {/* Specialties */}
              {specialtiesList.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Claimed Specialties
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {specialtiesList.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Trust gauge */}
        <Card className="flex items-center justify-center min-w-[220px]">
          <CardContent className="p-6">
            {profileLoading ? (
              <div className="flex flex-col items-center gap-3">
                <Skeleton className="w-[160px] h-[160px] rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            ) : trustProfile ? (
              <div className="text-center space-y-3">
                <TrustGauge
                  score={trustProfile.composite_score}
                  level={trustProfile.composite_level}
                  size="lg"
                />
                <p className="text-xs text-muted-foreground">
                  Scored{' '}
                  <span className="font-semibold text-foreground">
                    {trustProfile.scored_dimensions}
                  </span>{' '}
                  of {trustProfile.total_dimensions} dimensions
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <ClipboardCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Profile unavailable</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Dimensions / Flags / District Context */}
      <Tabs defaultValue="dimensions">
        <TabsList>
          <TabsTrigger value="dimensions" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Dimensions
          </TabsTrigger>
          <TabsTrigger value="flags" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Flags
            {sortedFlags.length > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">
                {sortedFlags.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="context" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            District Health Context
          </TabsTrigger>
        </TabsList>

        {/* Dimensions */}
        <div className="print-section-header" style={{ display: 'none' }}>Trust Dimensions</div>
        <TabsContent value="dimensions" className="mt-4 space-y-3">
          {profileLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : trustProfile ? (
            (trustProfile.dimensions ?? []).map((dim, idx) => (
              <TrustDimensionBar
                key={dim.key}
                dimension={dim}
                defaultOpen={idx === 0}
              />
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Trust profile has not been generated for this facility.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Flags */}
        <div className="print-section-header" style={{ display: 'none' }}>Flags</div>
        <TabsContent value="flags" className="mt-4">
          {sortedFlags.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No flags identified.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex items-center gap-4 text-sm">
                {criticalCount > 0 && (
                  <span className="flex items-center gap-1.5 text-red-600 font-medium">
                    <AlertCircle className="h-4 w-4" />
                    {criticalCount} critical
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    {warningCount} warning{warningCount !== 1 ? 's' : ''}
                  </span>
                )}
                {infoCount > 0 && (
                  <span className="flex items-center gap-1.5 text-blue-600 font-medium">
                    <Info className="h-4 w-4" />
                    {infoCount} info
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {sortedFlags.map((flag, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 rounded-lg border p-4 ${
                      flag.severity === 'critical'
                        ? 'border-red-200 bg-red-50/80'
                        : flag.severity === 'warning'
                          ? 'border-amber-200 bg-amber-50/80'
                          : 'border-blue-200 bg-blue-50/80'
                    }`}
                  >
                    <FlagBadge flag={flag} />
                    <div className="flex-1">
                      <p
                        className={`text-sm font-medium ${
                          flag.severity === 'critical'
                            ? 'text-red-800'
                            : flag.severity === 'warning'
                              ? 'text-amber-800'
                              : 'text-blue-800'
                        }`}
                      >
                        {flag.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                        Dimension: {flag.dimension.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* District health context */}
        <div className="print-section-header" style={{ display: 'none' }}>District Health Context</div>
        <TabsContent value="context" className="mt-4">
          {districtCtx ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  NFHS-5 Health Indicators: {districtCtx.district}, {districtCtx.state}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.entries(districtCtx.indicators ?? {}).map(([key, value]) => (
                    <div key={key} className="rounded-lg border p-3 bg-muted/20">
                      <p className="text-xs text-muted-foreground capitalize mb-1">
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm font-semibold text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <MapPin className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  District health context not available for this area.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Separator />

      {/* Planner notes (hidden in print) */}
      {id && (
        <div data-print-hide className="print:hidden">
          <PlannerNotePanel facilityId={id} />
        </div>
      )}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border p-3 bg-muted/20">
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground tabular-nums">{value}</p>
      </div>
    </div>
  );
}
