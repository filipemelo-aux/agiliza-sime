import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

type AppRole = "admin" | "moderator" | "user";

interface AuthContextType {
  user: User | null;
  roles: AppRole[];
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  roles: [],
  isAdmin: false,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);

  const fetchRoles = useCallback(async (userId: string) => {
    setRolesLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error) throw error;

      const userRoles = data?.map((r) => r.role as AppRole) || [];
      setRoles(userRoles);
      setIsAdmin(userRoles.includes("admin"));
    } catch (error) {
      console.error("Error fetching roles:", error);
      setRoles([]);
      setIsAdmin(false);
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    let currentUserId: string | null = null;
    let initialized = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Ignore token refresh events entirely — they don't change user identity
        if (event === 'TOKEN_REFRESHED') return;

        const newUser = session?.user ?? null;

        if (newUser) {
          if (event === 'SIGNED_IN' || newUser.id !== currentUserId) {
            currentUserId = newUser.id;
            setUser(newUser);
            setTimeout(() => {
              fetchRoles(newUser.id);
            }, 0);
          }
        } else {
          // Only sign out if we explicitly got a SIGNED_OUT event
          if (event === 'SIGNED_OUT' && currentUserId !== null) {
            currentUserId = null;
            setUser(null);
            setRoles([]);
            setIsAdmin(false);
            setRolesLoading(false);
          }
        }
        if (!initialized) {
          initialized = true;
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        currentUserId = sessionUser.id;
        fetchRoles(sessionUser.id);
      } else {
        setRolesLoading(false);
      }
      if (!initialized) {
        initialized = true;
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchRoles]);

  const isLoading = loading || (user !== null && rolesLoading);

  return (
    <AuthContext.Provider value={{ user, roles, isAdmin, loading: isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
