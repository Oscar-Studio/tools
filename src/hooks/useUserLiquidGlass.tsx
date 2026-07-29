import { createContext, useContext, useEffect, useState, createElement } from 'react';
import type { GlassOptics } from '@samasante/liquid-glass';

// UI 设置 → 液态玻璃画质预设
export type LiquidGlassQuality = 'high' | 'mid' | 'low';

const API_BASE = 'https://api.oscarstudio.cn/api';

// 与 API/routes/ui.js 和 API/public/settings.html 的 LG_PRESETS 保持一致
const LG_PRESETS: Record<LiquidGlassQuality, Partial<GlassOptics>> = {
  high: { sheenWidth: 30, strength: 0.15, curvature: 0.15, frost: 3, dispersion: 0.10, brightness: 0.04, sheen: 0.55, specular: 1.1, glow: 0.3, glowSpread: 0.18, depth: 0.7 },
  mid:  { sheenWidth: 60, strength: 0.5,  curvature: 0.3,  frost: 2, dispersion: 0.10, brightness: 0.04, sheen: 0.5,  specular: 1.0, glow: 0.25, glowSpread: 0.15, depth: 0.5 },
  low:  { sheenWidth: 30, strength: 0.3,  curvature: 0.0,  frost: 0, dispersion: 0.00, brightness: 0.02, sheen: 0.3,  specular: 0.7, glow: 0.1,  glowSpread: 0.1,  depth: 0.3 },
};

// 画质预设 → 渲染预算（maxDpr + filterResolution）
// 'high' = 完整质量；'mid' = 降采样 + 减小纹理；'low' = 进一步降（Glass 仍渲染但很糊）
const LG_BUDGET: Record<LiquidGlassQuality, { maxDpr?: number; filterResolution?: number }> = {
  high: {},
  mid:  { maxDpr: 1, filterResolution: 0.5 },
  low:  { maxDpr: 1, filterResolution: 0.25 },
};

export interface UserLiquidGlass {
  quality: LiquidGlassQuality;
  optics: Partial<GlassOptics>;
  budget: { maxDpr?: number; filterResolution?: number };
}

const DEFAULT: UserLiquidGlass = {
  quality: 'high',
  optics: { ...LG_PRESETS.high },
  budget: { ...LG_BUDGET.high },
};

const UserLiquidGlassContext = createContext<UserLiquidGlass>(DEFAULT);

export function UserLiquidGlassProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<UserLiquidGlass>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('ai_token') || readCookie('userToken');
        if (!token) return;
        const resp = await fetch(`${API_BASE}/ui`, { credentials: 'include' });
        if (!resp.ok) return;
        const data = await resp.json();
        if (cancelled || !data?.success || !data?.ui?.liquidGlass) return;
        const lg = data.ui.liquidGlass;
        const quality: LiquidGlassQuality =
          lg.preset === 'high' || lg.preset === 'mid' || lg.preset === 'low'
            ? lg.preset
            : 'high';
        // 用户自定义的 11 个参数优先；缺省用对应 preset 的值
        const optics: Partial<GlassOptics> = {
          ...LG_PRESETS[quality],
          ...(lg.params && typeof lg.params === 'object' ? lg.params : {}),
        };
        setCfg({ quality, optics, budget: LG_BUDGET[quality] });
        document.body.classList.toggle('liquid-glass-low', quality === 'low');
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return createElement(UserLiquidGlassContext.Provider, { value: cfg }, children);
}

export function useUserLiquidGlass(): UserLiquidGlass {
  return useContext(UserLiquidGlassContext);
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}