import { useRef, useState, useCallback } from 'react';
import { TopBar } from './components/TopBar';
import { Hero } from './components/Hero';
import { CardGrid } from './components/CardGrid';
import { MorphCard } from './components/MorphCard';
import { useToolsConfig } from './hooks/useToolsConfig';
import { useOpilot } from './hooks/useOpilot';
import { useGlassBackground } from './components/GlassProvider';
import { UserLiquidGlassProvider } from './hooks/useUserLiquidGlass';
import type { Tool } from './types';

export type Phase = 'idle' | 'opening' | 'open' | 'closing';

function AppContent() {
  useGlassBackground();
  const { tools, loading, error } = useToolsConfig();
  const [selected, setSelected] = useState<{ tool: Tool; rect: DOMRect } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const lockRef = useRef(false);
  const rectsRef = useRef<Record<string, DOMRect>>({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useOpilot(searchInputRef.current, tools, 'tools');

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
      <TopBar />
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
  return (
    <UserLiquidGlassProvider>
      <AppContent />
    </UserLiquidGlassProvider>
  );
}