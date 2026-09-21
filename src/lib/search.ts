import type { NestedState, Tok } from '../types';
import { pathAppend } from './path';

export interface TreeMatch {
  path: string;
  reason: 'key' | 'value';
}

/**
 * 在合并树（穿透已解析嵌套层）中全量搜索：key 或标量值包含 query（不区分大小写）。
 * matches 按树的深度优先顺序返回；visible 为命中节点及其全部祖先的路径集合，
 * 供树形「仅看匹配」过滤模式使用。
 */
export function findTreeMatches(
  root: unknown,
  nested: Map<string, NestedState>,
  query: string,
): { matches: TreeMatch[]; visible: Set<string> } {
  const q = query.toLowerCase();
  const matches: TreeMatch[] = [];
  const visible = new Set<string>();
  if (!q) return { matches, visible };

  const walk = (v: unknown, path: string, label: string, chain: string[]): void => {
    let disp = v;
    if (typeof v === 'string') {
      const st = nested.get(path);
      if (st && st.ok) disp = st.value;
    }
    let hit: 'key' | 'value' | null = null;
    if (label.toLowerCase().includes(q)) hit = 'key';
    else if (disp !== null && typeof disp !== 'object') {
      if (typeof disp === 'string') {
        if (disp.toLowerCase().includes(q)) hit = 'value';
      } else if (String(disp).toLowerCase().includes(q)) {
        hit = 'value';
      }
    }
    if (hit) {
      matches.push({ path, reason: hit });
      for (const a of chain) visible.add(a);
      visible.add(path);
    }
    if (disp === null || typeof disp !== 'object') return;
    if (Array.isArray(disp)) {
      const arr = disp as unknown[];
      const nextChain = [...chain, path];
      for (let i = 0; i < arr.length; i++) walk(arr[i], pathAppend(path, i), String(i), nextChain);
    } else {
      const obj = disp as Record<string, unknown>;
      const nextChain = [...chain, path];
      for (const k of Object.keys(obj)) walk(obj[k], pathAppend(path, k), k, nextChain);
    }
  };

  walk(root, '$', '$', []);
  return { matches, visible };
}

/** 文本视图搜索：返回包含 query（不区分大小写）的行号列表 */
export function findLineMatches(lines: Tok[][], query: string): number[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const out: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const toks = lines[i];
    let s = '';
    for (let k = 0; k < toks.length; k++) s += toks[k].v;
    if (s.toLowerCase().includes(q)) out.push(i);
  }
  return out;
}
