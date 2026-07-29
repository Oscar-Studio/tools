import { useEffect } from 'react';

declare global {
  interface Window {
    Opilot?: {
      enhance: (el: HTMLElement, opts: any) => void;
      openPanel?: () => void;
    };
  }
}

export function useOpilot(searchInput: HTMLInputElement | null, tools: any[], site: string) {
  useEffect(() => {
    if (!searchInput) return;
    let attempts = 0;
    const max = 60;
    const tick = () => {
      if (window.Opilot) {
        try {
          window.Opilot.enhance(searchInput, {
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
  }, [searchInput, tools, site]);
}