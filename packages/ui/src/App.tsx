import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { SWRConfig } from "swr";
import {
	AlertsPage,
	EventsPage,
	HostDetailPage,
	HostsPage,
	SetupPage,
	TagsPage,
	WebhooksPage,
} from "./routes";

export function App() {
	return (
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
					<Route path="/setup" element={<SetupPage />} />
				</Routes>
			</BrowserRouter>
		</SWRConfig>
	);
}
