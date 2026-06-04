import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error('UI crash:', error);
  }
  render() {
    if (this.state.hasError) {
      return <div className="p-8 text-neg">页面出错了，请刷新重试。</div>;
    }
    return this.props.children;
  }
}
