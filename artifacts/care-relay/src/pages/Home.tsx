import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ShieldCheck, HeartHandshake, Clock, Settings2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '../store/AuthContext';

export default function Home() {
  const { user, circles } = useAuth();

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
          Coordinate care securely with the people in your care circles. Each view is shaped by your membership and assistance tier.
        </p>
      </div>

      {/* Value Props */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="bg-card border-none shadow-sm ring-1 ring-border/50">
          <CardHeader>
            <Clock className="w-6 h-6 text-primary mb-2" />
            <CardTitle>Document Preview</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Authorized primary users and caretakers can preview extracted document findings. Preview selections are temporary and are not saved to the care record.
          </CardContent>
        </Card>
        
        <Card className="bg-card border-none shadow-sm ring-1 ring-border/50">
          <CardHeader>
            <ShieldCheck className="w-6 h-6 text-primary mb-2" />
            <CardTitle>Role-based Privacy</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Role-based privacy keeps clinical records and source messages limited to authorized members.
          </CardContent>
        </Card>
        
        <Card className="bg-card border-none shadow-sm ring-1 ring-border/50">
          <CardHeader>
            <Settings2 className="w-6 h-6 text-primary mb-2" />
            <CardTitle>Safe Orchestration</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Server-backed care records follow your circle’s role and assistance-tier permissions. Document previews do not create records, approval requests, or reminders.
          </CardContent>
        </Card>
      </div>

      {/* Authenticated entry */}
      <div className="bg-muted/40 rounded-3xl p-8 md:p-12 border border-border text-center space-y-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-serif">{user ? `Welcome, ${user.displayName}` : "Your care circles"}</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            {user ? "Open an authorized circle to continue." : "Sign in to access the care circles you belong to."}
          </p>
        </div>
        {user ? circles.length > 0 ? <Link href="/dashboard"><Button data-testid="button-open-dashboard">Open dashboard</Button></Link> : <p className="text-sm text-muted-foreground" data-testid="status-no-circles">You have not been added to a care circle yet.</p> : <Link href="/dashboard"><Button data-testid="button-sign-in">Sign in to continue</Button></Link>}
      </div>
    </div>
  );
}
