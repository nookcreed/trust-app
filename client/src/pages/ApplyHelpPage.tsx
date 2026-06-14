import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Separator,
  Textarea,
} from '@databricks/appkit-ui/react';
import { Send, BookOpen, ExternalLink, FileText } from 'lucide-react';

// Programs we have curated how-to-apply guidance for (mirrors public.apply_kb).
const PROGRAMS: Array<{ short: string; label: string }> = [
  { short: 'SNAP', label: 'SNAP (Food)' },
  { short: 'MEDICAID', label: 'Medicaid' },
  { short: 'CHIP', label: "Children's Health (CHIP)" },
  { short: 'WIC', label: 'WIC (Nutrition)' },
  { short: 'LIHEAP', label: 'Utility Relief (LIHEAP)' },
  { short: 'NSLP', label: 'School Meals' },
];

// Placeholder + example chips, tailored to the selected program (falls back to general).
interface PromptSet {
  placeholder: string;
  examples: string[];
}

const DEFAULT_PROMPTS: PromptSet = {
  placeholder: "e.g., What documents do I need for SNAP in Georgia?",
  examples: [
    'What documents do I need for SNAP in Georgia?',
    'How fast can I get emergency food assistance?',
    'Where do I apply for Medicaid for my kids?',
  ],
};

const PROGRAM_PROMPTS: Record<string, PromptSet> = {
  SNAP: {
    placeholder: 'e.g., What documents do I need to apply for SNAP?',
    examples: [
      'What documents do I need for SNAP?',
      'How fast can I get emergency (expedited) SNAP?',
      'Where do I apply for SNAP in my state?',
    ],
  },
  MEDICAID: {
    placeholder: 'e.g., How do I apply for Medicaid for my family?',
    examples: [
      'How do I apply for Medicaid?',
      'What documents does Medicaid require?',
      'How long does Medicaid approval take?',
    ],
  },
  CHIP: {
    placeholder: "e.g., How do I enroll my kids in CHIP?",
    examples: [
      'How do I enroll my kids in CHIP?',
      'What does CHIP cover?',
      'Can I apply for CHIP any time of year?',
    ],
  },
  WIC: {
    placeholder: 'e.g., How do I apply for WIC while pregnant?',
    examples: [
      'How do I apply for WIC?',
      'What can I buy with WIC benefits?',
      'What should I bring to my WIC appointment?',
    ],
  },
  LIHEAP: {
    placeholder: 'e.g., How do I get help paying my energy bill?',
    examples: [
      'How do I apply for LIHEAP?',
      'Can LIHEAP help in a heating or cooling emergency?',
      'What documents does LIHEAP need?',
    ],
  },
  NSLP: {
    placeholder: 'e.g., How do I apply for free school meals?',
    examples: [
      'How do I apply for free or reduced-price school meals?',
      'Does my child automatically qualify for school meals?',
      'When can I apply for school meal benefits?',
    ],
  },
};

interface ApplySource {
  title: string;
  source_name: string;
  source_url: string;
}

interface ApplyHelpResponse {
  answer: string;
  sources: ApplySource[];
  retrieved: number;
}

// Runtime guard for the /api/apply-help response shape.
function isApplyHelpResponse(data: unknown): data is ApplyHelpResponse {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.answer !== 'string') return false;
  if (typeof obj.retrieved !== 'number') return false;
  if (!Array.isArray(obj.sources)) return false;
  return obj.sources.every((s) => {
    if (typeof s !== 'object' || s === null) return false;
    const so = s as Record<string, unknown>;
    return (
      typeof so.title === 'string' &&
      typeof so.source_name === 'string' &&
      typeof so.source_url === 'string'
    );
  });
}

export function ApplyHelpPage() {
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyHelpResponse | null>(null);

  // Placeholder + example chips reflect the selected program (or general guidance).
  const prompts: PromptSet =
    (selectedProgram && PROGRAM_PROMPTS[selectedProgram]) || DEFAULT_PROMPTS;

  const askHelp = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/apply-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_short: selectedProgram,
          question: trimmed,
        }),
      });
      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const errBody = (await response.json()) as { error?: unknown };
          if (typeof errBody.error === 'string' && errBody.error) detail = errBody.error;
        } catch {
          // non-JSON error body — keep the status code
        }
        throw new Error(detail);
      }
      const data: unknown = await response.json();
      if (!isApplyHelpResponse(data)) {
        throw new Error('Invalid response shape from /api/apply-help');
      }
      setResult(data);
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void askHelp(question);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <header className="space-y-2 reveal">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="h-8 w-8 text-primary" />
          How to Apply
        </h1>
        <p className="text-muted-foreground">
          Ask a question about applying for a benefit. Answers are retrieved from a curated,
          cited knowledge base of official agency guidance — and every source is listed below
          so you can verify it.
        </p>
      </header>

      {/* Program picker */}
      <Card className="card-civic">
        <CardHeader>
          <CardTitle className="text-base">1. Pick a program (optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PROGRAMS.map((p) => (
              <Button
                key={p.short}
                variant={selectedProgram === p.short ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() =>
                  setSelectedProgram((cur) => (cur === p.short ? null : p.short))
                }
              >
                {p.label}
              </Button>
            ))}
          </div>
          {selectedProgram !== null && (
            <p className="text-xs text-muted-foreground mt-2">
              Filtering guidance to <span className="font-medium">{selectedProgram}</span>. Click
              again to clear.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Question input */}
      <Card className="card-civic">
        <CardHeader>
          <CardTitle className="text-base">2. Ask your question</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Textarea
              placeholder={prompts.placeholder}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              className="resize-none min-h-[60px]"
              disabled={isLoading}
            />
            <Button
              onClick={() => { void askHelp(question); }}
              disabled={isLoading || !question.trim()}
              className="self-end"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Ask</span>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {prompts.examples.map((ex) => (
              <Button
                key={ex}
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={isLoading}
                onClick={() => {
                  setQuestion(ex);
                  void askHelp(ex);
                }}
              >
                {ex}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <Card className="card-civic">
          <CardContent className="p-6 text-center text-muted-foreground">
            <div className="flex gap-1 justify-center">
              <span className="animate-bounce">●</span>
              <span className="animate-bounce delay-100">●</span>
              <span className="animate-bounce delay-200">●</span>
            </div>
            <p className="text-sm mt-2">Retrieving guidance and composing a grounded answer…</p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error !== null && !isLoading && (
        <Card className="border-destructive">
          <CardContent className="p-6 text-center text-destructive">
            Something went wrong: {error}
          </CardContent>
        </Card>
      )}

      {/* Answer */}
      {result !== null && !isLoading && (
        <Card className="card-civic border-primary/25">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary" />
                Grounded answer
              </CardTitle>
              <Badge variant="secondary">
                {result.retrieved} source{result.retrieved === 1 ? '' : 's'} retrieved
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm whitespace-pre-wrap text-foreground">{result.answer}</p>

            {result.sources.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Sources used
                  </p>
                  <ul className="space-y-2">
                    {result.sources.map((s) => (
                      <li key={`${s.title}-${s.source_url}`} className="text-sm">
                        <a
                          href={s.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary underline decoration-dotted inline-flex items-center gap-1"
                        >
                          {s.title}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <span className="text-xs text-muted-foreground"> — {s.source_name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            <Separator />
            <p className="text-xs text-muted-foreground">
              This guidance is retrieved from official agency sources. Rules vary by state —
              verify with your state agency or call <strong>211</strong> for help.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
