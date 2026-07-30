import { useEffect, useRef, useState } from 'react';

export function TopBar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [settingsOpen]);

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

  return (
    <header className="top-bar glass-element">
      <div className="breadcrumb">
        <img src="/logo.png" alt="" style={{ height: 24, verticalAlign: 'middle', marginRight: 8 }} />
        <a href="https://oscarstudio.cn">Oscar Studio</a> &gt; <span>实用工具</span>
      </div>
      <div className="search-box">
        <input ref={inputRef} type="text" id="searchInput" placeholder="Chat with Opilot" />
      </div>
      <div ref={dropRef} style={{ position: 'relative' }}>
        <button
          className={`settings-btn ${settingsOpen ? 'active' : ''}`}
          id="settingsBtn"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSettingsOpen(v => !v);
          }}
        >
          ⚙
        </button>
      </div>
      <div id="userButtonContainer" />
    </header>
  );
}