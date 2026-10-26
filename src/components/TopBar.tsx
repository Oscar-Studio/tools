import { forwardRef, useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

interface TopBarProps {
  section: string;
  onSearch: (value: string) => void;
}

export const TopBar = forwardRef<HTMLInputElement, TopBarProps>(function TopBar({ section, onSearch }, searchInputRef) {
  const [searchOpen, setSearchOpen] = useState(false);

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
          aria-label="搜索名称、介绍或标签"
          onChange={event => onSearch(event.target.value)}
          placeholder="搜索工具…"
          autoComplete="off"
          onBlur={() => setSearchOpen(false)}
        />
      </div>

      <div className="top-bar-actions">
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
