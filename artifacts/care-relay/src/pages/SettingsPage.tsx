import { useState } from "react";
import { Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAuditQueryKey, getListCirclesQueryKey, getListMembersQueryKey,
  useAddMember, useChangeTier, useListAudit, useListMembers, useRemoveMember,
  useReplaceCaretaker,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "../store/AuthContext";

export default function SettingsPage() {
  const { activeCircle } = useAuth();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [memberRole, setMemberRole] = useState<"family" | "primary_caretaker">("family");
  const [notice, setNotice] = useState<string | null>(null);
  const id = activeCircle?.id ?? "";
  const members = useListMembers(id, { query: { enabled: Boolean(id), queryKey: getListMembersQueryKey(id) } });
  const audit = useListAudit(id, { query: { enabled: Boolean(id), queryKey: getListAuditQueryKey(id) } });
  const add = useAddMember(); const remove = useRemoveMember(); const tier = useChangeTier(); const caretaker = useReplaceCaretaker();
  if (!activeCircle || !["primary_user", "primary_caretaker", "primary_physician"].includes(activeCircle.role)) return <Redirect href="/" />;
  const canManage = activeCircle.role === "primary_physician"
    || (activeCircle.role === "primary_user" && activeCircle.tier !== "fully_assisted")
    || (activeCircle.role === "primary_caretaker" && activeCircle.tier !== "non_assisted");
  const canAssignCaretaker = activeCircle.role === "primary_physician";
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: getListMembersQueryKey(id) }); void queryClient.invalidateQueries({ queryKey: getListAuditQueryKey(id) }); void queryClient.invalidateQueries({ queryKey: getListCirclesQueryKey() }); };
  const showResult = (result: unknown) => { setNotice(result && typeof result === "object" && "status" in result ? `Request is ${(result as { status: string }).status}; both required approvals must complete it.` : "Change applied."); refresh(); };
  return <div className="max-w-5xl mx-auto space-y-8">
    <div><h1 className="text-3xl font-serif">Care circle settings</h1><p className="text-muted-foreground mt-1">{activeCircle.name} · {activeCircle.recipientName}</p></div>
    {notice && <p className="rounded-md bg-primary/10 p-3 text-sm" data-testid="status-settings-notice">{notice}</p>}
    <div className="grid lg:grid-cols-2 gap-6">
      <Card><CardHeader><CardTitle>Assistance tier</CardTitle><CardDescription>Tier changes are server-authorized and may require dual approval.</CardDescription></CardHeader><CardContent className="space-y-3"><Badge>{activeCircle.tier.replaceAll("_", " ")}</Badge>{canManage && <select className="w-full rounded-md border bg-background p-2" value={activeCircle.tier} onChange={(event) => tier.mutate({ circleId: id, data: { tier: event.target.value as "non_assisted" | "transitional" | "fully_assisted" } }, { onSuccess: showResult })} data-testid="select-assistance-tier"><option value="non_assisted">Non-assisted</option><option value="transitional">Transitional</option><option value="fully_assisted">Fully assisted</option></select>}</CardContent></Card>
       <Card><CardHeader><CardTitle>Membership</CardTitle><CardDescription>Only authorized roles can change this roster.</CardDescription></CardHeader><CardContent className="space-y-3">{members.isLoading ? <p>Loading roster…</p> : members.isError ? <p className="text-destructive">Roster unavailable.</p> : members.data?.map((member) => <div className="flex items-center justify-between gap-3 rounded-md border p-3" key={member.userId}><div><p className="font-medium">{member.displayName ?? member.email ?? member.userId}</p><p className="text-xs text-muted-foreground">{member.role.replaceAll("_", " ")}</p></div>{canManage && member.role !== "primary_physician" && <Button variant="outline" size="sm" onClick={() => remove.mutate({ circleId: id, userId: member.userId }, { onSuccess: showResult })} data-testid={`button-remove-member-${member.userId}`}>Remove</Button>}</div>)}{canManage && <div className="flex gap-2 pt-2"><Input placeholder="User ID" value={userId} onChange={(event) => setUserId(event.target.value)} data-testid="input-member-user-id" /><select className="rounded-md border bg-background px-2" value={memberRole} onChange={(event) => setMemberRole(event.target.value as typeof memberRole)}><option value="family">Family</option><option value="primary_caretaker">Caretaker</option></select><Button onClick={() => add.mutate({ circleId: id, data: { userId, role: memberRole } }, { onSuccess: (result) => { setUserId(""); showResult(result); } })} disabled={!userId || add.isPending} data-testid="button-add-member">Add</Button></div>}</CardContent></Card>
    </div>
    {canAssignCaretaker && <Card><CardHeader><CardTitle>Replace primary caretaker</CardTitle><CardDescription>Physician assignment authority is limited to this circle.</CardDescription></CardHeader><CardContent className="flex gap-2"><Input placeholder="Caretaker user ID" value={userId} onChange={(event) => setUserId(event.target.value)} data-testid="input-caretaker-user-id" /><Button onClick={() => caretaker.mutate({ circleId: id, data: { userId } }, { onSuccess: showResult })} disabled={!userId || caretaker.isPending} data-testid="button-replace-caretaker">Replace</Button></CardContent></Card>}
    <Card><CardHeader><CardTitle>Audit history</CardTitle><CardDescription>Append-only decisions for this care circle.</CardDescription></CardHeader><CardContent className="space-y-2">{audit.isLoading ? <p>Loading audit…</p> : audit.isError ? <p className="text-destructive">Audit history unavailable.</p> : audit.data?.length ? audit.data.map((entry) => <div className="border-b py-2 text-sm last:border-0" key={entry.id}><span className="font-medium">{entry.action}</span><span className="text-muted-foreground"> · {entry.outcome} · {new Date(entry.createdAt).toLocaleString()}</span></div>) : <p className="text-sm text-muted-foreground">No audit events yet.</p>}</CardContent></Card>
  </div>;
}