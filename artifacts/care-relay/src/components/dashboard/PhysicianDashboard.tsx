import { useCareContext } from '../../store/CareContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import { formatTimeline } from '../../lib/dateUtils';

import { getRoleSpecificSummary } from '../../store/selectors';

export function PhysicianDashboard() {
  const { state, updateQuestionStatus, currentPersona } = useCareContext();
  const { events, questions, profile } = state;

  const roleSummary = getRoleSpecificSummary(state, currentPersona.role);

  const clinicalEvents = events.filter(e => 
    e.type === 'symptom' &&
    e.status === 'confirmed' && e.sharedWithPhysician
  ).sort((a, b) => new Date(b.datetime || Date.now()).getTime() - new Date(a.datetime || Date.now()).getTime());

  const confirmedSharedIds = new Set(clinicalEvents.map(e => e.id));
  const sourcedQuestions = questions.filter(q => confirmedSharedIds.has(q.sourceEventId));
  const pendingQuestions = sourcedQuestions.filter(q => q.status === 'awaiting_review');
  const reviewedQuestions = sourcedQuestions.filter(q => q.status !== 'awaiting_review');
  const upcomingAppointments = events
    .filter(e => e.type === 'appointment' && e.status === 'confirmed' && e.datetime && new Date(e.datetime).getTime() >= Date.now())
    .sort((a, b) => new Date(a.datetime!).getTime() - new Date(b.datetime!).getTime());

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif">Patient: {profile.displayName}</h1>
          <p className="text-muted-foreground mt-1">Clinical overview & family-reported signals</p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          Support Level {profile.supportLevel}
        </Badge>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {pendingQuestions.length > 0 && (
            <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-5 h-5" />
                  Family-reported observations for review
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingQuestions.map(q => (
                  <div key={q.id} className="bg-card p-4 rounded-lg border shadow-sm space-y-3">
                    <p className="text-foreground">{q.question}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Asked by {q.askedBy} • {formatTimeline(q.timestamp)}</span>
                      <div className="space-x-2">
                        <Button size="sm" variant="outline" onClick={() => updateQuestionStatus(q.id, 'planned_discussion')}>
                          Discuss Later
                        </Button>
                        <Button size="sm" onClick={() => updateQuestionStatus(q.id, 'acknowledged')}>
                          Acknowledge
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Clinical History & Signals
              </CardTitle>
              <CardDescription>Family-reported observations and logistics (Shared with Physician)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative border-l-2 border-border ml-3 pl-6 space-y-8">
                {clinicalEvents.map(event => (
                  <div key={event.id} className="relative">
                    <div className="absolute -left-[31px] top-1 h-3 w-3 rounded-full bg-primary/20 border-2 border-primary" />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground font-medium">
                        Reported: {event.datetime ? formatTimeline(event.datetime) : 'time unknown'}
                      </span>
                      <span className="font-medium text-foreground">{event.summary}</span>
                      <div className="bg-muted/50 p-3 rounded-md mt-2 text-sm text-muted-foreground border border-border/50">
                        Family-reported observation (not a clinical diagnosis).
                        {event.approvalTime && <div className="mt-1">Approved for sharing: {formatTimeline(event.approvalTime)}</div>}
                      </div>
                    </div>
                  </div>
                ))}
                {clinicalEvents.length === 0 && (
                  <div className="text-muted-foreground text-sm">No recent clinical signals reported.</div>
                )}
              </div>
            </CardContent>
          </Card>

           <Card>
             <CardHeader>
               <CardTitle>Appointment Context</CardTitle>
               <CardDescription>Scheduling context only; not included in clinical signals</CardDescription>
             </CardHeader>
             <CardContent className="space-y-2">
               {upcomingAppointments.length === 0 ? (
                 <p className="text-sm text-muted-foreground">No upcoming appointment is confirmed.</p>
               ) : upcomingAppointments.map(appointment => (
                 <div key={appointment.id} className="rounded-md border p-3">
                   <div className="font-medium">{appointment.summary}</div>
                   <div className="text-sm text-muted-foreground">{formatTimeline(appointment.datetime)}</div>
                 </div>
               ))}
             </CardContent>
           </Card>

          {reviewedQuestions.length > 0 && (
            <Card className="bg-muted/30 border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Reviewed Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {reviewedQuestions.map(q => (
                  <div key={q.id} className="flex justify-between items-start text-sm">
                    <span className="text-muted-foreground line-clamp-1 flex-1 mr-4">{q.question}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                      {q.status === 'acknowledged' ? 'Acknowledged by Dr. Patel' : 'To discuss at next appointment'}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="bg-card shadow-sm border-border">
            <CardHeader>
              <CardTitle>Summary of Confirmed Updates</CardTitle>
              <CardDescription>Generated from recent context</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground">{roleSummary}</p>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-sm border-border">
            <CardHeader>
              <CardTitle>Primary Care Tags</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {profile.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="capitalize">
                  {tag.replace('_', ' ')}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
