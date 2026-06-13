import { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  CardTitle,
  Button,
  Badge,
  Separator,
  Avatar,
  Textarea,
} from '@databricks/appkit-ui/react';
import { Send, User, Bot, TrendingUp, Users, ShieldCheck } from 'lucide-react';

// TypeScript types mirroring server contract
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

interface StatementProgram {
  short_name: string;
  name: string;
  amount: number | null;
  basis: string;
  source: string;
  confidence?: string;
  next_step?: string | null;
  apply_url?: string;
}

interface AcsContext {
  state: string;
  state_name: string;
  snap_receipt_pct: number;
  poverty_pct: number;
  source: string;
}

interface Cohort {
  label: string;
  modeled_n: number;
  apply_order: string[];
  programs_typical: string[];
  avg_processing_days: number | null;
  expedited_pct: number | null;
  source: string;
}

interface Statement {
  state: string | null;
  household_size: number | null;
  monthly_income: number | null;
  recently_lost_job: boolean;
  total: number;
  programs: StatementProgram[];
  cohort: Cohort | null;
  acs?: AcsContext | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Stats {
  families_helped: number;
  total_value: number;
}

const QUICK_START_SCENARIOS = [
  'Lost my job in Georgia, 2 kids',
  'Pregnant in California, low income',
  'Retired in Florida, $1,200/mo',
];

export function BenefitsPage() {
  const [profile, setProfile] = useState<Profile>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch stats on mount
  useEffect(() => {
    fetch('/api/stats')
      .then((res) => res.json())
      .then((data: Stats) => {
        if (data.families_helped > 0) {
          setStats(data);
        }
      })
      .catch((err) => console.error('Failed to fetch stats:', err));
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim()) return;

    const userMessage: ChatMessage = { role: 'user', content: messageText };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, message: messageText }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { reply: string; profile: Profile; statement?: Statement };
      const assistantMessage: ChatMessage = { role: 'assistant', content: data.reply };
      setMessages((prev) => [...prev, assistantMessage]);
      setProfile(data.profile);

      if (data.statement) {
        setStatement(data.statement);
      }
    } catch (err) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickStart = (scenario: string) => {
    void sendMessage(scenario);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(inputValue);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Hero */}
      <header className="text-center space-y-3 pt-2 reveal" style={{ animationDelay: '40ms' }}>
        <p className="text-[11px] uppercase tracking-[0.18em] text-primary/70 font-medium">
          AI for Good · built on Databricks
        </p>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-foreground leading-[1.05] text-balance">
          The benefits your family<br className="hidden sm:block" /> has already earned.
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Tell us your situation in plain words. We check it against real federal rules —
          no guessing — and hand you a clear Statement of Benefits.
        </p>
        {stats && (
          <p className="text-sm text-muted-foreground pt-1">
            <span className="font-semibold text-foreground">{stats.families_helped.toLocaleString()}</span>{' '}
            families helped ·{' '}
            <span className="font-semibold text-foreground">${(stats.total_value / 1000000).toFixed(1)}M</span>{' '}
            in value identified
          </p>
        )}
      </header>

