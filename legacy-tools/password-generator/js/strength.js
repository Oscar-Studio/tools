/**
 * zxcvbn-ts 4.x 包装：
 * - 单例 ZxcvbnFactory（懒初始化,首次调用时构建）
 * - 中文 feedback / 时间估计覆盖
 * - 返回统一的精简对象{score, entropy, guesses, warning, suggestions, crackTimes*}
 */
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as en from '@zxcvbn-ts/language-en';
import { CN_COMMON_PASSWORDS } from './dicts/cn-passwords.js';

// 简体中文翻译（覆盖 zxcvbn 默认英文 feedback + timeEstimation）
const zh = {
  warnings: {
    straightRow: '键盘上连续排列的按键很容易被猜到。',
    keyPattern: '短键盘模式很容易被猜到。',
    simpleRepeat: '类似 "aaa" 的重复字符很容易被猜到。',
    extendedRepeat: '类似 "abcabcabc" 的重复字符模式很容易被猜到。',
    sequences: '类似 "abc" 的常见字符序列很容易被猜到。',
    recentYears: '近年份很容易被猜到。',
    dates: '日期很容易被猜到。',
    topTen: '这是使用最多的密码之一。',
    topHundred: '这是使用频繁的密码。',
    common: '这是常见密码。',
    similarToCommon: '这与常见密码相似。',
    wordByItself: '单词单独使用很容易被猜到。',
    namesByThemselves: '单独的姓名或姓氏很容易被猜到。',
    commonNames: '常见的姓名和姓氏很容易被猜到。',
    userInputs: '不应包含任何与个人或页面相关的数据。',
    pwned: '您的密码已在数据泄露事件中被公开,请勿继续使用。',
  },
  suggestions: {
    l33t: "避免可预测的字母替换（如 '@' 代替 'a'）。",
    reverseWords: '避免常见单词的反向拼写。',
    allUppercase: '可以部分大写,而不是全部大写。',
    capitalization: '将更多字母大写,而不只是第一个。',
    dates: '避免使用与你相关的日期和年份。',
    recentYears: '避免使用近年份。',
    associatedYears: '避免使用与你相关的年份。',
    sequences: '避免使用常见字符序列。',
    repeated: '避免重复的单词和字符。',
    longerKeyboardPattern: '使用更长的键盘模式,并多次改变打字方向。',
    anotherWord: '增加更多不那么常见的单词。',
    useWords: '使用多个单词,但避免常见短语。',
    noNeed: '不使用符号、数字或大写字母,也能创建强密码。',
    pwned: '如果你在别处使用此密码,应立即修改。',
  },
  timeEstimation: {
    ltSecond: '不到 1 秒',
    second: '{base} 秒',
    seconds: '{base} 秒',
    minute: '{base} 分钟',
    minutes: '{base} 分钟',
    hour: '{base} 小时',
    hours: '{base} 小时',
    day: '{base} 天',
    days: '{base} 天',
    month: '{base} 个月',
    months: '{base} 个月',
    year: '{base} 年',
    years: '{base} 年',
    centuries: '{base} 世纪',
  },
};

let _factory = null;

function ensureFactory() {
  if (_factory) return _factory;
  _factory = new ZxcvbnFactory({
    translations: zh,
    dictionary: {
      ...common.dictionary,
      ...en.dictionary,
      'cn-common-passwords': CN_COMMON_PASSWORDS,
    },
    graphs: common.adjacencyGraphs,
    useLevenshteinDistance: true,
  });
  return _factory;
}

/** 中文评分标签。 */
export const SCORE_LABELS = ['极弱', '弱', '一般', '良好', '极强'];

/**
 * 评估密码强度。
 * @param {string} password
 * @param {(string|number)[]} [userInputs] 用户相关的输入（用户名、邮箱前缀等）
 */
export function assessStrength(password, userInputs = []) {
  if (typeof password !== 'string' || !password) return null;
  const f = ensureFactory();
  const r = f.check(password, userInputs);
  const slowSec = r.crackTimes.offlineSlowHashingXPerSecond.seconds;
  const fastSec = r.crackTimes.offlineFastHashingXPerSecond.seconds;
  const onlineSec = r.crackTimes.onlineNoThrottlingXPerSecond.seconds;
  const onlineThSec = r.crackTimes.onlineThrottlingXPerHour.seconds;
  return {
    score: r.score,
    guesses: r.guesses,
    guessesLog10: r.guessesLog10,
    entropy: Math.log2(r.guesses || 1),
    warning: r.feedback.warning,
    suggestions: r.feedback.suggestions || [],
    crackTimesSeconds: {
      offlineSlow: slowSec,
      offlineFast: fastSec,
      onlineNoThrottling: onlineSec,
      onlineThrottling: onlineThSec,
    },
    crackTimesDisplay: {
      offlineSlow: humanCrackTime(slowSec),
      offlineFast: humanCrackTime(fastSec),
      onlineNoThrottling: humanCrackTime(onlineSec),
      onlineThrottling: humanCrackTime(onlineThSec),
    },
    calcTime: r.calcTime,
  };
}

/** 给 crack time 秒数生成中文人类可读字符串（备用,zxcvbn 自带 display 已用中文翻译）。 */
export function humanCrackTime(seconds) {
  if (typeof seconds !== 'number' || !isFinite(seconds)) return '—';
  if (seconds < 1) return '瞬间';
  if (seconds < 60) return `${seconds.toFixed(0)} 秒`;
  const m = seconds / 60;
  if (m < 60) return `${m.toFixed(0)} 分钟`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(0)} 小时`;
  const d = h / 24;
  if (d < 30) return `${d.toFixed(0)} 天`;
  const y = d / 365;
  if (y < 1) return `${(d / 30).toFixed(1)} 个月`;
  if (y < 1000) return `${y.toFixed(1)} 年`;
  if (y < 1e6) return `${(y / 1e3).toFixed(1)} 千年`;
  if (y < 1e9) return `${(y / 1e6).toFixed(1)} 百万年`;
  return '宇宙级';
}