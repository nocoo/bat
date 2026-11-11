import { createContext, type ReactNode, useCallback, useContext, useState } from "react";

interface MobileNavContextValue {
	mobileOpen: boolean;
	setMobileOpen: (open: boolean) => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
	const [mobileOpen, setMobileOpen] = useState(false);
	const setOpen = useCallback((open: boolean) => {
		setMobileOpen(open);
	}, []);

	return (
		<MobileNavContext.Provider value={{ mobileOpen, setMobileOpen: setOpen }}>
			{children}
		</MobileNavContext.Provider>
	);
}

export function useMobileNav() {
	const context = useContext(MobileNavContext);
	if (!context) {
		throw new Error("useMobileNav must be used within a MobileNavProvider");
	}
	return context;
}
