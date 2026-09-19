import { useCareContext } from '../store/CareContext';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ShieldCheck, HeartHandshake, Clock, Settings2 } from 'lucide-react';
import { PERSONAS } from '../lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  const { setPersona, resetDemo } = useCareContext();

  return (
    <div className="max-w-5xl mx-auto space-y-16 py-8">
      {/* Hero */}
      <div className="text-center space-y-6">
        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-4">
          <HeartHandshake className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-5xl md:text-7xl font-serif font-medium tracking-tight text-foreground">
          One conversation in.<br/>
          <span className="text-muted-foreground italic font-normal">The right care out.</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-sans">
          Import a family update or a care document. CareRelay structures it, and you confirm what each person needs to know.
        </p>
      </div>

      {/* Value Props */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="bg-card border-none shadow-sm ring-1 ring-border/50">
          <CardHeader>
            <Clock className="w-6 h-6 text-primary mb-2" />
            <CardTitle>Chat &amp; Document Import</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Paste a chat excerpt, try a sample voice transcript, or upload a visit summary. Live messaging and recording are not connected; everything else runs the real extraction pipeline.
          </CardContent>
        </Card>
        
        <Card className="bg-card border-none shadow-sm ring-1 ring-border/50">
          <CardHeader>
            <ShieldCheck className="w-6 h-6 text-primary mb-2" />
            <CardTitle>Role-based Privacy</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Preview role-filtered views: clinical observations for the physician, assigned tasks for helpers, and a simple daily plan for Margaret. Demo roles are not production authentication.
          </CardContent>
        </Card>
        
        <Card className="bg-card border-none shadow-sm ring-1 ring-border/50">
          <CardHeader>
            <Settings2 className="w-6 h-6 text-primary mb-2" />
            <CardTitle>Safe Orchestration</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Extraction proposes care events with the source quote attached. A person resolves missing details and confirms before any reminder is created.
          </CardContent>
        </Card>
      </div>

      {/* Demo Entry */}
      <div className="bg-muted/40 rounded-3xl p-8 md:p-12 border border-border text-center space-y-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-serif">Enter the Demo</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Experience how the same information adapts to different roles. Select a persona to view their unique dashboard.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto text-left">
          {PERSONAS.map(persona => (
            <Link 
              key={persona.id} 
              href="/dashboard"
              onClick={() => setPersona(persona.id)}
              className="group flex flex-col p-5 bg-card hover:bg-accent/50 hover:border-accent rounded-xl border border-border transition-all"
            >
              <span className="font-medium text-foreground group-hover:text-accent-foreground">{persona.name}</span>
              <span className="text-sm text-muted-foreground mt-1">{persona.title}</span>
            </Link>
          ))}
        </div>
        
        <div className="pt-8">
          <Button variant="ghost" onClick={() => { if (window.confirm('Replace locally saved imports, tasks, and changes with the demo defaults?')) resetDemo(); }} className="text-muted-foreground">
            Reset Demo Data to Default
          </Button>
        </div>
      </div>
    </div>
  );
}
