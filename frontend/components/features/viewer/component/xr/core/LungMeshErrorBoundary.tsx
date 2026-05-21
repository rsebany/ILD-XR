import React, { Component } from "react";

type LungMeshErrorBoundaryProps = {
  fallback: React.ReactNode;
  onError?: (e: Error) => void;
  children: React.ReactNode;
};

type LungMeshErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

export class LungMeshErrorBoundary extends Component<
  LungMeshErrorBoundaryProps,
  LungMeshErrorBoundaryState
> {
  state: LungMeshErrorBoundaryState = { hasError: false, error: undefined };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

