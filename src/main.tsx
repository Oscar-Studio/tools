import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToolsThemeProvider } from './hooks/useHomeTheme';
import './styles/tokens.css';
import './styles/globals.css';
// subsite.css：原 public/style.css 的内容（含 .top-bar / .hero / .card-* 等），
// 打包进 assets/index-*.css，不再依赖外链 /style.css?v=11。
// 留 public/style.css 作为 fallback，删掉 index.html 里的 <link> 后它就不被加载了。
import './styles/subsite.css';

// tldraw 包体较大，懒加载：访问 /whiteboard 时才会下载对应 chunk。
const WhiteboardApp = React.lazy(() =>
  import('./tools/whiteboard/WhiteboardApp').then((m) => ({ default: m.WhiteboardApp }))
);

// HashRouter：避免服务器 try_files 配置改动；`/#/whiteboard` 直接路由到白板。
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* ToolsThemeProvider：放在最外层，让 TopBar / AppContent / 后续子页
        都拿到同一个 toolsTheme state —— 否则各自 useState 会导致切换后
        AppContent 拿不到新值，StudioLanding 不渲染。 */}
    <ToolsThemeProvider>
      <ErrorBoundary>
        <HashRouter>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<App />} />
              <Route path="/whiteboard" element={<WhiteboardApp />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </ErrorBoundary>
    </ToolsThemeProvider>
  </React.StrictMode>,
);
