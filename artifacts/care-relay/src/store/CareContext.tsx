import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { CareState, CareEvent, CareProfile, CareTask, ClinicianQuestion, NormalizedMessage, AuditEntry, MessageSource } from '../types';
import { PersonaId, getPersona, PERSONAS, UserRole } from '../lib/rbac';
import { INITIAL_PROFILE, INITIAL_MESSAGES, INITIAL_EVENTS, INITIAL_TASKS, INITIAL_QUESTIONS, INITIAL_AUDIT, INITIAL_SUMMARY } from './fixtures';
import { mockExtractionProvider } from '../lib/providers/extraction';
import { coreService } from '../services/coreService';

interface CareContextType {
  currentPersona: ReturnType<typeof getPersona>;
  setPersona: (id: PersonaId) => void;
  
  state: CareState;
  
  // Actions
  ingestMessage: (text: string, source: MessageSource, senderId: string) => Promise<void>;
  confirmEvent: (id: string, updates?: Partial<CareEvent>) => void;
  updateEventSharing: (id: string, shared: boolean) => void;
  rejectEvent: (id: string) => void;
  updateTaskStatus: (id: string, status: CareTask['status'], updates?: Partial<CareTask>) => void;
  updateQuestionStatus: (id: string, status: ClinicianQuestion['status']) => void;
  updateProfile: (updates: Partial<CareProfile>) => void;
  addAuditEntry: (action: string, details: string, source?: string) => void;
  resetDemo: () => void;
  
  isProcessing: boolean;
}

const CareContext = createContext<CareContextType | null>(null);

const STORAGE_KEY = 'carerelay_demo_state_v4';

const defaultState: CareState = {
  profile: INITIAL_PROFILE,
  messages: INITIAL_MESSAGES,
  events: INITIAL_EVENTS,
  tasks: INITIAL_TASKS,
  questions: INITIAL_QUESTIONS,
  audit: INITIAL_AUDIT,
  summary: INITIAL_SUMMARY
};

function migrateState(storedData: any): CareState {
  if (!storedData) return defaultState;
  
  // Safe deep copy
  const data = JSON.parse(JSON.stringify(storedData));
  
  // Migrate questions (discussed -> planned_discussion)
  if (data.questions && Array.isArray(data.questions)) {
    data.questions = data.questions.map((q: any) => 
      q.status === 'discussed' ? { ...q, status: 'planned_discussion' } : q
    );
  }
  
  // Migrate events (ensure sharedWithPhysician exists)
  if (data.events && Array.isArray(data.events)) {
    data.events = data.events.map((e: any) => ({
      ...e,
      sharedWithPhysician: e.sharedWithPhysician ?? false
    }));
  }

  // Ensure default structure
  return {
    ...defaultState,
    ...data,
    profile: data.profile || defaultState.profile,
    messages: data.messages || defaultState.messages,
    events: data.events || defaultState.events,
    tasks: data.tasks || defaultState.tasks,
    questions: data.questions || defaultState.questions,
    audit: data.audit || defaultState.audit
  };
}

