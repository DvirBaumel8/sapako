import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Branch } from '../api/types';

interface BranchState {
  selectedBranch: Branch | null;
  selectBranch: (branch: Branch) => void;
  clearBranch: () => void;
}

const BranchContext = createContext<BranchState | undefined>(undefined);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  const value = useMemo(
    () => ({
      selectedBranch,
      selectBranch: setSelectedBranch,
      clearBranch: () => setSelectedBranch(null),
    }),
    [selectedBranch],
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchState {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within BranchProvider');
  }
  return context;
}
