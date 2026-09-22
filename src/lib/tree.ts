import type { NestedState } from '../types';
import { escapeNonAscii, isJsonCandidate, tryParseLayer } from './jsonx';
import { pathAppend, parsePath } from './path';

export interface TreeRow {
  path: string;
  label: string;
  depth: number;
  kind: 'obj' | 'arr' | 'str' | 'num' | 'bool' | 'null';
  isContainer: boolean;
  expanded: boolean;
  childCount: number;
  preview: string;
  /** 叶子值的完整文本（未截断），详情面板/悬停提示用 */
  full: string;
  /** 用于复制：嵌套层保留的是原始字符串而非解析后的值 */
  origValue: unknown;
  nestCandidate: boolean;
  nestedState?: NestedState;
}

function previewOf(v: unknown, unicode: boolean): string {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'number' || t === 'boolean') return String(v);
  if (t === 'string') {
    let s = JSON.stringify(v);
    if (!unicode) s = escapeNonAscii(s);
    if (s.length > 160) return s.slice(0, 157) + '…"';
    return s;
  }
  return '';
}

/** 把当前可见的树展平成行（折叠的容器不入内），嵌套层按解析状态替换展示；
 *  传入 only 时仅保留其中的路径（搜索过滤模式） */
export function flattenTree(
  root: unknown,
  expanded: Set<string>,
  nested: Map<string, NestedState>,
  unicode: boolean,
  only?: Set<string>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (v: unknown, path: string, label: string, depth: number): void => {
    if (only && !only.has(path)) return;
    const st = typeof v === 'string' ? nested.get(path) : undefined;
    const disp = st && st.ok ? st.value : v;
    let kind: TreeRow['kind'];
    let isContainer = false;
    let childCount = 0;
    if (disp === null) kind = 'null';
    else if (Array.isArray(disp)) {
      kind = 'arr';
      isContainer = true;
      childCount = disp.length;
    } else if (typeof disp === 'object') {
      kind = 'obj';
      isContainer = true;
      childCount = Object.keys(disp as object).length;
    } else {
      kind = typeof disp === 'string' ? 'str' : typeof disp === 'number' ? 'num' : 'bool';
    }
    const isOpen = isContainer && expanded.has(path);
    rows.push({
      path,
      label,
      depth,
      kind,
      isContainer,
      expanded: isOpen,
      childCount,
      preview: isContainer ? '' : previewOf(disp, unicode),
      full: isContainer
        ? ''
        : typeof disp === 'string'
          ? unicode
            ? disp
            : escapeNonAscii(disp)
          : String(disp),
      origValue: v,
      nestCandidate: !isContainer && typeof v === 'string' && !st && isJsonCandidate(v),
      nestedState: st,
    });
    if (!isOpen) return;
    if (kind === 'arr') {
      const arr = disp as unknown[];
      for (let i = 0; i < arr.length; i++) walk(arr[i], pathAppend(path, i), String(i), depth + 1);
    } else {
      const obj = disp as Record<string, unknown>;
      for (const k of Object.keys(obj)) walk(obj[k], pathAppend(path, k), k, depth + 1);
    }
  };
  walk(root, '$', '$', 0);
  return rows;
}

/** 初始自动展开：BFS 到约 120 个可见节点为止 */
export function autoExpand(root: unknown): Set<string> {
  const out = new Set<string>();
  let budget = 120;
  const queue: Array<{ v: unknown; p: string }> = [{ v: root, p: '$' }];
  while (queue.length > 0 && budget > 0) {
    const item = queue.shift()!;
    const { v, p } = item;
    if (v === null || typeof v !== 'object') continue;
    out.add(p);
    const isArr = Array.isArray(v);
    if (isArr) {
      const arr = v as unknown[];
      for (let i = 0; i < arr.length && budget > 0; i++, budget--) {
        queue.push({ v: arr[i], p: pathAppend(p, i) });
      }
    } else {
      const obj = v as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        if (budget <= 0) break;
        budget--;
        queue.push({ v: obj[k], p: pathAppend(p, k) });
      }
    }
  }
  return out;
}

