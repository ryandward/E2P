import { describe, it, expect } from "vitest";
import { controlReducer, initControlState } from "../controlState";

const INITIAL = { threshold: 0.3, groupBy: "tissue" };

describe("controlReducer", () => {
  it("initializes in idle phase with matching display and committed values", () => {
    const state = initControlState(INITIAL);
    expect(state.phase).toBe("idle");
    expect(state.displayValues).toEqual(INITIAL);
    expect(state.committedValues).toEqual(INITIAL);
    expect(state.activeId).toBeNull();
  });

  it("DRAG_START transitions to dragging", () => {
    const state = initControlState(INITIAL);
    const next = controlReducer(state, { type: "DRAG_START", id: "threshold", value: 0.3 });
    expect(next.phase).toBe("dragging");
    expect(next.activeId).toBe("threshold");
  });

  it("DRAG_MOVE updates display values only, not committed", () => {
    let state = initControlState(INITIAL);
    state = controlReducer(state, { type: "DRAG_START", id: "threshold", value: 0.3 });
    state = controlReducer(state, { type: "DRAG_MOVE", id: "threshold", value: 0.5 });

    expect(state.phase).toBe("dragging");
    expect(state.displayValues.threshold).toBe(0.5);
    expect(state.committedValues.threshold).toBe(0.3); // unchanged
  });

  it("DRAG_MOVE is ignored when not dragging", () => {
    const state = initControlState(INITIAL);
    const next = controlReducer(state, { type: "DRAG_MOVE", id: "threshold", value: 0.9 });
    expect(next).toBe(state); // same reference, no change
  });

  it("DRAG_END commits the value and returns to idle", () => {
    let state = initControlState(INITIAL);
    state = controlReducer(state, { type: "DRAG_START", id: "threshold", value: 0.3 });
    state = controlReducer(state, { type: "DRAG_MOVE", id: "threshold", value: 0.7 });
    state = controlReducer(state, { type: "DRAG_END", id: "threshold", value: 0.7 });

    expect(state.phase).toBe("idle");
    expect(state.activeId).toBeNull();
    expect(state.displayValues.threshold).toBe(0.7);
    expect(state.committedValues.threshold).toBe(0.7); // NOW committed
  });

  it("SELECT commits immediately with no drag phase", () => {
    const state = initControlState(INITIAL);
    const next = controlReducer(state, { type: "SELECT", id: "groupBy", value: "mark" });

    expect(next.phase).toBe("idle");
    expect(next.displayValues.groupBy).toBe("mark");
    expect(next.committedValues.groupBy).toBe("mark");
  });

  it("full drag lifecycle: display updates during drag, commit on drop", () => {
    let state = initControlState(INITIAL);

    // Start drag
    state = controlReducer(state, { type: "DRAG_START", id: "threshold", value: 0.3 });
    expect(state.committedValues.threshold).toBe(0.3);

    // Drag through multiple positions
    state = controlReducer(state, { type: "DRAG_MOVE", id: "threshold", value: 0.4 });
    state = controlReducer(state, { type: "DRAG_MOVE", id: "threshold", value: 0.5 });
    state = controlReducer(state, { type: "DRAG_MOVE", id: "threshold", value: 0.6 });

    // Display updated, committed unchanged
    expect(state.displayValues.threshold).toBe(0.6);
    expect(state.committedValues.threshold).toBe(0.3);

    // Drop
    state = controlReducer(state, { type: "DRAG_END", id: "threshold", value: 0.6 });

    // Both updated
    expect(state.displayValues.threshold).toBe(0.6);
    expect(state.committedValues.threshold).toBe(0.6);
    expect(state.phase).toBe("idle");
  });

  it("other control values are preserved during drag", () => {
    let state = initControlState(INITIAL);
    state = controlReducer(state, { type: "DRAG_START", id: "threshold", value: 0.3 });
    state = controlReducer(state, { type: "DRAG_MOVE", id: "threshold", value: 0.8 });

    expect(state.displayValues.groupBy).toBe("tissue"); // untouched
    expect(state.committedValues.groupBy).toBe("tissue"); // untouched
  });
});
