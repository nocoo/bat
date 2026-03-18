"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, getAvatarColor } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { Bell, ChevronUp, Download, LogOut, PanelLeft, Server, Tag } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
			{ href: "/tags", label: "Tags", icon: Tag },
		],
	},
	{
		label: "Settings",
		defaultOpen: true,
		items: [{ href: "/setup", label: "Setup", icon: Download }],
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
		<div>
			{/* Group header */}
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className="flex w-full items-center justify-between px-3 py-1.5 mb-0.5"
			>
				<span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 select-none">
					{group.label}
				</span>
				<ChevronUp
					className={cn(
						"h-3 w-3 text-muted-foreground/50 transition-transform duration-200",
						!open && "rotate-180",
					)}
					strokeWidth={1.5}
				/>
			</button>

			{/* Animated group content */}
			<div
				className="grid overflow-hidden"
				style={{
					gridTemplateRows: open ? "1fr" : "0fr",
					transition: "grid-template-rows 200ms ease-out",
				}}
			>
				<div className="min-h-0 overflow-hidden">
					<div className="flex flex-col gap-0.5">
						{group.items.map((item) => {
							const isActive = pathname.startsWith(item.href);

							return (
								<Link
									key={item.href}
									href={item.href}
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
		</div>
	);
}

// ── Main component ──

interface SidebarProps {
	mobile?: boolean;
}

export function Sidebar({ mobile = false }: SidebarProps) {
	const pathname = usePathname();
	const { collapsed, toggle, setMobileOpen } = useSidebar();
	const { data: session } = useSession();

	// Get user info from session (Google OAuth)
	const userName = session?.user?.name ?? "User";
	const userEmail = session?.user?.email ?? "";
	const userImage = session?.user?.image;
	const userInitial = userName[0] ?? "?";

	const handleNavigate = () => setMobileOpen(false);

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
						<div className="flex h-14 w-full items-center justify-center">
							<Image src="/logo-24.png" alt="bat" width={24} height={24} className="rounded-sm" />
						</div>

						{/* Expand toggle */}
						<Tooltip>
							<TooltipTrigger asChild>
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
										<TooltipTrigger asChild>
											<Link
												href={item.href}
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

						{/* User avatar + sign out */}
						<div className="py-3 flex justify-center w-full">
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={() => signOut({ callbackUrl: "/login" })}
										aria-label="Sign out"
										className="cursor-pointer"
									>
										<Avatar className="h-9 w-9">
											{userImage && <AvatarImage src={userImage} alt={userName} />}
											<AvatarFallback
												className={cn("text-xs text-white", getAvatarColor(userName))}
											>
												{userInitial}
											</AvatarFallback>
										</Avatar>
									</button>
								</TooltipTrigger>
								<TooltipContent side="right" sideOffset={8}>
									{userName} · Click to sign out
								</TooltipContent>
							</Tooltip>
						</div>
					</div>
				) : (
					/* ── Expanded view ── */
					<div className="flex h-screen w-[260px] flex-col">
						{/* Header: logo + collapse toggle */}
						<div className="px-3 h-14 flex items-center">
							<div className="flex w-full items-center justify-between px-3">
								<div className="flex items-center gap-3">
									<Image
										src="/logo-24.png"
										alt="bat"
										width={24}
										height={24}
										className="rounded-sm"
									/>
									<span className="text-lg font-bold tracking-tighter">bat</span>
									<Badge
										variant="secondary"
										className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground"
									>
										v{APP_VERSION}
									</Badge>
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

						{/* User info + sign out */}
						<div className="px-4 py-3">
							<div className="flex items-center gap-3">
								<Avatar className="h-9 w-9 shrink-0">
									{userImage && <AvatarImage src={userImage} alt={userName} />}
									<AvatarFallback className={cn("text-xs text-white", getAvatarColor(userName))}>
										{userInitial}
									</AvatarFallback>
								</Avatar>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-foreground truncate">{userName}</p>
									<p className="text-xs text-muted-foreground truncate">{userEmail}</p>
								</div>
								<Tooltip>
									<TooltipTrigger asChild>
										<button
											type="button"
											onClick={() => signOut({ callbackUrl: "/login" })}
											aria-label="Sign out"
											className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
										>
											<LogOut className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
										</button>
									</TooltipTrigger>
									<TooltipContent side="top">Sign out</TooltipContent>
								</Tooltip>
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
