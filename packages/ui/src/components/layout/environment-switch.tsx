import { SegmentControl } from "@nocoo/basalt";
import { useState } from "react";
import { type EnvironmentMode, environment, selectEnvironment } from "../../environment";

export function EnvironmentSwitch() {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	if (!environment?.visible) return null;
	const switchMode = async (mode: string) => {
		if (!mode || mode === environment?.mode) return;
		if (
			document.querySelector('[role="dialog"], form:focus-within, [data-bat-dirty="true"]') &&
			!window.confirm("Discard unsaved changes and switch environment?")
		)
			return;
		setBusy(true);
		setError(null);
		try {
			await selectEnvironment(mode as EnvironmentMode);
			window.location.assign("/");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Switch failed");
			setBusy(false);
		}
	};
	return (
		<div className="flex items-center gap-2">
			{error && (
				<span role="alert" className="text-xs text-destructive">
					{error}
				</span>
			)}
			<SegmentControl
				legend={<span className="sr-only">Environment</span>}
				value={environment.mode}
				onValueChange={switchMode}
				disabled={busy || environment.locked}
				options={[
					{ value: "demo", label: "Demo" },
					{ value: "e2e", label: "E2E" },
					{ value: "prod", label: "Prod" },
				]}
			/>
		</div>
	);
}
