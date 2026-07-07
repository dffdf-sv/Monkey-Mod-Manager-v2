import React from 'react';
import { useModStore } from '@/lib/store';
import { MODS_URL } from '@/hooks/use-mods';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { Trash2, ShieldAlert, Palette, Database } from 'lucide-react';

export default function SettingsPage() {
  const { theme, setTheme, clearInstalled, installed } = useModStore();

  return (
    <div className="flex flex-col h-full overflow-hidden relative z-10">
      {/* Header */}
      <div className="px-6 py-8 border-b border-border bg-background/95 backdrop-blur z-20 flex-shrink-0">
        <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">
          SETTINGS
        </h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm">Configure your manager experience.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
        <div className="max-w-3xl mx-auto space-y-6 pb-10">
          
          {/* Appearance */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-mono text-lg">
                <Palette className="w-5 h-5 text-primary" />
                Appearance
              </CardTitle>
              <CardDescription>Customize how the app looks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
                <div>
                  <h4 className="font-medium text-foreground">Dark Mode</h4>
                  <p className="text-sm text-muted-foreground">Toggle between dark and light themes</p>
                </div>
                <Switch 
                  checked={theme === 'dark'} 
                  onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} 
                />
              </div>
            </CardContent>
          </Card>

          {/* Data Source */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-mono text-lg">
                <Database className="w-5 h-5 text-primary" />
                Mod Source
              </CardTitle>
              <CardDescription>Where the app fetches the mod list from.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Repository URL</label>
                <div className="flex items-center gap-2">
                  <Input 
                    readOnly 
                    value={MODS_URL} 
                    className="font-mono text-xs text-muted-foreground bg-muted/30 border-border/50"
                  />
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => window.open(MODS_URL, '_blank')}>
                    View
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  This URL is read-only and maintained by the community.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive/30 shadow-sm bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-mono text-lg text-destructive">
                <ShieldAlert className="w-5 h-5" />
                Danger Zone
              </CardTitle>
              <CardDescription className="text-destructive/70">Destructive actions that cannot be undone.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 rounded-lg bg-background border border-destructive/20">
                <div>
                  <h4 className="font-medium text-foreground">Clear All Installed Mods</h4>
                  <p className="text-sm text-muted-foreground">
                    Removes all {installed.length > 0 ? <span className="font-bold text-foreground">{installed.length}</span> : ''} mods from your local storage.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={installed.length === 0} className="font-mono font-bold tracking-wide">
                      <Trash2 className="w-4 h-4 mr-2" />
                      WIPE DATA
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="border-destructive/30">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove all installed mods from your library. You will need to reinstall them to use them again.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="font-mono">CANCEL</AlertDialogCancel>
                      <AlertDialogAction onClick={clearInstalled} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono font-bold">
                        YES, WIPE IT
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
