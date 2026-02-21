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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            fetchRoles(session.user.id);
          }, 0);
        } else {
          setRoles([]);
          setIsAdmin(false);
          setRolesLoading(false);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRoles(session.user.id);
      } else {
        setRolesLoading(false);
      }
      setLoading(false);
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
