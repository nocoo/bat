import {
	Breadcrumbs as BasaltBreadcrumbs,
	type BreadcrumbsProps as BasaltBreadcrumbsProps,
} from "@nocoo/basalt/components/breadcrumbs";

export function Breadcrumbs({ items, className }: BasaltBreadcrumbsProps) {
	return (
		<nav aria-label="Breadcrumb navigation" className="inline-flex items-center">
			<BasaltBreadcrumbs items={items} className={className} />
		</nav>
	);
}

export type { BreadcrumbItem, BreadcrumbsProps } from "@nocoo/basalt/components/breadcrumbs";
