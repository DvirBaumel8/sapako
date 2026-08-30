import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { saveBranch, loadBranch, clearStoredBranch } from './branchStorage';
import type { Branch } from '../api/types';

interface BranchState {
  selectedBranch: Branch | null;
  /** False until the persisted branch has been read back on launch. */
  isRestoring: boolean;
  selectBranch: (branch: Branch) => void;
  clearBranch: () => void;
}

const BranchContext = createContext<BranchState | undefined>(undefined);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  // The selection used to live only in memory. On native that was nearly
  // invisible, since the app stays resident between uses — but an installed
  // web app is a fresh page load every launch, so the user was sent back to
  // branch selection every single time, and any refresh lost their place.
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadBranch();
      if (!cancelled) {
        if (stored) {
          setSelectedBranch(stored);
        }
        setIsRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectBranch = useCallback((branch: Branch) => {
    setSelectedBranch(branch);
    // Fire-and-forget: the UI must not wait on storage to navigate, and a
    // failed write only costs the user a re-selection next launch.
    void saveBranch(branch);
  }, []);

  const clearBranch = useCallback(() => {
    setSelectedBranch(null);
    void clearStoredBranch();
  }, []);

  const value = useMemo(
    () => ({ selectedBranch, isRestoring, selectBranch, clearBranch }),
    [selectedBranch, isRestoring, selectBranch, clearBranch],
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
