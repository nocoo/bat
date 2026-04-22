// Shared formatting helpers used across multiple routes/components.
// Pure functions only — kept out of components so they can be unit-tested
// without React.

/** Format a unix-seconds timestamp using the local-time toLocaleString. */
export function formatTimestamp(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleString();
}
