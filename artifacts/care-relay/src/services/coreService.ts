import { CareState, CareEvent, CareTask, ClinicianQuestion, AuditEntry } from '../types';
import { getPersona, canUser, PERMISSIONS, PersonaId } from '../lib/rbac';

export const coreService = {
  confirmEvent(state: CareState, eventId: string, actorId: string, updates?: Partial<CareEvent>): CareState {
    const actor = getPersona(actorId as PersonaId);
    if (!canUser(actor.role, PERMISSIONS.MANAGE_MEMBERS) && !canUser(actor.role, PERMISSIONS.VIEW_ALL_STRUCTURED_EVENTS)) {
      return state; // Guard mutations
    }
    
    const ev = state.events.find(e => e.id === eventId);
    if (!ev || ev.status === 'confirmed') return state;

    const newEvents = state.events.map(e => {
      if (e.id === eventId) {
        return { 
          ...e, 
          status: 'confirmed' as const, 
          ...updates, 
          unresolvedTime: false, 
          confirmedBy: actorId, // Capture the actual actor who confirmed it
          approvalTime: new Date().toISOString()
        };
      }
      // Propagate time resolution to linked tasks from the same extraction that also need time
      if (e.messageId === ev.messageId && e.unresolvedTime && updates?.datetime && e.status === 'proposed') {
        return { ...e, datetime: updates.datetime, unresolvedTime: false };
      }
      return e;
    });

    const confirmedEv = newEvents.find(e => e.id === eventId)!;

    let newTasks = state.tasks;
    if (confirmedEv.type === 'task' || (confirmedEv.type === 'exercise' && confirmedEv.ownerId)) {
      newTasks = [{
        id: `task_${Date.now()}_${Math.random()}`,
        careProfileId: confirmedEv.personId,
        category: confirmedEv.type === 'exercise' ? 'exercise' : 'other',
        title: confirmedEv.summary,
        assignedTo: confirmedEv.ownerId,
        status: 'scheduled',
        dueAt: confirmedEv.datetime,
        recurrence: confirmedEv.recurrence,
        confirmationRequired: true,
        sourceEventId: eventId,
        relatedEventId: confirmedEv.relatedEventId
      }, ...newTasks];
    }

    if (confirmedEv.type === 'appointment') {
      newTasks = [{
        id: `task_${Date.now()}_${Math.random()}`,
        careProfileId: confirmedEv.personId,
        category: 'appointment',
        title: confirmedEv.summary,
        assignedTo: confirmedEv.ownerId,
        status: 'scheduled',
        dueAt: confirmedEv.datetime,
        confirmationRequired: true,
        sourceEventId: eventId
      }, ...newTasks];
    }

    const audit: AuditEntry = {
      id: `audit_${Date.now()}_conf`,
      timestamp: new Date().toISOString(),
      actorId,
      action: "event_confirmed",
      details: `Confirmed event: ${ev.summary}`,
      source: "system"
    };

    return { ...state, events: newEvents, tasks: newTasks, audit: [audit, ...state.audit] };
  },

  updateEventSharing(state: CareState, eventId: string, actorId: string, shared: boolean): CareState {
    const actor = getPersona(actorId as PersonaId);
    const ev = state.events.find(e => e.id === eventId);
    if (!canUser(actor.role, PERMISSIONS.SHARE_WITH_PHYSICIAN) || !ev || ev.type !== 'symptom' || ev.status !== 'confirmed') {
      return state;
    }
    if (!!ev.sharedWithPhysician === shared) return state;
    const audit: AuditEntry = {
      id: `audit_${Date.now()}_share`,
      timestamp: new Date().toISOString(),
      actorId,
      action: shared ? "observation_shared" : "observation_unshared",
      details: `${shared ? 'Shared' : 'Stopped sharing'} confirmed observation with Dr. Patel`,
      source: "system"
    };
    return {
      ...state,
      events: state.events.map(e => e.id === eventId ? { ...e, sharedWithPhysician: shared } : e),
      audit: [audit, ...state.audit]
    };
  },

  rejectEvent(state: CareState, eventId: string, actorId: string): CareState {
    const actor = getPersona(actorId as PersonaId);
    if (!canUser(actor.role, PERMISSIONS.MANAGE_MEMBERS) && !canUser(actor.role, PERMISSIONS.VIEW_ALL_STRUCTURED_EVENTS)) {
      return state; // Guard mutations
    }

    const ev = state.events.find(e => e.id === eventId);
    if (!ev || ev.status === 'rejected') return state;

    const audit: AuditEntry = {
      id: `audit_${Date.now()}_rej`,
      timestamp: new Date().toISOString(),
      actorId,
      action: "event_rejected",
      details: `Rejected event: ${ev.summary}`,
      source: "system"
    };

    return {
      ...state,
      events: state.events.map(e => e.id === eventId ? { ...e, status: 'rejected' } : e),
      audit: [audit, ...state.audit]
    };
  },

  updateTask(state: CareState, taskId: string, actorId: string, status: CareTask['status'], updates?: Partial<CareTask>): CareState {
    const actor = getPersona(actorId as PersonaId);
    const task = state.tasks.find(t => t.id === taskId);
    if (!task || (task.status === status && !updates)) return state;

    // Elder can only mutate their own tasks. Viewer cannot mutate.
    if (actor.role === 'FAMILY_VIEWER' || actor.role === 'PHYSICIAN') return state;
    if (actor.role === 'ELDER' && task.assignedTo !== 'margaret') return state;
    if (actor.role === 'FAMILY_SUPPORT' && task.assignedTo !== actorId) return state;

    let newTasks = [...state.tasks];
    const taskIndex = newTasks.findIndex(t => t.id === taskId);

    // Recurrence logic: if marking a recurring task confirmed, spawn the next occurrence
    let successorId: string | undefined;
    if (task.status !== 'confirmed' && status === 'confirmed' && task.recurrence && !task.nextOccurrenceTaskId) {
       successorId = `task_${Date.now()}_${Math.random()}`;
       const nextDue = task.dueAt ? new Date(new Date(task.dueAt).getTime() + 86400000).toISOString() : new Date(Date.now() + 86400000).toISOString();
       newTasks.push({
         ...task,
          id: successorId,
         status: 'scheduled',
         dueAt: nextDue,
         acceptedAt: undefined,
          acceptedBy: undefined,
          nextOccurrenceTaskId: undefined
       });
    }

    let updatedTask = { ...task, ...updates, status, ...(successorId ? { nextOccurrenceTaskId: successorId } : {}) };

    if (status === 'skipped') {
       // Snooze for 4 hours
       updatedTask.status = 'scheduled';
       updatedTask.dueAt = new Date(Date.now() + 4 * 3600000).toISOString();
    }

    newTasks[taskIndex] = updatedTask;

    const audit: AuditEntry = {
      id: `audit_${Date.now()}_task`,
      timestamp: new Date().toISOString(),
      actorId,
      action: status === 'skipped' ? "task_snoozed" : "task_updated",
      details: status === 'skipped'
        ? `Snoozed task ${task.title} for 4 hours`
        : `Task ${task.title} set to ${status}${updates?.assignedTo ? ` (Reassigned to ${updates.assignedTo})` : ''}`,
      source: "system"
    };

    return { ...state, tasks: newTasks, audit: [audit, ...state.audit] };
  },

  updateQuestion(state: CareState, questionId: string, actorId: string, status: ClinicianQuestion['status']): CareState {
    const actor = getPersona(actorId as PersonaId);
    if (!canUser(actor.role, PERMISSIONS.ACKNOWLEDGE_CLINICAL_ITEM)) {
      return state; // Guard mutations
    }

    const q = state.questions.find(qu => qu.id === questionId);
    if (!q || q.status === status) return state;

    const audit: AuditEntry = {
      id: `audit_${Date.now()}_q`,
      timestamp: new Date().toISOString(),
      actorId,
      action: "question_updated",
      details: `Question status set to ${status}`,
      source: "system"
    };

    return {
      ...state,
      questions: state.questions.map(qu => qu.id === questionId ? { ...qu, status } : qu),
      audit: [audit, ...state.audit]
    };
  }
};
