import { useNavigate } from 'react-router';
import { Card, CardContent, Badge } from '@databricks/appkit-ui/react';
import { Users, BedDouble, Stethoscope, MapPin } from 'lucide-react';
import { TrustGauge } from './TrustGauge';
import { FlagCountBadges } from './FlagBadge';
import type { Facility, TrustProfile } from '../lib/types';

interface FacilityCardProps {
  facility: Facility;
  trustProfile?: TrustProfile | null;
  className?: string;
}

export function FacilityCard({ facility, trustProfile, className = '' }: FacilityCardProps) {
  const navigate = useNavigate();
  const specialtiesList = facility.specialties
    ? facility.specialties.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <Card
      className={`group cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/30 hover:-translate-y-0.5 ${className}`}
      onClick={() => navigate(`/facility/${facility.id}`)}
    >
      <CardContent className="p-5">
        <div className="flex gap-4">
          {/* Trust gauge */}
          <div className="shrink-0">
            {trustProfile ? (
              <TrustGauge
                score={trustProfile.composite_score}
                level={trustProfile.composite_level}
                size="sm"
              />
            ) : (
              <div className="w-[80px] h-[80px] rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center">
                <span className="text-[10px] text-muted-foreground text-center leading-tight">
                  Not<br />scored
                </span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Name + type */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {facility.facility_name}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">
                    {facility.district}, {facility.state}
                  </span>
                </div>
              </div>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {facility.facility_type}
              </Badge>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {facility.num_doctors != null && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {facility.num_doctors} doctor{facility.num_doctors !== 1 ? 's' : ''}
                </span>
              )}
              {facility.num_beds != null && (
                <span className="flex items-center gap-1">
                  <BedDouble className="h-3 w-3" />
                  {facility.num_beds} bed{facility.num_beds !== 1 ? 's' : ''}
                </span>
              )}
              {specialtiesList.length > 0 && (
                <span className="flex items-center gap-1">
                  <Stethoscope className="h-3 w-3" />
                  {specialtiesList.length} specialt{specialtiesList.length !== 1 ? 'ies' : 'y'}
                </span>
              )}
            </div>

            {/* Flags */}
            {trustProfile && (trustProfile.flags ?? []).length > 0 && (
              <FlagCountBadges flags={trustProfile.flags} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
