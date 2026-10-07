import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * SEO 静态注入 + sitemap/robots 生成
 *
 * 为什么挂在 Vite 插件上而不是 npm postbuild 钩子：
 * deploy 经 sync-site.sh 走 `npm run build`，挂插件无论从哪条路径触发构建都会执行，
 * 且天然幂等。只在 build 生效（apply: 'build'），dev server 行为完全不变。
 */

const SITE = {
  domain: 'tools.oscarstudio.cn',
  h1: '实用工具',
  siteName: 'Oscar Studio 实用工具',
  title: '实用工具 - Oscar Studio',
  description:
    'Oscar Studio 实用工具集：字数统计、二维码生成、编解码器、密码生成器、正则表达式工作台、Markdown 编辑器、图片压缩、颜文字搜索等 10 个免安装在线小工具，全部在浏览器本地运行，数据不上传。',
  intro:
    '收录各类日常用得上的 H5 小工具。即开即用、无需安装、跨设备同步，持续扩充中。',
};

interface Tool {
  id: string;
  name: string;
  description: string;
  demoFile: string;
  featured?: boolean;
}

function loadTools(root: string): Tool[] {
  const raw = fs.readFileSync(path.join(root, 'tools-config.json'), 'utf8');
  const cfg = JSON.parse(raw) as { tools: Tool[] };
  return cfg.tools || [];
}

/** 排序必须与 src/hooks/useToolsConfig.ts 一致，减少静态版与 React 版的差异 */
function sortTools(tools: Tool[]): Tool[] {
  return [...tools].sort((a, b) => {
    if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * 只有真实目录才是可爬 URL。
 * 白板用的是 /#/whiteboard 这种 hash 路由，没有独立 URL，不能进 sitemap 和静态列表。
 */
function toolUrl(tool: Tool): string | null {
  if (!tool.demoFile || tool.demoFile.startsWith('/')) return null;
  return '/' + path.dirname(tool.demoFile) + '/';
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildStaticHtml(tools: Tool[]): string {
  const items = tools
    .map((t) => {
      const url = toolUrl(t);
      if (!url) return '';
      return (
        `    <li><a href="${escapeHtml(url)}">${escapeHtml(t.name)}</a>` +
        `<span class="seo-desc">${escapeHtml(t.description)}</span></li>`
      );
    })
    .filter(Boolean)
    .join('\n');

  return `<style>
  .seo-static{max-width:960px;margin:0 auto;padding:48px 24px;line-height:1.7}
  .seo-static h1{font-size:28px;margin:0 0 8px}
  .seo-static .seo-intro{margin:0 0 24px;opacity:.72}
  .seo-static ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
  .seo-static li{border:1px solid rgba(127,127,127,.35);border-radius:10px;padding:12px 14px}
  .seo-static a{font-weight:600;text-decoration:none}
  .seo-static .seo-desc{display:block;font-size:14px;opacity:.7}
</style>
<div class="seo-static">
  <h1>${escapeHtml(SITE.h1)}</h1>
  <p class="seo-intro">${escapeHtml(SITE.intro)}</p>
  <ul>
${items}
  </ul>
</div>`;
}

function buildSitemap(tools: Tool[], lastmod: string): string {
  const urls = [
    `<url><loc>https://${SITE.domain}/</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    ...tools
      .map((t) => toolUrl(t))
      .filter((u): u is string => !!u)
      .map((u) => {
        const loc = `https://${SITE.domain}${encodeURI(u)}`;
        return `<url><loc>${escapeHtml(loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`;
      }),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ${urls.join('\n  ')}\n</urlset>\n`;
}

function buildRobots(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: https://${SITE.domain}/sitemap.xml\n`;
}

export function seoInject(): Plugin {
  let outDir = '';
  let root = '';

  return {
    name: 'oscar-seo-inject',
    apply: 'build',

    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },

    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const tools = sortTools(loadTools(root));
        const injected = buildStaticHtml(tools);
        const replaced = html.replace(
          /<div(\s+)id=["']root["'](\s*)>\s*<\/div>/i,
          (_m, a, b) => `<div${a}id="root"${b}>${injected}</div>`
        );
        if (replaced === html) {
          this.warn('未找到空的 <div id="root"></div>，静态内容未注入');
        }
        return replaced;
      },
    },

    closeBundle() {
      const tools = sortTools(loadTools(root));
      const lastmod = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(path.join(outDir, 'sitemap.xml'), buildSitemap(tools, lastmod), 'utf8');
      fs.writeFileSync(path.join(outDir, 'robots.txt'), buildRobots(), 'utf8');
    },
  };
}

export { SITE };
