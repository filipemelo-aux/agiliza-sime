import { useState, useEffect, useCallback } from "react";

const CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
const VERSION_URL = "/version.json";

interface VersionInfo {
  version: string;
  updatedAt: string;
}

export function useVersionCheck() {
  const [currentVersion] = useState<string>(() => {
    return localStorage.getItem("app_version") || "";
  });
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;

      const data: VersionInfo = await res.json();
      const storedVersion = localStorage.getItem("app_version");

      if (!storedVersion) {
        // First visit — store version silently
        localStorage.setItem("app_version", data.version);
        return;
      }

      if (data.version !== storedVersion) {
        setNewVersion(data.version);
        setShowUpdate(true);
      }
    } catch {
      // Silently fail — no network, no problem
    }
  }, []);

  const applyUpdate = useCallback(() => {
    if (newVersion) {
      localStorage.setItem("app_version", newVersion);
    }
    window.location.reload();
  }, [newVersion]);

  const dismissUpdate = useCallback(() => {
    setShowUpdate(false);
  }, []);

  useEffect(() => {
    // Initial check after a short delay
    const initialTimeout = setTimeout(checkVersion, 5000);

    // Periodic checks
    const interval = setInterval(checkVersion, CHECK_INTERVAL);

    // Also check when tab becomes visible again
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkVersion();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [checkVersion]);

  return {
    currentVersion: currentVersion || "1.0.1",
    newVersion,
    showUpdate,
    applyUpdate,
    dismissUpdate,
  };
}
