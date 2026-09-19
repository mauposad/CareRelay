import { CareEvent, CareState, CareTask } from '../types';
import { UserRole, ROLE } from '../lib/rbac';
import { formatCareTime } from '../lib/dateUtils';

export type EventRouting = {
  recipients: string;
  excluded: string;
  reason: string;
};

export function getEventRouting(event: CareEvent, shareSymptom = !!event.sharedWithPhysician): EventRouting {
  switch (event.type) {
    case 'appointment':
      return {
        recipients: 'Margaret, coordinating family, and Dr. Patel (appointment context)',
        excluded: 'Read-only family viewers receive only a concise summary',
        reason: 'The schedule supports care coordination; the physician sees it outside clinical signals.'
      };
    case 'task':
      return {
        recipients: event.ownerId ? `${event.ownerId} and coordinating caregivers` : 'Coordinating caregivers',
        excluded: 'Dr. Patel and read-only family viewers',
        reason: 'Action details go only to the person responsible and coordinators.'
      };
    case 'exercise':
      return {
        recipients: 'Margaret and coordinating caregivers',
        excluded: 'Dr. Patel and read-only family viewers',
        reason: 'This becomes Margaret’s personal plan, not a clinical signal.'
      };
    case 'symptom':
      return {
        recipients: shareSymptom ? 'Coordinating caregivers and Dr. Patel' : 'Coordinating caregivers',
        excluded: shareSymptom ? 'Family support and read-only family viewers' : 'Dr. Patel, family support, and read-only family viewers',
        reason: shareSymptom
          ? 'A reviewer chose to share this reported observation with Dr. Patel.'
          : 'Reported observations stay with reviewers unless they explicitly share them.'
      };
    default:
      return {
        recipients: 'Coordinating caregivers',
        excluded: 'Dr. Patel, family support, and read-only family viewers',
        reason: 'General source notes remain in the reviewer workspace.'
      };
  }
}

export function getAcceptedRideTask(tasks: CareTask[], events: CareEvent[], appointment: CareEvent): CareTask | undefined {
  return tasks.find(task => {
    if (
      task.category !== 'other' ||
      !task.assignedTo ||
      !task.acceptedAt ||
      task.acceptedBy !== task.assignedTo ||
      ['cancelled', 'unable', 'missed'].includes(task.status)
    ) return false;
    if (task.relatedEventId === appointment.id || task.sourceEventId === appointment.id) return true;
    const sourceEvent = events.find(event => event.id === task.sourceEventId);
    return !!sourceEvent?.messageId &&
      sourceEvent.messageId === appointment.messageId &&
      /drive|ride|transport/i.test(task.title);
  });
}

export function getRoleSpecificSummary(state: CareState, role: UserRole): string {
  // Compute true actual counts based on confirmed events
  const symptoms = state.events.filter(e => e.type === 'symptom' && e.status === 'confirmed');
  
  if (role === ROLE.PHYSICIAN) {
    const sharedSymptoms = symptoms.filter(s => s.sharedWithPhysician);
    const nextAppointment = state.events
      .filter(e => e.type === 'appointment' && e.status === 'confirmed' && e.datetime && new Date(e.datetime).getTime() >= Date.now())
      .sort((a, b) => new Date(a.datetime!).getTime() - new Date(b.datetime!).getTime())[0];
    return `Family members shared ${sharedSymptoms.length} confirmed observation(s) for review.${nextAppointment?.datetime ? ` Next appointment: ${formatCareTime(nextAppointment.datetime, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : ''}`;
  }
  
  if (role === ROLE.FAMILY_VIEWER || role === ROLE.FAMILY_SUPPORT) {
    const activeTasks = state.tasks.filter(t => t.status !== 'cancelled' && t.status !== 'missed' && t.status !== 'confirmed');
    const confirmedUpdates = state.events.filter(e => e.status === 'confirmed');
    const nextAppointment = confirmedUpdates
      .filter(e => e.type === 'appointment' && e.datetime && new Date(e.datetime).getTime() >= Date.now())
      .sort((a, b) => new Date(a.datetime!).getTime() - new Date(b.datetime!).getTime())[0];
    const appointmentText = nextAppointment?.datetime
      ? ` Next appointment: ${nextAppointment.summary} on ${formatCareTime(nextAppointment.datetime, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
      : ' No upcoming appointment is confirmed.';
    return `Margaret’s confirmed plan is up to date with ${activeTasks.length} upcoming task${activeTasks.length === 1 ? '' : 's'} and ${confirmedUpdates.filter(e => e.type !== 'symptom').length} major update${confirmedUpdates.filter(e => e.type !== 'symptom').length === 1 ? '' : 's'}. Family wellbeing check-ins and logistics are being coordinated.${appointmentText}`;
  }

  // Primary Caregiver / Care Owner gets full context
  return `Margaret has ${symptoms.length} confirmed reported observation(s) and ${state.tasks.filter(t => !['cancelled', 'confirmed'].includes(t.status)).length} active task(s).`;
}