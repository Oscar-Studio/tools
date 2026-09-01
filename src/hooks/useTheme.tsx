import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'oscar-theme';

function readStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'system';
}

function writeStoredTheme(t: ThemeMode) {
  try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
}

function detectSystem(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  // 避免无意义重写
  if (document.documentElement.getAttribute('data-theme') !== resolved) {
    document.documentElement.setAttribute('data-theme', resolved);
  }
}

/**
 * 主题 hook。返回 [mode, resolved, setMode]。
 * - mode: 用户选择的模式（light / dark / system）
 * - resolved: 实际应用的主题（system 模式下根据系统偏好解析为 light / dark）
 * - setMode: 切换模式，会持久化到 localStorage
 */
export function useTheme(): [ThemeMode, ResolvedTheme, (t: ThemeMode) => void] {
  const [mode, setModeState] = useState<ThemeMode>(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(detectSystem);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    // 部分旧浏览器只支持 addListener
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, []);

  const resolved: ResolvedTheme = mode === 'system' ? systemTheme : mode;

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setMode = useCallback((t: ThemeMode) => {
    setModeState(t);
    writeStoredTheme(t);
  }, []);

  return [mode, resolved, setMode];
}
