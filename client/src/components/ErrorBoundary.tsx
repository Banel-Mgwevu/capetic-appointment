import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors anywhere below it in the tree and shows a
 * friendly fallback instead of a blank white screen. React error boundaries
 * must be class components -- there's no hook equivalent as of React 18.
 *
 * Placed around <Routes> (not the whole app) so the header and footer keep
 * rendering even if a page crashes, giving the person a way to navigate
 * away rather than being stuck on a blank tab.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error in the app:', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="page page--narrow">
          <div className="card error-boundary">
            <h1>Something went wrong</h1>
            <p>
              This page hit an unexpected error. Your booking (if you have one) is safe — nothing here is lost. Try
              reloading, or head back to the start.
            </p>
            <div className="step__actions">
              <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
                Reload page
              </button>
              <a className="button button--ghost" href="/">
                Back to booking
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
