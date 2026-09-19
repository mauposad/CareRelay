import { useCareContext } from '../../store/CareContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, User, Clock, Handshake } from 'lucide-react';
import { formatElderHeader, formatDateTime, formatTimeOnly, getCareDateKey } from '../../lib/dateUtils';
import { getAcceptedRideTask } from '../../store/selectors';

export function ElderDashboard() {
  const { state, updateTaskStatus } = useCareContext();
  const { tasks, events, profile } = state;

  const now = Date.now();
  const todayKey = getCareDateKey(now);

  const todayTasks = tasks.filter(t => {
    if (t.status === 'cancelled' || t.status === 'missed') return false;
    return t.assignedTo === 'margaret' && !!t.dueAt && getCareDateKey(t.dueAt) === todayKey;
  });

  const futurePersonalTasks = tasks
    .filter(t => t.assignedTo === 'margaret' && !!t.dueAt && new Date(t.dueAt).getTime() > now && getCareDateKey(t.dueAt) !== todayKey && !['cancelled', 'missed', 'confirmed'].includes(t.status))
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());

  const happeningTasks = tasks.filter(t => {
    if (t.status === 'cancelled' || t.status === 'missed') return false;
    if (t.dueAt) {
      if (new Date(t.dueAt).getTime() < now) return false;
    }
    return t.assignedTo !== 'margaret'; // Things happening for her
  });

  const upcomingAppointments = events
    .filter(e => e.type === 'appointment' && e.status === 'confirmed' && !!e.datetime && new Date(e.datetime).getTime() >= now)
    .sort((a, b) => new Date(a.datetime!).getTime() - new Date(b.datetime!).getTime());

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-serif font-medium text-foreground">
          Hello, {profile.displayName.split(' ')[0]}
        </h1>
        <p className="text-2xl text-muted-foreground">
          {formatElderHeader(new Date())}
        </p>
      </div>

      <div className="grid gap-6">
        {/* Next Appointment */}
        {upcomingAppointments.length > 0 && (
          <Card className="bg-primary/5 border-primary/20 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl text-foreground">
                <Clock className="w-8 h-8 text-primary" />
                Next Appointment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-6 bg-card rounded-xl border shadow-sm">
                <div className="text-3xl font-medium">{upcomingAppointments[0].summary}</div>
                {upcomingAppointments[0].datetime && (
                  <div className="text-xl text-muted-foreground mt-2">
                    {formatDateTime(upcomingAppointments[0].datetime)}
                  </div>
                )}
                
                {(() => {
                  const appointment = upcomingAppointments[0];
                  // Look for the ride task for this appointment
                   const rideTask = getAcceptedRideTask(tasks, events, appointment);
                  
                  if (rideTask) {
                     const driverName = rideTask.assignedTo!;
                     return (
                        <div className="flex items-center gap-2 mt-4 text-lg text-primary font-medium">
                          <Handshake className="w-5 h-5" />
                           {driverName.charAt(0).toUpperCase()}{driverName.slice(1)} is taking you.
                        </div>
                     );
                  } else if (appointment.ownerId) {
                     return (
                      <div className="flex items-center gap-2 mt-4 text-lg text-primary">
                        <User className="w-5 h-5" />
                        {appointment.ownerId.charAt(0).toUpperCase() + appointment.ownerId.slice(1)} will drive you.
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Things happening for Margaret */}
        {happeningTasks.length > 0 && (
          <Card className="bg-muted/10 border-dashed border-border/50">
            <CardHeader>
              <CardTitle className="text-xl font-serif text-muted-foreground">Things happening for you</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {happeningTasks.map(task => (
                 <div key={task.id} className="flex flex-col p-4 rounded-xl bg-card/50 border border-border/50">
                    <div className="text-xl font-medium">{task.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                       {task.dueAt && <div className="text-md text-muted-foreground">{formatDateTime(task.dueAt)}</div>}
                       {task.assignedTo && <div className="text-sm font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{task.assignedTo.charAt(0).toUpperCase()}{task.assignedTo.slice(1)}</div>}
                      {task.acceptedAt && <span className="text-sm text-secondary flex items-center gap-1"><Handshake className="w-3 h-3"/> confirmed</span>}
                    </div>
                 </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Daily Plan / Tasks (Things Margaret can do) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-serif">Today's Plan</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {todayTasks.length === 0 ? (
              <div className="text-center p-8 text-xl text-muted-foreground bg-muted/30 rounded-xl">
                All caught up for today.
              </div>
            ) : (
              todayTasks.map(task => (
                <div key={task.id} className={`flex items-center justify-between p-6 rounded-xl border ${task.status === 'confirmed' ? 'bg-muted/50 border-muted' : 'bg-card shadow-sm border-border'}`}>
                  <div className="space-y-1">
                    <div className="text-2xl font-medium">{task.title}</div>
                    {task.dueAt && <div className="text-lg text-muted-foreground">{formatTimeOnly(task.dueAt)}</div>}
                  </div>
                  {task.status === 'confirmed' ? (
                    <div className="flex flex-col items-center text-secondary">
                      <CheckCircle2 className="w-10 h-10 mb-1" />
                      <span className="text-sm font-medium">Done</span>
                    </div>
                  ) : (
                    <Button 
                      size="lg" 
                      onClick={() => updateTaskStatus(task.id, 'confirmed')}
                      className="h-16 px-8 text-xl rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                    >
                      Mark Complete
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {futurePersonalTasks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-serif">Coming Up</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {futurePersonalTasks.map(task => (
                <div key={task.id} className="p-4 rounded-xl border bg-card">
                  <div className="text-xl font-medium">{task.title}</div>
                  <div className="text-md text-muted-foreground">{formatDateTime(task.dueAt)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
