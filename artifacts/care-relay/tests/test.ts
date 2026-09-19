import { coreService } from '../src/services/coreService';
import { CareState, CareTask } from '../src/types';
import { INITIAL_PROFILE } from '../src/store/fixtures';
import { getAcceptedRideTask, getEventRouting, getRoleSpecificSummary } from '../src/store/selectors';
import { ROLE } from '../src/lib/rbac';
import { createNYDateISO, getCareDateKey } from '../src/lib/dateUtils';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
  console.log(`PASS: ${message}`);
}

const state: CareState = {
  profile: INITIAL_PROFILE,
  messages: [],
  events: [{
    id: 'appointment',
    type: 'appointment',
    summary: 'Physical therapy',
    personId: 'margaret',
    source: 'whatsapp',
    status: 'proposed',
    confidence: 1,
    evidence: 'raw source',
    needsConfirmation: true,
    unresolvedTime: true
  }, {
    id: 'symptom',
    type: 'symptom',
    summary: 'Reported tiredness',
    personId: 'margaret',
    source: 'whatsapp',
    status: 'proposed',
    confidence: 1,
    evidence: 'raw source',
    needsConfirmation: true
  }],
  tasks: [],
  questions: [],
  audit: [],
  summary: ''
};

const appointmentTime = createNYDateISO(3, 10);
const confirmed = coreService.confirmEvent(state, 'appointment', 'sarah', { datetime: appointmentTime });
assert(confirmed.tasks.length === 1, 'appointment confirmation creates one task');
assert(!!confirmed.events[0].approvalTime, 'approval time is stored separately');
assert(confirmed.events[0].datetime === appointmentTime, 'scheduled time remains the event datetime');
assert(coreService.confirmEvent(confirmed, 'appointment', 'sarah').tasks.length === 1, 'repeat confirmation does not duplicate tasks');

const symptomConfirmed = coreService.confirmEvent(confirmed, 'symptom', 'sarah', { sharedWithPhysician: false });
const shared = coreService.updateEventSharing(symptomConfirmed, 'symptom', 'sarah', true);
assert(shared.events.find(e => e.id === 'symptom')?.sharedWithPhysician === true, 'confirmed symptom sharing is editable');
assert(shared.tasks.length === symptomConfirmed.tasks.length, 'sharing update does not create tasks');
assert(coreService.updateEventSharing(shared, 'symptom', 'john', false) === shared, 'unauthorized sharing update is blocked');

const symptomRouting = getEventRouting(state.events[1], false);
assert(symptomRouting.recipients.includes('Coordinating caregivers') && symptomRouting.excluded.includes('Dr. Patel'), 'symptom routing names recipients and nonrecipients');
assert(getEventRouting(state.events[0]).recipients.includes('Dr. Patel'), 'appointment routing includes physician context');

const johnTask: CareTask = {
  id: 'john-task',
  careProfileId: 'margaret',
  category: 'other',
  title: 'Drive',
  assignedTo: 'john',
  status: 'scheduled',
  recurrence: 'daily',
  dueAt: appointmentTime,
  confirmationRequired: true,
  relatedEventId: 'appointment'
};
const guardedState = { ...shared, tasks: [johnTask, { ...johnTask, id: 'sarah-task', assignedTo: 'sarah' }] };
assert(coreService.updateTask(guardedState, 'sarah-task', 'john', 'confirmed') === guardedState, 'John can mutate only his assigned tasks');
assert(coreService.updateTask(guardedState, 'john-task', 'dr_patel', 'confirmed') === guardedState, 'physician cannot mutate tasks');

const completed = coreService.updateTask(guardedState, 'john-task', 'john', 'confirmed');
assert(completed.tasks.length === 3 && !!completed.tasks.find(t => t.id === 'john-task')?.nextOccurrenceTaskId, 'recurrence creates and marks one successor');
const reset = coreService.updateTask(completed, 'john-task', 'john', 'scheduled');
const recompleted = coreService.updateTask(reset, 'john-task', 'john', 'confirmed');
assert(recompleted.tasks.length === 3, 'reset and recomplete cannot duplicate recurrence successor');

const snoozed = coreService.updateTask(guardedState, 'john-task', 'john', 'skipped');
assert(snoozed.audit[0].action === 'task_snoozed' && snoozed.tasks[0].status === 'scheduled', 'snooze has explicit audit and reschedules task');

const appointment = { ...state.events[0], status: 'confirmed' as const, messageId: 'message-1' };
const rideSource = { ...state.events[1], id: 'ride-source', type: 'task' as const, messageId: 'message-1' };
const acceptedRide = { ...johnTask, sourceEventId: 'ride-source', relatedEventId: undefined, acceptedAt: 'now', acceptedBy: 'john' };
assert(getAcceptedRideTask([acceptedRide], [appointment, rideSource], appointment)?.id === 'john-task', 'accepted ride falls back safely through shared source message linkage');
assert(!getAcceptedRideTask([{ ...acceptedRide, acceptedBy: 'sarah' }], [appointment, rideSource], appointment), 'ride reassurance requires acceptance by the assigned person');

const viewerSummary = getRoleSpecificSummary(shared, ROLE.FAMILY_VIEWER);
assert(viewerSummary.includes('wellbeing') && viewerSummary.includes('Next appointment:'), 'Emily summary includes wellbeing and next appointment');
assert(!getRoleSpecificSummary(shared, ROLE.CARE_OWNER).includes('previous episode'), 'summary has no hardcoded previous episode');

const date = createNYDateISO(0, 23);
assert(/^\d{4}-\d{2}-\d{2}$/.test(getCareDateKey(date)), 'care date comparison uses an explicit YYYY-MM-DD timezone key');

console.log('ALL TESTS PASSED');