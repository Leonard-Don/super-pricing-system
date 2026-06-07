// ---------------------------------------------------------------------------
// macroFactorColors — ported from frontend/src/components/GodEyeDashboard/macroFactorColors.js
// No React / antd dependencies. Color token strings match the old JS values.
// ---------------------------------------------------------------------------

export const signalColor: Record<string, string> = { '1': 'red', '0': 'gold', '-1': 'green' };
export const conflictColor: Record<string, string> = { high: 'red', medium: 'orange', low: 'gold', none: 'default' };
export const conflictTrendColor: Record<string, string> = { rising: 'volcano', easing: 'green', stable: 'blue' };
export const coverageColor: Record<string, string> = { strong: 'green', partial: 'blue', thin: 'gold', sparse: 'red' };
export const blindSpotColor: Record<string, string> = { high: 'red', medium: 'orange', none: 'default' };
export const stabilityColor: Record<string, string> = { unstable: 'red', choppy: 'orange', stable: 'green' };
export const lagColor: Record<string, string> = { high: 'red', medium: 'orange', low: 'gold', none: 'green' };
export const concentrationColor: Record<string, string> = { high: 'red', medium: 'orange', low: 'green', none: 'default' };
export const driftColor: Record<string, string> = { degrading: 'red', improving: 'green', stable: 'blue', none: 'default', positive: 'green' };
export const flowColor: Record<string, string> = { broken: 'red', stretching: 'orange', stable: 'green', none: 'default' };
export const confirmationColor: Record<string, string> = { strong: 'green', moderate: 'blue', weak: 'gold', none: 'default' };
export const dominanceColor: Record<string, string> = { rotating: 'orange', derived_dominant: 'red', official_dominant: 'green', stable: 'blue', none: 'default' };
export const consistencyColor: Record<string, string> = { strong: 'green', moderate: 'blue', divergent: 'red', weak: 'gold', unknown: 'default' };
export const reversalColor: Record<string, string> = { reversed: 'red', fading: 'orange', emerging: 'blue', stable: 'green', none: 'default' };
export const precursorColor: Record<string, string> = { high: 'volcano', medium: 'gold', none: 'default' };
export const resonanceColor: Record<string, string> = { bullish_cluster: 'green', bearish_cluster: 'red', precursor_cluster: 'orange', fading_cluster: 'gold', reversal_cluster: 'volcano', mixed: 'blue' };
export const policySourceColor: Record<string, string> = { healthy: 'green', watch: 'gold', fragile: 'red', unknown: 'default' };
export const reliabilityColor: Record<string, string> = { robust: 'green', watch: 'gold', fragile: 'red' };
export const peopleLayerColor: Record<string, string> = { stable: 'green', watch: 'gold', fragile: 'red', unknown: 'default' };
export const departmentChaosColor: Record<string, string> = { stable: 'green', watch: 'gold', chaotic: 'red', unknown: 'default' };
