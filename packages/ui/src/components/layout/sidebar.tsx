import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Sidebar as BasaltSidebar,
	Button,
	Separator,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarNav,
	SidebarUser,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@nocoo/basalt";
import { EditableNavItem } from "@nocoo/basalt/components/editable-nav-item";
import {
	Bell,
	Database,
	Download,
	PanelLeft,
	Plug,
	ScrollText,
	Server,
	Tag,
	Webhook,
} from "lucide-react";
import { Fragment } from "react";
import { Link, useLocation } from "react-router";
import { useMe } from "@/hooks";
import { getDisplayName } from "@/lib/avatar-color";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { useSidebar } from "./sidebar-context";

const NAV_GROUPS = [
	{
		label: "Monitoring",
		items: [
			{ href: "/hosts", label: "Hosts", icon: Server },
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

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
	const { pathname } = useLocation();
	const { collapsed, toggle, setMobileOpen } = useSidebar();
	const { data: user } = useMe();
	const compact = !mobile && collapsed;
	const { name, initial, email, avatar } = getDisplayName(user);
	const closeMobile = () => setMobileOpen(false);
	const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
	const version = (
		<span className="shrink-0 rounded-basalt-md bg-basalt-secondary px-basalt-space-md py-basalt-space-xs text-basalt-sm leading-basalt-tight font-medium text-basalt-muted-foreground">
			v{APP_VERSION}
		</span>
	);
	const userAvatar = (
		<Avatar>
			{avatar && <AvatarImage src={avatar} alt={name} />}
			<AvatarFallback>{initial}</AvatarFallback>
		</Avatar>
	);

	return (
		<BasaltSidebar
			aria-label={mobile ? "Main navigation drawer" : "Main navigation"}
			collapsed={compact}
		>
			<SidebarHeader>
				<div
					className={cn(
						"flex w-full items-center",
						compact ? "justify-center" : "justify-between pl-basalt-layout-sm",
					)}
				>
					<Link
						to="/"
						aria-label="Bat home"
						onClick={closeMobile}
						className="flex min-w-0 items-center gap-basalt-space-lg text-basalt-foreground"
					>
						<img src="/logo-80.png" alt="bat" width={28} height={28} className="shrink-0" />
						{!compact && (
							<>
								<span className="text-basalt-xl font-semibold">bat</span>
								{version}
							</>
						)}
					</Link>
					{!compact && (
						<Button
							variant="ghost"
							size="icon"
							onClick={mobile ? closeMobile : toggle}
							aria-label={mobile ? "Close navigation menu" : "Collapse sidebar"}
						>
							<PanelLeft aria-hidden="true" strokeWidth={1.5} />
						</Button>
					)}
				</div>
			</SidebarHeader>
			{compact && (
				<Tooltip>
					<TooltipTrigger asChild={true}>
						<Button
							variant="ghost"
							size="icon"
							onClick={toggle}
							aria-label="Expand sidebar"
							className="mb-basalt-space-sm self-center"
						>
							<PanelLeft aria-hidden="true" strokeWidth={1.5} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">Expand sidebar</TooltipContent>
				</Tooltip>
			)}
			<SidebarNav>
				{NAV_GROUPS.map((group, index) => (
					<Fragment key={group.label}>
						{index > 0 && <Separator className="mx-basalt-row-x my-basalt-content-gap w-auto" />}
						{compact ? (
							group.items.map((item) => (
								<Tooltip key={item.href}>
									<TooltipTrigger asChild={true}>
										<Button
											asChild={true}
											variant="ghost"
											size="icon"
											className="basalt-nav-item"
											data-basalt-hover-item=""
											data-hover-selected={active(item.href)}
										>
											<Link
												to={item.href}
												onClick={closeMobile}
												aria-label={item.label}
												aria-current={active(item.href) ? "page" : undefined}
											>
												<item.icon aria-hidden="true" strokeWidth={1.5} />
												<span className="sr-only">{item.label}</span>
											</Link>
										</Button>
									</TooltipTrigger>
									<TooltipContent side="right">{item.label}</TooltipContent>
								</Tooltip>
							))
						) : (
							<SidebarGroup label={group.label}>
								{group.items.map((item) => (
									<EditableNavItem
										key={item.href}
										label={item.label}
										href={item.href}
										selected={active(item.href)}
										onSelect={closeMobile}
										icon={<item.icon strokeWidth={1.5} />}
									/>
								))}
							</SidebarGroup>
						)}
					</Fragment>
				))}
			</SidebarNav>
			<SidebarFooter>
				{compact ? (
					<>
						<Tooltip>
							<TooltipTrigger asChild={true}>
								<span role="img" aria-label={name}>
									{userAvatar}
								</span>
							</TooltipTrigger>
							<TooltipContent side="right">{name}</TooltipContent>
						</Tooltip>
						{version}
					</>
				) : (
					<SidebarUser name={name} email={email} avatar={userAvatar} />
				)}
			</SidebarFooter>
		</BasaltSidebar>
	);
}
