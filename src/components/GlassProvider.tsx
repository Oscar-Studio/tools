import { useEffect } from 'react';

const API_BASE = 'https://api.oscarstudio.cn';
const DEFAULT_BG = `${API_BASE}/default-bg.jpeg`;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

type BgCfg = { url: string; overlay?: number; blur?: number };

function applyBackgroundFx(cfg: BgCfg | null) {
  const body = document.body;
  const oldLayer = document.getElementById('userBgLayer');
  const oldMask = document.getElementById('userBgMask');
  if (oldLayer) oldLayer.remove();
  if (oldMask) oldMask.remove();
  body.style.backgroundImage = '';
  body.style.backgroundSize = '';
  body.style.backgroundPosition = '';
  body.style.backgroundRepeat = '';
  body.style.backgroundAttachment = '';

  if (!cfg) return;

  const overlay = typeof cfg.overlay === 'number' && Number.isFinite(cfg.overlay) ? cfg.overlay : 0;
  const blur = typeof cfg.blur === 'number' && Number.isFinite(cfg.blur) ? cfg.blur : 0;

  // 使用正 z-index 分层，避免 Safari 中 body 上的 stacking context 把
  // z-index:-1 误压在 body 背景下，导致加入遮罩后只剩玻璃模块透出背景。
  // 层级：userBgLayer=0、userBgMask=1、内容需 ≥ 2。
  const layer = document.createElement('div');
  layer.id = 'userBgLayer';
  layer.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:0',
    'pointer-events:none',
    `background-image:url(${cfg.url})`,
    'background-size:cover',
    'background-position:center',
    'background-repeat:no-repeat',
    'background-attachment:fixed',
    blur > 0 ? `filter:blur(${blur}px)` : '',
    blur > 0 ? `-webkit-filter:blur(${blur}px)` : '',
    blur > 0 ? 'will-change:transform' : '',
    blur > 0 ? 'transform:translateZ(0)' : '',
  ].filter(Boolean).join(';');
  document.body.appendChild(layer);

  if (overlay > 0) {
    const mask = document.createElement('div');
    mask.id = 'userBgMask';
    mask.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:1',
      'pointer-events:none',
      'background:#000',
      `opacity:${overlay}`,
    ].join(';');
    document.body.appendChild(mask);
  }

  body.style.background = 'transparent';
}

async function resolveBg(): Promise<BgCfg> {
  const fallback: BgCfg = { url: DEFAULT_BG };
  const token = readCookie('userToken');
  if (!token) return fallback;
  try {
    const resp = await fetch(`${API_BASE}/api/ui`, { credentials: 'include' });
    if (!resp.ok) return fallback;
    const data = await resp.json().catch(() => null);
    if (data?.success && data?.ui?.backgroundImage) {
      return {
        url: `${API_BASE}${data.ui.backgroundImage}`,
        overlay: data.ui.backgroundOverlay,
        blur: data.ui.backgroundBlur,
      };
    }
  } catch { /* ignore */ }
  return fallback;
}

/**
 * 应用用户自定义背景（无则用 default-bg.jpeg）。
 * 与 user-button.js 通过 `body.style.backgroundImage` 互斥，
 * 任意一方设置过则对方不再覆盖。
 */
export function useUserBackground() {
  useEffect(() => {
    // 移除 MutationObserver：原本的实现会因为 applyBackgroundFx 写入 body.style
    // 触发 observer 回调，回调里又调 applyBackgroundFx，造成无限循环
    // （Safari 尤甚，会直接卡死整个页面）。
    // 现在只首次拉一次配置即可，与 main-station 行为一致。
    //
    // 协调点：user-button.js（共享 SDK）会在登录态、且用户设置了 backgroundImage
    // 时创建自己的 userBgLayer/userBgMask（z-index:-1），并把 body.isolation 设成
    // 'isolate' 作为"已接管"标记。如果我们再 applyBackgroundFx，会把它删掉重建，
    // 出现两层 background 互相打架。这里检测到 isolation 已经被设过就让位。
    if (document.body.style.isolation === 'isolate') return;
    resolveBg().then(applyBackgroundFx);
  }, []);
}
