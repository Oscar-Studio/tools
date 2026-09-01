import { motion } from 'framer-motion';
import { heroContainer, heroItem } from '../../lib/motion-presets';

/**
 * Studio 风 hero —— 参照 Linear.app 的产品落地页：
 *   - split 布局：左列 = eyebrow + 大标题 + 副标题；右列 = 3 条带绿点的 bullet
 *   - 不用装饰，纯文字 + 状态点
 *   - 强调"本地运行 / 键盘优先 / 持续扩充"三个产品属性
 *   - 动画：4 个元素（eyebrow / h1 / lede / ul）依次 stagger 淡入（80ms 间隔）
 */
export function StudioHero() {
  return (
    <motion.section
      className="studio-hero"
      id="heroSection"
      variants={heroContainer}
      initial="hidden"
      animate="visible"
    >
      <div className="studio-hero__inner">
        <div className="studio-intro">
          <div className="studio-intro__left">
            <motion.p className="eyebrow" variants={heroItem}>
              实用工具 · STUDIO
            </motion.p>
            <motion.h1 variants={heroItem}>
              Tools, <em>sharpened.</em>
            </motion.h1>
            <motion.p className="studio-intro__lede" variants={heroItem}>
              做点小事，别浪费时间。一组即开即用的小工具，专注在每天用得上的小事上。
            </motion.p>
          </div>

          <motion.ul className="studio-intro__right" aria-label="产品属性" variants={heroItem}>
            <li className="studio-feature">
              <span className="studio-feature__dot" aria-hidden="true" />
              <span className="studio-feature__text">
                <strong>本地运行</strong>
                <small>你的输入不会离开设备。</small>
              </span>
            </li>
            <li className="studio-feature">
              <span className="studio-feature__dot" aria-hidden="true" />
              <span className="studio-feature__text">
                <strong>键盘优先</strong>
                <small>所有功能都可纯键盘完成。</small>
              </span>
            </li>
            <li className="studio-feature">
              <span className="studio-feature__dot" aria-hidden="true" />
              <span className="studio-feature__text">
                <strong>持续扩充</strong>
                <small>新工具按周上线，跨设备同步。</small>
              </span>
            </li>
          </motion.ul>
        </div>
      </div>
    </motion.section>
  );
}
