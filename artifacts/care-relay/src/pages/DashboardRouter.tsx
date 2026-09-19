import { useCareContext } from '../store/CareContext';
import { useAuth } from '../store/AuthContext';
import { Loader2 } from 'lucide-react';
import { ElderDashboard } from '../components/dashboard/ElderDashboard';
import { PhysicianDashboard } from '../components/dashboard/PhysicianDashboard';
import { CaregiverDashboard } from '../components/dashboard/CaregiverDashboard';

/**
 * Sends each member to the view built for them. The server has already
 * filtered what they can see; this chooses how it is presented.
 */
export default function DashboardRouter() {
  const { activeCircle } = useAuth();
  const { isLoading, error } = useCareContext();

  if (!activeCircle) {
    return (
      <div className="py-20 text-center text-muted-foreground" data-testid="status-empty-circles">
        No authorized care circles are available.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-20 flex justify-center" data-testid="status-dashboard-loading">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center text-destructive" data-testid="status-dashboard-error">
        {error}
      </div>
    );
  }

  switch (activeCircle.role) {
    case 'primary_user':
      return <ElderDashboard />;
    case 'primary_physician':
      return <PhysicianDashboard />;
    default:
      return <CaregiverDashboard />;
  }
}
