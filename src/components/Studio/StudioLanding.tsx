import { BackgroundCover } from '../BackgroundCover';
import type { Tool } from '../../types';
import { StudioHero } from './StudioHero';
import { StudioCardGrid } from './StudioCardGrid';

interface Props {
  tools: Tool[];
}

/**
 * Studio 主题的整体落地页包装：
 *   - hero + 卡片网格（直接跳转，无 MorphCard 动画）
 */
export function StudioLanding({ tools }: Props) {
  return (
    <div className="studio-landing">
      <BackgroundCover variant="tools" label="03 / STUDIO — 手边有工具，眼前有风景。"><StudioHero /></BackgroundCover>
      <StudioCardGrid tools={tools} />
    </div>
  );
}
