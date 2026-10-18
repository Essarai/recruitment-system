import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    proxy: {"/mcp":"http://127.0.0.1:3001","/api":"http://127.0.0.1:3001"},
    fs: {deny:[".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/INITIAL_LOGIN.txt", "**/server/**"]},
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
