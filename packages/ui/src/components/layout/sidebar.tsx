import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Sidebar as BasaltSidebar,
	SidebarBrand,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarIconItem,
	SidebarItem,
	SidebarNav,
	SidebarProvider,
	SidebarToggle,
	SidebarUser,
} from "@nocoo/basalt";
import { useSidebar } from "@nocoo/basalt/components/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@nocoo/basalt/components/tooltip";
import {
	Bell,
	Database,
	Download,
	Laptop,
	Plug,
	ScrollText,
	Server,
	Tag,
	Webhook,
} from "lucide-react";
import { useLocation } from "react-router";
import { useMe } from "@/hooks";
import { ACCESS_LOGOUT_URL } from "@/lib/access";
import { getDisplayName } from "@/lib/avatar-color";
import { APP_VERSION } from "@/lib/version";

const NAV_GROUPS = [
	{
		label: "Monitoring",
		items: [
			{ href: "/hosts", label: "Hosts", icon: Server },
			{ href: "/workstations", label: "Workstations", icon: Laptop },
			{ href: "/alerts", label: "Alerts", icon: Bell },
			{ href: "/events", label: "Events", icon: ScrollText },
			{ href: "/tags", label: "Tags", icon: Tag },
		],
	},
	{
		label: "Settings",
		items: [
			{ href: "/connect", label: "Connect", icon: Plug },
			{ href: "/setup", label: "Setup", icon: Download },
			{ href: "/settings/webhooks", label: "Webhooks", icon: Webhook },
			{ href: "/settings/data", label: "Data Retention", icon: Database },
		],
	},
];

type NavItem = { href: string; label: string; icon: typeof Server };

const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

function isItemActive(href: string, pathname: string) {
	return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarBodyProps {
	variant?: "desktop" | "mobile";
	onNavigate?: () => void;
	onDismiss?: () => void;
}

function SidebarBody({ variant = "desktop", onNavigate, onDismiss }: SidebarBodyProps) {
	const { pathname } = useLocation();
	const { collapsed, peek, peeking } = useSidebar();
	const railCollapsed = collapsed && !(peek && peeking);
	const { data: user } = useMe();
	const { name, initial, email, avatar } = getDisplayName(user);

	const userAvatar = (
		<Avatar className="h-9 w-9 shrink-0">
			{avatar ? <AvatarImage src={avatar} alt={name} /> : null}
			<AvatarFallback className="text-basalt-sm">{initial}</AvatarFallback>
		</Avatar>
	);

	return (
		<>
			<SidebarHeader>
				<SidebarBrand
					logo={<img src="/logo-24.png" alt="bat" width={24} height={24} />}
					name="bat"
					version={`v${APP_VERSION}`}
					action={
						variant === "mobile" ? (
							<SidebarToggle
								mode="dismiss"
								dismissLabel="Close navigation menu"
								{...(onDismiss ? { onDismiss } : {})}
							/>
						) : (
							<SidebarToggle expandLabel="Expand sidebar" collapseLabel="Collapse sidebar" />
						)
					}
				/>
			</SidebarHeader>
			<SidebarNav>
				{railCollapsed
					? ALL_NAV_ITEMS.map((item) => {
							const Icon = item.icon;
							const active = isItemActive(item.href, pathname);
							return (
								<Tooltip key={item.href} delayDuration={0}>
									<TooltipTrigger asChild>
										<SidebarIconItem
											href={item.href}
											active={active}
											aria-label={item.label}
											onClick={onNavigate}
										>
											<Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
										</SidebarIconItem>
									</TooltipTrigger>
									<TooltipContent side="right" sideOffset={8}>
										{item.label}
									</TooltipContent>
								</Tooltip>
							);
						})
					: NAV_GROUPS.map((group) => (
							<SidebarGroup key={group.label} label={group.label}>
								{group.items.map((item) => {
									const Icon = item.icon;
									const active = isItemActive(item.href, pathname);
									return (
										<SidebarItem
											key={item.href}
											href={item.href}
											active={active}
											onClick={onNavigate}
										>
											<Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
											<span className="flex-1 truncate text-left">{item.label}</span>
										</SidebarItem>
									);
								})}
							</SidebarGroup>
						))}
			</SidebarNav>
			<SidebarFooter>
				<SidebarUser
					name={name}
					email={email ?? undefined}
					avatar={userAvatar}
					tooltip={name}
					signOutHref={ACCESS_LOGOUT_URL}
					signOutLabel="Sign out"
				/>
			</SidebarFooter>
		</>
	);
}

export interface SidebarProps {
	/** Accessible name for the complementary landmark. */
	ariaLabel: string;
	variant?: "desktop" | "mobile";
	onNavigate?: () => void;
	onDismiss?: () => void;
}

export function Sidebar({ ariaLabel, variant = "desktop", onNavigate, onDismiss }: SidebarProps) {
	return (
		<TooltipProvider delayDuration={0}>
			<BasaltSidebar aria-label={ariaLabel} resizable={variant === "mobile" ? false : undefined}>
				<SidebarBody
					variant={variant}
					{...(onNavigate ? { onNavigate } : {})}
					{...(onDismiss ? { onDismiss } : {})}
				/>
			</BasaltSidebar>
		</TooltipProvider>
	);
}

export function DesktopSidebarProvider({
	collapsed,
	onCollapsedChange,
	children,
}: {
	collapsed: boolean;
	onCollapsedChange: (collapsed: boolean) => void;
	children: React.ReactNode;
}) {
	return (
		<SidebarProvider collapsed={collapsed} onCollapsedChange={onCollapsedChange} defaultWidth={260}>
			{children}
		</SidebarProvider>
	);
}
