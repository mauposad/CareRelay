import { type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useCareContext } from '../../store/CareContext';
import { PERSONAS, canUser, PERMISSIONS } from '../../lib/rbac';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Settings, FileText } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'wouter';

export function AppLayout({ children }: { children: ReactNode }) {
  const { currentPersona, setPersona, resetDemo } = useCareContext();
  const [location] = useLocation();
  const scopeByRole: Record<string, string> = {
    PRIMARY_CAREGIVER: 'reviews all care updates',
    CARE_OWNER: 'manages the care circle',
    FAMILY_SUPPORT: 'sees John’s assigned logistics',
    FAMILY_VIEWER: 'sees Emily’s concise read-only summary',
    PHYSICIAN: 'sees Dr. Patel’s shared observations',
    ELDER: 'sees Margaret’s personal plan'
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/20">
      <header className="sticky top-0 z-40 w-full border-b bg-card/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="size-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
              </div>
              <span className="font-serif font-semibold text-xl tracking-tight text-foreground hidden sm:inline-block">CareRelay</span>
            </Link>
            
            {location !== '/' && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground hidden md:inline-block">Demo Role Switcher:</span>
                <Select value={currentPersona.id} onValueChange={(val) => setPersona(val as any)}>
                  <SelectTrigger className="w-[180px] h-9 bg-muted/50 border-0">
                    <SelectValue placeholder="Select persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSONAS.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} <span className="text-muted-foreground text-xs ml-1">({p.title})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {location !== '/' && (
              <div className="hidden lg:block text-xs text-muted-foreground border-l pl-4">
                <strong className="text-foreground">{currentPersona.name}</strong> · {scopeByRole[currentPersona.role]}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {location !== '/' && (
              <Button variant="ghost" size="sm" asChild className="hidden sm:flex">
                <Link href="/">Overview</Link>
              </Button>
            )}
            {location !== '/' && canUser(currentPersona.role, PERMISSIONS.VIEW_ALL_STRUCTURED_EVENTS) && (
              <Button variant={location === '/documents' ? 'secondary' : 'ghost'} size="sm" asChild>
                <Link href="/documents" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">Documents</span>
                </Link>
              </Button>
            )}
            {currentPersona.role === 'CARE_OWNER' && location !== '/settings' && location !== '/' && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings" className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Settings</span>
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      
      {/* Disclaimer Banner for Clinical Safety */}
      <div className="bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs py-2 px-4 flex items-center justify-center gap-2 text-center border-b border-amber-200 dark:border-amber-900/50">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span>CareRelay is a coordination tool, not a medical device. For emergencies, contact local emergency services. Demo personalization is for preview only, not production security or authentication.</span>
      </div>

      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
