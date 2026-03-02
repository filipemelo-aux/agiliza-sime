import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

function autoVersionPlugin(): Plugin {
  return {
    name: "auto-version",
    writeBundle() {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");

      // Read existing version to determine counter
      const versionPath = path.resolve(__dirname, "dist/version.json");
      const publicVersionPath = path.resolve(__dirname, "public/version.json");
      const datePrefix = `1.0.0.${day}${month}`;

      let counter = 1;
      try {
        const existing = JSON.parse(fs.readFileSync(publicVersionPath, "utf-8"));
        if (existing.version && existing.version.startsWith(datePrefix + ".")) {
          const prev = parseInt(existing.version.split(".").pop() || "0", 10);
          counter = prev + 1;
        }
      } catch { /* first build */ }

      const version = `${datePrefix}.${counter}`;
      const content = JSON.stringify({ version, updatedAt: now.toISOString() }, null, 2);

      // Write to both public (source) and dist (output)
      fs.writeFileSync(publicVersionPath, content + "\n");
      try { fs.writeFileSync(versionPath, content + "\n"); } catch { /* dist may not exist yet */ }

      console.log(`[auto-version] Generated version: ${version}`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    autoVersionPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query"],
  },
}));
