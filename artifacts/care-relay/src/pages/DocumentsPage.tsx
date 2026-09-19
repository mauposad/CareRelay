import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { useCareContext } from '../store/CareContext';
import { CareEvent, CareEventType } from '../types';
import { canUser, PERMISSIONS } from '../lib/rbac';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Activity, AlertTriangle, ArrowRight, BadgeCheck, Calendar, Check, ClipboardList,
  FileCheck2, FileText, Loader2, LockKeyhole, Pill, RotateCcw, ShieldCheck, Sparkles, Upload, X,
} from 'lucide-react';

type Phase = 'idle' | 'processing' | 'review' | 'complete';
type ItemStatus = 'pending' | 'approved' | 'rejected';

type ReviewItem = {
  id: string;
  event: Partial<CareEvent>;
  status: ItemStatus;
};

const SAMPLE_DOCUMENT = 'sample-visit-summary.pdf';
const MAX_BYTES = 10 * 1024 * 1024;

const TYPE_LABEL: Record<CareEventType, string> = {
  medication: 'Medication',
  symptom: 'Observation',
  appointment: 'Appointment',
  task: 'Task',
  exercise: 'Exercise',
  check_in: 'Check-in',
  note: 'Care note',
};

function typeIcon(type: CareEventType) {
  switch (type) {
    case 'medication': return <Pill className="w-4 h-4 text-primary" />;
    case 'symptom': return <Activity className="w-4 h-4 text-red-500" />;
    case 'appointment': return <Calendar className="w-4 h-4 text-blue-500" />;
    case 'exercise': return <Activity className="w-4 h-4 text-green-600" />;
    default: return <ClipboardList className="w-4 h-4 text-muted-foreground" />;
  }
}

/** Who a finding of this type reaches once it is confirmed on the dashboard. */
function routingFor(type: CareEventType): string {
  if (type === 'symptom') return 'Coordinating caregivers (Dr. Patel only if explicitly shared)';
  if (type === 'appointment') return 'Margaret, coordinating family, and Dr. Patel';
  if (type === 'medication') return 'Coordinating caregivers and Margaret’s daily plan';
  return 'Coordinating caregivers';
}

