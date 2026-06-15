import { NavLink, Outlet } from 'react-router';
import { ShieldCheck, MessageSquareHeart, FileQuestion, Database } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Check benefits', icon: MessageSquareHeart, end: true },
  { to: '/how-it-works', label: 'How it works', icon: ShieldCheck, end: false },
  { to: '/apply-help', label: 'How to apply', icon: FileQuestion, end: false },
  { to: '/data', label: 'Data & sources', icon: Database, end: false },
];

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-border bg-card/70 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-1 sm:gap-2 h-16">
          <NavLink to="/" className="flex items-center gap-2 mr-2 sm:mr-5 shrink-0 group">
            <span className="seal h-8 w-8 transition-transform group-hover:-rotate-6">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="font-display text-lg font-semibold text-primary tracking-tight">
              BenefitsIQ
            </span>
          </NavLink>
          <div className="flex items-center gap-1 overflow-x-auto">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
      <main className="px-4 py-6 flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-card/50 mt-auto print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-5 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
            <p>
              <strong>BenefitsIQ</strong> provides eligibility estimates for informational purposes.
              Final determinations are made by administering agencies.
            </p>
            <p className="shrink-0">
              Need help now? Call or text <strong>211</strong>
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            Built on Databricks · AI for Good Hackathon 2026 · Data sourced from USDA FNS, CMS, HHS, U.S. Census Bureau
          </p>
        </div>
      </footer>
    </div>
  );
}
