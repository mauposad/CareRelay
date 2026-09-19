import { useState, useMemo } from 'react';
import { useCareContext } from '../../store/CareContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, AlertTriangle, Calendar, Clock, CheckSquare, Activity, ShieldAlert } from 'lucide-react';
import { CareEventType } from '../../types';
import { formatTimeline, createNYDateISO, getNowInNY } from '../../lib/dateUtils';
import { canUser, PERMISSIONS } from '../../lib/rbac';
import { getEventRouting } from '../../store/selectors';

export function ProposedEvents() {
  const { state, confirmEvent, rejectEvent, currentPersona } = useCareContext();
  const [timeSelections, setTimeSelections] = useState<Record<string, string>>({});
  const [sharingSelections, setSharingSelections] = useState<Record<string, boolean>>({});
  
  const proposed = state.events.filter(e => e.status === 'proposed');

  const { nextFriday10, nextFriday22, tomorrow8 } = useMemo(() => {
    const daysToFriday = (5 - getNowInNY().getDay() + 7) % 7 || 7;
    return {
      nextFriday10: createNYDateISO(daysToFriday, 10),
      nextFriday22: createNYDateISO(daysToFriday, 22),
      tomorrow8: createNYDateISO(1, 8)
    };
  }, []);

  if (proposed.length === 0) return null;

  const getIcon = (type: CareEventType) => {
    switch (type) {
      case 'appointment': return <Calendar className="w-5 h-5 text-blue-500" />;
      case 'task': return <CheckSquare className="w-5 h-5 text-orange-500" />;
      case 'symptom': return <Activity className="w-5 h-5 text-red-500" />;
      case 'exercise': return <Activity className="w-5 h-5 text-green-500" />;
      default: return <CheckSquare className="w-5 h-5 text-slate-500" />;
    }
  };

  const handleConfirm = (eventId: string) => {
    confirmEvent(eventId, { 
       ...(timeSelections[eventId] ? { datetime: timeSelections[eventId] } : {}),
       sharedWithPhysician: sharingSelections[eventId] || false
    });
  };

  const canViewRaw = canUser(currentPersona.role, PERMISSIONS.VIEW_SOURCE_CONTEXT);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl">Requires Confirmation</h3>
        <span className="text-sm font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
          {proposed.length}
        </span>
      </div>
      
      <div className="grid gap-3">
        {proposed.map(event => {
          const routing = getEventRouting(event, !!sharingSelections[event.id]);
          return (
          <Card key={event.id} className="border-primary/20 shadow-sm bg-card animate-in slide-in-from-right-4 duration-300">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-4 justify-between sm:items-start">
              <div className="flex gap-3 items-start flex-1">
                <div className="p-2 bg-muted/50 rounded-lg shrink-0">
                  {getIcon(event.type)}
                </div>
                <div className="space-y-1 w-full">
                  <div className="font-medium text-foreground flex items-center gap-2">
                    {event.summary}
                    {event.type === 'symptom' && <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded uppercase font-semibold">Observation</span>}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    {event.datetime && !event.unresolvedTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeline(event.datetime)}
                      </span>
                    )}
                    {event.ownerId && (
                      <span className="capitalize text-primary">For: {event.ownerId}</span>
                    )}
                  </div>
                   {canViewRaw && <div className="text-xs text-muted-foreground/80 italic border-l-2 border-primary/30 pl-2 mt-2">
                    "{event.evidence}"
                   </div>}
                   <div className="mt-3 rounded-md bg-muted/40 p-2 text-xs space-y-1" aria-label={`Routing for ${event.summary}`}>
                     <div><strong>Receives:</strong> {routing.recipients}</div>
                     <div><strong>Does not receive:</strong> {routing.excluded}</div>
                     <div className="text-muted-foreground"><strong>Why:</strong> {routing.reason}</div>
                   </div>
                  
                  {event.unresolvedTime && (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Missing exact time. Caregiver review required.
                      </div>
                      <Select value={timeSelections[event.id] || ""} onValueChange={(v) => setTimeSelections({...timeSelections, [event.id]: v})}>
                        <SelectTrigger className="w-[200px] h-8 text-xs border-amber-200 dark:border-amber-900 focus:ring-amber-500">
                          <SelectValue placeholder="Resolve time..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={nextFriday10}>Friday at 10:00 AM</SelectItem>
                           <SelectItem value={nextFriday22}>Friday at 10:00 PM</SelectItem>
                           {event.type === 'exercise' && <SelectItem value={tomorrow8}>Morning (8:00 AM)</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {event.type === 'symptom' && canUser(currentPersona.role, PERMISSIONS.SHARE_WITH_PHYSICIAN) && (
                    <div className="mt-3 flex items-center gap-2">
                      <Button 
                         variant={sharingSelections[event.id] ? "default" : "outline"}
                         size="sm" 
                         className="h-7 text-xs px-2"
                         onClick={() => setSharingSelections(prev => ({...prev, [event.id]: !prev[event.id]}))}
                      >
                         <ShieldAlert className="w-3 h-3 mr-1" />
                          {sharingSelections[event.id] ? 'Will share with Dr. Patel' : 'Share with Dr. Patel?'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                <Button size="icon" variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => rejectEvent(event.id)}>
                  <X className="w-4 h-4" />
                </Button>
                <Button 
                  size="sm" 
                  className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90" 
                  onClick={() => handleConfirm(event.id)}
                  disabled={event.unresolvedTime && !timeSelections[event.id]}
                >
                  <Check className="w-4 h-4" />
                  Confirm
                </Button>
              </div>
            </CardContent>
          </Card>
        )})}
      </div>
    </div>
  );
}
