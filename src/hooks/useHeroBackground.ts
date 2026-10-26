/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';

const KEY = 'oscar-tools-cover';
export const DEMO_COVER = 'https://api.oscarstudio.cn/default-bg.jpeg';
type Cover = { image: string; overlay: number; blur: number };
const EMPTY: Cover = { image: '', overlay: 20, blur: 0 };
const resolveImage = (url: string) => url.startsWith('/') && !url.startsWith('//') ? `https://api.oscarstudio.cn${url}` : url;

export function useHeroBackground() {
  const locallyChanged = useRef(false);
  const [cover, setCover] = useState<Cover>(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('cover') === 'demo') return { ...EMPTY, image: DEMO_COVER };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && typeof saved.image === 'string') return {
        image: saved.image,
        overlay: Number.isFinite(saved.overlay) ? Math.max(0, Math.min(70, saved.overlay)) : 20,
        blur: Number.isFinite(saved.blur) ? Math.max(0, Math.min(16, saved.blur)) : 0,
      };
      const legacy = localStorage.getItem('lg-bg');
      if (legacy) return { ...EMPTY, image: resolveImage(legacy) };
    } catch { /* Keep the default canvas when storage is unavailable. */ }
    return EMPTY;
  });
  const [error, setError] = useState('');

  useEffect(() => {
    // An explicit local choice always wins over the account's existing wallpaper.
    try { if (localStorage.getItem(KEY)) return; } catch { return; }
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('cover') === 'demo') return;
    let cancelled = false;
    const controller = new AbortController();
    let token = document.cookie.match(/(?:^|; )userToken=([^;]*)/)?.[1];
    try { token ||= localStorage.getItem('ai_token') || localStorage.getItem('userToken') || undefined; } catch { /* Cookie authentication remains available. */ }
    if (!token) return;
    fetch(`${(window as Window & { API_BASE?: string }).API_BASE || 'https://api.oscarstudio.cn'}/api/ui`, { credentials: 'include', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (cancelled || locallyChanged.current || !data?.success || typeof data.ui?.backgroundImage !== 'string') return;
        const ui = data.ui;
        setCover({
          image: resolveImage(ui.backgroundImage),
          overlay: typeof ui.backgroundOverlay === 'number' ? Math.max(0, Math.min(70, ui.backgroundOverlay * 100)) : 20,
          blur: typeof ui.backgroundBlur === 'number' ? Math.max(0, Math.min(16, ui.backgroundBlur)) : 0,
        });
      }).catch(() => {});
    return () => { cancelled = true; controller.abort(); };
  }, []);

  function update(next: Cover) {
    locallyChanged.current = true;
    setCover(next);
    setError('');
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { setError('背景已应用，但本机存储空间不足，刷新后可能无法保留。'); }
  }

  return { cover, update, error, setError };
}