export function CareProvider({ children }: { children: ReactNode }) {
  const [currentPersona, setCurrentPersona] = useState(() => {
    try {
      const saved = localStorage.getItem('carerelay_demo_persona');
      return PERSONAS.find(persona => persona.id === saved) || PERSONAS[0];
    } catch {
      return PERSONAS[0];
    }
  });

  useEffect(() => {
    localStorage.setItem('carerelay_demo_persona', currentPersona.id);
  }, [currentPersona.id]);
  const [state, setState] = useState<CareState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return migrateState(JSON.parse(stored));
      
      const oldStoredV3 = localStorage.getItem('carerelay_demo_state_v3');
      const oldStoredV2 = localStorage.getItem('carerelay_demo_state_v2');
      const oldStored = localStorage.getItem('carerelay_demo_state');
      
      const toMigrate = oldStoredV3 || oldStoredV2 || oldStored;
      if (toMigrate) {
        return migrateState(JSON.parse(toMigrate));
      }
      return defaultState;
    } catch (e) {
      return defaultState;
    }
  });
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setPersona = useCallback((id: PersonaId) => {
    setCurrentPersona(getPersona(id));
  }, []);

  const addAuditEntry = useCallback((action: string, details: string, source?: string) => {
    setState(s => ({
      ...s,
      audit: [{
        id: `audit_${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorId: currentPersona.id,
        action,
        details,
        source
      }, ...s.audit]
    }));
  }, [currentPersona.id]);

  const ingestMessage = useCallback(async (text: string, source: MessageSource, senderId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const msgId = `msg_${Date.now()}`;
      const newMessage: NormalizedMessage = {
        id: msgId,
        familyId: "fam_1",
        careProfileId: "margaret",
        senderId,
        source,
        body: text,
        receivedAt: new Date().toISOString(),
        consent: source === 'voice' ? 'unknown' : 'user_imported'
      };

      setState(s => ({
        ...s,
        messages: [newMessage, ...s.messages],
        audit: [{
          id: `audit_${Date.now()}_msg`,
          timestamp: new Date().toISOString(),
          actorId: senderId,
          action: "message_ingested",
          details: `Imported message from ${source}`,
          source
        }, ...s.audit]
      }));

      // Run extraction
      const result = await mockExtractionProvider.extractCareEvents(text, source);
      
      if (result.events.length > 0) {
        let newEvents: CareEvent[] = result.events.map((e, idx) => ({
          ...e,
          id: `evt_${Date.now()}_${idx}`,
          messageId: msgId,
          status: 'proposed',
        } as CareEvent));
        const appointment = newEvents.find(e => e.type === 'appointment');
        if (appointment) {
          newEvents = newEvents.map(e =>
            e.type === 'task' && /drive|ride|transport/i.test(e.summary)
              ? { ...e, relatedEventId: appointment.id }
              : e
          );
        }

        setState(s => ({
          ...s,
          events: [...newEvents, ...s.events]
        }));
      }

    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing]);

  const confirmEvent = useCallback((id: string, updates?: Partial<CareEvent>) => {
    setState(s => coreService.confirmEvent(s, id, currentPersona.id, updates));
  }, [currentPersona.id]);

  const updateEventSharing = useCallback((id: string, shared: boolean) => {
    setState(s => coreService.updateEventSharing(s, id, currentPersona.id, shared));
  }, [currentPersona.id]);

  const rejectEvent = useCallback((id: string) => {
    setState(s => coreService.rejectEvent(s, id, currentPersona.id));
  }, [currentPersona.id]);

  const updateTaskStatus = useCallback((id: string, status: CareTask['status'], updates?: Partial<CareTask>) => {
    setState(s => coreService.updateTask(s, id, currentPersona.id, status, updates));
  }, [currentPersona.id]);

  const updateQuestionStatus = useCallback((id: string, status: ClinicianQuestion['status']) => {
    setState(s => coreService.updateQuestion(s, id, currentPersona.id, status));
  }, [currentPersona.id]);

  const updateProfile = useCallback((updates: Partial<CareProfile>) => {
    setState(s => ({
      ...s,
      profile: { ...s.profile, ...updates }
    }));
    addAuditEntry("profile_updated", "Updated care profile settings");
  }, [addAuditEntry]);

  const resetDemo = useCallback(() => {
    setState(defaultState);
  }, []);

  return (
    <CareContext.Provider value={{
      currentPersona,
      setPersona,
      state,
      ingestMessage,
      confirmEvent,
      updateEventSharing,
      rejectEvent,
      updateTaskStatus,
      updateQuestionStatus,
      updateProfile,
      addAuditEntry,
      resetDemo,
      isProcessing
    }}>
      {children}
    </CareContext.Provider>
  );
}

export function useCareContext() {
  const ctx = useContext(CareContext);
  if (!ctx) throw new Error("useCareContext must be used within CareProvider");
  return ctx;
}
