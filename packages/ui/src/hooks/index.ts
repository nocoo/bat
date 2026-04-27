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
	useHostMaintenance,
	useHostMetrics,
	useHosts,
	useHostTags,
	useHostTagsFor,
	useHostTier2,
	useMe,
	useSetup,
	useTags,
	useWebhooks,
} from "./queries";
export { useIsMobile } from "./use-mobile";
