import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	build: {
		outDir: "../worker/static",
		emptyOutDir: true,
	},
	server: {
		port: 7025,
		allowedHosts: ["bat.dev.hexly.ai"],
		// Proxy /api/* to production worker for local development with HMR
		// Uses bat-ingest endpoint (no Access JWT required, but still needs API key)
		proxy: {
			"/api": {
				target: "https://bat-ingest.worker.hexly.ai",
				changeOrigin: true,
			},
		},
	},
});
