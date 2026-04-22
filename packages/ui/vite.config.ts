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
		// Proxy /api/* to local wrangler dev (bun dev).
		// entry-control bypasses localhost / *.dev.hexly.ai, so browser read
		// routes work against local D1 without Access JWT.
		proxy: {
			"/api": {
				target: "http://localhost:8787",
				changeOrigin: true,
			},
		},
	},
});
