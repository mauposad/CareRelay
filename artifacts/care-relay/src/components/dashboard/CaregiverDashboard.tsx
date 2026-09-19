import { useCareContext } from '../../store/CareContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { MessageIngest } from './MessageIngest';
import { ProposedEvents } from './ProposedEvents';
import { Timeline } from './Timeline';
import { TaskBoard } from './TaskBoard';
import { RideBoard } from './RideBoard';
import { ROLE, canUser, PERMISSIONS } from '../../lib/rbac';
import { getRoleSpecificSummary } from '../../store/selectors';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { FileText } from 'lucide-react';

export function CaregiverDashboard() {
  const { currentPersona, state } = useCareContext();
  const canEdit = canUser(currentPersona.role, PERMISSIONS.MANAGE_MEMBERS) || canUser(currentPersona.role, PERMISSIONS.VIEW_ALL_STRUCTURED_EVENTS);
  const isViewer = currentPersona.role === ROLE.FAMILY_VIEWER;

  const roleSummary = getRoleSpecificSummary(state, currentPersona.role);

  if (isViewer) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-3xl font-serif">Care Summary</h1>
        <Card>
          <CardHeader>
            <CardTitle>Current Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground leading-relaxed">{roleSummary}</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/10 border-dashed">
          <CardHeader>
            <CardTitle className="text-lg">Roles & Access Overview (Read-only)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><strong className="text-foreground">Primary Caregiver (Sarah):</strong> Full access, confirms events, reviews clinical reports.</p>
            <p><strong className="text-foreground">Care Owner (Alex):</strong> Full access, manages settings and members.</p>
            <p><strong className="text-foreground">Family Support (John):</strong> Action-oriented, only assigned tasks and family logistics.</p>
            <p><strong className="text-foreground">Physician (Dr. Patel):</strong> Clinical observations, care tags, explicit sharing required.</p>
            <p><strong className="text-foreground">Family Viewer (Emily):</strong> Read-only concise updates. No detailed symptoms or task management.</p>
            <p><strong className="text-foreground">Elder (Margaret):</strong> Filtered simple view, separates own actionable tasks from things happening for her.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto grid lg:grid-cols-3 gap-8">
      
      {/* Main Column: Action & Timeline */}
      <div className="lg:col-span-2 space-y-8">
        
        <div className="space-y-1 mb-6">
          <h1 className="text-3xl font-serif">Care Center</h1>
          <p className="text-muted-foreground">Organizing updates for {state.profile.displayName}</p>
        </div>

        {canEdit && <MessageIngest />}
        {canEdit && (
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Have a visit summary or discharge note?</div>
                  <div className="text-sm text-muted-foreground">
                    Review a care document and carry the findings into this timeline.
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild className="shrink-0">
                <Link href="/documents">Open document intake</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        {canEdit && <ProposedEvents />}

        <RideBoard />
        
        {canUser(currentPersona.role, PERMISSIONS.VIEW_ALL_STRUCTURED_EVENTS) && <Timeline />}
      </div>

      {/* Sidebar: Tasks & Summary */}
      <div className="space-y-6">
        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Current Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground leading-relaxed">{roleSummary}</p>
          </CardContent>
        </Card>

        <TaskBoard />
      </div>

    </div>
  );
}
