import { Badge } from '@databricks/appkit-ui/react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import type { Flag } from '../lib/types';

interface FlagBadgeProps {
  flag: Flag;
  className?: string;
}

const severityConfig = {
  critical: {
    variant: 'destructive' as const,
    icon: AlertCircle,
    className: 'animate-pulse',
  },
  warning: {
    variant: 'outline' as const,
    icon: AlertTriangle,
    className: 'border-amber-300 bg-amber-50 text-amber-700',
  },
  info: {
    variant: 'outline' as const,
    icon: Info,
    className: 'border-blue-300 bg-blue-50 text-blue-700',
  },
};

export function FlagBadge({ flag, className = '' }: FlagBadgeProps) {
  const config = severityConfig[flag.severity];
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={`gap-1 text-xs font-medium ${config.className} ${className}`}
    >
      <Icon className="h-3 w-3" />
      {flag.message}
    </Badge>
  );
}

interface FlagCountBadgesProps {
  flags: Flag[];
  className?: string;
}

export function FlagCountBadges({ flags, className = '' }: FlagCountBadgesProps) {
  const critical = flags.filter((f) => f.severity === 'critical').length;
  const warning = flags.filter((f) => f.severity === 'warning').length;
  const info = flags.filter((f) => f.severity === 'info').length;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {critical > 0 && (
        <Badge variant="destructive" className="gap-1 text-xs animate-pulse">
          <AlertCircle className="h-3 w-3" />
          {critical}
        </Badge>
      )}
      {warning > 0 && (
        <Badge
          variant="outline"
          className="gap-1 text-xs border-amber-300 bg-amber-50 text-amber-700"
        >
          <AlertTriangle className="h-3 w-3" />
          {warning}
        </Badge>
      )}
      {info > 0 && (
        <Badge variant="outline" className="gap-1 text-xs border-blue-300 bg-blue-50 text-blue-700">
          <Info className="h-3 w-3" />
          {info}
        </Badge>
      )}
    </div>
  );
}
