export const ROLE = {
  CARE_OWNER: 'CARE_OWNER',
  PRIMARY_CAREGIVER: 'PRIMARY_CAREGIVER',
  FAMILY_SUPPORT: 'FAMILY_SUPPORT',
  FAMILY_VIEWER: 'FAMILY_VIEWER',
  PHYSICIAN: 'PHYSICIAN',
  ELDER: 'ELDER',
} as const;

export type UserRole = (typeof ROLE)[keyof typeof ROLE];

export const PERMISSIONS = {
  VIEW_ALL_STRUCTURED_EVENTS: 'view_all_structured_events',
  VIEW_ASSIGNED_TASKS: 'view_assigned_tasks',
  ASSIGN_TASKS: 'assign_tasks',
  MANAGE_MEMBERS: 'manage_members',
  VIEW_SYMPTOMS: 'view_symptoms',
  VIEW_MEDICATION_UPDATES: 'view_medication_updates',
  VIEW_FAMILY_LOGISTICS: 'view_family_logistics',
  VIEW_CLINICAL_SUMMARY: 'view_clinical_summary',
  VIEW_SOURCE_CONTEXT: 'view_source_context',
  SHARE_WITH_PHYSICIAN: 'share_with_physician',
  ACKNOWLEDGE_CLINICAL_ITEM: 'acknowledge_clinical_item',
  VIEW_ELDER_DAILY_PLAN: 'view_elder_daily_plan',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [ROLE.CARE_OWNER]: [
    PERMISSIONS.VIEW_ALL_STRUCTURED_EVENTS,
    PERMISSIONS.VIEW_ASSIGNED_TASKS,
    PERMISSIONS.ASSIGN_TASKS,
    PERMISSIONS.MANAGE_MEMBERS,
    PERMISSIONS.VIEW_SYMPTOMS,
    PERMISSIONS.VIEW_MEDICATION_UPDATES,
    PERMISSIONS.VIEW_FAMILY_LOGISTICS,
    PERMISSIONS.VIEW_CLINICAL_SUMMARY,
    PERMISSIONS.VIEW_SOURCE_CONTEXT,
    PERMISSIONS.SHARE_WITH_PHYSICIAN,
    PERMISSIONS.VIEW_ELDER_DAILY_PLAN,
  ],
  [ROLE.PRIMARY_CAREGIVER]: [
    PERMISSIONS.VIEW_ALL_STRUCTURED_EVENTS,
    PERMISSIONS.VIEW_ASSIGNED_TASKS,
    PERMISSIONS.VIEW_SYMPTOMS,
    PERMISSIONS.VIEW_MEDICATION_UPDATES,
    PERMISSIONS.VIEW_FAMILY_LOGISTICS,
    PERMISSIONS.VIEW_ELDER_DAILY_PLAN,
    PERMISSIONS.SHARE_WITH_PHYSICIAN,
    PERMISSIONS.VIEW_SOURCE_CONTEXT,
  ],
  [ROLE.FAMILY_SUPPORT]: [
    PERMISSIONS.VIEW_ASSIGNED_TASKS,
    PERMISSIONS.VIEW_FAMILY_LOGISTICS,
  ],
  [ROLE.FAMILY_VIEWER]: [
    PERMISSIONS.VIEW_ELDER_DAILY_PLAN, // Viewer gets concise derived summary
  ],
  [ROLE.PHYSICIAN]: [
    PERMISSIONS.VIEW_SYMPTOMS,
    PERMISSIONS.VIEW_MEDICATION_UPDATES,
    PERMISSIONS.VIEW_CLINICAL_SUMMARY,
    PERMISSIONS.ACKNOWLEDGE_CLINICAL_ITEM,
  ],
  [ROLE.ELDER]: [
    PERMISSIONS.VIEW_ELDER_DAILY_PLAN,
  ],
};

export function canUser(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// Ensure explicit ids for easy mapping
export const PERSONAS = [
  { id: 'sarah', name: 'Sarah Wilson', role: ROLE.PRIMARY_CAREGIVER, title: 'Primary Caregiver' },
  { id: 'john', name: 'John Wilson', role: ROLE.FAMILY_SUPPORT, title: 'Family Support' },
  { id: 'alex', name: 'Alex Wilson', role: ROLE.CARE_OWNER, title: 'Care Owner' },
  { id: 'emily', name: 'Emily Wilson', role: ROLE.FAMILY_VIEWER, title: 'Family Viewer' },
  { id: 'dr_patel', name: 'Dr. Maya Patel', role: ROLE.PHYSICIAN, title: 'Primary Care Physician' },
  { id: 'margaret', name: 'Margaret Wilson', role: ROLE.ELDER, title: 'Care Recipient' },
];

export type PersonaId = typeof PERSONAS[number]['id'];

export function getPersona(id: PersonaId) {
  return PERSONAS.find((p) => p.id === id) || PERSONAS[0];
}
