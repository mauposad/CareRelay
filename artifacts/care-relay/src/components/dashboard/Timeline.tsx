import { useState } from 'react';
import { useCareContext } from '../../store/CareContext';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Activity, ChevronDown, ChevronRight } from 'lucide-react';
import { CareEvent, NormalizedMessage } from '../../types';
import { formatTimeline } from '../../lib/dateUtils';
import { canUser, PERMISSIONS } from '../../lib/rbac';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function Timeline() {
  const { state, currentPersona, updateEventSharing } = useCareContext();
  const { events, messages } = state;
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const canViewRaw = canUser(currentPersona.role, PERMISSIONS.VIEW_SOURCE_CONTEXT);
  const canViewSymptoms = canUser(currentPersona.role, PERMISSIONS.VIEW_SYMPTOMS);
  const canShare = canUser(currentPersona.role, PERMISSIONS.SHARE_WITH_PHYSICIAN);

  // Group events by messageId for timeline grouping
  const eventsByMessage: Record<string, CareEvent[]> = {};
  events.filter(e => e.status === 'confirmed').forEach(e => {
    if (e.messageId) {
      if (!eventsByMessage[e.messageId]) eventsByMessage[e.messageId] = [];
      eventsByMessage[e.messageId].push(e);
    }
  });

  const timelineItems = messages
    .map(m => {
      const relatedEvents = eventsByMessage[m.id] || [];
      return { type: 'group' as const, message: m, events: relatedEvents, date: new Date(m.receivedAt) };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  // Filter out items John shouldn't see (he shouldn't see timeline raw/symptoms)
  // If no events he can see, and he can't view raw context, skip.
  const visibleItems = timelineItems.filter(item => {
    if (canViewRaw) return true;
    const viewableEvents = item.events.filter(e => {
      if (e.type === 'symptom' && !canViewSymptoms) return false;
      return true;
    });
    return viewableEvents.length > 0;
  });

  if (!canViewRaw && visibleItems.length === 0) {
    return <div className="space-y-4"><h3 className="font-serif text-xl">Care Timeline</h3><div className="text-muted-foreground text-sm">No activity visible for your role.</div></div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Care Timeline</h3>
      
      <div className="relative border-l-2 border-border ml-3 pl-6 space-y-6">
        {visibleItems.length === 0 && (
          <div className="text-muted-foreground text-sm">No activity yet.</div>
        )}
        
        {visibleItems.map((item) => {
          const msg = item.message;
          const relatedEvents = item.events.filter(e => e.type !== 'symptom' || canViewSymptoms);
          const isExpanded = expandedItems[msg.id];

          return (
            <div key={`group_${msg.id}`} className="relative">
              <div className="absolute -left-[31px] top-1 h-3 w-3 rounded-full bg-border border-2 border-background" />
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium capitalize">{msg.senderId}</span>
                  <span className="text-muted-foreground">{formatTimeline(item.date)}</span>
                  <Badge variant="outline" className="text-[10px] h-4 py-0 uppercase">{msg.source}</Badge>
                </div>

                {/* The structured events derived from this message */}
                {relatedEvents.length > 0 && (
                  <div className="space-y-2 mt-1">
                    {relatedEvents.map(ev => (
                      <Card key={ev.id} className="bg-primary/5 border-primary/20 shadow-sm">
                         <CardContent className="p-3 py-2 flex items-center gap-3">
                          {ev.type === 'symptom' ? <Activity className="w-4 h-4 text-primary" /> : <CheckCircle2 className="w-4 h-4 text-primary" />}
                           <div className="flex flex-col flex-1">
                            <span className="font-medium text-sm text-foreground">{ev.summary}</span>
                             <span className="text-xs text-muted-foreground">
                               {ev.type === 'appointment'
                                 ? `Scheduled: ${ev.datetime ? formatTimeline(ev.datetime) : 'time unknown'}`
                                 : `Reported: ${ev.datetime ? formatTimeline(ev.datetime) : 'time unknown'}`}
                               {ev.approvalTime ? ` • Approved: ${formatTimeline(ev.approvalTime)}` : ''}
                             </span>
                            {ev.type === 'symptom' ? (
                              <span className="text-xs text-muted-foreground capitalize">{ev.confirmedBy || 'Caregiver'} approved family-reported observation to record (not clinical verification).</span>
                            ) : (
                              <span className="text-xs text-muted-foreground capitalize">{ev.confirmedBy || 'System'} confirmed {ev.type}.</span>
                            )}
                          </div>
                           {ev.type === 'symptom' && canShare && (
                             <Button
                               type="button"
                               size="sm"
                               variant={ev.sharedWithPhysician ? 'secondary' : 'outline'}
                               onClick={() => updateEventSharing(ev.id, !ev.sharedWithPhysician)}
                               aria-pressed={!!ev.sharedWithPhysician}
                             >
                               {ev.sharedWithPhysician ? 'Shared with Dr Patel' : 'Share with Dr Patel'}
                             </Button>
                           )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* The raw evidence, expandable if authorized */}
                {canViewRaw && (
                  <div className="mt-1">
                    <button 
                      onClick={() => toggleExpand(msg.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {isExpanded ? 'Hide raw message' : 'Show raw message'}
                    </button>
                    {isExpanded && (
                      <div className="bg-muted/30 p-3 rounded-lg text-sm text-foreground mt-2 border animate-in slide-in-from-top-1">
                        {msg.body}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
