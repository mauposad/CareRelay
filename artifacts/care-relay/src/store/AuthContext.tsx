import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSession, listCircles, register as registerUser, signIn as signInUser, signOut as signOutUser } from "@workspace/api-client-react";
import type { Circle, SessionUser } from "@workspace/api-client-react";

export type AuthUser = SessionUser;
export type CareCircle = Circle;

type AuthContextValue = {
  user: AuthUser | null;
  circles: CareCircle[];
  activeCircle: CareCircle | null;
  setActiveCircle: (circle: CareCircle) => void;
  isLoading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [circles, setCircles] = useState<CareCircle[]>([]);
  const [activeCircle, setActiveCircleState] = useState<CareCircle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextUser = await getSession();
      setUser(nextUser);
      const nextCircles = await listCircles();
      setCircles(nextCircles);
      setActiveCircleState((current) => nextCircles.find((circle) => circle.id === current?.id) ?? nextCircles[0] ?? null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to restore your session";
      // A missing session is an expected signed-out state, not a fatal app error.
      if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
        setUser(null);
        setCircles([]);
        setActiveCircleState(null);
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const nextUser = await signInUser({ email, password });
    setUser(nextUser);
    setCircles(nextUser.circles);
    setActiveCircleState(nextUser.circles[0] ?? null);
  }, [refresh]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    setError(null);
    const nextUser = await registerUser({ displayName: name, email, password });
    setUser(nextUser);
    setCircles(nextUser.circles);
    setActiveCircleState(nextUser.circles[0] ?? null);
  }, [refresh]);

  const signOut = useCallback(async () => {
    await signOutUser();
    setUser(null);
    setCircles([]);
    setActiveCircleState(null);
  }, []);

  const value = useMemo(() => ({
    user, circles, activeCircle,
    setActiveCircle: setActiveCircleState,
    isLoading, error, signIn, register, signOut, refresh,
  }), [user, circles, activeCircle, isLoading, error, signIn, register, signOut, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}