import { motion } from 'framer-motion';
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
 *   - 点击：直接跳转到 demoFile，无延展开场动画
 *   - 动画：进入视口时 stagger fade-up（40ms 间隔），只触发一次
 */

export function StudioCardGrid({ tools }: { tools: Tool[] }) {
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
            <StudioCard key={tool.id} tool={tool} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/**
 * 单张卡片：纯链接 + framer-motion 的 hover/tap 反馈，
 * 点击即同步跳转，没有任何 L 形延展。
 */
function StudioCard({ tool }: { tool: Tool }) {
  return (
    <motion.a
      href={tool.demoFile}
      data-cursor="hover"
      className="studio-card"
      variants={cardItem}
      whileHover={cardHover}
      whileTap={cardPress}
    >
      <div className="studio-card__body">
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
      </div>
    </motion.a>
  );
}
