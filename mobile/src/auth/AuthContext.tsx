import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { jwtDecode } from 'jwt-decode';
import { getToken, setToken, clearToken } from './tokenStorage';
import { setUnauthorizedHandler } from '../api/client';
import { fetchMe, login as loginRequest } from '../api/auth';
import type { Role } from '../api/types';

interface JwtPayload {
  sub: string;
  role: Role;
}

interface AuthState {
  isLoading: boolean;
  userId: string | null;
  role: Role | null;
  // True for admins and for staff granted the can-edit-products flag.
  canEditProducts: boolean;
  // True while a logged-in non-admin's capability is still being fetched.
  isCapabilityLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  // Any failure (including a 404 for a deleted user) leaves `me` undefined,
  // which reads as "no capability" rather than crashing.
  const {
    data: me,
    isPending: isMePending,
    refetch: refetchMe,
  } = useQuery({ queryKey: ['me', userId], queryFn: fetchMe, enabled: !!userId, retry: false });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && userId) refetchMe();
    });
    return () => subscription.remove();
  }, [refetchMe, userId]);

  const canEditProducts = role === 'ADMIN' || (!!userId && !!me?.canEditProducts);
  const isCapabilityLoading = !!userId && role !== 'ADMIN' && isMePending;

  const applyToken = (token: string | null) => {
    if (!token) {
      setUserId(null);
      setRole(null);
      return;
    }
    const payload = jwtDecode<JwtPayload>(token);
    setUserId(payload.sub);
    setRole(payload.role);
  };

  useEffect(() => {
    (async () => {
      const existingToken = await getToken();
      applyToken(existingToken);
      setIsLoading(false);
    })();
    setUnauthorizedHandler(() => applyToken(null));
  }, []);

  const login = async (username: string, password: string) => {
    const token = await loginRequest(username, password);
    await setToken(token);
    applyToken(token);
  };

  const logout = async () => {
    await clearToken();
    applyToken(null);
  };

  const value = useMemo(
    () => ({ isLoading, userId, role, canEditProducts, isCapabilityLoading, login, logout }),
    [isLoading, userId, role, canEditProducts, isCapabilityLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
