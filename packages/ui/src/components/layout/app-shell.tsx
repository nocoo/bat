import {
	ContentIsland,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@nocoo/basalt";
import { AppHeader } from "@nocoo/basalt/components/app-header";
import {
	AppMain,
	AppSkipLink,
	AppShell as BasaltAppShell,
} from "@nocoo/basalt/components/app-shell";
import { Menu } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { Github } from "@/components/icons/github";
import { useIsMobile } from "@/hooks/use-mobile";
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
	const { pathname } = useLocation();

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
		<BasaltAppShell>
			<AppSkipLink>Skip to main content</AppSkipLink>
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
						className="w-[260px] max-w-[260px] border-0 bg-basalt-background p-0"
					>
						<SheetHeader className="sr-only">
							<SheetTitle>Navigation Menu</SheetTitle>
							<SheetDescription>Browse bat dashboard pages</SheetDescription>
						</SheetHeader>
						<Sidebar mobile={true} />
					</SheetContent>
				</Sheet>
			)}

			<AppMain>
				<AppHeader
					aria-label="Breadcrumb navigation"
					leading={
						showHamburger ? (
							<button
								type="button"
								onClick={() => setMobileOpen(true)}
								aria-label="Open navigation menu"
								className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ${resolved ? "" : "md:hidden"}`}
							>
								<Menu className="h-5 w-5" aria-hidden="true" strokeWidth={1.5} />
							</button>
						) : null
					}
					actions={
						<div className="flex items-center gap-1">
							<a
								href="https://github.com/nocoo/bat"
								target="_blank"
								rel="noopener noreferrer"
								aria-label="GitHub repository"
								className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
							>
								<Github className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.5} />
							</a>
							<ThemeToggle aria-label="Toggle theme" />
						</div>
					}
					breadcrumbs={
						breadcrumbs.length > 1
							? [{ label: "Home", href: "/" }, ...breadcrumbs.slice(0, -1)]
							: breadcrumbs[0]?.href
								? [{ label: "Home", href: "/" }]
								: [{ label: "Home", href: "/" }]
					}
					title={breadcrumbs.length > 0 ? (breadcrumbs[breadcrumbs.length - 1]?.label ?? "") : ""}
				/>

				{/* Floating island content area */}
				<div className="flex min-h-0 flex-1 flex-col px-2 pb-2 md:px-3 md:pb-3">
					<ContentIsland>{children}</ContentIsland>
				</div>
			</AppMain>
		</BasaltAppShell>
	);
}

export function AppShell({ children, breadcrumbs = [] }: AppShellProps) {
	return (
		<SidebarProvider>
			<AppShellInner breadcrumbs={breadcrumbs}>{children}</AppShellInner>
		</SidebarProvider>
	);
}
