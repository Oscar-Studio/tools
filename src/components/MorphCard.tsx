import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Tool } from '../types';
import { GlassWrap } from './GlassProvider';
import { useUserLiquidGlass } from '../hooks/useUserLiquidGlass';
import type { Phase } from '../App';

interface Props {
  tool: Tool | null;
  sourceRect: DOMRect | null;
  phase: Phase;
  onClose: () => void;
  onPhaseChange: (next: Phase) => void;
}

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.8 };

export function MorphCard({ tool, sourceRect, phase, onClose, onPhaseChange }: Props) {
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const { quality, budget: glassBudget } = useUserLiquidGlass();

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tool) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tool, onClose]);

  useEffect(() => {
    if (phase !== 'opening') return;
    const t = setTimeout(() => {
      onPhaseChange('open');
    }, 500);
    return () => clearTimeout(t);
  }, [phase, onPhaseChange]);

  useEffect(() => {
    if (phase !== 'closing') return;
    const t = setTimeout(() => {
      onPhaseChange('idle');
    }, 350);
    return () => clearTimeout(t);
  }, [phase, onPhaseChange]);

  const targetW = Math.min(450, viewport.w * 0.9);
  const targetH = 340;
  const targetX = (viewport.w - targetW) / 2;
  const targetY = (viewport.h - targetH) / 2;

  const initialX = sourceRect ? sourceRect.left : targetX;
  const initialY = sourceRect ? sourceRect.top : targetY;
  const initialW = sourceRect ? sourceRect.width : targetW;
  const initialH = sourceRect ? sourceRect.height : targetH;

  const handleExpandComplete = () => {
    if (phase === 'opening') onPhaseChange('open');
  };

  const handleShrinkComplete = () => {
    if (phase === 'closing') onPhaseChange('idle');
  };

  return createPortal(
    <AnimatePresence>
      {tool && (
        <>
          <motion.div
            key="backdrop"
            className={`backdrop ${tool ? 'active' : ''}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={quality === 'low' ? { duration: 0 } : { duration: 0.5 }}
            onClick={onClose}
          />
          <motion.div
            key="morph"
            className="morph-anim"
            initial={{
              left: initialX,
              top: initialY,
              width: initialW,
              minHeight: initialH,
              opacity: 0.95,
            }}
            animate={phase === 'closing' ? {
              left: initialX,
              top: initialY,
              width: initialW,
              minHeight: initialH,
              opacity: 0.95,
            } : {
              left: targetX,
              top: targetY,
              width: targetW,
              minHeight: targetH,
              opacity: 1,
            }}
            exit={{
              left: initialX,
              top: initialY,
              width: initialW,
              minHeight: initialH,
              opacity: 0.95,
            }}
            transition={quality === 'low' ? { duration: 0 } : SPRING}
            onAnimationComplete={phase === 'opening' ? handleExpandComplete : phase === 'closing' ? handleShrinkComplete : undefined}
            style={{
              position: 'fixed',
              zIndex: 300,
              background: 'transparent',
              border: 'none',
              backdropFilter: 'none',
              padding: 0,
            }}
          >
            <GlassWrap
              borderRadius={20}
              maxDpr={glassBudget.maxDpr}
              filterResolution={glassBudget.filterResolution}
              style={{
                background: phase === 'open' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.06)',
                border: phase === 'open' ? '1px solid rgba(0, 229, 255, 0.4)' : '0.5px solid rgba(255, 255, 255, 0.18)',
                width: '100%',
                height: '100%',
                padding: phase === 'open' ? '40px' : '15px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: phase === 'open' ? 'center' : 'flex-start',
                justifyContent: phase === 'open' ? 'center' : 'center',
                textAlign: phase === 'open' ? 'center' : 'left',
                position: 'relative',
                overflow: 'hidden',
                gap: phase === 'open' ? 0 : 8,
                boxShadow: phase === 'open' ? '0 20px 60px rgba(0, 229, 255, 0.15)' : '0 25px 50px rgba(0, 0, 0, 0.4)',
              }}
            >
              {phase === 'open' ? (
                <>
                  <div style={{ fontSize: '4.5rem', marginBottom: 20 }}>{tool.icon || '📄'}</div>
                  <h2 style={{ fontSize: '1.8rem', marginBottom: 15 }}>{tool.name}</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: 25 }}>
                    {tool.description}
                  </p>
                  {tool.tags && tool.tags.length > 0 && (
                    <div className="morph-tags" style={{ marginBottom: 20, justifyContent: 'center', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {tool.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="morph-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                  <a
                    href={tool.demoFile}
                    className="btn-explore"
                    style={{
                      display: 'inline-block',
                      padding: '12px 40px',
                      background: 'linear-gradient(135deg, var(--primary-color), var(--accent-color))',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: 25,
                      fontSize: '1rem',
                      fontWeight: 600,
                    }}
                  >
                    进入演示
                  </a>
                  <button
                    className="close-btn"
                    type="button"
                    onClick={onClose}
                    style={{
                      position: 'absolute',
                      top: 15,
                      right: 15,
                      width: 32,
                      height: 32,
                      border: 'none',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'var(--text-muted)',
                      fontSize: '1.3rem',
                      borderRadius: '50%',
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                </>
              ) : (
                <>
                  <div className="morph-header" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                    <span className="morph-icon" style={{ fontSize: '1.8rem' }}>{tool.icon || '📄'}</span>
                    <span className="morph-name" style={{ flex: 1, fontSize: '1rem', fontWeight: 500 }}>{tool.name}</span>
                  </div>
                  {tool.tags && tool.tags.length > 0 && (
                    <div className="morph-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%' }}>
                      {tool.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="morph-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </GlassWrap>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}