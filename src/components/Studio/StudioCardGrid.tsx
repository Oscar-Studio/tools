import { useState } from 'react';
import { motion, useAnimate } from 'framer-motion';
import type { Tool } from '../../types';
import {
  gridContainer,
  cardItem,
  cardHover,
  cardPress,
} from '../../lib/motion-presets';

/**
 * Studio 风卡片网格 —— 参照 Linear.app 的 issue 卡片：
 *   - 12px 圆角 + 1px hairline
 *   - 左上 tag 药丸 + 右上小图标
 *   - hover 时 accent 接管边框 + -2px 上移（transform 交给 framer-motion，box-shadow/border 留给 CSS）
 *   - 点击：只有被点中的那张做 L 形延展——这是个**设计过的动作**而不是过场动画：
 *     用 `useAnimate` imperative API 同步驱动两张并行时间线：
 *       - 卡片本体：scaleY 1 → 5.4（470ms），再 scaleX 1 → 6.4（470ms）
 *       - 文字 wrapper：scaleY 1 → 1/5.4，再 scaleX 1 → 1/6.4
 *     两个 transform 嵌套相乘，文字视觉上保持 1:1 不被拉伸
 *     1.5x 快放（原 0.7s×2 → 0.47s×2 ≈ 0.94s 总时长）
 *     940ms 后触发导航 + B1 view-transition 收尾
 *   - 动画：进入视口时 stagger fade-up（40ms 间隔），只触发一次
 */

// 缓动：cubic-bezier(0.22, 1, 0.36, 1) → 头快尾稳，适合 scale-up
const EASE_SNAP = [0.22, 1, 0.36, 1] as const;
// 延展目标倍数
const SCALE_Y_END = 5.4;
const SCALE_X_END = 6.4;
// 每阶段时长（原 0.7s → 1.5x 快放 = 0.7 / 1.5 ≈ 0.47s）
const PHASE_DURATION = 0.47;

export function StudioCardGrid({ tools }: { tools: Tool[] }) {
  // 当前正在延展的卡片 id（只有这一张会动）
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  return (
    <section className="studio-grid" id="studioGrid">
      <div className="studio-grid__inner">
        <header className="studio-grid__header">
          <p className="eyebrow">所有工具</p>
          <h2 className="studio-grid__title">挑一个开始</h2>
        </header>

        <motion.div
          className="studio-grid__list"
          variants={gridContainer}
          initial="hidden"
          animate="visible"
        >
          {tools.map((tool) => (
            <StudioCard
              key={tool.id}
              tool={tool}
              isLaunching={launchingId === tool.id}
              onLaunch={(id) => {
                if (launchingId) return;
                setLaunchingId(id);
              }}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/**
 * 单张卡片：抽出来用 `useAnimate` 拿到 scope/animate 对，
 * 让卡片本体和文字 wrapper 共享一个动画时序器（保持严格同步）。
 */
function StudioCard({
  tool,
  isLaunching,
  onLaunch,
}: {
  tool: Tool;
  isLaunching: boolean;
  onLaunch: (id: string) => void;
}) {
  // scope 绑到 motion.a；文字 wrapper 单独用 ref
  const [cardScope, animateCard] = useAnimate<HTMLAnchorElement>();
  const [bodyScope, animateBody] = useAnimate<HTMLDivElement>();

  const handleCardClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onLaunch(tool.id);

    try {
      // Phase 1：垂直延展成瘦高竖条（1050ms）
      // 卡片 scaleY 1→5.4 同时，文字 wrapper scaleY 1→1/5.4 抵消
      await Promise.all([
        animateCard(
          cardScope.current,
          {
            scaleY: SCALE_Y_END,
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.18)',
          },
          { duration: PHASE_DURATION, ease: EASE_SNAP }
        ),
        animateBody(
          bodyScope.current,
          { scaleY: 1 / SCALE_Y_END },
          { duration: PHASE_DURATION, ease: EASE_SNAP }
        ),
      ]);

      // Phase 2：从竖条横向铺开到接近全屏（1050ms）
      // scaleX 1→6.4 同时，文字 wrapper scaleX 1→1/6.4 抵消
      await Promise.all([
        animateCard(
          cardScope.current,
          { scaleX: SCALE_X_END },
          { duration: PHASE_DURATION, ease: EASE_SNAP }
        ),
        animateBody(
          bodyScope.current,
          { scaleX: 1 / SCALE_X_END },
          { duration: PHASE_DURATION, ease: EASE_SNAP }
        ),
      ]);
    } catch {
      // 动画被中断（用户再次点击 / 组件卸载 / 浏览器优化）→ 仍走导航
    }

    // L 形延展完成后触发文档导航，B1 view-transition 自动接管 morph
    window.location.href = tool.demoFile;
  };

  return (
    <motion.a
      ref={cardScope}
      href={tool.demoFile}
      data-cursor="hover"
      className="studio-card"
      variants={cardItem}
      whileHover={isLaunching ? undefined : cardHover}
      whileTap={isLaunching ? undefined : cardPress}
      onClick={handleCardClick}
      // B1 view-transition：浏览器在 ~940ms 后 document navigation 时接管 morph
      // 940ms 内的 L 形延展由 useAnimate 驱动（避开 framer-motion
      // keyframes + times 数组的多属性 timing 解析 bug）
      style={{
        viewTransitionName: `vt-tool-${tool.id}`,
        // 延展时瞬时提到最上层（useAnimate 不能动 zIndex）
        zIndex: isLaunching ? 9999 : 'auto',
      }}
    >
      {/* 文字 wrapper：absolute inset:0 脱离父级 transform 的影响？
        *  —— 不对，CSS transform 嵌套相乘，文字 wrapper 在父级 local space 里
        * 仍然受父级 transform 影响。useAnimate 反向缩放 (1/5.4, 1/6.4) 后
        * 最终视觉 = (1, 1)，文字保持正常大小。 */}
      <motion.div
        ref={bodyScope}
        className="studio-card__body"
      >
        <div className="studio-card__head">
          {tool.tags?.[0] && (
            <span className="studio-card__tag">{tool.tags[0]}</span>
          )}
          {tool.icon && <span className="studio-card__icon">{tool.icon}</span>}
        </div>
        <h3 className="studio-card__name">{tool.name}</h3>
        {tool.description && (
          <p className="studio-card__desc">{tool.description}</p>
        )}
        <span className="studio-card__meta">
          <span className="studio-card__status" aria-hidden="true" />
          <span className="studio-card__status-text">就绪</span>
        </span>
      </motion.div>
    </motion.a>
  );
}
