import { useCareContext } from '../../store/CareContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Check, Clock, XCircle, RotateCcw, UserPlus, Handshake } from 'lucide-react';
import { CareTask } from '../../types';
import { ROLE } from '../../lib/rbac';
import { formatTimeline } from '../../lib/dateUtils';

export function TaskBoard() {
  const { state, currentPersona, updateTaskStatus } = useCareContext();
  
  const tasks = state.tasks.filter(t => t.status !== 'cancelled');
  
  const isSupport = currentPersona.role === ROLE.FAMILY_SUPPORT;
  const myTasks = tasks.filter(t => t.assignedTo === currentPersona.id);
  const otherTasks = isSupport ? [] : tasks.filter(t => t.assignedTo !== currentPersona.id);

  const TaskCard = ({ task, isMine }: { task: CareTask, isMine: boolean }) => {
    const isCompleted = task.status === 'confirmed';
    const isAccepted = !!task.acceptedAt;

    return (
      <div className={`p-3 rounded-lg border ${isCompleted ? 'bg-muted/30 border-muted opacity-60' : 'bg-card border-border shadow-sm'} flex items-start justify-between gap-4 transition-all`}>
        <div className="space-y-1">
          <div className={`font-medium text-sm ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {task.title}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            {task.dueAt && <span>{formatTimeline(task.dueAt)}</span>}
            {task.recurrence && <span className="uppercase text-[10px] bg-secondary px-1.5 rounded">{task.recurrence}</span>}
            {task.assignedTo && !isMine && <span className="capitalize text-primary">• {task.assignedTo}</span>}
            {isAccepted && !isCompleted && <span className="text-secondary font-medium flex items-center gap-1"><Handshake className="w-3 h-3" /> Accepted</span>}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isCompleted ? (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" disabled>
              <Check className="w-4 h-4" />
            </Button>
          ) : (
            <>
              {isMine && !isAccepted ? (
                <Button size="sm" variant="default" className="h-8 px-3 text-xs" onClick={() => updateTaskStatus(task.id, task.status, { acceptedAt: new Date().toISOString(), acceptedBy: currentPersona.id })}>
                  Accept
                </Button>
              ) : isMine ? (
                <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => updateTaskStatus(task.id, 'confirmed')}>
                  Done
                </Button>
              ) : null}

              {(!isMine || isAccepted) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => updateTaskStatus(task.id, 'skipped')}>
                      <Clock className="w-4 h-4 mr-2" /> Snooze 4h
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => updateTaskStatus(task.id, 'unable')} className="text-destructive focus:text-destructive">
                      <XCircle className="w-4 h-4 mr-2" /> Unable to complete
                    </DropdownMenuItem>
                    {task.status !== 'scheduled' && (
                      <DropdownMenuItem onClick={() => updateTaskStatus(task.id, 'scheduled')}>
                        <RotateCcw className="w-4 h-4 mr-2" /> Reset Status
                      </DropdownMenuItem>
                    )}
                    {!isSupport && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => updateTaskStatus(task.id, task.status, { assignedTo: 'john', acceptedAt: undefined, acceptedBy: undefined })}>
                          <UserPlus className="w-4 h-4 mr-2" /> Reassign to John
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateTaskStatus(task.id, task.status, { assignedTo: 'sarah', acceptedAt: undefined, acceptedBy: undefined })}>
                          <UserPlus className="w-4 h-4 mr-2" /> Reassign to Sarah
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="shadow-sm border-border">
      <CardContent className="p-4 space-y-6">
        <div className="space-y-3">
          <h3 className="font-serif text-lg flex items-center justify-between">
            My Tasks
            <span className="text-sm bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-sans">{myTasks.length}</span>
          </h3>
          <div className="space-y-2">
            {myTasks.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 text-center border rounded-lg border-dashed">
                No tasks assigned to you.
              </div>
            ) : (
              myTasks.map(t => <TaskCard key={t.id} task={t} isMine={true} />)
            )}
          </div>
        </div>

        {otherTasks.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <h3 className="font-serif text-lg flex items-center justify-between text-muted-foreground">
              Family Tasks
            </h3>
            <div className="space-y-2">
              {otherTasks.map(t => <TaskCard key={t.id} task={t} isMine={false} />)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
