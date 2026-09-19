import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  ClipboardList,
  FileCheck2,
  FileText,
  HeartHandshake,
  Info,
  LockKeyhole,
  MessageCircleMore,
  Pill,
  RotateCcw,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

export type CareRelayEvent = {
  id: string;
  type: 'medication' | 'observation' | 'follow-up' | 'care-plan';
  summary: string;
  routing: string[];
  source: { documentName: string; documentDate: string; excerpt: string };
};

type IntakeProps = {
  elderId?: string;
  elderName?: string;
  currentUser?: { name: string; role?: string };
  onEventsApproved?: (events: CareRelayEvent[]) => void;
};

type ItemStatus = 'pending' | 'approved' | 'rejected';
type ItemCategory = 'Medication' | 'Observation' | 'Follow-up' | 'Care plan';
type IntakeItem = {
  id: string;
  category: ItemCategory;
  title: string;
  detail: string;
  excerpt: string;
  documentDate: string;
  sourceDocument: string;
  routing: string[];
  status: ItemStatus;
  needsClarification: boolean;
};

const sampleDocumentName = 'sample-visit-summary.pdf';
const sampleDocumentDate = 'October 14, 2024';

const demoItems: IntakeItem[] = [
  {
    id: 'medication-1',
    category: 'Medication',
    title: 'Continue lisinopril 10 mg once daily.',
    detail: 'Ongoing medication',
    excerpt: 'Continue lisinopril 10 mg once daily.',
    documentDate: sampleDocumentDate,
    sourceDocument: sampleDocumentName,
    routing: ['Family caregiver', 'Medication list'],
    status: 'pending',
    needsClarification: false,
  },
  {
    id: 'observation-1',
    category: 'Observation',
    title: 'Document notes occasional dizziness.',
    detail: 'Care observation',
    excerpt: 'Patient reports occasional dizziness when standing.',
    documentDate: sampleDocumentDate,
    sourceDocument: sampleDocumentName,
    routing: ['Family caregiver', 'Care team'],
    status: 'pending',
    needsClarification: false,
  },
  {
    id: 'follow-up-1',
    category: 'Follow-up',
    title: 'Schedule a primary care follow-up in 2–4 weeks.',
    detail: 'Timing needs a human check',
    excerpt: 'Follow up with primary care in 2–4 weeks.',
    documentDate: sampleDocumentDate,
    sourceDocument: sampleDocumentName,
    routing: ['Family caregiver', 'Appointments'],
    status: 'pending',
    needsClarification: true,
  },
  {
    id: 'care-plan-1',
    category: 'Care plan',
    title: 'Encourage hydration and standing slowly.',
    detail: 'Care guidance',
    excerpt: 'Encourage hydration and standing slowly.',
    documentDate: sampleDocumentDate,
    sourceDocument: sampleDocumentName,
    routing: ['Family caregiver'],
    status: 'pending',
    needsClarification: false,
  },
];

/**
 * The demo processor is deliberately isolated from the review UI.
 * A real document service can replace this function without changing the
 * upload, review, or integration surfaces below.
 */
function analyzeDocument(documentName: string): IntakeItem[] {
  return demoItems.map((item) => ({
    ...item,
    sourceDocument: documentName,
    status: 'pending',
  }));
}

function categoryIcon(category: ItemCategory) {
  if (category === 'Medication') return <Pill size={16} strokeWidth={1.8} />;
  if (category === 'Observation') return <Activity size={16} strokeWidth={1.8} />;
  if (category === 'Follow-up') return <CalendarClock size={16} strokeWidth={1.8} />;
  return <HeartHandshake size={16} strokeWidth={1.8} />;
}

function eventType(category: ItemCategory): CareRelayEvent['type'] {
  if (category === 'Medication') return 'medication';
  if (category === 'Observation') return 'observation';
  if (category === 'Follow-up') return 'follow-up';
  return 'care-plan';
}

