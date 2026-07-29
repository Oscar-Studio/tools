import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Glass } from '@samasante/liquid-glass';
import type { Tool } from '../types';
import { useUserLiquidGlass } from '../hooks/useUserLiquidGlass';
import type { Phase } from '../App';

const GLASS_ROOT_MARGIN = '100px';

function useInView(
  ref: React.RefObject<Element | null>,
  rootMargin: string = GLASS_ROOT_MARGIN,
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setInView(entry.isIntersecting);
      },
      { rootMargin, threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return inView;
}

const FALLBACK_CARD_STYLE: React.CSSProperties = {
  width: '100%',
  minHeight: 140,
  padding: '24px 28px',
  borderRadius: 16,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: 12,
  cursor: 'pointer',
  background: 'rgba(255, 255, 255, 0.04)',
  backdropFilter: 'blur(8px) saturate(150%)',
  WebkitBackdropFilter: 'blur(8px) saturate(150%)',
  border: '0.5px solid rgba(255, 255, 255, 0.18)',
};

interface Props {
  tools: Tool[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  phase: Phase;
  rects: Record<string, DOMRect>;
  onSelect: (tool: Tool, rect: DOMRect) => void;
}

const SUBJECT_NAMES: Record<string, string> = {
  '数学': '数学',
  '物理': '物理',
  '化学': '化学',
  '生物': '生物',
  '语文': '语文',
  '英语': '英语',
  '地理': '地理',
  '历史': '历史',
  '道法': '道法',
  '通用': '通用工具',
};

const CARD_STYLE: React.CSSProperties = {
  width: '100%',
  minHeight: 140,
  padding: '24px 28px',
  borderRadius: 16,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: 12,
  cursor: 'pointer',
  background: 'rgba(255, 255, 255, 0.06)',
  border: '0.5px solid rgba(255, 255, 255, 0.18)',
};

const HIDE_MAX_DELAY = 0.12;
const RETURN_MAX_DELAY = 0.4;

interface ToolCardProps {
  tool: Tool;
  index: number;
  selectedId: string | null;
  phase: Phase;
  cardRect: DOMRect | undefined;
  onSelect: (tool: Tool, rect: DOMRect) => void;
  registerRef: (id: string, el: HTMLElement | null) => void;
}

function ToolCard({
  tool,
  index,
  selectedId,
  phase,
  cardRect,
  onSelect,
  registerRef,
}: ToolCardProps) {
  const isSelected = tool.id === selectedId;
  const isOther = !!selectedId && !isSelected;
  const elRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(elRef);
  const { quality, budget: glassBudget, optics } = useUserLiquidGlass();
  // 'low' 档完全不用 WebGL（无论是否在视窗），走 CSS 兜底
  const useGlass = quality !== 'low' && inView;

  const hideDelay = useMemo(() => {
    if (!cardRect) return 0;
    const vh = window.innerHeight || 800;
    return Math.max(0, ((vh - cardRect.top) / vh) * HIDE_MAX_DELAY);
  }, [cardRect]);

  const returnDelay = useMemo(() => {
    if (!cardRect) return 0;
    const vh = window.innerHeight || 800;
    return Math.max(0, (cardRect.top / vh) * RETURN_MAX_DELAY);
  }, [cardRect]);

  const [closingStage, setClosingStage] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (phase === 'closing' && isOther && quality !== 'low') {
      setClosingStage(1);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setClosingStage(2));
      });
      return () => cancelAnimationFrame(raf);
    }
    if (phase === 'idle') {
      setClosingStage(0);
    }
  }, [phase, isOther, quality]);

  const propAnimate = useMemo(() => {
    if (phase === 'opening' || phase === 'open') {
      if (isSelected) return { opacity: 0, y: 0 };
      if (isOther) return { opacity: 0, y: '120vh' };
    }
    if (phase === 'closing') {
      if (isSelected) return { opacity: 0, y: 0 };
      if (isOther) {
        if (closingStage === 1) return { opacity: 0, y: '-100vh' };
        return { opacity: 1, y: 0 };
      }
    }
    return { opacity: 1, y: 0 };
  }, [phase, isSelected, isOther, closingStage]);

  const propTransition = useMemo(() => {
    if (phase === 'closing') {
      if (isOther) {
        if (closingStage === 1) return { duration: 0 };
        return {
          type: 'spring' as const,
          stiffness: 280,
          damping: 18,
          mass: 0.9,
          delay: returnDelay,
        };
      }
      return { duration: 0 };
    }
    if (phase === 'opening' || phase === 'open') {
      if (isSelected) return { delay: hideDelay, duration: 0.15 };
      if (quality === 'low' && isOther) return { duration: 0 };
      return { delay: hideDelay, duration: 0.9, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] };
    }
    if (isSelected) return { duration: 0.25, ease: [0.4, 0, 0.2, 1] };
    return { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.8, delay: index * 0.03 };
  }, [phase, hideDelay, returnDelay, index, isSelected, isOther, quality, closingStage]);

  const cardContent = (
    <>
      <div className="card-header">
        <span className="card-icon">{tool.icon || '📄'}</span>
        <span className="card-name">{tool.name}</span>
      </div>
      {tool.tags && tool.tags.length > 0 && (
        <div className="card-tags">
          {tool.tags.slice(0, 3).map(tag => (
            <span key={tag} className="card-tag">{tag}</span>
          ))}
        </div>
      )}
    </>
  );

  return (
    <motion.div
      ref={(node) => {
        elRef.current = node;
        registerRef(tool.id, node);
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={propAnimate}
      transition={propTransition}
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onSelect(tool, rect);
      }}
      whileHover={isOther ? undefined : { y: -4, scale: 1.02 }}
    >
      {useGlass ? (
        <Glass
          className="glass-element card-glass"
          style={CARD_STYLE}
          optics={optics}
          maxDpr={glassBudget.maxDpr}
          filterResolution={glassBudget.filterResolution}
        >
          {cardContent}
        </Glass>
      ) : (
        <div
          className="glass-element card-glass"
          style={FALLBACK_CARD_STYLE}
        >
          {cardContent}
        </div>
      )}
    </motion.div>
  );
}

