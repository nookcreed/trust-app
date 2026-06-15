import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Badge,
  Progress,
} from '@databricks/appkit-ui/react';
import { AlertCircle, AlertTriangle, Info, Database } from 'lucide-react';
import { EvidenceList } from './EvidenceList';
import { TRUST_LEVEL_CONFIG } from '../lib/types';
import type { DimensionScore } from '../lib/types';

interface TrustDimensionBarProps {
  dimension: DimensionScore;
  defaultOpen?: boolean;
}

function progressColor(level: DimensionScore['level']): string {
  switch (level) {
    case 'high':
      return '[&>div]:bg-green-500';
    case 'moderate':
      return '[&>div]:bg-amber-500';
    case 'low':
      return '[&>div]:bg-red-500';
    case 'insufficient_data':
      return '[&>div]:bg-gray-300';
  }
}

export function TrustDimensionBar({ dimension, defaultOpen = false }: TrustDimensionBarProps) {
  const config = TRUST_LEVEL_CONFIG[dimension.level] ?? TRUST_LEVEL_CONFIG.insufficient_data;
  const flags = dimension.flags ?? [];
  const flagCounts = {
    critical: flags.filter((f) => f.severity === 'critical').length,
    warning: flags.filter((f) => f.severity === 'warning').length,
    info: flags.filter((f) => f.severity === 'info').length,
  };

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={defaultOpen ? dimension.key : undefined}
    >
      <AccordionItem value={dimension.key} className="border rounded-lg px-4 bg-card">
        <AccordionTrigger className="py-3 hover:no-underline">
          <div className="flex items-center gap-3 w-full mr-3">
            {/* Label + weight */}
            <div className="flex items-center gap-2 min-w-[180px]">
              <span className="text-sm font-semibold text-foreground">
                {dimension.label}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                {Math.round(dimension.weight * 100)}%
              </Badge>
            </div>

            {/* Progress bar */}
            <div className="flex-1 max-w-[280px]">
              {dimension.available ? (
                <Progress
                  value={dimension.score}
                  className={`h-2.5 bg-gray-100 ${progressColor(dimension.level)}`}
                />
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Database className="h-3 w-3" />
                  <span>No data available</span>
                </div>
              )}
            </div>

            {/* Score + level */}
            <div className="flex items-center gap-2 min-w-[120px] justify-end">
              {dimension.available && (
                <span className={`text-sm font-bold tabular-nums ${config.color}`}>
                  {dimension.score}/100
                </span>
              )}
              <Badge
                variant="outline"
                className={`text-[10px] ${config.color} ${config.bg} ${config.ring} ring-1`}
              >
                {config.label}
              </Badge>
            </div>

            {/* Flag counts */}
            <div className="flex items-center gap-1 min-w-[60px]">
              {flagCounts.critical > 0 && (
                <span className="flex items-center gap-0.5 text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span className="text-xs font-bold">{flagCounts.critical}</span>
                </span>
              )}
              {flagCounts.warning > 0 && (
                <span className="flex items-center gap-0.5 text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-xs font-bold">{flagCounts.warning}</span>
                </span>
              )}
              {flagCounts.info > 0 && (
                <span className="flex items-center gap-0.5 text-blue-600">
                  <Info className="h-3.5 w-3.5" />
                  <span className="text-xs font-bold">{flagCounts.info}</span>
                </span>
              )}
            </div>
          </div>
        </AccordionTrigger>

        <AccordionContent className="pb-4">
          <div className="space-y-4 pt-2">
            {/* Flags */}
            {flags.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Flags
                </h4>
                <div className="space-y-1.5">
                  {flags.map((flag, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
                        flag.severity === 'critical'
                          ? 'bg-red-50 text-red-800 border border-red-200'
                          : flag.severity === 'warning'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {flag.severity === 'critical' ? (
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      ) : flag.severity === 'warning' ? (
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      ) : (
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                      )}
                      <span>{flag.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Evidence ({dimension.evidence.length} items)
              </h4>
              <EvidenceList items={dimension.evidence} />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
