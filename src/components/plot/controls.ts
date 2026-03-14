/**
 * Declarative control specifications for PlotFrame's canopy.
 *
 * Controls are data objects, not JSX. PlotFrame owns the state for each
 * control internally. The caller declares what controls exist and receives
 * value changes via an onControlChange callback keyed by control id.
 *
 * This enforces the visual contract: a control inside one PlotFrame
 * cannot affect another PlotFrame's state.
 */

// ── Control Specs ──

export interface RangeControl {
  type: "range";
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  /** Format the display value. Defaults to String(value). */
  display?: (value: number) => string;
  /** Reserve width string for the gauge (e.g., "100%", "0.00"). */
  reserve?: string;
}

export interface SelectControl {
  type: "select";
  id: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue: string;
}

export interface MetricControl {
  type: "metric";
  id: string;
  label: string;
  value: string;
  reserve?: string;
}

export type ControlSpec = RangeControl | SelectControl | MetricControl;

// ── Control State ──

/** Map of control id → current value. */
export type ControlValues = Record<string, number | string>;

/** Initialize control values from specs. */
export function initControlValues(specs: ControlSpec[]): ControlValues {
  const values: ControlValues = {};
  for (const spec of specs) {
    if (spec.type === "metric") continue; // read-only, no state
    values[spec.id] = spec.defaultValue;
  }
  return values;
}
