import { LinkProvider, ThemeProvider, TooltipProvider } from "@nocoo/basalt";
import { AccentProvider } from "@nocoo/basalt/providers/accent";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router";
import { SWRConfig } from "swr";
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
	className,
	children,
}: {
	href: string;
	className?: string;
	children?: React.ReactNode;
}) {
	if (
		href.startsWith("http://") ||
		href.startsWith("https://") ||
		href.startsWith("mailto:") ||
		href.startsWith("tel:")
	) {
		return (
			<a href={href} className={className}>
				{children}
			</a>
		);
	}
	return (
		<Link to={href} className={className}>
			{children}
		</Link>
	);
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
							</BrowserRouter>
						</SWRConfig>
					</TooltipProvider>
				</LinkProvider>
			</AccentProvider>
		</ThemeProvider>
	);
}
