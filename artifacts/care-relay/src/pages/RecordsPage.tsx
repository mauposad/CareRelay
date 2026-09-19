import { useAuth } from "../store/AuthContext";
import { getListApprovalsQueryKey, getListRecordsQueryKey, useApproveRequest, useCreateApproval, useCreateRecord, useListApprovals, useListRecords, useRejectApproval } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function RecordsPage() {
  const { activeCircle } = useAuth();
  const circleId = activeCircle?.id ?? "";
  const canListApprovals = activeCircle?.role !== "family";
  const records = useListRecords(circleId, {
    query: { enabled: Boolean(circleId), queryKey: getListRecordsQueryKey(circleId) },
  });
  const approvals = useListApprovals(circleId, {
    query: {
      enabled: Boolean(circleId) && canListApprovals,
      queryKey: getListApprovalsQueryKey(circleId),
    },
  });
  const queryClient = useQueryClient();
  const approve = useApproveRequest();
  const reject = useRejectApproval();
  const createRecord = useCreateRecord();
  const createApproval = useCreateApproval();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("appointment");
  const canRequestApproval = activeCircle?.tier === "transitional"
    && (activeCircle.role === "primary_user" || activeCircle.role === "primary_caretaker");
  const canCreateDirectly = activeCircle?.role === "primary_physician"
    || (activeCircle?.role === "primary_user" && activeCircle.tier === "non_assisted")
    || (activeCircle?.role === "primary_caretaker" && activeCircle.tier === "fully_assisted");
  const canWrite = canRequestApproval || canCreateDirectly;
  const submitRecord = () => {
    if (!title || !activeCircle) return;
    const data = { kind, title };
    const onSuccess = () => { setTitle(""); void queryClient.invalidateQueries({ queryKey: getListRecordsQueryKey(circleId) }); void queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey(circleId) }); };
    if (canRequestApproval) createApproval.mutate({ circleId, data: { action: "create_record", payload: data } }, { onSuccess });
    else createRecord.mutate({ circleId, data }, { onSuccess });
  };

  if (!activeCircle) return <div className="py-20 text-center text-muted-foreground" data-testid="status-empty-circles">No authorized care circles are available.</div>;
  if (records.isLoading || (canListApprovals && approvals.isLoading)) return <div className="py-20 flex justify-center" data-testid="status-dashboard-loading"><Loader2 className="animate-spin" /></div>;
  if (records.isError || (canListApprovals && approvals.isError)) return <div className="py-20 text-center text-destructive" data-testid="status-dashboard-error">This care circle could not be loaded. Please try again.</div>;

  return <div className="max-w-5xl mx-auto space-y-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm text-muted-foreground">{activeCircle.name}</p><h1 className="text-3xl font-serif">{activeCircle.recipientName}&apos;s Care Center</h1><p className="text-muted-foreground mt-1">Your access: {activeCircle.role.replaceAll("_", " ")} · {activeCircle.tier.replaceAll("_", " ")}</p></div>
      <Badge variant="secondary" className="gap-2"><ShieldCheck className="w-3 h-3" />Server-authorized view</Badge>
    </div>
    <div className="grid md:grid-cols-2 gap-6">
      {canWrite && <Card><CardHeader><CardTitle>Add care record</CardTitle><CardDescription>{activeCircle.tier === "transitional" ? "This change will wait for dual approval." : "Changes are applied by the server immediately."}</CardDescription></CardHeader><CardContent className="space-y-3"><Input placeholder="Record title" value={title} onChange={(event) => setTitle(event.target.value)} data-testid="input-record-title" /><select className="w-full rounded-md border bg-background p-2" value={kind} onChange={(event) => setKind(event.target.value)}><option value="appointment">Appointment</option><option value="medicine">Medicine</option><option value="exercise">Exercise</option><option value="status">Status update</option></select><Button onClick={submitRecord} disabled={!title || createRecord.isPending || createApproval.isPending} data-testid="button-create-record">{createRecord.isPending || createApproval.isPending ? "Saving…" : activeCircle.tier === "transitional" ? "Request change" : "Add record"}</Button></CardContent></Card>}
      <Card><CardHeader><CardTitle>Care records</CardTitle></CardHeader><CardContent className="space-y-3">
        {!records.data?.length && <p className="text-sm text-muted-foreground" data-testid="status-empty-records">No care records have been added yet.</p>}
        {records.data?.map((record) => <div className="rounded-lg border p-3" key={record.id} data-testid={`record-${record.id}`}><p className="font-medium">{record.title}</p><p className="text-xs text-muted-foreground">{record.kind}{record.dueAt ? ` · ${new Date(record.dueAt).toLocaleString()}` : ""}</p>{record.details && <p className="text-sm mt-2">{record.details}</p>}</div>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Pending approvals</CardTitle></CardHeader><CardContent className="space-y-3">
        {!canListApprovals && <p className="text-sm text-muted-foreground">Approval work is limited to the primary user and care team.</p>}
        {canListApprovals && !approvals.data?.length && <p className="text-sm text-muted-foreground" data-testid="status-empty-approvals">No pending approval requests.</p>}
        {approvals.data?.map((approval) => <div className="rounded-lg border p-3 flex items-center justify-between gap-3" key={approval.id} data-testid={`approval-${approval.id}`}><div><p className="font-medium">{approval.action.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground capitalize">{approval.status}</p></div>{approval.status === "pending" && (activeCircle.role === "primary_user" || activeCircle.role === "primary_caretaker") && <div className="flex gap-2"><button className="text-sm rounded-md border px-3 py-1.5 hover:bg-muted" disabled={approve.isPending} onClick={() => approve.mutate({ circleId, approvalId: approval.id }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey(circleId) }); void queryClient.invalidateQueries({ queryKey: getListRecordsQueryKey(circleId) }); } })} data-testid={`button-approve-${approval.id}`}>{approve.isPending ? "Approving…" : "Approve"}</button><button className="text-sm rounded-md border px-3 py-1.5 hover:bg-muted" disabled={reject.isPending} onClick={() => reject.mutate({ circleId, approvalId: approval.id }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey(circleId) }); } })} data-testid={`button-reject-${approval.id}`}>Reject</button></div>}</div>)}
      </CardContent></Card>
    </div>
  </div>;
}