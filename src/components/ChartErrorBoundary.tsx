import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChartErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ChartErrorBoundary] Render error caught:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 space-y-3 flex flex-col items-center justify-center text-center my-4">
          <AlertTriangle className="w-8 h-8 text-rose-400 animate-bounce" />
          <div>
            <h4 className="text-sm font-bold">Chart Render Error</h4>
            <p className="text-xs text-rose-300 mt-1">
              {this.props.fallbackMessage || 'An unexpected error occurred while rendering telemetry chart.'}
            </p>
            {this.state.error && (
              <pre className="text-[10px] font-mono bg-slate-950/60 p-2 rounded mt-2 text-rose-400 overflow-x-auto max-w-md">
                {this.state.error.message}
              </pre>
            )}
          </div>
          <button
            onClick={this.handleReset}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Chart</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
