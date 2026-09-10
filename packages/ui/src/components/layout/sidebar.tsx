import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Sidebar as BasaltSidebar,
	Button,
	Collapsible,
	CollapsibleTrigger,
	SidebarFooter,
	SidebarHeader,
	SidebarNav,
	SidebarUser,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@nocoo/basalt";
import {
	Bell,
	ChevronUp,
	Database,
	Download,
	PanelLeft,
	ScrollText,
	Server,
	Tag,
	Webhook,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useMe } from "@/hooks";
import { getAvatarColor, getDisplayName } from "@/lib/avatar-color";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { useSidebar } from "./sidebar-context";

// ── Types ──

interface NavItem {
	href: string;
	label: string;
	icon: React.ElementType;
}

interface NavGroup {
	label: string;
	items: NavItem[];
	defaultOpen?: boolean;
}

// ── Navigation config ──

const NAV_GROUPS: NavGroup[] = [
	{
		label: "Monitoring",
		defaultOpen: true,
		items: [
			{ href: "/hosts", label: "Hosts", icon: Server },
			{ href: "/alerts", label: "Alerts", icon: Bell },
			{ href: "/events", label: "Events", icon: ScrollText },
			{ href: "/tags", label: "Tags", icon: Tag },
		],
	},
	{
		label: "Settings",
		defaultOpen: true,
		items: [
			{ href: "/setup", label: "Setup", icon: Download },
			{ href: "/settings/webhooks", label: "Webhooks", icon: Webhook },
			{ href: "/settings/data", label: "Data Retention", icon: Database },
		],
	},
];

// Flat list for collapsed icon-only view and backward compat
const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// ── Nav group component (expanded sidebar) ──

function NavGroupSection({
	group,
	pathname,
	onNavigate,
}: {
	group: NavGroup;
	pathname: string;
	onNavigate: () => void;
}) {
	const [open, setOpen] = useState(group.defaultOpen ?? true);

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			{/* Group header */}
			<CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5">
				<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70 select-none">
					{group.label}
				</span>
				<ChevronUp
					className={cn(
						"h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200",
						!open && "rotate-180",
					)}
					strokeWidth={1.5}
				/>
			</CollapsibleTrigger>

			{/* Animated group content */}
			<div
				className="grid overflow-hidden"
				style={{
					gridTemplateRows: open ? "1fr" : "0fr",
					transition: "grid-template-rows 200ms ease-out",
				}}
			>
				<div className="min-h-0 overflow-hidden">
					<div className="flex flex-col gap-0.5 px-3">
						{group.items.map((item) => {
							const isActive = pathname.startsWith(item.href);

							return (
								<Link
									key={item.href}
									to={item.href}
									onClick={onNavigate}
									className={cn(
										"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
										isActive
											? "bg-accent text-foreground"
											: "text-muted-foreground hover:bg-accent hover:text-foreground",
									)}
								>
									<item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
									<span className="flex-1 text-left">{item.label}</span>
								</Link>
							);
						})}
					</div>
				</div>
			</div>
		</Collapsible>
	);
}

// ── Main component ──

interface SidebarProps {
	mobile?: boolean;
}

export function Sidebar({ mobile = false }: SidebarProps) {
	const { pathname } = useLocation();
	const { collapsed, toggle, setMobileOpen } = useSidebar();
	const { data: user } = useMe();

	const handleNavigate = () => setMobileOpen(false);

	const {
		name: userName,
		initial: userInitial,
		email: userEmail,
		avatar: userAvatar,
	} = getDisplayName(user);

	return (
		<TooltipProvider delayDuration={0}>
			<BasaltSidebar
				aria-label={mobile ? "Main navigation drawer" : "Main navigation"}
				collapsed={collapsed}
			>
				{collapsed ? (
					/* ── Collapsed (icon-only) view ── */
					<>
						{/* Logo */}
						<SidebarHeader className="justify-start pl-6 pr-3">
							<img src="/logo-24.png" alt="bat" width={24} height={24} />
						</SidebarHeader>

						{/* Expand toggle */}
						<Tooltip>
							<TooltipTrigger asChild={true}>
								<Button
									variant="ghost"
									size="icon"
									onClick={toggle}
									aria-label="Expand sidebar"
									className="mb-2 self-center text-muted-foreground hover:text-foreground"
								>
									<PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								Expand sidebar
							</TooltipContent>
						</Tooltip>

						{/* Navigation — flat icon list (no group headers when collapsed) */}
						<SidebarNav className="items-center gap-1 pt-1">
							{NAV_ITEMS.map((item) => {
								const isActive = pathname.startsWith(item.href);

								return (
									<Tooltip key={item.href}>
										<TooltipTrigger asChild={true}>
											<Link
												to={item.href}
												onClick={handleNavigate}
												className={cn(
													"relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
													isActive
														? "bg-accent text-foreground"
														: "text-muted-foreground hover:bg-accent hover:text-foreground",
												)}
											>
												<item.icon className="h-4 w-4" strokeWidth={1.5} />
											</Link>
										</TooltipTrigger>
										<TooltipContent side="right" sideOffset={8}>
											{item.label}
										</TooltipContent>
									</Tooltip>
								);
							})}
						</SidebarNav>

						{/* Version badge at bottom */}
						<SidebarFooter className="flex w-full justify-center px-0 py-3">
							<span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground leading-none">
								v{APP_VERSION}
							</span>
						</SidebarFooter>
					</>
				) : (
					/* ── Expanded view ── */
					<>
						{/* Header: logo + collapse toggle */}
						<SidebarHeader>
							<div className="flex w-full items-center justify-between">
								<div className="flex items-center gap-3">
									<img src="/logo-24.png" alt="bat" width={24} height={24} />
									<span className="text-lg font-bold tracking-tighter">bat</span>
									<span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground leading-none">
										v{APP_VERSION}
									</span>
								</div>
								<Button
									variant="ghost"
									size="icon"
									onClick={toggle}
									aria-label="Collapse sidebar"
									className="h-7 w-7 text-muted-foreground hover:text-foreground"
								>
									<PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
								</Button>
							</div>
						</SidebarHeader>

						{/* Navigation — grouped */}
						<SidebarNav className="pt-1">
							<div className="flex flex-col gap-3 px-3">
								{NAV_GROUPS.map((group) => (
									<NavGroupSection
										key={group.label}
										group={group}
										pathname={pathname}
										onNavigate={handleNavigate}
									/>
								))}
							</div>
						</SidebarNav>

						{/* Footer — user info */}
						<SidebarFooter className="border-t border-border">
							<SidebarUser
								name={userName}
								email={userEmail}
								avatar={
									<Avatar className="h-9 w-9 shrink-0">
										{userAvatar && <AvatarImage src={userAvatar} alt={userName} />}
										<AvatarFallback className={cn("text-xs text-white", getAvatarColor(userEmail))}>
											{userInitial}
										</AvatarFallback>
									</Avatar>
								}
							/>
						</SidebarFooter>
					</>
				)}
			</BasaltSidebar>
		</TooltipProvider>
	);
}

export type { NavGroup, NavItem };
// Export for testing
export { NAV_GROUPS, NAV_ITEMS };
