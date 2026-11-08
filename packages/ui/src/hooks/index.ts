// Re-export the centralized server-state queries (the MVVM "Model" layer)
// plus the small UI-side hooks. Keeping a single barrel lets routes/components
// import from `@/hooks` without caring how the data layer is organized.
export {
	EVENTS_PAGE_SIZE,
	useAlerts,
	useAllAllowedPorts,
	useAllowedPorts,
	useEvents,
	useHostDetail,
	useHostMetrics,
	useHosts,
	useHostTags,
	useHostTagsFor,
	useHostTier2,
	useMe,
	useSettings,
	useSetup,
	useTags,
	useWebhooks,
	useWorkstation,
	useWorkstationConnectivity,
	useWorkstationMetricsPages,
	useWorkstations,
} from "./queries";
export { useDeleteHost } from "./use-delete-host";
export { useDeleteWorkstation } from "./use-delete-workstation";
export { useIsMobile } from "./use-mobile";
