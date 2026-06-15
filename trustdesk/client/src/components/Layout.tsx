import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ShieldCheck, Search, Database } from 'lucide-react';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const NAV_ITEMS = [
  { to: '/', label: 'Explorer', icon: Search },
  { to: '/how-it-works', label: 'How It Works', icon: ShieldCheck },
  { to: '/data', label: 'Data Catalog', icon: Database },
];

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ScrollToTop />
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Brand */}
          <NavLink
            to="/"
            className="flex items-center gap-2.5 group"
          >
            <div className="relative">
              <ShieldCheck className="h-7 w-7 text-primary transition-transform group-hover:scale-110" />
              <Search className="h-3 w-3 text-primary/60 absolute -bottom-0.5 -right-0.5" />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-lg font-bold text-foreground leading-none tracking-tight">
                Trust Desk
              </span>
              <span className="text-[10px] text-muted-foreground leading-none mt-0.5 tracking-wide">
                Facility Verification Engine
              </span>
            </div>
          </NavLink>

          {/* Navigation */}
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Built on{' '}
            <span className="font-semibold text-foreground">Databricks</span>
            {' '}&middot;{' '}
            AI for Good Hackathon 2026
          </span>
          <span>
            Facility data from{' '}
            <span className="font-medium">National Health Mission</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
