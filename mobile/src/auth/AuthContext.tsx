import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { getToken, setToken, clearToken } from './tokenStorage';
import { setUnauthorizedHandler } from '../api/client';
import { login as loginRequest } from '../api/auth';
import type { Role } from '../api/types';

interface JwtPayload {
  sub: string;
  role: Role;
}

interface AuthState {
  isLoading: boolean;
  userId: string | null;
  role: Role | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

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
    () => ({ isLoading, userId, role, login, logout }),
    [isLoading, userId, role],
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
