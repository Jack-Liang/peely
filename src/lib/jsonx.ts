/** JSON 序列化 / 转义 / 错误定位的纯函数，主线程与 Worker 共用 */

export function lineColFromPos(text: string, pos: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  const end = Math.min(pos, text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  }
  return { line, column: pos - last };
}

/**
 * 手写 JSON 语法扫描，返回第一处语法错误的偏移量（找不到问题返回 -1）。
 * 新版 V8 的 JSON.parse 错误信息不再携带 position，用它补齐定位。
 */
export function scanJsonError(text: string): number {
  const n = text.length;
  let i = 0;
  const ws = () => {
    while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;
  };

  const str = (): number => {
    i++;
    while (i < n) {
      const c = text[i];
      if (c === '"') {
        i++;
        return i;
      }
      if (c === '\\') {
        const e = i + 1 < n ? text[i + 1] : '';
        if ('"\\/bfnrt'.indexOf(e) >= 0) i += 2;
        else if (e === 'u' && i + 5 < n && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) i += 6;
        else return -1; // 无效或未完成的转义
      } else if (c < ' ') {
        return -1; // 字符串里不允许裸控制字符
      } else i++;
    }
    return -1; // 未闭合
  };

  const primitive = (): number => {
    const rest = text.slice(i, i + 5);
    if (rest.startsWith('true')) {
      i += 4;
      return i;
    }
    if (rest.startsWith('false')) {
      i += 5;
      return i;
    }
    if (rest.startsWith('null')) {
      i += 4;
      return i;
    }
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i, i + 64));
    if (!m || m[0] === '') return -1;
    i += m[0].length;
    return i;
  };

  const value = (): number => {
    ws();
    if (i >= n) return -1;
    const c = text[i];
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === '"') return str();
    return primitive();
  };

  const object = (): number => {
    i++;
    ws();
    if (text[i] === '}') {
      i++;
      return i;
    }
    for (;;) {
      ws();
      if (text[i] !== '"') return -1;
      if (str() < 0) return -1;
      ws();
      if (text[i] !== ':') return -1;
      i++;
      if (value() < 0) return -1;
      ws();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '}') {
        i++;
        return i;
      }
      return -1;
    }
  };

  const array = (): number => {
    i++;
    ws();
    if (text[i] === ']') {
      i++;
      return i;
    }
    for (;;) {
      if (value() < 0) return -1;
      ws();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        return i;
      }
      return -1;
    }
  };

  if (value() < 0) return Math.min(i, n - 1);
  ws();
  if (i < n) return i; // 顶层值结束后还有多余内容
  return -1;
}

/** 从 JSON.parse 抛出的错误里提取位置信息（行:列，1 起；未知为 -1） */
export function extractError(e: unknown, text: string): {
  message: string;
  line: number;
  column: number;
  position: number;
} {
  const message = e instanceof Error ? e.message : String(e);
  const posMatch = message.match(/position\s+(\d+)/i);
  if (posMatch) {
    const pos = parseInt(posMatch[1], 10);
    const { line, column } = lineColFromPos(text, pos);
    return { message, line, column, position: pos };
  }
  const lcMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lcMatch) {
    return {
      message,
      line: parseInt(lcMatch[1], 10),
      column: parseInt(lcMatch[2], 10),
      position: -1,
    };
  }
  // 引擎没给位置（新版 V8）：用自研扫描器定位
  const off = scanJsonError(text);
  if (off >= 0) {
    const { line, column } = lineColFromPos(text, off);
    return { message, line, column, position: off };
  }
  return { message, line: -1, column: -1, position: -1 };
}

/** 把字符串里的非 ASCII 字符转成 \uXXXX 形式。只对 JSON 文本整体使用：
 * JSON 的结构字符全是 ASCII，文本中任何非 ASCII 字符必然位于字符串字面量内。 */
export function escapeNonAscii(s: string): string {
  let out = '';
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x7f && c <= 0xffff) {
      out += s.slice(from, i) + '\\u' + c.toString(16).padStart(4, '0');
      from = i + 1;
    }
  }
  return from === 0 ? s : out + s.slice(from);
}

export function stringifyOpts(value: unknown, opts: { minify: boolean; unicode: boolean }): string {
  let text: string;
  try {
    text = JSON.stringify(value, null, opts.minify ? 0 : 2) ?? 'null';
  } catch {
    text = String(value);
  }
  return opts.unicode ? text : escapeNonAscii(text);
}

/** 判断一个字符串值是否「看起来像 JSON」（cheap 预过滤，真正解析在点击时做） */
export function isJsonCandidate(s: string): boolean {
  if (s.length < 2) return false;
  const t = s.trim();
  return (
    (t.charCodeAt(0) === 123 && t.charCodeAt(t.length - 1) === 125) || // {...}
    (t.charCodeAt(0) === 91 && t.charCodeAt(t.length - 1) === 93) // [...]
  );
}

/** 复制某个值：keepEscape 时输出带引号和转义符的字符串形式（可直接嵌回别处） */
export function copyValueText(v: unknown, keepEscape: boolean, unicode: boolean): string {
  let base: string;
  if (typeof v === 'string') base = v;
  else {
    try {
      base = JSON.stringify(v) ?? 'null';
    } catch {
      base = String(v);
    }
  }
  if (!unicode) base = escapeNonAscii(base);
  return keepEscape ? JSON.stringify(base) : base;
}

export function tryParseLayer(raw: string): { ok: true; value: unknown } | { ok: false; msg: string } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) };
  }
}

/** 统计节点数与最大深度（迭代遍历，防深嵌套爆栈） */
export function computeStats(value: unknown): { nodes: number; maxDepth: number; topType: string } {
  let nodes = 0;
  let maxDepth = 0;
  const stack: Array<{ v: unknown; d: number }> = [{ v: value, d: 1 }];
  while (stack.length) {
    const { v, d } = stack.pop()!;
    nodes++;
    if (d > maxDepth) maxDepth = d;
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) stack.push({ v: v[i], d: d + 1 });
      } else {
        for (const k in v) stack.push({ v: (v as Record<string, unknown>)[k], d: d + 1 });
      }
    }
  }
  return {
    nodes,
    maxDepth,
    topType: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
  };
}

/** 深拷贝并递归排序对象 key（数组顺序保持不变） */
export function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v === null || typeof v !== 'object') return v;
  const obj = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    out[k] = sortValue(obj[k]);
  }
  return out;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
