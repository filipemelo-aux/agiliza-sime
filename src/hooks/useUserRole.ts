import { useAuth } from "@/contexts/AuthContext";

export function useUserRole() {
  return useAuth();
}
