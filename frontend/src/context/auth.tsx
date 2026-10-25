import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, setCsrfToken } from "@/lib/api";
import type { AuthResponse, User } from "@/lib/types";

interface AuthApi {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery<AuthResponse>({
    queryKey: ["me"],
    queryFn: api.auth.me,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const user = query.data?.user ?? null;

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      setCsrfToken(null);
      queryClient.setQueryData(["me"], null);
    }
  }, [query.error, queryClient]);

  useEffect(() => {
    const handler = () => {
      queryClient.setQueryData(["me"], null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    };
    window.addEventListener("bv:unauthorized", handler);
    return () => window.removeEventListener("bv:unauthorized", handler);
  }, [queryClient]);

  const setUser = useCallback(
    (next: User | null) => {
      queryClient.setQueryData(["me"], next ? { user: next } : null);
    },
    [queryClient],
  );

  const refresh = useCallback(async () => {
    const result = await api.auth.me();
    queryClient.setQueryData(["me"], result);
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setCsrfToken(null);
      queryClient.setQueryData(["me"], null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    }
  }, [queryClient]);

  const value = useMemo<AuthApi>(
    () => ({ user, loading: query.isLoading, setUser, refresh, logout }),
    [user, query.isLoading, setUser, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
