import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { DEMO_COVER, useHeroBackground } from '../hooks/useHeroBackground';
import './BackgroundCover.css';

type Props = { children: ReactNode; variant: 'games' | 'edu' | 'tools' | 'ppt'; label: string };
const ImageIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></svg>;

export function BackgroundCover({ children, variant, label }: Props) {
  const { cover, update, error, setError } = useHeroBackground();
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setFailed(false), [cover.image]);
  const active = !!cover.image && !failed;
  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setError('请选择不超过 3 MB 的 JPG、PNG 或 WebP 图片。');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError('图片读取失败，请重新选择。');
    reader.onload = () => {
      const image = new Image();
      image.onload = () => update({ ...cover, image: String(reader.result) });
      image.onerror = () => setError('无法打开这张图片，请换一张试试。');
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }
  return <div className={`os-cover os-cover-${variant}${active ? ' os-cover-active' : ''}`}>
    {active && <div className="os-cover-photo" aria-hidden="true">
      <img src={cover.image} alt="" style={{ filter: `blur(${cover.blur}px)` }} onError={() => { setFailed(true); setError('图片加载失败，已恢复默认画布。'); }} />
      <div className="os-cover-shade" style={{ opacity: cover.overlay / 100 }} />
      <div className="os-cover-photo-caption"><span>{variant === 'edu' ? 'FIELD NOTES / 观察与发现' : variant === 'tools' ? 'A LITTLE ROOM TO THINK.' : variant === 'ppt' ? 'A NEW PERSPECTIVE.' : 'TAKE A BREATH. PRESS PLAY.'}</span><span>↗</span></div>
    </div>}
    <div className="os-cover-content">{children}</div>
    <div className="os-cover-toolbar"><span>{label}</span><button className="os-cover-trigger" onClick={() => dialog.current?.showModal()}><ImageIcon /> {active ? '更换风景' : '首页背景'}</button></div>
    <dialog className="os-cover-dialog" ref={dialog} aria-labelledby={`cover-title-${variant}`} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="os-cover-panel">
        <header><div><p className="os-cover-kicker">A SPACE OF YOUR OWN</p><h2 id={`cover-title-${variant}`}>留一点，自己的风景。</h2></div><button className="os-cover-close" aria-label="关闭背景设置" onClick={() => dialog.current?.close()}>×</button></header>
        <p className="os-cover-description">喜欢的照片，成为每次打开的第一眼。内容与工具，依然清晰有序。</p>
        <div className="os-cover-options" role="group" aria-label="背景样式">
          <button aria-pressed={!cover.image} onClick={() => update({ image: '', overlay: 20, blur: 0 })}><span className="os-cover-swatch os-cover-paper">✳</span>默认画布</button>
          <button aria-pressed={cover.image === DEMO_COVER} onClick={() => update({ image: DEMO_COVER, overlay: 20, blur: 0 })}><span className="os-cover-swatch os-cover-sample" />山间日出</button>
          <button aria-pressed={!!cover.image && cover.image !== DEMO_COVER} onClick={() => input.current?.click()}><span className="os-cover-swatch os-cover-upload"><ImageIcon /></span>我的照片</button>
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={selectImage} />
        <p className="os-cover-hint">JPG / PNG / WebP · 最大 3 MB · 仅在本机保存</p>
        <label className="os-cover-slider">遮罩深度 <output>{cover.overlay}%</output><input type="range" min="0" max="70" value={cover.overlay} disabled={!cover.image} onChange={event => update({ ...cover, overlay: Number(event.target.value) })} /></label>
        <label className="os-cover-slider">背景模糊 <output>{cover.blur}px</output><input type="range" min="0" max="16" value={cover.blur} disabled={!cover.image} onChange={event => update({ ...cover, blur: Number(event.target.value) })} /></label>
        {error && <p className="os-cover-error" role="alert">{error}</p>}
        <footer><span>当前浏览器保存 · 随时恢复默认</span><button onClick={() => dialog.current?.close()}>看看效果 ↗</button></footer>
      </div>
    </dialog>
  </div>;
}
