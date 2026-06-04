import { createContext, useContext, useState, type ReactNode } from 'react';
import { getApiAuthToken, setApiAuthToken, setApiRefreshToken } from '@/services/api/core';

interface Session {
  access_token: string;
  refresh_token?: string;
}
interface AuthValue {
  isAuthenticated: boolean;
  setSession: (s: Session) => void;
  logout: () => void;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string>(() => getApiAuthToken());
  const setSession = (s: Session) => {
    setApiAuthToken(s.access_token);
    if (s.refresh_token) setApiRefreshToken(s.refresh_token);
    setToken(s.access_token);
  };
  const logout = () => {
    setApiAuthToken('');
    setApiRefreshToken('');
    setToken('');
  };
  return (
    <AuthCtx.Provider value={{ isAuthenticated: Boolean(token), setSession, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
