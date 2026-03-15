import type { Metadata } from "next";
import { DM_Sans, Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
});

const dmSans = DM_Sans({
	variable: "--font-dm-sans",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
	metadataBase: new URL(process.env.NEXTAUTH_URL || "http://localhost:7020"),
	title: "bat - Infrastructure Monitoring",
	description: "Infrastructure monitoring dashboard",
	openGraph: {
		title: "bat - Infrastructure Monitoring",
		description: "Infrastructure monitoring dashboard",
		type: "website",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: blocking script to prevent FOUC */}
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var s=localStorage.getItem("theme");var d=window.matchMedia("(prefers-color-scheme:dark)").matches;if(s==="dark"||(s!=="light"&&d))document.documentElement.classList.add("dark")}catch(e){}})()`,
					}}
				/>
			</head>
			<body className={`${inter.variable} ${dmSans.variable} antialiased`}>
				<AuthProvider>{children}</AuthProvider>
			</body>
		</html>
	);
}