export default function DocumentsPage() {
  const { extractDocument, acceptDocumentEvents, isProcessing, currentPersona, extractionStatus, lastExtraction } =
    useCareContext();

  const [phase, setPhase] = useState<Phase>('idle');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [fileError, setFileError] = useState('');
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [carriedCount, setCarriedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const canReview = canUser(currentPersona.role, PERMISSIONS.VIEW_ALL_STRUCTURED_EVENTS);

  if (!canReview) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <LockKeyhole className="w-8 h-8 mx-auto text-muted-foreground" />
            <h1 className="text-2xl font-serif">Document intake is restricted</h1>
            <p className="text-muted-foreground">
              {currentPersona.name} does not have permission to review care documents. Switch to the
              Primary Caregiver or Care Owner role to use this workspace.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const runExtraction = async (file: File) => {
    setFileError('');
    setSourceName(file.name);
    setItems([]);
    setUnresolved([]);
    setPhase('processing');

    try {
      const result = await extractDocument(file);
      setItems(result.events.map((event, index) => ({
        id: `doc_item_${index}`,
        event,
        status: 'pending',
      })));
      setUnresolved(result.unresolved);
      setPhase('review');
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not read that document.');
      setPhase('idle');
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const valid = ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)
      || /\.(pdf|jpe?g|png)$/i.test(file.name);
    if (!valid) {
      setFileError('That file type is not supported. Choose a PDF, JPG, JPEG, or PNG.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError('That file is larger than 10 MB. Choose a smaller document to continue.');
      return;
    }
    void runExtraction(file);
  };

  const loadSample = async () => {
    setFileError('');
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${SAMPLE_DOCUMENT}`);
      if (!response.ok) throw new Error('Sample document is not available.');
      const blob = await response.blob();
      await runExtraction(new File([blob], SAMPLE_DOCUMENT, { type: 'application/pdf' }));
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not load the sample document.');
      setPhase('idle');
    }
  };

  const setStatus = (id: string, status: ItemStatus) => {
    setItems(current => current.map(item => (item.id === id ? { ...item, status } : item)));
  };

  const approvedItems = items.filter(item => item.status === 'approved');

  const carryForward = () => {
    const count = acceptDocumentEvents(approvedItems.map(item => item.event), sourceName);
    setCarriedCount(count);
    setPhase('complete');
  };

  const reset = () => {
    setPhase('idle');
    setItems([]);
    setSourceName('');
    setFileError('');
    setUnresolved([]);
    setCarriedCount(0);
  };

  const aiLive = lastExtraction ? lastExtraction.mode === 'ai' : extractionStatus?.aiEnabled;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-serif">Document Intake</h1>
          {extractionStatus && (
            <Badge variant={aiLive ? 'default' : 'secondary'} className="gap-1">
              <Sparkles className="w-3 h-3" />
              {aiLive ? `Live extraction · ${extractionStatus.model}` : 'Demo extraction (no API key)'}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Turn a visit summary, discharge note or care letter into reviewed care events for Margaret
          Wilson. Nothing enters the shared record until you approve it.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* Step 1 — source */}
        <Card className="lg:col-span-1 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg">Source document</h2>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Step 1</span>
            </div>

            <div className={`rounded-xl border-2 border-dashed p-6 text-center space-y-3 transition-colors ${sourceName ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30'}`}>
              <div className="mx-auto size-10 rounded-full bg-background flex items-center justify-center ring-1 ring-border">
                {sourceName ? <FileCheck2 className="w-5 h-5 text-primary" /> : <Upload className="w-5 h-5 text-muted-foreground" />}
              </div>
              {sourceName ? (
                <>
                  <p className="font-medium break-all">{sourceName}</p>
                  <p className="text-xs text-muted-foreground">Loaded for review</p>
                </>
              ) : (
                <>
                  <p className="font-medium">Bring in a care document</p>
                  <p className="text-xs text-muted-foreground">PDF, JPG, JPEG or PNG · up to 10 MB</p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
              <Button variant="outline" size="sm" disabled={isProcessing} onClick={() => inputRef.current?.click()}>
                {sourceName ? 'Replace document' : 'Choose a file'}
              </Button>
            </div>

            {!sourceName && (
              <Button variant="secondary" className="w-full gap-2" disabled={isProcessing} onClick={loadSample}>
                Load sample visit summary
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}

            {fileError && (
              <p role="alert" className="text-sm text-destructive">{fileError}</p>
            )}

            <div className="text-xs text-muted-foreground flex gap-2 pt-2 border-t">
              <LockKeyhole className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>The document is sent to the extraction service for this review only. It is not stored.</span>
            </div>
            <div className="text-xs text-muted-foreground flex gap-2">
              <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Every proposed event keeps the quote it came from.</span>
            </div>
          </CardContent>
        </Card>

        {/* Step 2 — review */}
        <div className="lg:col-span-2 space-y-4">
          {phase === 'idle' && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center space-y-3">
                <ClipboardList className="w-7 h-7 mx-auto text-muted-foreground" />
                <h3 className="font-serif text-xl">A calmer way to begin</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Upload a care document or load the sample visit summary. CareRelay keeps the first
                  pass small, traceable and ready for your judgment.
                </p>
              </CardContent>
            </Card>
          )}

          {phase === 'processing' && (
            <Card>
              <CardContent className="p-12 text-center space-y-3">
                <Loader2 className="w-7 h-7 mx-auto text-primary animate-spin" />
                <h3 className="font-serif text-xl">Reading the care document</h3>
                <p className="text-muted-foreground">
                  Finding care-relevant details in <strong className="text-foreground">{sourceName}</strong>.
                </p>
                <p className="text-xs text-muted-foreground">No events are created until you review them.</p>
              </CardContent>
            </Card>
          )}

          {phase === 'review' && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Step 2 · Human review</div>
                  <h2 className="font-serif text-xl">Proposed care events</h2>
                  <p className="text-sm text-muted-foreground">Review each finding independently. Nothing is shared automatically.</p>
                </div>
                <Badge variant="outline" className="gap-1"><FileText className="w-3 h-3" /> {sourceName}</Badge>
              </div>

              {lastExtraction?.fallbackReason && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-sm text-amber-900 dark:text-amber-200 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Live extraction was unavailable, so these are sample findings. Reason: {lastExtraction.fallbackReason}</span>
                </div>
              )}

              {items.length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    No care-relevant findings were extracted from this document.
                  </CardContent>
                </Card>
              )}

              <div className="space-y-3">
                {items.map(item => {
                  const type = (item.event.type ?? 'note') as CareEventType;
                  return (
                    <Card
                      key={item.id}
                      className={`shadow-sm transition-colors ${
                        item.status === 'approved' ? 'border-primary/50 bg-primary/5'
                        : item.status === 'rejected' ? 'border-border bg-muted/40 opacity-60'
                        : 'border-border'
                      }`}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-muted/60 rounded-md">{typeIcon(type)}</div>
                            <div>
                              <div className="font-medium">{TYPE_LABEL[type]}</div>
                              <div className="text-xs text-muted-foreground">
                                Confidence {Math.round((item.event.confidence ?? 0) * 100)}%
                                {item.event.ownerId ? ` · for ${item.event.ownerId}` : ' · unassigned'}
                              </div>
                            </div>
                          </div>
                          <Badge variant={item.status === 'approved' ? 'default' : item.status === 'rejected' ? 'secondary' : 'outline'}>
                            {item.status === 'approved' ? 'Approved'
                              : item.status === 'rejected' ? 'Not carrying forward'
                              : item.event.unresolvedTime ? 'Needs a time' : 'Awaiting review'}
                          </Badge>
                        </div>

                        <p className="text-foreground">{item.event.summary}</p>

                        <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-2">
                          “{item.event.evidence}”
                        </p>

                        <div className="rounded-md bg-muted/40 p-2 text-xs">
                          <strong>Will reach:</strong> {routingFor(type)}
                        </div>

                        {item.event.unresolvedTime && (
                          <div className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            The document does not pin down a time. You will set it when confirming on the dashboard.
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            variant={item.status === 'approved' ? 'default' : 'outline'}
                            className="gap-1"
                            onClick={() => setStatus(item.id, 'approved')}
                          >
                            <Check className="w-3.5 h-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant={item.status === 'rejected' ? 'secondary' : 'outline'}
                            className="gap-1"
                            onClick={() => setStatus(item.id, 'rejected')}
                          >
                            <X className="w-3.5 h-3.5" /> Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {unresolved.length > 0 && (
                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="p-4 space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" /> Still needs a person
                    </div>
                    <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                      {unresolved.map((note, index) => <li key={index}>{note}</li>)}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <Card className="border-primary/30">
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                    <div>
                      <div className="font-medium">
                        {approvedItems.length} {approvedItems.length === 1 ? 'event' : 'events'} ready to carry forward
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Approved findings become proposed events on the care dashboard for final confirmation.
                      </div>
                    </div>
                  </div>
                  <Button onClick={carryForward} disabled={approvedItems.length === 0} className="gap-1 shrink-0">
                    Carry forward <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {phase === 'complete' && (
            <Card>
              <CardContent className="p-12 text-center space-y-4">
                <BadgeCheck className="w-9 h-9 mx-auto text-primary" />
                <h2 className="font-serif text-2xl">Added to the care record</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  {carriedCount} reviewed {carriedCount === 1 ? 'finding' : 'findings'} from{' '}
                  <strong className="text-foreground">{sourceName}</strong> {carriedCount === 1 ? 'is' : 'are'} now
                  waiting for confirmation on the care dashboard, each with its source quote attached.
                </p>
                <div className="flex flex-wrap gap-3 justify-center pt-2">
                  <Button asChild className="gap-1">
                    <Link href="/dashboard">Review on the dashboard <ArrowRight className="w-4 h-4" /></Link>
                  </Button>
                  <Button variant="outline" onClick={reset} className="gap-1">
                    <RotateCcw className="w-3.5 h-3.5" /> Review another document
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
