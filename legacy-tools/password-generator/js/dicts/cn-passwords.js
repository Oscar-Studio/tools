/**
 * 中文常见弱密码 / 拼音 / 数字模式字典，用于 zxcvbn 增强检测。
 * 来源：公开的弱密码列表 + 常见拼音 / 生日 / 手机号模式（精选）。
 */
/** @type {readonly string[]} */
export const CN_COMMON_PASSWORDS = Object.freeze([
  // 数字模式
  '123456', '12345678', '123456789', '1234567890', '000000', '111111', '666666', '888888',
  '11111111', '00000000', '654321', 'abcdef', 'abc123', 'qwerty', 'asdfgh', 'zxcvbn',
  'password', 'iloveyou', 'admin', 'root', 'welcome', 'monkey', 'dragon', 'master',
  'login', 'princess', 'sunshine', 'trustno1', 'football', 'shadow', 'superman', 'qazwsx',
  'p@ssw0rd', 'P@ssw0rd', 'P@ss1234', 'Aa123456', 'qq123456',
  // 拼音弱密码
  'woaini', 'woaini1314', 'wodema', 'shabi', 'caonima', 'nima', 'nimabi', 'laoda',
  'xiao ming', 'wang wei', 'li na', 'zhang wei', 'liu yang', 'chen yu', 'wang fang',
  'beijing', 'shanghai', 'guangzhou', 'shenzhen', 'hangzhou', 'chengdu', 'nanjing',
  'china', 'chinese', 'zhongguo', 'zhanghao', 'mima', 'wenzhang', 'jiaju', 'jiating',
  // 生日 / 年份
  '19900101', '19910101', '19850101', '19901212', '19910101', '20000101', '19950808',
  '520520', '5211314', '1314520', '1314521', '7758258', '7758521', 'woaini520',
  '1314520520', 'aini1314', 'iloveyou520', 'loveyou', 'love1314',
  // 中文双字 / 短语
  '密码', '口令', '管理员', '测试', '默认', '用户', '账号', '游戏', '登录',
  '系统', '管理', '安全', '你好', '谢谢', '对不起', '我爱你', '中国', '中国梦',
  // 常见英文单词
  'love', 'baby', 'test', 'hello', 'world', 'sunshine', 'letmein', 'access',
  'fuckyou', 'asshole', 'football', 'baseball', 'jordan', 'michael', 'jennifer',
  'killer', 'soccer', 'hockey', 'batman', 'spider', 'tigger', 'andrew', 'joshua',
]);