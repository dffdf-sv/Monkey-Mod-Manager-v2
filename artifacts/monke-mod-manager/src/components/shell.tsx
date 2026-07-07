import React from 'react';
import { Link, useLocation } from 'wouter';
import { Wrench, Settings, Info, Sun, Moon } from 'lucide-react';
import { useModStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useModStore();

  const navItems = [
    { label: 'Mods', path: '/', icon: Wrench },
    { label: 'Settings', path: '/settings', icon: Settings },
    { label: 'About', path: '/about', icon: Info },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
      {/* Sidebar */}
      <div className="w-[240px] flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
        {/* Brand */}
        <div className="h-16 flex items-center px-4 font-mono font-bold text-lg tracking-tight text-sidebar-foreground border-b border-border">
          <div className="mr-3 w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center shadow-[0_0_15px_rgba(45,106,79,0.3)]">
            🦍
          </div>
          <span className="truncate">MONKE MODS</span>
        </div>

        {/* Nav Links */}
        <ScrollArea className="flex-1 py-4">
          <div className="px-3 space-y-1">
            {navItems.map((item) => {
              const active = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors font-medium text-sm ${
                    active 
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm' 
                      : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                  }`}
                >
                  <item.icon className={`h-4 w-4 ${active ? 'text-primary' : ''}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer actions */}
        <div className="p-4 border-t border-border flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">v1.0.0</span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
        {/* Grain/noise texture overlay for raw vibe */}
        <div 
          className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05] z-50 mix-blend-overlay"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
        ></div>
        {children}
      </div>
    </div>
  );
}
