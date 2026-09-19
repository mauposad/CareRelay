import { useCareContext } from '../store/CareContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { PERSONAS } from '../lib/rbac';
import { Download, RotateCcw } from 'lucide-react';
import { Redirect } from 'wouter';

export default function SettingsPage() {
  const { state, updateProfile, resetDemo, currentPersona } = useCareContext();

  // Guard access
  if (currentPersona.role !== 'CARE_OWNER') {
    return <Redirect href="/" />;
  }

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "carerelay_export.json");
    a.click();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-serif">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage the care profile and review access scopes.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-card shadow-sm">
          <CardHeader>
            <CardTitle>Care Profile</CardTitle>
            <CardDescription>Adjust the coordination level for {state.profile.displayName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-medium">Support Level</label>
              <Select 
                value={state.profile.supportLevel.toString()} 
                onValueChange={(val) => updateProfile({ supportLevel: parseInt(val) as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Level 1 - Independent with reminders</SelectItem>
                  <SelectItem value="2">Level 2 - Assisted at home</SelectItem>
                  <SelectItem value="3">Level 3 - Coordinated care</SelectItem>
                  <SelectItem value="4">Level 4 - High-touch support</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Changes the required audit logging and escalation defaults.</p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Active Care Tags</label>
              <div className="flex flex-wrap gap-2">
                {['medication', 'mobility', 'exercise', 'nutrition', 'appointments'].map(tag => (
                  <Badge 
                    key={tag}
                    variant={state.profile.tags.includes(tag as any) ? 'default' : 'outline'}
                    className="cursor-pointer capitalize"
                    onClick={() => {
                      const newTags = state.profile.tags.includes(tag as any)
                        ? state.profile.tags.filter(t => t !== tag)
                        : [...state.profile.tags, tag];
                      updateProfile({ tags: newTags as any });
                    }}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm">
          <CardHeader>
            <CardTitle>Roles and access overview</CardTitle>
            <CardDescription>Read-only overview of who has access to this care circle; permissions are not editable here</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {PERSONAS.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border bg-background">
                  <div>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.title}</div>
                  </div>
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    {p.role.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 bg-card shadow-sm">
          <CardHeader>
            <CardTitle>Audit Log</CardTitle>
            <CardDescription>Server-side event history for coordination tracking</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
              {state.audit.map(entry => (
                <div key={entry.id} className="flex gap-4 text-sm p-2 border-b last:border-0">
                  <div className="w-32 shrink-0 text-muted-foreground">
                    {format(new Date(entry.timestamp), 'MMM d, HH:mm:ss')}
                  </div>
                  <div className="w-24 shrink-0 font-medium capitalize truncate">
                    {entry.actorId}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-primary mr-2">{entry.action}</span>
                    <span className="text-foreground">{entry.details}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-destructive/20 bg-destructive/5 shadow-sm">
          <CardHeader>
            <CardTitle className="text-destructive">System & Data</CardTitle>
            <CardDescription>Manage your demo data safely</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button variant="outline" className="gap-2" onClick={handleExport}>
              <Download className="w-4 h-4" />
              Export JSON
            </Button>
            <Button variant="outline" className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => { if (window.confirm('Replace locally saved imports, tasks, and changes with demo defaults?')) resetDemo(); }}>
              <RotateCcw className="w-4 h-4" />
              Reset Demo
            </Button>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
