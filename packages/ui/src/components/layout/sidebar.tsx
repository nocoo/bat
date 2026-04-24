import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/hooks";
import { getAvatarColor, getDisplayName } from "@/lib/avatar-color";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import {
	Bell,
	ChevronUp,
	Download,
	PanelLeft,
	ScrollText,
	Server,
	Tag,
	Webhook,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
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
}: { group: NavGroup; pathname: string; onNavigate: () => void }) {
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

	const { name: userName, initial: userInitial, email: userEmail } = getDisplayName(user);

	return (
		<TooltipProvider delayDuration={0}>
			<aside
				aria-label={mobile ? "Main navigation drawer" : "Main navigation"}
				className={cn(
					"sticky top-0 flex h-screen shrink-0 flex-col bg-background transition-all duration-300 ease-in-out overflow-hidden",
					collapsed ? "w-[68px]" : "w-[260px]",
				)}
			>
				{collapsed ? (
					/* ── Collapsed (icon-only) view ── */
					<div className="flex h-screen w-[68px] flex-col items-center">
						{/* Logo */}
						<div className="flex h-14 w-full items-center justify-start pl-6 pr-3">
							<img src="/logo-24.png" alt="bat" width={24} height={24} className="rounded-sm" />
						</div>

						{/* Expand toggle */}
						<Tooltip>
							<TooltipTrigger asChild={true}>
								<button
									type="button"
									onClick={toggle}
									aria-label="Expand sidebar"
									className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mb-2"
								>
									<PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								Expand sidebar
							</TooltipContent>
						</Tooltip>

						{/* Navigation — flat icon list (no group headers when collapsed) */}
						<nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto pt-1">
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
						</nav>

						{/* Version badge at bottom */}
						<div className="py-3 flex justify-center w-full">
							<span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground leading-none">
								v{APP_VERSION}
							</span>
						</div>
					</div>
				) : (
					/* ── Expanded view ── */
					<div className="flex h-screen w-[260px] flex-col">
						{/* Header: logo + collapse toggle */}
						<div className="px-3 h-14 flex items-center">
							<div className="flex w-full items-center justify-between px-3">
								<div className="flex items-center gap-3">
									<img src="/logo-24.png" alt="bat" width={24} height={24} className="rounded-sm" />
									<span className="text-lg font-bold tracking-tighter">bat</span>
									<span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground leading-none">
										v{APP_VERSION}
									</span>
								</div>
								<button
									type="button"
									onClick={toggle}
									aria-label="Collapse sidebar"
									className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
								>
									<PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
								</button>
							</div>
						</div>

						{/* Navigation — grouped */}
						<nav className="flex-1 overflow-y-auto pt-1">
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
						</nav>

						{/* Footer — user info */}
						<div className="px-4 py-3 border-t">
							<div className="flex items-center gap-3">
								<Avatar className="h-9 w-9 shrink-0">
									<AvatarFallback className={cn("text-xs text-white", getAvatarColor(userEmail))}>
										{userInitial}
									</AvatarFallback>
								</Avatar>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-foreground truncate">{userName}</p>
									{userEmail && (
										<p className="text-xs text-muted-foreground truncate">{userEmail}</p>
									)}
								</div>
							</div>
						</div>
					</div>
				)}
			</aside>
		</TooltipProvider>
	);
}

// Export for testing
export { NAV_GROUPS, NAV_ITEMS };
export type { NavItem, NavGroup };
