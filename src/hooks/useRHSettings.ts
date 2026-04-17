/**
 * Hook que expõe RHSettings como estado reativo, observando o serviço.
 * Garante uma única fonte da verdade para configurações em toda a app.
 */
import { useEffect, useState, useCallback } from "react";
import { rhSettings, type RHSettings } from "@/services/rh/rhSettings";

export function useRHSettings() {
  const [settings, setSettings] = useState<RHSettings>(() => rhSettings.get());

  useEffect(() => {
    return rhSettings.subscribe((s) => setSettings(s));
  }, []);

  const patch = useCallback((partial: Partial<RHSettings>) => {
    rhSettings.patch(partial);
  }, []);

  const setSalaryOverride = useCallback((id: string, value: number | null) => {
    rhSettings.setSalaryOverride(id, value);
  }, []);

  return { settings, patch, setSalaryOverride };
}