/** 递归解析所有内嵌 JSON 层（穿透到最深层），返回 nested 状态表；maxDepth 为合并树的深度防御上限 */
export function parseAllNested(root: unknown, maxDepth = 200): Map<string, NestedState> {
  const map = new Map<string, NestedState>();
  const walk = (v: unknown, path: string, depth: number): void => {
    if (depth > maxDepth) return;
    let disp: unknown = v;
    if (typeof v === 'string') {
      if (!isJsonCandidate(v)) return;
      const r = tryParseLayer(v);
      if (!r.ok) {
        map.set(path, { ok: false, msg: r.msg });
        return;
      }
      map.set(path, { ok: true, value: r.value, raw: v });
      disp = r.value;
    }
    if (disp === null || typeof disp !== 'object') return;
    if (Array.isArray(disp)) {
      const arr = disp as unknown[];
      for (let i = 0; i < arr.length; i++) walk(arr[i], pathAppend(path, i), depth + 1);
    } else {
      const obj = disp as Record<string, unknown>;
      for (const k of Object.keys(obj)) walk(obj[k], pathAppend(path, k), depth + 1);
    }
  };
  walk(root, '$', 0);
  return map;
}

/** BFS 自动展开（会穿透已解析的嵌套层），到约 budget 个可见节点为止 */
export function autoExpandDeep(
  root: unknown,
  nested: Map<string, NestedState>,
  budget = 200,
): Set<string> {
  const out = new Set<string>();
  let left = budget;
  const queue: Array<{ v: unknown; p: string }> = [{ v: root, p: '$' }];
  while (queue.length > 0 && left > 0) {
    const { v, p } = queue.shift()!;
    let disp = v;
    if (typeof v === 'string') {
      const st = nested.get(p);
      if (!st || !st.ok) continue;
      disp = st.value;
    }
    if (disp === null || typeof disp !== 'object') continue;
    out.add(p);
    if (Array.isArray(disp)) {
      const arr = disp as unknown[];
      for (let i = 0; i < arr.length && left > 0; i++, left--) {
        queue.push({ v: arr[i], p: pathAppend(p, i) });
      }
    } else {
      const obj = disp as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        if (left <= 0) break;
        left--;
        queue.push({ v: obj[k], p: pathAppend(p, k) });
      }
    }
  }
  return out;
}

/** 收集全部容器路径（穿透已解析嵌套层）；超过 maxNodes 截断并标记 capped */
export function collectContainers(
  root: unknown,
  nested: Map<string, NestedState>,
  maxNodes = 20000,
): { paths: string[]; capped: boolean } {
  const paths: string[] = [];
  let count = 0;
  const stack: Array<{ v: unknown; p: string }> = [{ v: root, p: '$' }];
  while (stack.length > 0) {
    if (count >= maxNodes) return { paths, capped: true };
    const { v, p } = stack.pop()!;
    let disp = v;
    if (typeof v === 'string') {
      const st = nested.get(p);
      if (st && st.ok) disp = st.value;
    }
    if (disp === null || typeof disp !== 'object') continue;
    count++;
    paths.push(p);
    if (Array.isArray(disp)) {
      const arr = disp as unknown[];
      for (let i = 0; i < arr.length; i++) stack.push({ v: arr[i], p: pathAppend(p, i) });
    } else {
      const obj = disp as Record<string, unknown>;
      for (const k of Object.keys(obj)) stack.push({ v: obj[k], p: pathAppend(p, k) });
    }
  }
  return { paths, capped: false };
}

/** 沿 JSONPath 取值；途中遇到已解析的嵌套层会穿透进去 */
export function resolvePath(root: unknown, nested: Map<string, NestedState>, path: string): unknown {
  const segs = parsePath(path);
  let cur = root;
  let curPath = '$';
  for (const seg of segs) {
    if (typeof cur === 'string') {
      const st = nested.get(curPath);
      cur = st && st.ok ? st.value : undefined;
    }
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[seg as string | number];
    curPath = pathAppend(curPath, seg);
  }
  return cur;
}
