import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, __dirname, "");
	return {
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
			// Proxy /api/* to local worker dev (or prod if target configured)
			proxy: {
				"/api": {
					target: env.VITE_API_TARGET || "http://127.0.0.1:37025",
					changeOrigin: true,
					secure: false,
					headers: {
						...(env.CF_ACCESS_CLIENT_ID ? { "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID } : {}),
						...(env.CF_ACCESS_CLIENT_SECRET
							? { "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET }
							: {}),
					},
				},
			},
		},
	};
});
