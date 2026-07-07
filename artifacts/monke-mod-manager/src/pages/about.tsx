import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Github, ExternalLink, Code2, Users, Heart } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden relative z-10">
      {/* Header */}
      <div className="px-6 py-8 border-b border-border bg-background/95 backdrop-blur z-20 flex-shrink-0 text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-[0_0_30px_rgba(45,106,79,0.4)] mb-4 text-3xl">
          🦍
        </div>
        <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">
          MONKE MOD MANAGER
        </h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-widest">Version 1.0.0-web</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
        <div className="max-w-2xl mx-auto space-y-8 pb-10">
          
          <div className="text-center space-y-4">
            <p className="text-lg text-foreground/80 leading-relaxed">
              A browser-based mod manager for Gorilla Tag. Built by fans, for fans.
              Browse, install, and manage your mods without needing a heavy desktop client.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-border/50 shadow-sm bg-card hover:border-primary/50 transition-colors">
              <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Github className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold font-mono text-lg">Mod Manager</h3>
                  <p className="text-sm text-muted-foreground mt-1">The original desktop MonkeModManager that inspired this web port.</p>
                </div>
                <Button variant="outline" className="w-full font-mono mt-auto" onClick={() => window.open('https://github.com/DeadlyKitten/MonkeModManager', '_blank')}>
                  View Source <ExternalLink className="w-3 h-3 ml-2" />
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm bg-card hover:border-primary/50 transition-colors">
              <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                  <DatabaseIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold font-mono text-lg">Mod Database</h3>
                  <p className="text-sm text-muted-foreground mt-1">The community-maintained GORILA-TAG-MODBASE repository.</p>
                </div>
                <Button variant="outline" className="w-full font-mono mt-auto" onClick={() => window.open('https://github.com/dffdf-sv/GORILA-TAG-MODBASE', '_blank')}>
                  View Modbase <ExternalLink className="w-3 h-3 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50 shadow-sm mt-8">
            <CardContent className="p-6">
              <h3 className="font-bold font-mono text-lg mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Credits & Thanks
              </h3>
              <div className="space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <Heart className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p><strong className="text-foreground">DeadlyKitten</strong> and contributors for creating the original MonkeModManager desktop app.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Code2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p><strong className="text-foreground">dffdf-sv</strong> for maintaining the open JSON modbase that powers this web version.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 text-base">🦍</div>
                  <p><strong className="text-foreground">Another Axiom</strong> for creating Gorilla Tag and giving us all a reason to swing around in VR.</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
        </div>
      </div>
    </div>
  );
}

function DatabaseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}