export function CardGrid({ tools, loading, error, selectedId, phase, rects, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const { quality } = useUserLiquidGlass();

  const registerRef = (id: string, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  };

  const handleSelect = (tool: Tool, rect: DOMRect) => {
    if (quality === 'low') {
      onSelect(tool, rect);
      return;
    }
    const allRects: Record<string, DOMRect> = {};
    cardRefs.current.forEach((el, id) => {
      allRects[id] = el.getBoundingClientRect();
    });
    onSelect(tool, rect);
  };

  if (loading) {
    return <main className="card-container"><p className="no-results">加载中…</p></main>;
  }
  if (error) {
    return <main className="card-container"><p className="no-results">{error}</p></main>;
  }
  if (tools.length === 0) {
    return <main className="card-container"><p className="no-results">没有找到匹配的工具</p></main>;
  }

  const grouped: Record<string, Tool[]> = {};
  tools.forEach(tool => {
    const subject = (tool.subject && tool.subject[0]) || '通用';
    if (!grouped[subject]) grouped[subject] = [];
    grouped[subject].push(tool);
  });

  const subjects = Object.keys(grouped).sort(
    (a, b) => grouped[b].length - grouped[a].length,
  );

  let globalIdx = 0;

  return (
    <main className="card-container" id="cardContainer" ref={containerRef}>
      {subjects.map(subject => (
        <section key={subject} className="category-section">
          <h2 className="category-title">{SUBJECT_NAMES[subject] || subject}</h2>
          <div className="category-grid">
            {grouped[subject].map((tool) => {
              const idx = globalIdx++;
              return (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  index={idx}
                  selectedId={selectedId}
                  phase={phase}
                  cardRect={rects[tool.id]}
                  onSelect={handleSelect}
                  registerRef={registerRef}
                />
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}