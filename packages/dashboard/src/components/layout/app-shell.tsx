"use client";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Breadcrumbs } from "./breadcrumbs";
import { Sidebar } from "./sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { ThemeToggle } from "./theme-toggle";

interface AppShellProps {
	children: React.ReactNode;
	breadcrumbs?: { label: string; href?: string }[];
}

function AppShellInner({ children, breadcrumbs = [] }: AppShellProps) {
	const isMobile = useIsMobile();
	const { mobileOpen, setMobileOpen } = useSidebar();
	const pathname = usePathname();

	// Whether JS has resolved the viewport — before this, CSS drives visibility
	const resolved = isMobile !== undefined;

	// Close mobile sidebar on route change
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname triggers sidebar close on route change
	useEffect(() => {
		setMobileOpen(false);
	}, [pathname, setMobileOpen]);

	// Prevent body scroll when mobile sidebar is open
	useEffect(() => {
		if (mobileOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [mobileOpen]);

	// Desktop sidebar: shown by CSS on md+ before JS resolves, then by JS
	const showDesktopSidebar = resolved ? !isMobile : true;
	// Mobile drawer: only rendered after JS resolves on mobile
	const showMobileDrawer = resolved && isMobile;
	// Hamburger: shown by CSS on <md before JS resolves, then by JS
	const showHamburger = resolved ? isMobile : true;

	return (
		<div className="flex min-h-screen w-full bg-background">
			{/* Desktop sidebar — CSS-hidden on mobile before JS resolves */}
			{showDesktopSidebar && (
				<div className={resolved ? undefined : "hidden md:contents"}>
					<Sidebar />
				</div>
			)}

			{showMobileDrawer && (
				<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
					<SheetContent
						side="left"
						className="w-[260px] p-0 sm:max-w-[260px]"
						showCloseButton={false}
					>
						<SheetHeader className="sr-only">
							<SheetTitle>Navigation Menu</SheetTitle>
							<SheetDescription>Browse bat dashboard pages</SheetDescription>
						</SheetHeader>
						<Sidebar mobile />
					</SheetContent>
				</Sheet>
			)}

			<main className="flex flex-1 flex-col min-h-screen min-w-0">
				{/* Header — no border, matching basalt */}
				<header className="flex h-14 shrink-0 items-center justify-between px-4 md:px-6">
					<div className="flex items-center gap-3">
						{showHamburger && (
							<button
								type="button"
								onClick={() => setMobileOpen(true)}
								aria-label="Open navigation menu"
								className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ${resolved ? "" : "md:hidden"}`}
							>
								<Menu className="h-5 w-5" aria-hidden="true" strokeWidth={1.5} />
							</button>
						)}
						<Breadcrumbs items={[{ label: "Home", href: "/" }, ...breadcrumbs]} />
					</div>
					<div className="flex items-center gap-1">
						<ThemeToggle />
					</div>
				</header>

				{/* Floating island content area */}
				<div className="flex-1 px-2 pb-2 md:px-3 md:pb-3">
					<div className="h-full rounded-[16px] md:rounded-[20px] bg-card p-3 md:p-5 overflow-y-auto">
						{children}
					</div>
				</div>
			</main>
		</div>
	);
}

export function AppShell({ children, breadcrumbs = [] }: AppShellProps) {
	return (
		<SidebarProvider>
			<AppShellInner breadcrumbs={breadcrumbs}>{children}</AppShellInner>
		</SidebarProvider>
	);
}
