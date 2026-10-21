import { Badge } from "@nocoo/basalt";
import { getBadgeStyleByIndex } from "@/lib/palette";

export function TagChip({ name, color }: { name: string; color: number }) {
	return <Badge style={getBadgeStyleByIndex(color)}>{name}</Badge>;
}
