import React from "react";
import { AppErrorScreen } from "@/components/AppErrorScreen";

type ErrorBoundaryProps = {
  children: React.ReactNode;
  onRetry?: () => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Pulse render error:", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.error) {
      return <AppErrorScreen error={this.state.error} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}
