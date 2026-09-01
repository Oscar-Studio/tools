import { forwardRef, useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { useHomeTheme } from '../hooks/useHomeTheme';

interface TopBarProps {
  section: string;
}

export const TopBar = forwardRef<HTMLInputElement, TopBarProps>(function TopBar({ section }, searchInputRef) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [toolsTheme, setToolsTheme] = useHomeTheme();

  // 加载 user-button.js（共享认证）
  useEffect(() => {
    const id = 'oscar-user-button';
    if (document.getElementById(id)) return;
    const s = document.createElement('script');
    s.id = id;
    s.src = 'https://api.oscarstudio.cn/user-button.js';
    s.crossOrigin = 'anonymous';
    s.async = true;
    document.body.appendChild(s);
  }, []);

  // 加载 opilot
  useEffect(() => {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'https://ai.oscarstudio.cn/opilot.css';
    document.head.appendChild(style);
    const id = 'oscar-opilot';
    if (document.getElementById(id)) return;
    const s = document.createElement('script');
    s.id = id;
    s.src = 'https://ai.oscarstudio.cn/opilot.js';
    s.async = true;
    document.body.appendChild(s);
  }, []);

  // 把 user-button.js 生成的 "登录/注册" 按钮改名为 "登录"
  useEffect(() => {
    const shorten = () => {
      const btn = document.querySelector<HTMLAnchorElement>('.login-register-btn');
      if (btn && btn.textContent && btn.textContent.includes('注册')) {
        btn.textContent = '登录';
      }
    };
    shorten();
    const observer = new MutationObserver(shorten);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  // 搜索框打开时按 Esc 关闭
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  // 移动端不加载 plasma
  useEffect(() => {
    let particleUI: any = null;
    const loaded = new Set<string>();

    const isPlasma = () => {
      try { return localStorage.getItem('oscar-quality') === 'plasma'; } catch { return false; }
    };
    const loadScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        if (loaded.has(src)) return resolve();
        const el = document.createElement('script');
        el.src = src;
        el.onload = () => { loaded.add(src); resolve(); };
        el.onerror = reject;
        document.head.appendChild(el);
      });
    const destroyParticle = () => {
      if (particleUI && typeof particleUI.destroy === 'function') particleUI.destroy();
      particleUI = null;
    };
    const initParticle = async () => {
      try {
        await loadScript('/particle-engine/particle-core.js');
        await loadScript('/particle-engine/particle-ui.js');
        const W = window as any;
        if (typeof W.ParticleUI === 'function') {
          particleUI = new W.ParticleUI(document.body, { particleCount: 200, quality: 'plasma' });
        }
      } catch (e) {
        console.error('Failed to load particle UI:', e);
      }
    };
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (isPlasma() && !isMobile) initParticle();
    else destroyParticle();
    return () => destroyParticle();
  }, []);

  return (
    <header className="top-bar">
      <div className="breadcrumb">
        <img src="/logo.png" alt="" style={{ height: 24, verticalAlign: 'middle', marginRight: 8 }} />
        <a href="https://oscarstudio.cn">Oscar Studio</a> &gt; <span>{section}</span>
      </div>

      {/* 中心搜索区：默认折叠（点 🔍 后从右滑到中间展开） */}
      <div className={`top-bar-search${searchOpen ? ' open' : ''}`}>
        <input
          ref={searchInputRef}
          type="text"
          id="searchInput"
          placeholder="搜索工具…"
          autoComplete="off"
          onBlur={() => setSearchOpen(false)}
        />
      </div>

      <div className="top-bar-actions">
        <div className="theme-mode-toggle" role="group" aria-label="主题">
          <button
            type="button"
            className={toolsTheme === 'classic' ? 'active' : ''}
            onClick={() => setToolsTheme('classic')}
            aria-pressed={toolsTheme === 'classic'}
          >
            Classic
          </button>
          <button
            type="button"
            className={toolsTheme === 'studio' ? 'active' : ''}
            onClick={() => setToolsTheme('studio')}
            aria-pressed={toolsTheme === 'studio'}
          >
            Studio
          </button>
        </div>
        <button
          type="button"
          className="icon-button search-toggle"
          aria-label={searchOpen ? '关闭搜索' : '打开搜索'}
          title={searchOpen ? '关闭' : '搜索'}
          onClick={() => setSearchOpen(v => !v)}
        >
          {searchOpen ? '✕' : '⌕'}
        </button>
        <ThemeToggle />
        <div id="userButtonContainer" />
      </div>
    </header>
  );
});
