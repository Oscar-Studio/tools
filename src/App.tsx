import { useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TopBar } from './components/TopBar';
import { Hero } from './components/Hero';
import { CardGrid } from './components/CardGrid';
import { MorphCard } from './components/MorphCard';
import { useToolsConfig } from './hooks/useToolsConfig';
import { useOpilot } from './hooks/useOpilot';
import { useUserBackground } from './components/GlassProvider';
import { useHomeTheme } from './hooks/useHomeTheme';
import { StudioLanding } from './components/Studio/StudioLanding';
import { pageFade } from './lib/motion-presets';
import type { Tool } from './types';

export type Phase = 'idle' | 'opening' | 'open' | 'closing';

function AppContent() {
  useUserBackground();
  const { tools, loading, error } = useToolsConfig();
  const [selected, setSelected] = useState<{ tool: Tool; rect: DOMRect } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [toolsTheme] = useHomeTheme();
  const lockRef = useRef(false);
  const rectsRef = useRef<Record<string, DOMRect>>({});
  // searchInputRef 转发到 TopBar 内的搜索框；传给 useOpilot 后能在 input mount 时挂上增强。
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useOpilot(searchInputRef, tools, 'tools');

  const handleSelect = useCallback((tool: Tool, rect: DOMRect) => {
    if (lockRef.current) return;
    lockRef.current = true;
    rectsRef.current[tool.id] = rect;
    setSelected({ tool, rect });
    setPhase('opening');
  }, []);

  const handleClose = useCallback(() => {
    setPhase('closing');
  }, []);

  const handlePhaseChange = useCallback((next: Phase) => {
    setPhase(next);
    if (next === 'idle') {
      setSelected(null);
      rectsRef.current = {};
      lockRef.current = false;
    }
  }, []);

  return (
    <>
      <TopBar ref={searchInputRef} section="实用工具" />
      {/* Classic 主题：原版卡片网格。Studio 主题下用 .classic-only 隐藏 */}
      <div className="classic-only">
        <Hero />
        <CardGrid
          tools={tools}
          loading={loading}
          error={error}
          selectedId={selected?.tool.id ?? null}
          phase={phase}
          rects={rectsRef.current}
          onSelect={handleSelect}
        />
      </div>
      {/* Studio 主题：落地页（点击直接跳转，无 MorphCard）。Classic 主题下不渲染（节省 JS）
          AnimatePresence 包做主题切换 crossfade：mode="wait" 让旧主题完全淡出后新主题才淡入，避免重叠闪烁。
          注意：不要 gate 在 !loading && !error 上 —— 一旦 fetch 失败 error 永久置位，studio 模式会一直空白。
          让 hero 永远渲染，grid 拿到数据时再填充；空状态由 StudioCardGrid 内部处理。 */}
      <AnimatePresence mode="wait">
        {toolsTheme === 'studio' && (
          <motion.div key="studio-landing" {...pageFade}>
            <StudioLanding tools={tools} />
          </motion.div>
        )}
      </AnimatePresence>
      {/* MorphCard 复用：两个主题共用工具开启动画 */}
      <MorphCard
        tool={selected?.tool ?? null}
        sourceRect={selected?.rect ?? null}
        phase={phase}
        onClose={handleClose}
        onPhaseChange={handlePhaseChange}
      />
    </>
  );
}

export default function App() {
  return <AppContent />;
}
