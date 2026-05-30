// Pure types for alert evaluation results. Used by `domain/alerts/evaluate.ts`,
// `domain/alerts/tier2.ts`, and the D1 adapter that persists them.

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertEvalResult {
	ruleId: string;
	fired: boolean;
	severity: AlertSeverity;
	value: number;
	message: string;
	durationSeconds: number; // 0 = instant
}
