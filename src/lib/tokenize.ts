import type { Tok, TokType } from '../types';
import { isJsonCandidate } from './jsonx';
import { pathAppend } from './path';

type Frame = { type: 'obj'; key: string | null } | { type: 'arr'; idx: number };

function buildPath(stack: Frame[]): string {
  let p = '$';
  for (const f of stack) {
    p = f.type === 'obj' ? pathAppend(p, f.key ?? '?') : pathAppend(p, f.idx);
  }
  return p;
}

function isHighSurrogate(c: string): boolean {
  const x = c.charCodeAt(0);
  return x >= 0xd800 && x <= 0xdbff;
}

/**
 * 把 JSON 文本切成带类型的 token，按可视行组织（超长行在 wrapCols 处折行，
 * 仅影响展示不影响内容）。字符串值若像内嵌 JSON，标为 nest 并附 JSONPath。
 */
export function tokenizeLines(text: string, wrapCols = 240): Tok[][] {
  const out: Tok[][] = [];
  let cur: Tok[] = [];
  let col = 0;

  const flush = () => {
    out.push(cur);
    cur = [];
    col = 0;
  };

  const pushTok = (t: TokType, v: string, p?: string) => {
    let s = v;
    while (wrapCols > 0 && col + s.length > wrapCols) {
      let take = Math.max(1, wrapCols - col);
      // 避免把代理对（如 emoji、部分生僻字）从中间切开
      if (take < s.length && isHighSurrogate(s[take - 1]) && !isHighSurrogate(s[take])) take--;
      if (take > 0) cur.push(p ? { t, v: s.slice(0, take), p } : { t, v: s.slice(0, take) });
      flush();
      s = s.slice(take);
    }
    if (s.length) {
      cur.push(p ? { t, v: s, p } : { t, v: s });
      col += s.length;
    }
  };

  const stack: Frame[] = [];
  /** 值开始时消费父级上下文（对象消费 pending key，数组下标 +1）并返回该值的完整路径 */
  const valuePath = (): string => {
    const top = stack[stack.length - 1];
    if (!top) return '$';
    const parent = buildPath(stack.slice(0, -1));
    if (top.type === 'obj') {
      const key = top.key ?? '?';
      top.key = null;
      return pathAppend(parent, key);
    }
    top.idx++;
    return pathAppend(parent, top.idx);
  };

  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (ch === '\n') {
      flush();
      i++;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      let j = i;
      while (j < n && (text[j] === ' ' || text[j] === '\t' || text[j] === '\r')) j++;
      pushTok('punc', text.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '{' || ch === '[') {
      valuePath();
      stack.push(ch === '{' ? { type: 'obj', key: null } : { type: 'arr', idx: -1 });
      pushTok('punc', ch);
      i++;
      continue;
    }
    if (ch === '}' || ch === ']') {
      stack.pop();
      pushTok('punc', ch);
      i++;
      continue;
    }
    if (ch === ',' || ch === ':') {
      pushTok('punc', ch);
      i++;
      continue;
    }
    if (ch === '"') {
      // 找闭引号：用 indexOf 跳到下一个引号，再看前面反斜杠个数奇偶
      let j = i + 1;
      let close = -1;
      while (j < n) {
        const q = text.indexOf('"', j);
        if (q < 0) {
          j = n;
          break;
        }
        let bs = 0;
        let k = q - 1;
        while (k >= j && text[k] === '\\') {
          bs++;
          k--;
        }
        if (bs % 2 === 0) {
          close = q;
          break;
        }
        j = q + 1;
      }
      if (close < 0) {
        pushTok('str', text.slice(i)); // 未闭合（不该发生在合法 JSON 里）
        i = n;
        continue;
      }
      const raw = text.slice(i, close + 1);
      const inner = text.slice(i + 1, close);
      // 向前看一个非空白字符判断是 key 还是值
      let k = close + 1;
      while (k < n && (text[k] === ' ' || text[k] === '\t' || text[k] === '\r' || text[k] === '\n')) k++;
      if (text[k] === ':') {
        const top = stack[stack.length - 1];
        if (top && top.type === 'obj') top.key = inner;
        pushTok('key', raw);
      } else {
        const nest = isJsonCandidate(inner);
        const path = valuePath();
        pushTok(nest ? 'nest' : 'str', raw, nest ? path : undefined);
      }
      i = close + 1;
      continue;
    }
    // 数字 / true / false / null
    let j = i;
    while (j < n && !'{}[],:" \t\r\n'.includes(text[j])) j++;
    const word = text.slice(i, j);
    if (word) {
      valuePath();
      pushTok(word === 'true' || word === 'false' || word === 'null' ? 'lit' : 'num', word);
      i = j;
    } else {
      pushTok('punc', ch); // 未知字符兜底
      i++;
    }
  }
  if (cur.length || out.length === 0) flush();
  return out;
}
