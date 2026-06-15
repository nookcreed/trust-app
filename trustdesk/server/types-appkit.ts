// Shared AppKit type interface for Facility Trust Desk routes.

import type { Application } from 'express';

export interface AppKitLike {
  lakebase: {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  serving: (alias: 'default') => {
    invoke: (body: Record<string, unknown>) => Promise<unknown>;
  };
  server: { extend(fn: (app: Application) => void): void };
}
