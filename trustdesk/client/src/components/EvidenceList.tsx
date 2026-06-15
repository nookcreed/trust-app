import { CheckCircle, XCircle, Database } from 'lucide-react';
import type { EvidenceItem } from '../lib/types';

interface EvidenceListProps {
  items: EvidenceItem[];
  className?: string;
}

export function EvidenceList({ items, className = '' }: EvidenceListProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-2">
        No evidence items available for this dimension.
      </p>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {items.map((item, idx) => (
        <div
          key={idx}
          className={`rounded-lg border p-3 transition-colors ${
            item.supported
              ? 'border-green-200 bg-green-50/50 hover:bg-green-50'
              : 'border-red-200 bg-red-50/50 hover:bg-red-50'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 shrink-0">
              {item.supported ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Claim
                </span>
                <span className="text-sm text-foreground">{item.claim}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Finding
                </span>
                <span
                  className={`text-sm font-medium ${
                    item.supported ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {item.finding}
                </span>
              </div>
              {item.source && (
                <div className="flex items-center gap-1.5 pt-0.5">
                  <Database className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-mono">{item.source}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
