import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';
import { BranchProvider, useBranch } from '../../src/branch/BranchContext';

function Gate() {
  const { selectedBranch } = useBranch();
  if (!selectedBranch) {
    return <Redirect href="/select-branch" />;
  }
  return <Stack />;
}

export default function AppLayout() {
  const { isLoading, userId } = useAuth();

  if (isLoading) {
    return null;
  }
  if (!userId) {
    return <Redirect href="/login" />;
  }
  return (
    <BranchProvider>
      <Gate />
    </BranchProvider>
  );
}
