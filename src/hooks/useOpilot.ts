import { useEffect, type RefObject } from 'react';

declare global {
  interface Window {
    Opilot?: {
      enhance: (el: HTMLElement, opts: any) => void;
      openPanel?: () => void;
    };
  }
}

/**
 * 跟 Opilot（ai.oscarstudio.cn/opilot.js）握手，给传入的搜索框挂上搜索增强。
 * 接收 RefObject 而不是 HTMLElement，是因为 input 由 TopBar 渲染，
 * App 里持有的 ref 在首次渲染时 current 仍是 null；传 ref 对象让 hook 在 useEffect 里
 * 读 current，能正确等到 input mount 后再调 enhance。
 */
export function useOpilot(
  searchInputRef: RefObject<HTMLInputElement | null>,
  tools: any[],
  site: string,
) {
  useEffect(() => {
    const el = searchInputRef.current;
    if (!el) return;
    let attempts = 0;
    const max = 60;
    const tick = () => {
      if (window.Opilot) {
        try {
          window.Opilot.enhance(el, {
            get tools() { return tools; },
            site,
            onKeyword: () => {},
          });
        } catch (e) {
          console.warn('Opilot enhance failed:', e);
        }
        return;
      }
      if (attempts++ < max) setTimeout(tick, 250);
    };
    tick();
  }, [searchInputRef, tools, site]);
}
