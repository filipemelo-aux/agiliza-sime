import { useAuth } from "@/contexts/AuthContext";

export function useUserRole() {
  const auth = useAuth();
  return {
    ...auth,
    // Operador has same access as admin/moderator to all pages except settings
    hasAdminAccess: auth.isAdmin || auth.isModerator || auth.isOperador,
  };
}
