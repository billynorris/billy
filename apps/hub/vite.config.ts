import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "/" — the CloudFront Function prepends each app's S3 prefix, so assets
// are referenced from the root and resolved per-app at the edge.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
