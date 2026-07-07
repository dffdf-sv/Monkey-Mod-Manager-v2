import React, { useMemo, useState } from 'react';
import { useMods } from '@/hooks/use-mods';
import { useModStore } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Download, Trash2, AlertTriangle, CheckCircle2, RotateCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { motion, AnimatePresence } from 'framer-motion';

export default function ModsPage() {
  const { mods, isLoading, error, refetch } = useMods();
  const { installed, enabled, toggleInstalled, toggleEnabled } = useModStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('All');

  const categories = useMemo(() => {
    if (!mods) return ['All'];
    const cats = new Set(mods.map(m => m.category || 'Uncategorized'));
    return ['All', ...Array.from(cats)].sort();
  }, [mods]);

  const filteredMods = useMemo(() => {
    return mods.filter(mod => {
      // Tab filter
      if (activeTab !== 'All' && (mod.category || 'Uncategorized') !== activeTab) return false;
      
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          mod.name.toLowerCase().includes(q) ||
          mod.author.toLowerCase().includes(q) ||
          mod.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [mods, activeTab, searchQuery]);

  return (
    <div className="flex flex-col h-full overflow-hidden relative z-10">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border bg-background/95 backdrop-blur z-20 flex-shrink-0 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-mono tracking-tight text-foreground flex items-center gap-2">
            MOD LIST
            {!isLoading && <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary hover:bg-primary/20">{mods.length}</Badge>}
          </h1>
          <div className="relative w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search mods, authors..." 
              className="pl-9 bg-card border-border/50 focus-visible:ring-primary font-mono text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeTab === cat 
                  ? 'bg-primary text-primary-foreground shadow-md' 
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-muted/20">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <div className="text-5xl animate-spin mb-4" style={{ animationDuration: '3s' }}>🦍</div>
            <p className="font-mono text-sm animate-pulse">Fetching from modbase...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-xl font-bold mb-2">Connection Error</h3>
            <p className="text-muted-foreground mb-6 max-w-md">{error.message}</p>
            <Button onClick={refetch} variant="outline" className="gap-2">
              <RotateCw className="h-4 w-4" />
              Retry Fetch
            </Button>
          </div>
        ) : filteredMods.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <Search className="h-12 w-12 mb-4 opacity-20" />
            <p className="font-mono">No mods found matching your criteria.</p>
          </div>
        ) : (
          <ScrollArea className="h-full p-6">
            <div className="max-w-4xl mx-auto flex flex-col gap-3 pb-8">
              <AnimatePresence mode="popLayout">
                {filteredMods.map((mod, index) => {
                  const isInst = installed.includes(mod.name);
                  const isEnab = enabled.includes(mod.name);
                  
                  // Compute visual state
                  let cardStyle = "bg-card border-border hover:border-primary/50";
                  if (isInst && isEnab) cardStyle = "bg-primary/5 border-primary/30 shadow-[0_0_20px_rgba(45,106,79,0.05)]";
                  else if (isInst && !isEnab) cardStyle = "bg-muted/30 border-border/50 opacity-70 grayscale-[0.3]";

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
                      key={mod.name}
                      className={`relative flex items-center p-4 rounded-xl border transition-all ${cardStyle}`}
                    >
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-lg font-bold font-mono truncate text-foreground flex items-center gap-2">
                            {mod.name}
                            <Badge variant="outline" className="font-mono text-xs font-normal border-border/60">
                              v{mod.version}
                            </Badge>
                          </h3>
                          {isInst && isEnab && (
                            <Badge className="bg-primary hover:bg-primary text-primary-foreground font-mono text-[10px] px-1.5 py-0">ACTIVE</Badge>
                          )}
                          {isInst && !isEnab && (
                            <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 opacity-80">DISABLED</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2 pr-4">{mod.description}</p>
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                          <span className="text-foreground/70 font-medium">
                            <span className="text-muted-foreground mr-1">by</span>
                            {mod.author}
                          </span>
                          
                          <div className="w-1 h-1 rounded-full bg-border" />
                          
                          <span className="text-muted-foreground uppercase tracking-wider font-mono text-[10px]">
                            {mod.category || 'Uncategorized'}
                          </span>

                          {mod.dependencies && mod.dependencies.length > 0 && (
                            <>
                              <div className="w-1 h-1 rounded-full bg-border" />
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">Deps:</span>
                                {mod.dependencies.map(dep => {
                                  const depInstalled = installed.includes(dep);
                                  return (
                                    <Badge 
                                      key={dep} 
                                      variant="secondary" 
                                      className={`text-[10px] px-1.5 py-0 font-mono ${depInstalled ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive border-destructive/20'}`}
                                    >
                                      {dep}
                                      {!depInstalled && <AlertTriangle className="w-3 h-3 ml-1 inline" />}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-3 flex-shrink-0 w-32 border-l border-border/50 pl-4 py-1">
                        <motion.div whileTap={{ scale: 0.95 }}>
                          <Button 
                            variant={isInst ? "destructive" : "default"}
                            className={`w-full font-mono font-bold text-xs uppercase tracking-wider h-8 ${isInst ? 'bg-destructive/90 hover:bg-destructive' : 'bg-primary hover:bg-primary/90'}`}
                            onClick={() => {
                              if (!isInst && mod.download_url && mod.download_url !== 'https://github.com') {
                                const a = document.createElement('a');
                                a.href = mod.download_url;
                                a.download = mod.name.replace(/\s+/g, '_') + '.dll';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                              }
                              toggleInstalled(mod.name);
                            }}
                          >
                            {isInst ? (
                              <><Trash2 className="w-3 h-3 mr-1.5" /> Remove</>
                            ) : (
                              <><Download className="w-3 h-3 mr-1.5" /> Install</>
                            )}
                          </Button>
                        </motion.div>
                        
                        {isInst && (
                          <div className="flex items-center justify-between w-full pt-1">
                            <span className="text-xs font-mono text-muted-foreground">{isEnab ? 'Enabled' : 'Disabled'}</span>
                            <Switch 
                              checked={isEnab}
                              onCheckedChange={() => toggleEnabled(mod.name)}
                              className="data-[state=checked]:bg-primary"
                            />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
