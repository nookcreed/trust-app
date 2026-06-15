import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Textarea,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
  Separator,
} from '@databricks/appkit-ui/react';
import { StickyNote, Send, Clock, CheckCircle, Flag, Pause } from 'lucide-react';
import { DIMENSION_LABELS } from '../lib/types';
import type { PlannerNote } from '../lib/types';

interface PlannerNotePanelProps {
  facilityId: string;
  className?: string;
}

const DECISION_OPTIONS = [
  { value: 'flag', label: 'Flag for Review', icon: Flag, color: 'text-red-600' },
  { value: 'approve', label: 'Approve', icon: CheckCircle, color: 'text-green-600' },
  { value: 'defer', label: 'Defer Decision', icon: Pause, color: 'text-amber-600' },
];

export function PlannerNotePanel({ facilityId, className = '' }: PlannerNotePanelProps) {
  const [notes, setNotes] = useState<PlannerNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [noteText, setNoteText] = useState('');
  const [dimension, setDimension] = useState<string>('');
  const [decision, setDecision] = useState<string>('');

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/planner-notes/${facilityId}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(Array.isArray(data) ? data : data.notes ?? []);
      }
    } catch {
      // Silently handle — notes are optional
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleSubmit = async () => {
    if (!noteText.trim()) return;
    setSubmitting(true);

    try {
      const body: Record<string, string> = {
        facility_id: facilityId,
        note: noteText.trim(),
      };
      if (dimension) body.dimension = dimension;
      if (decision) body.decision = decision;

      const res = await fetch('/api/planner-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setNoteText('');
        setDimension('');
        setDecision('');
        await fetchNotes();
      }
    } catch {
      // Silently handle
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <StickyNote className="h-4 w-4 text-primary" />
          Planner Notes
          {notes.length > 0 && (
            <Badge variant="secondary" className="text-[10px] ml-1">
              {notes.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add note form */}
        <div className="space-y-3 rounded-lg border border-dashed border-primary/20 p-3 bg-primary/[0.02]">
          <Textarea
            placeholder="Add a note about this facility..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            className="resize-none text-sm"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={dimension} onValueChange={setDimension}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Dimension (optional)" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DIMENSION_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={decision} onValueChange={setDecision}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Decision (optional)" />
              </SelectTrigger>
              <SelectContent>
                {DECISION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex-1" />

            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!noteText.trim() || submitting}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {submitting ? 'Saving...' : 'Save Note'}
            </Button>
          </div>
        </div>

        <Separator />

        {/* Notes list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 italic">
            No notes yet. Add a note above to start documenting your analysis.
          </p>
        ) : (
          <ScrollArea className="max-h-[320px]">
            <div className="space-y-2 pr-3">
              {notes.map((note) => {
                const decisionOpt = DECISION_OPTIONS.find((d) => d.value === note.decision);
                const DecisionIcon = decisionOpt?.icon;

                return (
                  <div
                    key={note.id}
                    className="rounded-lg border p-3 space-y-1.5 bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatDate(note.created_at)}</span>
                      {note.dimension && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {DIMENSION_LABELS[note.dimension] ?? note.dimension}
                        </Badge>
                      )}
                      {decisionOpt && DecisionIcon && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 gap-0.5 ${decisionOpt.color}`}
                        >
                          <DecisionIcon className="h-3 w-3" />
                          {decisionOpt.label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{note.note}</p>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
