import { LinkProvider, ThemeProvider, TooltipProvider } from "@nocoo/basalt";
import { AccentProvider } from "@nocoo/basalt/providers/accent";
import type { ComponentPropsWithRef } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router";
import { SWRConfig } from "swr";
import { AppShell } from "./components/layout";
import {
	AlertsPage,
	ConnectPage,
	DataRetentionPage,
	EventsPage,
	HostDetailPage,
	HostsPage,
	SetupPage,
	TagsPage,
	WebhooksPage,
} from "./routes";

function AppLink({
	href,
	...props
}: ComponentPropsWithRef<"a"> & {
	href: string;
}) {
	if (
		href.startsWith("http://") ||
		href.startsWith("https://") ||
		href.startsWith("mailto:") ||
		href.startsWith("tel:") ||
		href.startsWith("//")
	) {
		return <a href={href} {...props} />;
	}
	return <Link to={href} {...props} />;
}

export function App() {
	return (
		<ThemeProvider defaultTheme="system" storageKey="theme">
			<AccentProvider defaultAccent="rose">
				<LinkProvider render={AppLink}>
					<TooltipProvider delayDuration={0}>
						<SWRConfig
							value={{
								revalidateOnFocus: false,
								dedupingInterval: 5000,
							}}
						>
							<BrowserRouter>
								<AppShell>
									<Routes>
										<Route path="/" element={<Navigate to="/hosts" replace={true} />} />
										<Route path="/hosts" element={<HostsPage />} />
										<Route path="/hosts/:id" element={<HostDetailPage />} />
										<Route path="/alerts" element={<AlertsPage />} />
										<Route path="/events" element={<EventsPage />} />
										<Route path="/tags" element={<TagsPage />} />
										<Route path="/settings/webhooks" element={<WebhooksPage />} />
										<Route path="/settings/data" element={<DataRetentionPage />} />
										<Route path="/setup" element={<SetupPage />} />
										<Route path="/connect" element={<ConnectPage />} />
									</Routes>
								</AppShell>
							</BrowserRouter>
						</SWRConfig>
					</TooltipProvider>
				</LinkProvider>
			</AccentProvider>
		</ThemeProvider>
	);
}
