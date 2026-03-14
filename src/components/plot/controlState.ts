/**
 * Control state machine for PlotFrame canopy controls.
 *
 * Separates visual (drag) state from committed (query) state.
 * Modeled after GenomeHub's RangeSlider reducer:
 *
 *   idle ──DRAG_START──► dragging ──DRAG_END──► dropped ──QUERY_START──► querying ──SETTLE──► idle
 *                                                  └──VOID_SKIP──► idle (no query)
 *
 * Current implementation: compile() is synchronous, so 'querying' resolves
 * instantly. When GenomeHub integration arrives and compile becomes an async
 * query, the querying phase and VOID_SKIP optimization activate naturally.
 */

import type { ControlValues } from "./controls";

// ── Phases ──

export type ControlPhase =
  | "idle"       // No interaction. Display values === committed values.
  | "dragging"   // User is actively dragging a range thumb. Display values
                 //   update at rAF rate. Committed values unchanged. No recompile.
  | "dropped"    // User released the thumb. Committed values updated.
                 //   Recompile triggers. Waiting for result.
  | "querying"   // [FUTURE] Async query in flight. Currently unused —
                 //   compile() is synchronous so dropped → idle is instant.
                 //   When GenomeHub serves data, this phase holds until the
                 //   Arrow IPC response arrives.
  ;              // [FUTURE] VOID_SKIP: dropped → idle without querying.
                 //   Requires histogram data to detect empty deltas.
                 //   GenomeHub's DataProfile provides this via 64-bin histograms.

// ── Actions ──

export type ControlAction =
  | { type: "DRAG_START"; id: string; value: number }
  | { type: "DRAG_MOVE"; id: string; value: number }
  | { type: "DRAG_END"; id: string; value: number }
  | { type: "SELECT"; id: string; value: string }     // Select controls commit immediately
  // [FUTURE] | { type: "VOID_SKIP" }                  // Delta has no data, skip query
  // [FUTURE] | { type: "QUERY_START" }                 // Async query dispatched
  // [FUTURE] | { type: "SETTLE" }                      // Async query resolved
  ;

// ── State ──

export interface ControlState {
  phase: ControlPhase;
  /** Values shown in the UI (updates during drag). */
  displayValues: ControlValues;
  /** Values used for compilation/queries (updates on commit only). */
  committedValues: ControlValues;
  /** The control id currently being dragged, if any. */
  activeId: string | null;
}

export function initControlState(initial: ControlValues): ControlState {
  return {
    phase: "idle",
    displayValues: { ...initial },
    committedValues: { ...initial },
    activeId: null,
  };
}

// ── Reducer ──

export function controlReducer(state: ControlState, action: ControlAction): ControlState {
  switch (action.type) {
    case "DRAG_START":
      return {
        ...state,
        phase: "dragging",
        activeId: action.id,
        displayValues: { ...state.displayValues, [action.id]: action.value },
      };

    case "DRAG_MOVE":
      // Visual only — no commit, no recompile.
      if (state.phase !== "dragging") return state;
      return {
        ...state,
        displayValues: { ...state.displayValues, [action.id]: action.value },
      };

    case "DRAG_END": {
      // Commit the value. This triggers recompile in the template.
      // [FUTURE] If histogram data is available, check hasDataInDelta()
      // here and dispatch VOID_SKIP instead if the delta is empty.
      const next = { ...state.committedValues, [action.id]: action.value };
      return {
        phase: "idle", // [FUTURE] → "dropped" when async queries exist
        activeId: null,
        displayValues: { ...state.displayValues, [action.id]: action.value },
        committedValues: next,
      };
    }

    case "SELECT": {
      // Select controls have no drag phase — commit immediately.
      const next = { ...state.committedValues, [action.id]: action.value };
      return {
        ...state,
        phase: "idle",
        displayValues: { ...state.displayValues, [action.id]: action.value },
        committedValues: next,
      };
    }

    // [FUTURE] case "VOID_SKIP":
    //   return { ...state, phase: "idle", activeId: null };
    //   Requires: DataProfile histograms + hasDataInDelta() utility.
    //   The committed values stay unchanged, no query fires.

    // [FUTURE] case "QUERY_START":
    //   return { ...state, phase: "querying" };
    //   Fires after DRAG_END when the async query is dispatched.

    // [FUTURE] case "SETTLE":
    //   return { ...state, phase: "idle", activeId: null };
    //   Fires when the Arrow IPC response arrives and the graph updates.

    default:
      return state;
  }
}
