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
		// Proxy /api/* to wrangler dev for local development with HMR
		proxy: {
			"/api": {
				target: "http://localhost:8787",
				changeOrigin: true,
				// Preserve localhost as Host header for wrangler to recognize as local dev
				headers: {
					Host: "localhost:8787",
				},
			},
		},
	},
});
