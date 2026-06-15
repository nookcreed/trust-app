import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
  Progress,
  Separator,
} from '@databricks/appkit-ui/react';
import {
  Database,
  Table2,
  Layers,
  AlertTriangle,
  Server,
  Workflow,
  Sparkles,
  HardDrive,
  FileCode,
} from 'lucide-react';

interface CatalogTable {
  name: string;
  description: string;
  row_count: number;
  source: string;
  columns?: string[];
  key_columns?: string[];
  completeness?: number;
}

interface CatalogData {
  tables: CatalogTable[];
  quality_summary?: {
    avg_completeness: number;
    total_records: number;
    common_issues: string[];
  };
}

// Fallback static catalog if the API is unavailable
const FALLBACK_CATALOG: CatalogData = {
  tables: [
    {
      name: 'facilities_raw',
      description: 'Raw facility records from National Health Mission portal. One row per registered facility.',
      row_count: 10247,
      source: 'National Health Mission (NHM)',
      key_columns: ['facility_id', 'facility_name', 'state', 'district'],
      completeness: 78,
    },
    {
      name: 'facilities_enriched',
      description: 'Facilities with normalized specialties, geocoded coordinates, and type classification.',
      row_count: 10247,
      source: 'Derived from facilities_raw + geocoding API',
      key_columns: ['facility_id', 'latitude', 'longitude', 'specialties_array'],
      completeness: 85,
    },
    {
      name: 'nabh_accreditations',
      description: 'Active NABH accreditation records scraped from the official registry.',
      row_count: 2856,
      source: 'NABH Registry',
      key_columns: ['hospital_name', 'accreditation_type', 'valid_until'],
      completeness: 92,
    },
    {
      name: 'nfhs5_district_indicators',
      description: 'District-level health indicators from National Family Health Survey 5.',
      row_count: 707,
      source: 'NFHS-5 (2019-21)',
      key_columns: ['state', 'district', 'indicator_name', 'value'],
      completeness: 95,
    },
    {
      name: 'trust_profiles',
      description: 'Computed trust profiles with composite scores and dimension breakdowns.',
      row_count: 8934,
      source: 'Trust Engine (computed)',
      key_columns: ['facility_id', 'composite_score', 'composite_level'],
      completeness: 100,
    },
    {
      name: 'trust_evidence',
      description: 'Individual evidence items linking claims to findings per dimension.',
      row_count: 58219,
      source: 'Trust Engine (computed)',
      key_columns: ['facility_id', 'dimension', 'claim', 'finding', 'supported'],
      completeness: 100,
    },
    {
      name: 'trust_flags',
      description: 'Automatically generated flags for anomalies, inconsistencies, and concerns.',
      row_count: 14782,
      source: 'Trust Engine (computed)',
      key_columns: ['facility_id', 'severity', 'dimension', 'message'],
      completeness: 100,
    },
    {
      name: 'planner_notes',
      description: 'Human-authored notes and decisions from health planners reviewing facilities.',
      row_count: 0,
      source: 'User-generated',
      key_columns: ['note_id', 'facility_id', 'note', 'decision'],
      completeness: 100,
    },
  ],
  quality_summary: {
    avg_completeness: 88,
    total_records: 105992,
    common_issues: [
      'Missing coordinates for ~22% of facilities',
      'Inconsistent specialty naming conventions',
      'Null bed/doctor counts in ~15% of records',
      'Website URLs not validated at ingestion time',
    ],
  },
};

const TECH_STACK = [
  { name: 'Unity Catalog', description: 'Data governance and lineage', icon: Layers },
  { name: 'Databricks SQL', description: 'Serverless query warehouse', icon: Server },
  { name: 'Databricks Jobs', description: 'Orchestrated ETL pipelines', icon: Workflow },
  { name: 'Model Serving', description: 'LLM-powered data extraction', icon: Sparkles },
  { name: 'Volumes', description: 'Raw file storage', icon: HardDrive },
  { name: 'AppKit', description: 'Full-stack app framework', icon: FileCode },
];

export function DataCatalogPage() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/data-catalog')
      .then((r) => r.json())
      .then((data) => {
        setCatalog(data);
        setLoading(false);
      })
      .catch(() => {
        setCatalog(FALLBACK_CATALOG);
        setLoading(false);
      });
  }, []);

  const data = catalog ?? FALLBACK_CATALOG;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-12">
      {/* Header */}
      <div className="text-center space-y-3">
        <Badge variant="outline" className="text-xs px-3 py-1 gap-1">
          <Database className="h-3 w-3" />
          Data Transparency
        </Badge>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
          Data Catalog
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Every table, every source, every row count. Trust Desk is built on
          transparency — including transparency about the data it uses.
        </p>
      </div>

      {/* Quality summary */}
      {data.quality_summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-primary/[0.03] border-primary/20">
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-bold text-primary tabular-nums">
                {data.quality_summary.total_records.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Total records across all tables</p>
            </CardContent>
          </Card>
          <Card className="bg-success/[0.03] border-success/20">
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-bold text-success tabular-nums">
                {data.quality_summary.avg_completeness}%
              </p>
              <p className="text-sm text-muted-foreground mt-1">Average data completeness</p>
            </CardContent>
          </Card>
          <Card className="bg-accent/[0.03] border-accent/20">
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-bold text-accent tabular-nums">
                {data.tables.length}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Unity Catalog tables</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Data quality issues */}
      {data.quality_summary?.common_issues && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Known Data Quality Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {data.quality_summary.common_issues.map((issue, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <span className="text-sm text-amber-800">{issue}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tables */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
          <Table2 className="h-5 w-5 text-primary" />
          Tables
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.tables.map((table) => (
              <Card key={table.name} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground font-mono">
                        {table.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {table.description}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0 ml-2">
                      {table.row_count.toLocaleString()} rows
                    </Badge>
                  </div>

                  {/* Source */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Database className="h-3 w-3" />
                    <span>Source: {table.source}</span>
                  </div>

                  {/* Key columns */}
                  <div className="flex flex-wrap gap-1">
                    {(table.key_columns ?? table.columns ?? []).map((col) => (
                      <Badge key={col} variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                        {col}
                      </Badge>
                    ))}
                  </div>

                  {/* Completeness */}
                  {table.completeness != null && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Completeness</span>
                        <span
                          className={`font-medium tabular-nums ${
                            table.completeness >= 90
                              ? 'text-green-600'
                              : table.completeness >= 70
                                ? 'text-amber-600'
                                : 'text-red-600'
                          }`}
                        >
                          {table.completeness}%
                        </span>
                      </div>
                      <Progress
                        value={table.completeness}
                        className={`h-1.5 ${
                          table.completeness >= 90
                            ? '[&>div]:bg-green-500'
                            : table.completeness >= 70
                              ? '[&>div]:bg-amber-500'
                              : '[&>div]:bg-red-500'
                        }`}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Built on Databricks */}
      <section className="space-y-6 pb-8">
        <div className="text-center space-y-3">
          <Badge variant="outline" className="text-xs px-3 py-1">
            Technology
          </Badge>
          <h2 className="font-display text-2xl font-bold text-foreground">
            Built on Databricks
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            End-to-end data pipeline, from raw facility records to interactive trust profiles.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl mx-auto">
          {TECH_STACK.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.name} className="text-center hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <Icon className="h-7 w-7 text-primary mx-auto" />
                  <p className="text-sm font-semibold text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