      {/* Landing framing — the problem, quantified (shown before the conversation starts) */}
      {messages.length === 0 && (
        <div className="space-y-6">
          <Card className="card-civic border-primary/15 overflow-hidden reveal" style={{ animationDelay: '120ms' }}>
            <CardContent className="p-6 sm:p-7 flex items-center gap-5 sm:gap-6">
              <div className="shrink-0 text-center">
                <p className="stmt-total text-5xl text-primary leading-none">$60B</p>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-1.5">
                  every year
                </p>
              </div>
              <div className="self-stretch w-px bg-border shrink-0" />
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-foreground">
                  in U.S. government benefits goes unclaimed.
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  1 in 5 eligible families never enrolls — not because they don&apos;t qualify, but
                  because no one tells them what they&apos;ve earned. BenefitsIQ does, in plain language.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="text-center space-y-3 reveal" style={{ animationDelay: '200ms' }}>
            <p className="text-sm text-muted-foreground">
              Tell me your situation, or try one of these:
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_START_SCENARIOS.map((scenario) => (
                <Button
                  key={scenario}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickStart(scenario)}
                  className="text-xs rounded-full"
                >
                  {scenario}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chat messages */}
      {messages.length > 0 && (
        <Card className="card-civic">
          <CardContent className="p-4 space-y-4 max-h-96 overflow-y-auto">
            {messages.map((msg) => (
              <div
                key={`${msg.role}-${msg.content.slice(0, 30)}-${messages.indexOf(msg)}`}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <Bot className="h-4 w-4" />
                  </Avatar>
                )}
                <div
                  className={`rounded-lg px-4 py-2 max-w-[80%] ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
                {msg.role === 'user' && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <User className="h-4 w-4" />
                  </Avatar>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <Avatar className="h-8 w-8 shrink-0">
                  <Bot className="h-4 w-4" />
                </Avatar>
                <div className="bg-muted rounded-lg px-4 py-2">
                  <div className="flex gap-1">
                    <span className="animate-bounce">●</span>
                    <span className="animate-bounce delay-100">●</span>
                    <span className="animate-bounce delay-200">●</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </CardContent>
        </Card>
      )}

      {/* Statement of Benefits card */}
      {statement && <StatementCard statement={statement} />}

      {/* Input area */}
      <Card className="card-civic">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Textarea
              placeholder="Describe your situation... (e.g., 'I just lost my job and have 2 kids')"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="resize-none min-h-[60px]"
              disabled={isLoading}
            />
            <Button
              onClick={() => { void sendMessage(inputValue); }}
              disabled={isLoading || !inputValue.trim()}
              className="self-end"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Send message</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatementCard({ statement }: { statement: Statement }) {
  const [animatedTotal, setAnimatedTotal] = useState(0);

  // Animate total count-up
  useEffect(() => {
    const duration = 1500;
    const steps = 60;
    const increment = statement.total / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= statement.total) {
        setAnimatedTotal(statement.total);
        clearInterval(timer);
      } else {
        setAnimatedTotal(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [statement.total]);

  return (
    <Card className="card-civic border-primary/25 overflow-hidden reveal">
      {/* Certificate header band */}
      <div className="bg-primary/[0.06] border-b border-primary/15 px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="seal h-9 w-9 shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-primary/70 font-medium">
              Estimated · informational
            </p>
            <CardTitle className="font-display text-lg leading-tight">
              Statement of Benefits
            </CardTitle>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {statement.programs.length} likely
        </Badge>
      </div>

      <CardContent className="space-y-6 pt-6">
        {/* Big total */}
        <div className="text-center py-2">
          <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-2">
            Estimated annual total
          </p>
          <p className="stmt-total text-6xl text-primary">
            ${animatedTotal.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-2">per year, across the programs below</p>
        </div>

        <div className="rule-dotted" />

        {/* Program list */}
        <div className="space-y-4">
          {statement.programs.map((prog) => (
            <div key={prog.short_name} className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{prog.name}</p>
                <p className="text-xs text-muted-foreground">{prog.basis}</p>
                {prog.next_step && (
                  <p className="text-xs text-foreground/80 mt-1">{prog.next_step}</p>
                )}
                <p className="text-xs text-muted-foreground/70 mt-1">Source: {prog.source}</p>
                {prog.apply_url && (
                  <a
                    href={prog.apply_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline mt-1 inline-block"
                  >
                    How to apply →
                  </a>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="stmt-total text-base text-foreground">
                  {prog.amount !== null ? `$${prog.amount.toLocaleString()}` : 'varies'}
                </p>
                <p className="text-xs text-muted-foreground">/year</p>
              </div>
            </div>
          ))}
        </div>

        {/* Families like you panel */}
        {statement.cohort && (
          <>
            <Separator />
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" />
                Families like you
              </div>
              <p className="text-sm text-muted-foreground">
                Households like yours typically applied to{' '}
                <span className="font-medium">{statement.cohort.apply_order[0]}</span> first.
                {statement.cohort.avg_processing_days && (
                  <> Average processing: {statement.cohort.avg_processing_days} days.</>
                )}
              </p>
              <p className="text-xs text-muted-foreground/70">
                Based on {statement.cohort.source} (n={statement.cohort.modeled_n.toLocaleString()})
              </p>
            </div>
          </>
        )}

        {/* Real-world context from U.S. Census ACS (shown only once that dataset is loaded) */}
        {statement.acs && (
          <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-accent" />
              In {statement.acs.state_name}, you&apos;re far from alone
            </div>
            <p className="text-sm text-muted-foreground">
              About <span className="font-medium">{statement.acs.snap_receipt_pct}%</span> of
              households in {statement.acs.state_name} receive SNAP, and{' '}
              <span className="font-medium">{statement.acs.poverty_pct}%</span> live below the poverty
              line. Applying is common and nothing to be ashamed of.
            </p>
            <p className="text-xs text-muted-foreground/70">Source: {statement.acs.source}</p>
          </div>
        )}

        <Separator />

        {/* Disclaimer */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Estimate only</strong> — verify with your state agency. These amounts are
            modeled estimates and not guarantees.
          </p>
          <p>
            <strong>Need help now?</strong> Call or text <strong>211</strong> for urgent assistance.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
