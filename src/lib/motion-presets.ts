/**
 * tools · Studio 主题的动画预设
 * —— Linear.app 风：克制、均匀（hero 0.08s 间隔 / grid 0.04s 间隔）
 *
 * 共享给 games/teaching-tools 同名文件，但每个主题有自己的节奏参数。
 * 统一在内部处理 prefers-reduced-motion（REDUCE 时所有时长/stagger 归 0）。
 */
import type { Variants } from 'framer-motion';

const REDUCE_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// 全局缩减因子：reduced-motion 时所有 delay/duration/y 归 0
const D = REDUCE_MOTION ? 0 : 1;

// —— Hero：父容器控制 stagger，子节点（eyebrow/h1/lede/ul）按 heroItem 进入 ——
export const heroContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 * D, delayChildren: 0.05 * D },
  },
};

export const heroItem: Variants = {
  hidden: { opacity: 0, y: 12 * D },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.48 * D, ease: [0.22, 1, 0.36, 1] },
  },
};

// —— Card grid：父容器控制 stagger，子卡片按 cardItem 进入 ——
export const gridContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04 * D,
      delayChildren: 0.1 * D,
    },
  },
};

export const cardItem: Variants = {
  hidden: { opacity: 0, y: 16 * D },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38 * D, ease: [0.22, 1, 0.36, 1] },
  },
};

// —— 卡片 hover/press（与 CSS transition 共存：CSS 管 box-shadow/border，这里只管 transform）——
export const cardHover = REDUCE_MOTION ? {} : { y: -2 };
export const cardPress = REDUCE_MOTION ? {} : { scale: 0.985 };

// —— 主题切换 crossfade：包 AnimatePresence 时用，mode="wait" ——
export const pageFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.22 * D, ease: 'easeOut' } },
  exit:    { opacity: 0, transition: { duration: 0.18 * D, ease: 'linear' } },
};
