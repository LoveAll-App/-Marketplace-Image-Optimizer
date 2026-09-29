import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg p-8 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-(--color-muted)">{this.state.error.message}</p>
          <button onClick={() => { this.setState({ error: null }); location.reload(); }} className="mt-4 rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg)">
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