function SourcePanel({
  phase,
  sourceName,
  onDemo,
  onFile,
  error,
}: {
  phase: 'idle' | 'processing' | 'review' | 'complete';
  sourceName: string;
  onDemo: () => void;
  onFile: (file: File | undefined) => void;
  error: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseFile = () => inputRef.current?.click();

  return (
    <aside className="panel source-panel" data-testid="panel-document-source">
      <div className="panel-title">
        <h2>Source document</h2>
        <span className="mini-label">Step 1</span>
      </div>
      <div className={`dropzone ${sourceName ? 'is-loaded' : ''}`} data-testid="dropzone-document">
        <div className="upload-icon">
          {sourceName ? <FileCheck2 size={20} /> : <Upload size={20} />}
        </div>
        {sourceName ? (
          <>
            <strong data-testid="text-source-document">{sourceName}</strong>
            <small>Ready to review as a demo document</small>
          </>
        ) : (
          <>
            <strong>Bring in a care document</strong>
            <small>PDF, JPG, JPEG, or PNG<br />Up to 10 MB</small>
            <button className="file-cta" type="button" onClick={chooseFile} data-testid="button-choose-file">
              Choose a file
            </button>
          </>
        )}
        <input
          ref={inputRef}
          className="file-input"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={(event) => onFile(event.target.files?.[0])}
          data-testid="input-document-file"
        />
      </div>
      {sourceName && (
        <button className="demo-button" type="button" onClick={chooseFile} data-testid="button-replace-file">
          <Upload size={14} />
          Replace document
        </button>
      )}
      {!sourceName && (
        <button className="demo-button" type="button" onClick={onDemo} data-testid="button-load-demo">
          <span className="demo-chip">DEMO PROCESSING MODE</span>
          <span>Load sample visit summary</span>
          <ArrowRight size={13} />
        </button>
      )}
      {error && <div className="error-note" role="alert" data-testid="status-file-error">{error}</div>}
      <div className="privacy-note">
        <LockKeyhole size={14} />
        <span>Documents stay in this review session until you choose what to carry forward.</span>
      </div>
      {phase !== 'idle' && (
        <div className="privacy-note">
          <Info size={14} />
          <span>Every proposed event keeps a link back to its source document.</span>
        </div>
      )}
    </aside>
  );
}

function EmptyReview() {
  return (
    <div className="empty-review" data-testid="empty-review-state">
      <ClipboardList size={25} />
      <h3>A calmer way to begin</h3>
      <p>Upload a care document or load the sample visit summary. CareRelay will keep the first pass small, traceable, and ready for your judgment.</p>
    </div>
  );
}

function ProcessingState({ sourceName }: { sourceName: string }) {
  return (
    <div className="panel process-panel" data-testid="status-processing">
      <div className="process-orbit" aria-hidden="true" />
      <h2>Reading the care document</h2>
      <p>Finding a few useful details in <strong>{sourceName}</strong>.</p>
      <div className="progress-line" aria-label="Processing document"><span /></div>
      <p style={{ marginTop: 15 }}>No events are created until you review them.</p>
    </div>
  );
}

function ItemCard({
  item,
  index,
  onStatus,
  onClarification,
}: {
  item: IntakeItem;
  index: number;
  onStatus: (id: string, status: ItemStatus) => void;
  onClarification: (id: string) => void;
}) {
  const statusLabel = item.status === 'approved'
    ? 'Approved'
    : item.status === 'rejected'
      ? 'Not carrying forward'
      : item.needsClarification
        ? 'Needs clarification'
        : 'Awaiting review';
  const cardClass = item.status === 'approved' ? 'is-approved' : item.status === 'rejected' ? 'is-rejected' : item.needsClarification ? 'is-clarify' : '';

  return (
    <article className={`item-card ${cardClass}`} style={{ animationDelay: `${index * 70}ms` }} data-testid={`card-item-${item.id}`}>
      <div className="item-top">
        <div className="category">
          <div className="category-icon">{categoryIcon(item.category)}</div>
          <div>
            <h3>{item.category}</h3>
            <p>{item.detail}</p>
          </div>
        </div>
        <span className={`status ${item.status === 'approved' ? 'approved' : item.status === 'rejected' ? 'rejected' : item.needsClarification ? 'clarify' : 'pending'}`} data-testid={`status-item-${item.id}`}>
          {statusLabel}
        </span>
      </div>
      <p className="item-text" data-testid={`text-item-summary-${item.id}`}>{item.title}</p>
      <div className="trace-row">
        <FileText size={13} />
        <span>{item.documentDate}</span>
        <span>·</span>
        <span className="trace-quote">“{item.excerpt}”</span>
        {item.routing.map((role) => <span className="role-tag" key={role}>{role}</span>)}
      </div>
      {item.needsClarification && (
        <div className="clarify-note" data-testid={`status-clarification-${item.id}`}>
          <AlertTriangle size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />
          The document says “2–4 weeks.” Confirm the intended follow-up timing before carrying this forward.
        </div>
      )}
      <div className="item-actions">
        <button
          className={`action-button approve ${item.status === 'approved' ? 'active' : ''}`}
          type="button"
          onClick={() => onStatus(item.id, 'approved')}
          data-testid={`button-approve-${item.id}`}
        >
          <Check size={14} /> Approve
        </button>
        <button
          className={`action-button reject ${item.status === 'rejected' ? 'active' : ''}`}
          type="button"
          onClick={() => onStatus(item.id, 'rejected')}
          data-testid={`button-reject-${item.id}`}
        >
          <X size={14} /> Reject
        </button>
        {item.needsClarification && (
          <button
            className={`action-button clarify ${!item.needsClarification ? '' : 'active'}`}
            type="button"
            onClick={() => onClarification(item.id)}
            data-testid={`button-clarify-${item.id}`}
          >
            <MessageCircleMore size={14} /> Mark clarified
          </button>
        )}
      </div>
    </article>
  );
}

function ReviewState({
  items,
  sourceName,
  onStatus,
  onClarification,
  onApprove,
}: {
  items: IntakeItem[];
  sourceName: string;
  onStatus: (id: string, status: ItemStatus) => void;
  onClarification: (id: string) => void;
  onApprove: () => void;
}) {
  const approvedCount = items.filter((item) => item.status === 'approved').length;
  return (
    <>
      <div className="review-top">
        <div>
          <div className="eyebrow">Step 2 · Human review</div>
          <h2>Proposed CareRelay events</h2>
          <p>Review each item independently. Nothing is shared automatically.</p>
        </div>
        <div className="doc-pill" data-testid="text-active-document"><FileText size={13} /> {sourceName}</div>
      </div>
      <div className="items-stack">
        {items.map((item, index) => (
          <ItemCard key={item.id} item={item} index={index} onStatus={onStatus} onClarification={onClarification} />
        ))}
      </div>
      <div className="continue-bar">
        <div className="continue-copy">
          <ShieldCheck size={19} />
          <div>
            <strong>{approvedCount} {approvedCount === 1 ? 'event' : 'events'} ready to carry forward</strong>
            <span>Approved items will be normalized with their source traceability.</span>
          </div>
        </div>
        <button className="primary-button" type="button" onClick={onApprove} disabled={approvedCount === 0} data-testid="button-approve-events">
          Approve selected <ArrowRight size={14} />
        </button>
      </div>
    </>
  );
}

function CompleteState({ events, onReset }: { events: CareRelayEvent[]; onReset: () => void }) {
  return (
    <div className="panel complete-panel" data-testid="status-complete">
      <div className="complete-mark"><BadgeCheck size={27} /></div>
      <h2>Events are ready</h2>
      <p>{events.length} normalized {events.length === 1 ? 'event is' : 'events are'} prepared for the CareRelay handoff. The callback surface received the approved set.</p>
      <div className="event-output" data-testid="output-approved-events">
        <pre>{JSON.stringify(events, null, 2)}</pre>
      </div>
      <button className="primary-button" type="button" onClick={onReset} data-testid="button-start-another">
        <RotateCcw size={14} /> Review another document
      </button>
    </div>
  );
}

export function DocumentIntake({
  elderId = 'demo-elder',
  elderName = 'Eleanor Brooks',
  currentUser = { name: 'Maya Chen', role: 'Family caregiver' },
  onEventsApproved,
}: IntakeProps) {
  const [phase, setPhase] = useState<'idle' | 'processing' | 'review' | 'complete'>('idle');
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [fileError, setFileError] = useState('');
  const [approvedEvents, setApprovedEvents] = useState<CareRelayEvent[]>([]);
  const processingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (processingTimer.current) clearTimeout(processingTimer.current);
  }, []);

  const beginAnalysis = (documentName: string) => {
    setFileError('');
    setSourceName(documentName);
    setItems([]);
    setApprovedEvents([]);
    setPhase('processing');
    processingTimer.current = setTimeout(() => {
      setItems(analyzeDocument(documentName));
      setPhase('review');
    }, 1450);
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const valid = ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)
      || /\.(pdf|jpe?g|png)$/i.test(file.name);
    if (!valid) {
      setFileError('That file type is not supported. Choose a PDF, JPG, JPEG, or PNG.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError('That file is larger than 10 MB. Choose a smaller document to continue.');
      return;
    }
    beginAnalysis(file.name);
  };

  const updateStatus = (id: string, status: ItemStatus) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item));
  };

  const markClarified = (id: string) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, needsClarification: false } : item));
  };

  const approveEvents = () => {
    const nextEvents = items
      .filter((item) => item.status === 'approved')
      .map((item): CareRelayEvent => ({
        id: `${elderId}-${item.id}`,
        type: eventType(item.category),
        summary: item.title,
        routing: item.routing,
        source: { documentName: item.sourceDocument, documentDate: item.documentDate, excerpt: item.excerpt },
      }));
    setApprovedEvents(nextEvents);
    setPhase('complete');
    onEventsApproved?.(nextEvents);
  };

  const reset = () => {
    setPhase('idle');
    setSourceName('');
    setItems([]);
    setApprovedEvents([]);
    setFileError('');
  };

  return (
    <main className="intake-shell" data-testid="document-intake-app">
      <header className="site-header">
        <div className="brand" data-testid="text-brand">
          <div className="brand-mark"><HeartHandshake size={18} /></div>
          <span className="brand-name">CareRelay</span>
        </div>
        <div className="header-note"><span />Private review workspace</div>
      </header>
      <div className="page-wrap">
        <section className="intro" aria-labelledby="page-title">
          <div className="eyebrow">Document intake · {elderName}</div>
          <h1 id="page-title">Make the next step<br />feel a little clearer.</h1>
          <p>Turn a physician or care document into a small set of human-reviewed events for {elderName}. You stay in control of what moves forward.</p>
        </section>
        <div className="workspace">
          <SourcePanel phase={phase} sourceName={sourceName} onDemo={() => beginAnalysis(sampleDocumentName)} onFile={handleFile} error={fileError} />
          <section className="review-area" aria-label="Document review">
            {phase === 'idle' && <EmptyReview />}
            {phase === 'processing' && <ProcessingState sourceName={sourceName} />}
            {phase === 'review' && <ReviewState items={items} sourceName={sourceName} onStatus={updateStatus} onClarification={markClarified} onApprove={approveEvents} />}
            {phase === 'complete' && <CompleteState events={approvedEvents} onReset={reset} />}
          </section>
        </div>
        <div className="footer-note"><UserRound size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Reviewing as {currentUser.name}{currentUser.role ? ` · ${currentUser.role}` : ''} · Information is shown for review, not medical advice.</div>
      </div>
    </main>
  );
}

function Home() {
  return <DocumentIntake />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;