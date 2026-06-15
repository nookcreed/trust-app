// Facility Trust Desk — AppKit entry point.
// Plugins: Lakebase (Postgres), Model Serving (Llama 3.3 70B), Server (Express).

import { createApp, lakebase, serving, server } from '@databricks/appkit';
import { ensureTablesExist } from './ensure-tables';
import { setupFacilitiesRoutes } from './routes/facilities';
import { setupTrustProfileRoutes } from './routes/trust-profile';
import { setupChatRoute } from './routes/chat';
import { setupStatsRoute } from './routes/stats';
import { setupCatalogRoute } from './routes/catalog';
import { setupDistrictRoute } from './routes/district-context';
import { setupPlannerNotesRoutes } from './routes/planner-notes';

createApp({
  plugins: [
    lakebase(),
    serving({
      endpoints: {
        default: { env: 'DATABRICKS_SERVING_ENDPOINT_NAME' },
      },
    }),
    server(),
  ],
  async onPluginsReady(appkit) {
    await ensureTablesExist(appkit);
    setupFacilitiesRoutes(appkit);
    setupTrustProfileRoutes(appkit);
    setupChatRoute(appkit);
    setupStatsRoute(appkit);
    setupCatalogRoute(appkit);
    setupDistrictRoute(appkit);
    setupPlannerNotesRoutes(appkit);
  },
}).catch(console.error);
