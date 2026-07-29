import { useEffect, useState } from 'react';
import type { ToolsConfig, Tool } from '../types';

export function useToolsConfig() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    fetch('/tools-config.json', { signal: ctrl.signal })
      .then(r => {
        clearTimeout(timer);
        return r.json() as Promise<ToolsConfig>;
      })
      .then(data => {
        const loaded = (data.tools || []).slice();
        loaded.sort((a, b) => {
          if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setTools(loaded);
        setLoading(false);
      })
      .catch(err => {
        clearTimeout(timer);
        console.error('加载工具配置失败:', err);
        setError('加载工具配置失败');
        setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  return { tools, loading, error };
}