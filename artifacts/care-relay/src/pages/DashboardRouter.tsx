import { useCareContext } from '../store/CareContext';
import { Redirect } from 'wouter';
import { ROLE } from '../lib/rbac';
import { ElderDashboard } from '../components/dashboard/ElderDashboard';
import { PhysicianDashboard } from '../components/dashboard/PhysicianDashboard';
import { CaregiverDashboard } from '../components/dashboard/CaregiverDashboard';

export default function DashboardRouter() {
  const { currentPersona } = useCareContext();

  switch (currentPersona.role) {
    case ROLE.ELDER:
      return <ElderDashboard />;
    case ROLE.PHYSICIAN:
      return <PhysicianDashboard />;
    case ROLE.CARE_OWNER:
    case ROLE.PRIMARY_CAREGIVER:
    case ROLE.FAMILY_SUPPORT:
    case ROLE.FAMILY_VIEWER:
      return <CaregiverDashboard />;
    default:
      return <Redirect href="/" />;
  }
}
