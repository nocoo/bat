import {
	Button,
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
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { Github } from "@/components/icons/github";
import { useIsMobile } from "@/hooks/use-mobile";
import { EnvironmentSwitch } from "./environment-switch";
import { HeaderTooltip, HexlyLink } from "./header-links";
import { useRouteBreadcrumbs } from "./route-breadcrumbs";
import { Sidebar } from "./sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { ThemeToggle } from "./theme-toggle";

interface AppShellProps {
	children: React.ReactNode;
}

function AppShellInner({ children }: AppShellProps) {
	const isMobile = useIsMobile();
	const breadcrumbs = useRouteBreadcrumbs();
	const menuTrigger = useRef<HTMLButtonElement>(null);
	const { mobileOpen, setMobileOpen } = useSidebar();
	const { pathname } = useLocation();

	// Whether JS has resolved the viewport — before this, CSS drives visibility
	const resolved = isMobile !== undefined;

	// Close mobile sidebar on route change
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname triggers sidebar close on route change
	useEffect(() => {
		setMobileOpen(false);
	}, [pathname, setMobileOpen]);

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
						onCloseAutoFocus={(event) => {
							event.preventDefault();
							menuTrigger.current?.focus();
						}}
						className="w-[260px] max-w-[260px] border-0 bg-basalt-background p-0 sm:p-0"
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
					breadcrumbs={breadcrumbs}
					leading={
						showHamburger ? (
							<HeaderTooltip label="Open navigation menu">
								<Button
									ref={menuTrigger}
									variant="ghost"
									size="icon"
									onClick={() => setMobileOpen(true)}
									aria-label="Open navigation menu"
									className={resolved ? undefined : "md:hidden"}
								>
									<Menu className="size-4" aria-hidden="true" strokeWidth={1.5} />
								</Button>
							</HeaderTooltip>
						) : undefined
					}
					actions={
						<>
							<EnvironmentSwitch />
							<HeaderTooltip label="GitHub repository">
								<Button asChild variant="ghost" size="icon">
									<a
										href="https://github.com/nocoo/bat"
										target="_blank"
										rel="noopener noreferrer"
										aria-label="GitHub repository"
									>
										<Github className="size-4" aria-hidden="true" strokeWidth={1.5} />
									</a>
								</Button>
							</HeaderTooltip>
							<HexlyLink />
							<ThemeToggle aria-label="Toggle theme" />
						</>
					}
				/>

				{/* Floating island content area */}
				<div className="flex min-h-0 flex-1 flex-col px-2 pb-2 md:px-3 md:pb-3">
					<ContentIsland>{children}</ContentIsland>
				</div>
			</AppMain>
		</BasaltAppShell>
	);
}

export function AppShell({ children }: AppShellProps) {
	return (
		<SidebarProvider>
			<AppShellInner>{children}</AppShellInner>
		</SidebarProvider>
	);
}
