import { useEffect } from 'react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ModStoreProvider, useModStore } from '@/lib/store';
import NotFound from '@/pages/not-found';
import ModsPage from '@/pages/mods';
import SettingsPage from '@/pages/settings';
import AboutPage from '@/pages/about';
import { Shell } from '@/components/shell';

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={ModsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/about" component={AboutPage} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function ThemeLoader({ children }: { children: React.ReactNode }) {
  // Use theme from store to apply to HTML
  useModStore();
  return <>{children}</>;
}

function App() {
  return (
    <ModStoreProvider>
      <ThemeLoader>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeLoader>
    </ModStoreProvider>
  );
}

export default App;
