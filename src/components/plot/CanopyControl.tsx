/**
 * CanopyControl — renders a single ControlSpec as a canopy UI element.
 *
 * Stateless renderer. PlotFrame owns the state via controlReducer.
 * Range controls dispatch DRAG_MOVE on change, DRAG_END on pointer up.
 * Select controls dispatch SELECT (immediate commit, no drag phase).
 */

import { StableCounter } from "stablekit.ts";
import type { ControlSpec } from "./controls";
import type { ControlAction } from "./controlState";

interface CanopyControlProps {
  spec: ControlSpec;
  value: number | string;
  dispatch: (action: ControlAction) => void;
}

export function CanopyControl({ spec, value, dispatch }: CanopyControlProps) {
  if (spec.type === "select") {
    return (
      <div className="stack">
        <div className="text-label color-muted">{spec.label}</div>
        <div className="dropdown">
          <select
            value={value as string}
            onChange={(e) => dispatch({ type: "SELECT", id: spec.id, value: e.target.value })}
          >
            {spec.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    );
  }

  if (spec.type === "range") {
    const numValue = value as number;
    const display = spec.display ? spec.display(numValue) : String(numValue);
    return (
      <div className="stack">
        <div className="text-label color-muted">{spec.label}</div>
        <div className="slider-group">
          <input
            className="slider"
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={numValue}
            onPointerDown={() => dispatch({ type: "DRAG_START", id: spec.id, value: numValue })}
            onChange={(e) => dispatch({ type: "DRAG_MOVE", id: spec.id, value: Number(e.target.value) })}
            onPointerUp={(e) => dispatch({ type: "DRAG_END", id: spec.id, value: Number((e.target as HTMLInputElement).value) })}
          />
          <StableCounter
            className="gauge"
            value={display}
            reserve={spec.reserve ?? display}
          />
        </div>
      </div>
    );
  }

  if (spec.type === "metric") {
    return (
      <div className="stack">
        <div className="text-label color-muted">{spec.label}</div>
        <StableCounter
          className="gauge"
          value={spec.value}
          reserve={spec.reserve ?? spec.value}
        />
      </div>
    );
  }

  return null;
}
