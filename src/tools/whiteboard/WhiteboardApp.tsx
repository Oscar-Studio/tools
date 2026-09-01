import { useCallback, useEffect, useRef, useState } from 'react';
import { Tldraw, type Editor, getSnapshot, loadSnapshot } from 'tldraw';
import 'tldraw/tldraw.css';

const API_BASE = 'https://api.oscarstudio.cn/api';
const SYNC_DEBOUNCE_MS = 1500;
const SYNC_MAX_BYTES = 3 * 1024 * 1024; // 3 MB

function readCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()!.split(';').shift() || null;
  return null;
}

function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function tokenValid(token: string | null): token is string {
  if (!token) return false;
  const exp = decodeJwtExp(token);
  return !exp || exp * 1000 > Date.now();
}

/**
 * 解析 token 优先级：document.cookie.userToken (跨域) > localStorage.ai_token > localStorage.userToken
 */
function resolveToken(): string | null {
  const cookieToken = readCookie('userToken');
  if (tokenValid(cookieToken)) return cookieToken;
  try {
    if (tokenValid(localStorage.getItem('ai_token'))) return localStorage.getItem('ai_token')!;
    if (tokenValid(localStorage.getItem('userToken'))) return localStorage.getItem('userToken')!;
  } catch {
    /* localStorage 可能被禁用 */
  }
  return null;
}

function readTheme(): 'dark' | 'light' {
  const t = document.body?.dataset?.theme;
  if (t === 'dark' || t === 'light') return t;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function WhiteboardApp() {
  const editorRef = useRef<Editor | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => readTheme());

  // 监听 body[data-theme] 变化，自动跟随主题
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => obs.disconnect();
  }, []);

  // 主题变化时，实时更新 tldraw 主题
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      editor.user.updateUserPreferences({ colorScheme: theme });
    } catch (e) {
      console.warn('[whiteboard] set colorScheme failed:', e);
    }
  }, [theme]);

  const pushToCloud = useCallback(async (snapshot: unknown) => {
    const token = resolveToken();
    if (!token) return; // 未登录：仅本地保存
    try {
      const serialized = JSON.stringify(snapshot);
      if (serialized.length > SYNC_MAX_BYTES) {
        console.warn('[whiteboard] snapshot > 3MB, skip cloud sync');
        return;
      }
      const res = await fetch(`${API_BASE}/whiteboard`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ snapshot }),
      });
      if (!res.ok && res.status !== 413) {
        console.warn('[whiteboard] cloud sync failed:', res.status);
      }
    } catch (e) {
      // 网络异常静默：本地已保存
      console.warn('[whiteboard] cloud sync error:', e);
    }
  }, []);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // 初始主题
    try {
      editor.user.updateUserPreferences({ colorScheme: readTheme() });
    } catch (e) {
      console.warn('[whiteboard] initial colorScheme failed:', e);
    }

    // 监听变更并防抖同步。
    // 注意：使用 tldraw 顶层 getSnapshot(store)，它会同时序列化
    // document + session state，避免只保存 document 导致 session 引用断裂。
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = editor.store.listen(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const snap = getSnapshot(editor.store);
          void pushToCloud(snap);
        } catch (e) {
          console.warn('[whiteboard] getSnapshot failed:', e);
        }
      }, SYNC_DEBOUNCE_MS);
    });

    // 异步拉取云端快照并覆盖本地。
    // 使用 tldraw 顶层 loadSnapshot(store, snapshot, opts) 而不是
    // editor.store.loadSnapshot（已弃用，会跳过 schema 迁移和 session 处理）。
    (async () => {
      const token = resolveToken();
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/whiteboard`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.snapshot || typeof data.snapshot !== 'object') return;
        try {
          loadSnapshot(editor.store, data.snapshot, {
            forceOverwriteSessionState: true,
          });
        } catch (loadErr) {
          // 加载失败通常是云端 snapshot 是用旧的 editor.store.getSnapshot() 保存的、
          // 或者 schema 已不兼容。退一步：清空 store 让 integrity checker 重建。
          console.warn('[whiteboard] loadSnapshot failed, resetting local store:', loadErr);
          try {
            editor.store.clear();
            // ensureStoreIsUsable 是 @tldraw/store 的 @internal API，会为缺失的
            // page/document/instance 自动补 record（integrity checker）。
            (editor.store as unknown as { ensureStoreIsUsable(): void }).ensureStoreIsUsable();
          } catch (clearErr) {
            console.warn('[whiteboard] reset local store failed:', clearErr);
          }
        }
      } catch (e) {
        console.warn('[whiteboard] cloud load failed:', e);
      }
    })();

    // 在 editor 上挂一个清理函数，React unmount 时调用
    (editor as Editor & { __wbCleanup?: () => void }).__wbCleanup = () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [pushToCloud]);

  // 卸载时清理 store listener
  useEffect(() => {
    return () => {
      const editor = editorRef.current as (Editor & { __wbCleanup?: () => void }) | null;
      if (editor?.__wbCleanup) {
        try { editor.__wbCleanup(); } catch { /* ignore */ }
      }
      editorRef.current = null;
    };
  }, []);

  return (
    <div className="whiteboard-shell" style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        persistenceKey="oscar-whiteboard"
        onMount={handleMount}
      />
    </div>
  );
}

export default WhiteboardApp;
