import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api, ApiError, setAuthToken, setUnauthorizedHandler } from "@/api/client";
import type { Outlet, User } from "@/api/types";
import { getItem, KEYS, removeItem, setItem } from "@/lib/storage";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: User; outlets: Outlet[] };

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const logout = useCallback(async () => {
    setAuthToken(null);
    await removeItem(KEYS.token);
    queryClient.clear();
    setState({ status: "signedOut" });
  }, [queryClient]);

  // Any 401 from an authenticated route ends the session.
  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Restore a stored session on launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getItem(KEYS.token);
      if (!token) {
        if (!cancelled) setState({ status: "signedOut" });
        return;
      }
      setAuthToken(token);
      try {
        const me = await api.me();
        if (!cancelled) setState({ status: "signedIn", user: me.user, outlets: me.outlets });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          await logout();
        } else {
          // Server unreachable: keep the token, but show login so the user can retry.
          setAuthToken(null);
          setState({ status: "signedOut" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email.trim(), password);
    setAuthToken(res.token);
    await setItem(KEYS.token, res.token);
    setState({ status: "signedIn", user: res.user, outlets: res.outlets });
  }, []);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** For screens rendered only while signed in. */
export function useSession() {
  const { state, logout } = useAuth();
  if (state.status !== "signedIn") throw new Error("useSession used while signed out");
  const canApprove = state.user.role === "OWNER" || state.user.role === "MANAGER";
  return { user: state.user, outlets: state.outlets, canApprove, logout };
}
