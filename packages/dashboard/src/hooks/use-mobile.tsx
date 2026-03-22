import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Returns whether the viewport is below the mobile breakpoint.
 *
 * Returns `undefined` during SSR / before the first client-side effect,
 * so consumers can distinguish "not yet known" from "definitely desktop".
 * The AppShell uses CSS media queries to hide/show sidebar during that
 * brief window, avoiding a layout flash.
 */
export function useIsMobile(): boolean | undefined {
	const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);

	useEffect(() => {
		const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
		const onChange = () => {
			setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
		};
		mql.addEventListener("change", onChange);
		setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
		return () => mql.removeEventListener("change", onChange);
	}, []);

	return isMobile;
}
