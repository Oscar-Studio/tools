import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * React 子树错误兜底：捕获组件渲染错误，显示一个简洁的错误提示，
 * 避免整个 #root 被 unmount（之前一旦抛错会撕掉 TopBar）。
 *
 * 重置方式：reload。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[tools] ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            margin: '120px auto 0',
            maxWidth: 520,
            padding: '24px 28px',
            border: '1px solid rgba(255, 90, 90, 0.4)',
            borderRadius: 12,
            background: 'rgba(255, 90, 90, 0.08)',
            color: '#fff',
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
            lineHeight: 1.55,
          }}
        >
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>页面出了点问题</h2>
          <p style={{ margin: '0 0 16px', opacity: 0.85 }}>
            某个组件渲染失败。刷新页面通常能恢复；如果持续出现，麻烦反馈给 Oscar。
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
