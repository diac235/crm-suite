import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  apiGet,
  apiPost,
  consumeRefreshedUser,
  refreshAccessToken,
  setAccessToken,
  setUnauthorizedHandler,
} from '../lib/api';
import { setCurrencyConfig } from '../lib/format';
import type { AuthUser } from '../types';

interface LoginResult {
  accessToken: string;
  user: AuthUser;
  mustChangePassword: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (...codes: string[]) => boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setMustChangePassword(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
  }, [clearSession]);

  // Al montar se intenta recuperar la sesión con la cookie de refresco.
  // refreshAccessToken() está deduplicado, por lo que el doble montaje de
  // React StrictMode no dispara dos rotaciones de token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await refreshAccessToken();
        if (cancelled) return;
        if (!token) {
          clearSession();
          return;
        }
        const refreshed = consumeRefreshedUser<AuthUser>();
        if (refreshed) setUser(refreshed);
        const me = await apiGet<AuthUser & { mustChangePassword: boolean }>('/auth/me');
        if (cancelled) return;
        setMustChangePassword(me.mustChangePassword);
        if (!refreshed) setUser(me);
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  // Configuración pública (moneda) para el formateo de importes.
  useEffect(() => {
    if (!user) return;
    apiGet<Record<string, unknown>>('/settings/public')
      .then((settings) => {
        const currency = settings['finance.currency'] as
          | { code: string; symbol: string; locale: string; decimals: number }
          | undefined;
        if (currency) setCurrencyConfig(currency);
      })
      .catch(() => undefined);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiPost<LoginResult>('/auth/login', { email, password });
    setAccessToken(result.accessToken);
    setUser(result.user);
    setMustChangePassword(result.mustChangePassword);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const me = await apiGet<AuthUser & { mustChangePassword: boolean; role: { id: string; slug: string } }>(
      '/auth/me',
    );
    setMustChangePassword(me.mustChangePassword);
    setUser((previous) => (previous ? { ...previous, ...me, permissions: me.permissions } : previous));
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const isSuperAdmin = user?.roleSlug === 'superadmin';
    return {
      user,
      loading,
      mustChangePassword,
      login,
      logout,
      refreshUser,
      isSuperAdmin,
      can: (...codes: string[]) => {
        if (!user) return false;
        if (isSuperAdmin) return true;
        return codes.some((code) => user.permissions.includes(code));
      },
    };
  }, [user, loading, mustChangePassword, login, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
