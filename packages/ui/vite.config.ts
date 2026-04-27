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
			// Proxy /api/* to the prod browser entry so local dev sees real data.
			// Cloudflare Access service-token headers come from .env.local;
			// without them prod returns the Access login HTML.
			proxy: {
				"/api": {
					target: "https://bat.hexly.ai",
					changeOrigin: true,
					secure: true,
					headers: {
						"CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID ?? "",
						"CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET ?? "",
					},
				},
			},
		},
	};
});
