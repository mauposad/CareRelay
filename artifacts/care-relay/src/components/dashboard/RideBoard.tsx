import { useState } from 'react';
import { useCareContext } from '../../store/CareContext';
import { useAuth } from '../../store/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Car, Check, ChevronDown, ChevronUp, Clock, MapPin, UserPlus, X } from 'lucide-react';
import { formatDateTime } from '../../lib/dateUtils';
import type { RideStatus, ServerRide } from '../../lib/api';

const STATUS_LABEL: Record<RideStatus, string> = {
  needs_driver: 'Needs a driver',
  offered: 'Waiting on a reply',
  accepted: 'Driver confirmed',
  declined: 'Declined',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function statusVariant(status: RideStatus): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'needs_driver') return 'destructive';
  if (status === 'accepted') return 'default';
  if (status === 'completed') return 'secondary';
  return 'outline';
}

function RideHistory({ ride }: { ride: ServerRide }) {
  const [open, setOpen] = useState(false);
  if (ride.history.length === 0) return null;

  return (
    <div className="pt-2 border-t">
      <button
        type="button"
        className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {open ? 'Hide' : 'Show'} handoff history ({ride.history.length})
      </button>
      {open && (
        <ol className="mt-2 space-y-1 text-xs text-muted-foreground border-l-2 border-border pl-3">
          {ride.history.map((entry) => (
            <li key={entry.id}>
              <span className="font-medium text-foreground capitalize">{entry.action}</span>
              {entry.detail ? ` — ${entry.detail}` : ''}
              <span className="opacity-60"> · {formatDateTime(entry.createdAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function RideBoard() {
  const { rides, members, assignRide, respondToRide, completeRide } = useCareContext();
  const { user, activeCircle } = useAuth();
  const [selectedDriver, setSelectedDriver] = useState<Record<string, string>>({});
  const [declineReason, setDeclineReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const canCoordinate = activeCircle?.role === 'primary_caretaker'
    || (activeCircle?.role === 'primary_user' && activeCircle.tier === 'non_assisted');

  // Family members only need to see the rides that involve them.
  const visible = canCoordinate
    ? rides
    : rides.filter((ride) => ride.driverId === user?.id || ride.status === 'needs_driver');

  if (visible.length === 0) return null;

  const act = async (id: string, run: () => Promise<void>) => {
    setBusy(id);
    try { await run(); } finally { setBusy(null); }
  };

  const open = visible.filter((ride) => !['completed', 'cancelled'].includes(ride.status));
  const past = visible.filter((ride) => ['completed', 'cancelled'].includes(ride.status));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl flex items-center gap-2">
          <Car className="w-5 h-5 text-primary" /> Getting there
        </h3>
        {open.some((ride) => ride.status === 'needs_driver') && (
          <Badge variant="destructive">
            {open.filter((ride) => ride.status === 'needs_driver').length} need a driver
          </Badge>
        )}
      </div>

      <div className="grid gap-3">
        {[...open, ...past].map((ride) => {
          const isMine = ride.driverId === user?.id;
          const awaitingMyAnswer = isMine && ride.status === 'offered';

          return (
            <Card key={ride.id} className={ride.status === 'needs_driver' ? 'border-destructive/40' : ''}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{ride.purpose}</div>
                    <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      {ride.pickupAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Pick up {formatDateTime(ride.pickupAt)}
                        </span>
                      )}
                      {ride.pickupLocation && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {ride.pickupLocation}
                          {ride.dropoffLocation ? ` → ${ride.dropoffLocation}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant={statusVariant(ride.status)}>{STATUS_LABEL[ride.status]}</Badge>
                </div>

                {ride.driverName && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Driver: </span>
                    <span className="font-medium">{ride.driverName}</span>
                    {isMine && <span className="text-muted-foreground"> (you)</span>}
                  </div>
                )}
                {ride.status === 'needs_driver' && ride.declineReason && (
                  <div className="text-sm text-amber-700 dark:text-amber-300">
                    Last answer: “{ride.declineReason}” — needs someone else.
                  </div>
                )}

                {/* Driver's own accept / decline */}
                {awaitingMyAnswer && (
                  <div className="rounded-lg bg-muted/40 p-3 space-y-2">
                    <div className="text-sm font-medium">You’ve been asked to drive.</div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Button
                        size="sm"
                        disabled={busy === ride.id}
                        onClick={() => act(ride.id, () => respondToRide(ride.id, true))}
                        className="gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> I can drive
                      </Button>
                      <Input
                        className="h-8 w-[190px] text-xs"
                        placeholder="Reason (optional)"
                        value={declineReason[ride.id] ?? ''}
                        onChange={(event) => setDeclineReason((prev) => ({ ...prev, [ride.id]: event.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === ride.id}
                        onClick={() => act(ride.id, () => respondToRide(ride.id, false, declineReason[ride.id]))}
                        className="gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Can’t make it
                      </Button>
                    </div>
                  </div>
                )}

                {/* Coordinator: offer or hand off */}
                {canCoordinate && ['needs_driver', 'offered'].includes(ride.status) && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      className="h-8 w-[200px] rounded-md border bg-background px-2 text-xs"
                      aria-label={`Choose a driver for ${ride.purpose}`}
                      data-testid={`select-driver-${ride.id}`}
                      value={selectedDriver[ride.id] ?? ''}
                      onChange={(event) => setSelectedDriver((prev) => ({ ...prev, [ride.id]: event.target.value }))}
                    >
                      <option value="">{ride.status === 'offered' ? 'Hand off to…' : 'Ask someone…'}</option>
                      {members
                        .filter((member) => member.role !== 'primary_physician' && member.userId !== ride.driverId)
                        .map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.displayName}
                          </option>
                        ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={!selectedDriver[ride.id] || busy === ride.id}
                      onClick={() => act(ride.id, () => assignRide(ride.id, selectedDriver[ride.id]!))}
                      data-testid={`button-assign-${ride.id}`}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      {ride.status === 'offered' ? 'Hand off' : 'Ask'}
                    </Button>
                  </div>
                )}

                {ride.status === 'accepted' && (canCoordinate || isMine) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={busy === ride.id}
                    onClick={() => act(ride.id, () => completeRide(ride.id))}
                  >
                    <Check className="w-3.5 h-3.5" /> Mark completed
                  </Button>
                )}

                <RideHistory ride={ride} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
