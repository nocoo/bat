import { resolve } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	// Monorepo root for Turbopack (required for Docker builds)
	turbopack: {
		root: resolve(__dirname, "../.."),
	},
	// Allow cross-origin requests in development (e.g., from reverse proxies)
	allowedDevOrigins: ["localhost", "*.hexly.ai", "*.dev.hexly.ai"],
	// Allow loading images from external domains (e.g., Google avatars)
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
		],
	},
};

export default nextConfig;
