import { createBrowserRouter, RouterProvider, useRouteError, Link } from 'react-router';
import { Layout } from './components/Layout';
import { BenefitsPage } from './pages/BenefitsPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { ApplyHelpPage } from './pages/ApplyHelpPage';
import { DataSourcesPage } from './pages/DataSourcesPage';
import { Card, CardContent, Button } from '@databricks/appkit-ui/react';
import { AlertTriangle, Home } from 'lucide-react';

function ErrorBoundary() {
  const error = useRouteError();
  return (
    <div className="max-w-xl mx-auto p-8 text-center space-y-4">
      <Card className="card-civic border-destructive/30">
        <CardContent className="p-8 space-y-4">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="font-display text-2xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </p>
          <Button variant="outline" asChild>
            <Link to="/"><Home className="h-4 w-4 mr-2" />Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function NotFound() {
  return (
    <div className="max-w-xl mx-auto p-8 text-center space-y-4">
      <Card className="card-civic">
        <CardContent className="p-8 space-y-4">
          <p className="stmt-total text-6xl text-primary">404</p>
          <h1 className="font-display text-2xl font-semibold">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist.
          </p>
          <Button variant="outline" asChild>
            <Link to="/"><Home className="h-4 w-4 mr-2" />Check your benefits</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <ErrorBoundary />,
    children: [
      { path: '/', element: <BenefitsPage /> },
      { path: '/how-it-works', element: <HowItWorksPage /> },
      { path: '/apply-help', element: <ApplyHelpPage /> },
      { path: '/data', element: <DataSourcesPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
