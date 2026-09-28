import { Button } from "@nocoo/basalt";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { initializeEnvironment } from "./environment";

let startupError: string | null = null;
try {
	await initializeEnvironment();
} catch (error) {
	startupError = error instanceof Error ? error.message : "Local environment startup failed";
}

const root = document.getElementById("root");
if (!root) {
	throw new Error("Root element not found");
}

createRoot(root).render(
	<StrictMode>
		{startupError ? (
			<main className="p-6 space-y-4">
				<h1>Environment unavailable</h1>
				<p role="alert">{startupError}</p>
				<Button
					onClick={() => {
						try {
							localStorage.removeItem("bat:environment-mode");
							sessionStorage.removeItem("bat:environment-instance");
						} catch {}
						window.location.reload();
					}}
				>
					Retry default environment
				</Button>
			</main>
		) : (
			<App />
		)}
	</StrictMode>,
);
