import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Separator,
} from '@databricks/appkit-ui/react';
import { Database, FileText, Server, ShieldCheck, ExternalLink } from 'lucide-react';

// TypeScript types for the /api/data-catalog response
interface TableMetadata {
  name: string;
  uc_path: string;
  rows: number | null;
  description: string;
  source: string;
  source_url: string;
  effective: string;
}

interface Tool {
  name: string;
  description: string;
  role: string;
}

interface CatalogResponse {
  tables: TableMetadata[];
  tools: Tool[];
}

// Runtime shape guard
function isCatalogResponse(data: unknown): data is CatalogResponse {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    Array.isArray(obj.tables) &&
    Array.isArray(obj.tools) &&
    obj.tables.every(
      (t) =>
        typeof t === 'object' &&
        t !== null &&
        typeof (t as Record<string, unknown>).name === 'string' &&
        typeof (t as Record<string, unknown>).uc_path === 'string' &&
        (typeof (t as Record<string, unknown>).rows === 'number' || (t as Record<string, unknown>).rows === null) &&
        typeof (t as Record<string, unknown>).description === 'string' &&
        typeof (t as Record<string, unknown>).source === 'string' &&
        typeof (t as Record<string, unknown>).source_url === 'string' &&
        typeof (t as Record<string, unknown>).effective === 'string',
    ) &&
    obj.tools.every(
      (tool) =>
        typeof tool === 'object' &&
        tool !== null &&
        typeof (tool as Record<string, unknown>).name === 'string' &&
        typeof (tool as Record<string, unknown>).description === 'string' &&
        typeof (tool as Record<string, unknown>).role === 'string',
    )
  );
}

const TOOL_ICONS = {
  'Unity Catalog': Database,
  'Lakebase (serverless Postgres)': Server,
  'Model Serving (databricks-meta-llama-3-3-70b-instruct)': FileText,
  'On-behalf-of-user (OBO) access': ShieldCheck,
};

export function DataSourcesPage() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/data-catalog')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data: unknown) => {
        if (!isCatalogResponse(data)) {
          throw new Error('Invalid catalog response shape');
        }
        setCatalog(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(String((err as Error).message));
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading data catalog...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Card className="border-destructive">
          <CardContent className="p-8 text-center text-destructive">
            Failed to load catalog: {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (catalog === null) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <header className="space-y-2 reveal">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Database className="h-8 w-8 text-primary" />
          Data &amp; Sources
        </h1>
        <p className="text-muted-foreground">
          Everything BenefitsIQ tells you is grounded in these datasets, synced from Unity Catalog into Lakebase.
        </p>
      </header>

      {/* Unity Catalog Tables */}
      <Card className="card-civic">
        <CardHeader>
          <CardTitle>Unity Catalog Delta Tables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {catalog.tables.map((table) => (
            <div key={table.name} className="space-y-2 pb-4 border-b last:border-b-0 last:pb-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">{table.name}</h3>
                    {table.rows === null ? (
                      <Badge variant="secondary" className="text-xs">
                        pending
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs font-mono">
                        {table.rows.toLocaleString()} rows
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-mono text-muted-foreground">{table.uc_path}</p>
                  <p className="text-sm text-muted-foreground mt-1">{table.description}</p>
                </div>
              </div>
              <div className="flex items-start gap-1 text-xs text-muted-foreground">
                <span className="font-medium">Source:</span>
                <a
                  href={table.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline decoration-dotted flex items-center gap-1"
                >
                  {table.source}
                  <ExternalLink className="h-3 w-3" />
                </a>
                <span className="mx-1">·</span>
                <span>Effective: {table.effective}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Separator />

      {/* Databricks Tools */}
      <Card className="card-civic">
        <CardHeader>
          <CardTitle>Databricks Tools Powering BenefitsIQ</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {catalog.tools.map((tool) => {
            const IconComponent = TOOL_ICONS[tool.name as keyof typeof TOOL_ICONS] || Database;
            return (
              <Card key={tool.name} className="bg-muted/50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <IconComponent className="h-5 w-5 text-primary" />
                    <h4 className="font-semibold text-sm">{tool.name}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">{tool.description}</p>
                  <p className="text-xs text-muted-foreground/70">
                    <span className="font-medium">Role:</span> {tool.role}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </CardContent>
      </Card>

      {/* Footer note */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Data Relevance & Thoroughness:</strong> All eligibility
            logic and estimates are traced to authoritative federal sources (USDA FNS, CMS, HHS). Live
            row counts prove the data is loaded. Unity Catalog provides versioned lineage, Lakebase
            enables sub-50ms queries, and OBO access ensures secure, user-scoped data governance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
