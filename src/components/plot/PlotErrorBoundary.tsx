/**
 * PlotErrorBoundary — catches compile() or render errors in PlotFrame.
 *
 * Renders a user-facing error message instead of crashing the page.
 * Wraps individual PlotFrames so one broken plot doesn't take down
 * the rest of the page.
 */

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class PlotErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="surface-sunken radius-sm" style={{ padding: "var(--space-block)" }}>
          <p className="weight-semibold">This dataset could not be visualized.</p>
          <pre className="color-muted" style={{ fontSize: "var(--text-fine)", whiteSpace: "pre-wrap" }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
