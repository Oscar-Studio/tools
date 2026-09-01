import { useTheme, type ThemeMode, type ResolvedTheme } from '../hooks/useTheme';

// 单按钮循环顺序：浅色 → 深色 → 跟随系统 → 浅色 → ...
const CYCLE: ThemeMode[] = ['light', 'dark', 'system'];

const ICON: Record<ThemeMode, string> = {
  light: '☀',
  dark: '☾',
  system: '◐',
};

const TITLE: Record<ThemeMode, (resolved: ResolvedTheme) => string> = {
  light: () => '主题: 浅色（点击切换）',
  dark: () => '主题: 深色（点击切换）',
  system: (r) => `主题: 跟随系统（${r === 'light' ? '浅色' : '深色'}，点击切换）`,
};

export function ThemeToggle() {
  const [mode, resolved, setMode] = useTheme();

  const cycle = () => {
    const idx = CYCLE.indexOf(mode);
    setMode(CYCLE[(idx + 1) % CYCLE.length]);
  };

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label="切换主题"
      title={TITLE[mode](resolved)}
      onClick={cycle}
    >
      {ICON[mode]}
    </button>
  );
}
