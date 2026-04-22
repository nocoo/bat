// Pure formatting helpers for the host-detail page.
import { formatCpuTopology } from "./host-card-format";

/** Format CPU label — e.g. "AMD EPYC 7763 (4 cores, 8 threads)". */
export function formatCpuLabel(
	model: string | null | undefined,
	physical: number | null | undefined,
	logical: number | null | undefined,
): string | null {
	const topology = formatCpuTopology(physical ?? null, logical ?? null);
	if (!(model || topology)) {
		return null;
	}
	if (!topology) {
		return model ?? null;
	}
	const suffix =
		physical != null && logical != null && physical !== logical
			? `(${physical} cores, ${logical} threads)`
			: `(${physical ?? logical} cores)`;
	return model ? `${model} ${suffix}` : suffix;
}

/**
 * Pretty-print the virtualization vendor label.
 * Falls back to the raw value when not in the known-vendor table.
 */
const VIRT_LABELS: Record<string, string> = {
	kvm: "KVM",
	vmware: "VMware",
	hyperv: "Hyper-V",
	aws: "AWS",
	gce: "GCE",
	virtualbox: "VirtualBox",
	xen: "Xen",
	"bare-metal": "Bare Metal",
	container: "Container",
	digitalocean: "DigitalOcean",
	hetzner: "Hetzner",
};
export const capitalizeVirt = (v: string): string => VIRT_LABELS[v] ?? v;

/** Format a boot-time unix timestamp for display. */
export function formatBootTime(unixSeconds: number | null | undefined): string | null {
	if (unixSeconds == null) {
		return null;
	}
	return new Date(unixSeconds * 1000).toLocaleString();
}
