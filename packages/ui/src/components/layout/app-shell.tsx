import { ContentIsland, SidebarDrawer } from "@nocoo/basalt";
import { AppHeader, AppHeaderMenuButton, ProjectLinks } from "@nocoo/basalt/components/app-header";
import {
	AppMain,
	AppSkipLink,
	AppShell as BasaltAppShell,
} from "@nocoo/basalt/components/app-shell";
import { ThemeToggle } from "@nocoo/basalt/components/theme-toggle";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useIsMobile } from "@/hooks/use-mobile";
import { EnvironmentSwitch } from "./environment-switch";
import { MobileNavProvider, useMobileNav } from "./mobile-nav-context";
import { useAppHeaderBreadcrumbs } from "./route-breadcrumbs";
import { DesktopSidebarProvider, Sidebar } from "./sidebar";

interface AppShellProps {
	children: React.ReactNode;
}

function AppShellInner({ children }: AppShellProps) {
	const isMobile = useIsMobile();
	const breadcrumbs = useAppHeaderBreadcrumbs(isMobile);
	const menuTrigger = useRef<HTMLButtonElement>(null);
	const { mobileOpen, setMobileOpen } = useMobileNav();
	const { pathname } = useLocation();
	const [collapsed, setCollapsed] = useState(false);

	const resolved = isMobile !== undefined;
	const showDesktopSidebar = resolved ? !isMobile : true;
	const showMobileDrawer = resolved && isMobile;
	const showHamburger = resolved ? isMobile : true;

	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname triggers sidebar close on route change
	useEffect(() => {
		setMobileOpen(false);
	}, [pathname, setMobileOpen]);

	return (
		<BasaltAppShell>
			<AppSkipLink>Skip to main content</AppSkipLink>
			{showDesktopSidebar && (
				<div className={resolved ? undefined : "hidden md:contents"}>
					<DesktopSidebarProvider collapsed={collapsed} onCollapsedChange={setCollapsed}>
						<Sidebar ariaLabel="Main navigation" variant="desktop" />
					</DesktopSidebarProvider>
				</div>
			)}

			{showMobileDrawer && (
				<SidebarDrawer
					open={mobileOpen}
					onOpenChange={setMobileOpen}
					returnFocusRef={menuTrigger}
					title="Navigation Menu"
					description="Browse bat dashboard pages"
				>
					<Sidebar
						ariaLabel="Main navigation drawer"
						variant="mobile"
						onNavigate={() => setMobileOpen(false)}
						onDismiss={() => setMobileOpen(false)}
					/>
				</SidebarDrawer>
			)}

			<AppMain>
				<AppHeader
					density="compact"
					breadcrumbs={breadcrumbs}
					breadcrumbsLabel="Breadcrumb navigation"
					leading={
						showHamburger ? (
							<AppHeaderMenuButton
								ref={menuTrigger}
								label="Open navigation menu"
								onClick={() => setMobileOpen(true)}
								className={resolved ? undefined : "md:hidden"}
							/>
						) : undefined
					}
					actions={
						<>
							<EnvironmentSwitch />
							<ProjectLinks github="nocoo/bat" hexly="bat" name="Bat" />
							<ThemeToggle />
						</>
					}
				/>

				<div className="flex min-h-0 flex-1 flex-col px-2 pb-2 md:px-3 md:pb-3">
					<ContentIsland className="bat-workspace md:p-basalt-layout lg:px-basalt-layout-lg">
						{children}
					</ContentIsland>
				</div>
			</AppMain>
		</BasaltAppShell>
	);
}

export function AppShell({ children }: AppShellProps) {
	return (
		<MobileNavProvider>
			<AppShellInner>{children}</AppShellInner>
		</MobileNavProvider>
	);
}
