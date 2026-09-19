import { useState } from 'react';
import { useCareContext } from '../../store/CareContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mic, MessageSquarePlus, Loader2, FileText, Sparkles } from 'lucide-react';
import { mockTranscriptionProvider } from '../../lib/providers/transcription';
import { MessageSource } from '../../types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function MessageIngest() {
  const { ingestMessage, isProcessing, currentPersona, extractionStatus, lastExtraction } = useCareContext();
  const [text, setText] = useState('');
  const [source, setSource] = useState<MessageSource>('whatsapp');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const handleTextSubmit = async () => {
    if (!text.trim() || isProcessing) return;
    await ingestMessage(text, source, currentPersona.id);
    setText('');
  };

  const handleSimulateVoice = async () => {
    setIsRecording(true);
    // Simulate recording time
    await new Promise(r => setTimeout(r, 2000));
    setIsRecording(false);
    
    setIsTranscribing(true);
    try {
      const result = await mockTranscriptionProvider.transcribeAudio(new Blob());
      // Show the transcript in the text box so they can edit/review before submit
      setText(result.transcript);
      setSource('voice');
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground px-1">
        Paste one family update. Review the care facts. See what each person receives.
      </p>
      {extractionStatus && !extractionStatus.aiEnabled && (
        <p role="note" className="text-xs text-amber-700 dark:text-amber-300 px-1">
          Demo extraction: no API key is configured, so only the two sample updates extract in full. Other text is saved as a general note for reviewer confirmation.
        </p>
      )}
      {lastExtraction && (
        <p role="status" className="text-xs px-1 flex items-center gap-1 text-muted-foreground">
          <Sparkles className="w-3 h-3" />
          {lastExtraction.mode === 'ai'
            ? `Last update read by ${extractionStatus?.model ?? 'the extraction model'}.`
            : `Last update used demo extraction${lastExtraction.fallbackReason ? ` (${lastExtraction.fallbackReason})` : ''}.`}
        </p>
      )}
      <Card className="border shadow-sm bg-card overflow-hidden">
        <Tabs defaultValue="text" className="w-full">
          <div className="bg-muted/40 border-b px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageSquarePlus className="w-4 h-4" />
              Add Update
            </span>
            <TabsList className="h-8">
              <TabsTrigger value="text" className="text-xs">Paste / Type</TabsTrigger>
              <TabsTrigger value="voice" className="text-xs">Voice Note</TabsTrigger>
            </TabsList>
          </div>

          <CardContent className="p-4">
          <TabsContent value="text" className="m-0 space-y-4">
            <Button variant="outline" size="sm" disabled={isProcessing} onClick={() => setText('PT moved to Friday at 10. John can drive. Mom felt tired after breakfast.')}>
              Try sample update
            </Button>
              <Textarea 
                placeholder="Paste a message thread or type an update..." 
                className="min-h-[100px] resize-none bg-background focus-visible:ring-primary/50"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={isProcessing}
              />
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Simulated source</span>
                  <Select value={source} onValueChange={(val) => setSource(val as MessageSource)} disabled={isProcessing}>
                    <SelectTrigger className="w-[140px] h-8 text-xs" aria-label="Simulated source metadata">
                      <SelectValue placeholder="Choose source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="imessage">iMessage</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="internal">Internal Note</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleTextSubmit} disabled={!text.trim() || isProcessing} size="sm">
                  {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</> : 'Process Update'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="voice" className="m-0 space-y-4">
              {!text ? (
                 <div className="flex flex-col items-center justify-center py-6 space-y-4">
                  <Button 
                    size="lg" 
                    variant={isRecording ? "destructive" : "secondary"}
                    className="rounded-full w-16 h-16 p-0 shadow-sm transition-all"
                    onClick={handleSimulateVoice}
                    disabled={isRecording || isTranscribing}
                  >
                    {isTranscribing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Mic className="w-6 h-6" />}
                  </Button>
                  <div className="text-center">
                    <p className="text-sm font-medium">
                      {isRecording ? "Recording demo voice..." : 
                       isTranscribing ? "Transcribing with AI..." : 
                       "Tap to simulate voice recording"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Simulated voice source: browser mic is disabled and fixed demo audio is used.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                  <div className="flex items-center gap-2 text-sm text-primary font-medium">
                    <FileText className="w-4 h-4" />
                    Review Transcript
                  </div>
                  <Textarea 
                    className="min-h-[100px] resize-none bg-background focus-visible:ring-primary/50"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={isProcessing}
                  />
                  <div className="flex justify-between items-center">
                    <Button variant="ghost" size="sm" onClick={() => setText('')} disabled={isProcessing}>
                      Discard
                    </Button>
                    <Button onClick={handleTextSubmit} disabled={!text.trim() || isProcessing} size="sm">
                      {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</> : 'Process Transcript'}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
