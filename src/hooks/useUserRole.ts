import { useAuth } from "@/contexts/AuthContext";

export function useUserRole() {
  const auth = useAuth();
  return {
    ...auth,
    // Operador: acesso total exceto configurações. Consultor: visualiza tudo, não edita.
    hasAdminAccess: auth.isAdmin || auth.isModerator || auth.isOperador || auth.isConsultor,
    canEdit: auth.isAdmin || auth.isModerator || auth.isOperador,
    canAccessSettings: auth.isAdmin || auth.isModerator,
  };
}
