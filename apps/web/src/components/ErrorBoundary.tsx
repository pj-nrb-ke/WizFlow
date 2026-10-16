import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean };

/** Stops one page's render crash from blanking the whole app (white screen).
 *  React error boundaries must be class components. Give it a `key` that changes
 *  on route (e.g. location.pathname) so it resets automatically when you navigate. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Observability only — surfaces in the browser console for diagnosis.
    console.error("ErrorBoundary caught a render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="wf-card p-8 text-center max-w-lg mx-auto mt-8">
        <h2 className="font-semibold text-slate-800 text-lg">This section couldn’t be displayed</h2>
        <p className="text-sm text-slate-500 mt-2">
          Something went wrong while rendering this page. Your data is safe — try again, or reload.
        </p>
        <div className="flex gap-2 justify-center mt-4">
          <button
            type="button"
            className="wf-btn-primary text-sm px-4 py-2"
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </button>
          <button
            type="button"
            className="wf-btn-secondary text-sm px-4 py-2"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
