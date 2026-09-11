import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * tools 子站的主题切换 hook（classic / studio）
 *
 * 修过的问题：之前每个调用 useHomeTheme() 的组件都拿到独立的 useState，
 * TopBar 切换 studio 时写 localStorage + setAttribute 都对了，但 AppContent
 * 内部的 useHomeTheme() 仍是旧值，导致 {toolsTheme === 'studio' && <StudioLanding>}
 * 永远不渲染，切换后页面空白。现在用 Context 共享同一个 state。
 *
 * 用法：在 main.tsx 用 <ToolsThemeProvider> 包住整棵子树，
 *      任何组件里调用 useHomeTheme() 拿到同一个 theme + setter。
 */

export type ToolsTheme = 'classic' | 'studio';

const STORAGE_KEY = 'oscar-tools-theme';
const DEFAULT_TOOLS_THEME: ToolsTheme = 'studio';

const API_BASE_FALLBACK = 'https://api.oscarstudio.cn';

function isValidTheme(v: unknown): v is ToolsTheme {
  return v === 'classic' || v === 'studio';
}

function readStoredTheme(): ToolsTheme {
  if (typeof localStorage === 'undefined') return DEFAULT_TOOLS_THEME;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isValidTheme(v)) return v;
  } catch { /* ignore */ }
  return DEFAULT_TOOLS_THEME;
}

function writeStoredTheme(t: ToolsTheme) {
  try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
}

function readToken(): string | null {
  if (typeof document !== 'undefined') {
    const m = document.cookie.match(/(?:^|; )userToken=([^;]*)/);
    if (m) return decodeURIComponent(m[1]);
  }
  try {
    const ls = localStorage.getItem('ai_token') || localStorage.getItem('userToken');
    if (ls) return ls;
  } catch { /* ignore */ }
  return null;
}

function applyThemeAttr(t: ToolsTheme) {
  if (typeof document === 'undefined') return;
  const cur = document.documentElement.getAttribute('data-tools-theme');
  if (cur !== t) document.documentElement.setAttribute('data-tools-theme', t);
}

interface Ctx {
  theme: ToolsTheme;
  setTheme: (t: ToolsTheme) => void;
}

const ToolsThemeContext = createContext<Ctx | null>(null);

export function ToolsThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ToolsTheme>(readStoredTheme);

  // 1. 同步挂到 <html data-tools-theme>
  useEffect(() => {
    applyThemeAttr(theme);
  }, [theme]);

  // 2. 登录态下，把服务端 ui_config.toolsTheme 拉下来覆盖本地缓存。
  useEffect(() => {
    let cancelled = false;
    const token = readToken();
    if (!token) return;

    (async () => {
      try {
        const apiBase = (window.API_BASE || API_BASE_FALLBACK) + '/api';
        const resp = await fetch(`${apiBase}/ui`, { credentials: 'include' });
        if (!resp.ok) return;
        const data = await resp.json().catch(() => null);
        if (cancelled || !data?.success) return;
        const remote = data?.ui?.toolsTheme;
        if (isValidTheme(remote) && remote !== readStoredTheme()) {
          writeStoredTheme(remote);
          setThemeState(remote);
        }
      } catch { /* ignore */ }
    })();

    return () => { cancelled = true; };
  }, []);

  const setTheme = useCallback((t: ToolsTheme) => {
    if (!isValidTheme(t)) return;
    setThemeState(t);
    writeStoredTheme(t);
    const token = readToken();
    if (token) {
      try {
        const apiBase = (window.API_BASE || API_BASE_FALLBACK) + '/api';
        fetch(`${apiBase}/ui`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
          body: JSON.stringify({ toolsTheme: t }),
        }).catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    }
  }, []);

  return (
    <ToolsThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ToolsThemeContext.Provider>
  );
}

export function useHomeTheme(): [ToolsTheme, (t: ToolsTheme) => void] {
  const ctx = useContext(ToolsThemeContext);
  if (!ctx) {
    // 没包 Provider 时退回独立 useState（兼容意外调用，比如 Storybook 单测）
    const [theme, setThemeState] = useState<ToolsTheme>(readStoredTheme);
    useEffect(() => { applyThemeAttr(theme); }, [theme]);
    const setTheme = useCallback((t: ToolsTheme) => {
      if (!isValidTheme(t)) return;
      setThemeState(t);
      writeStoredTheme(t);
    }, []);
    return [theme, setTheme];
  }
  return [ctx.theme, ctx.setTheme];
}
