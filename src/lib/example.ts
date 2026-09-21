/** 示例数据：多层转义嵌套 JSON + Unicode 转义 + 各种类型 */

const inner2 = JSON.stringify({ level: 95, active: true, score: 1234.56, tags: ['a', 'b'] });

const inner1 = JSON.stringify({
  user: { name: '张三', city: '杭州', roles: ['admin', 'dev'] },
  extra: inner2,
  note: '你好，世界',
});

export const EXAMPLE: string = JSON.stringify(
  {
    code: 0,
    message: '成功',
    data: inner1,
    list: [1, 2.5, true, false, null, '普通字符串'],
    unicodeDemo: '\u4f60\u597d',
    meta: { ts: 1695274800, version: '1.0.0', debug: false },
  },
  null,
  2,
);
