import { useEffect, useMemo, useRef, useState } from 'react';
import type { NestedState } from '../types';
import { flattenTree } from '../lib/tree';
import type { TreeRow } from '../lib/tree';

const ROW_H = 26;

interface Props {
  root: unknown;
  expanded: Set<string>;
  nested: Map<string, NestedState>;
  selected: string | null;
  unicode: boolean;
  /** 搜索：命中的节点路径（高亮） */
  matchPaths?: Set<string>;
  /** 搜索过滤模式：仅显示这些路径 */
  onlyPaths?: Set<string>;
  filterOn: boolean;
  /** 路径栏输入内容（可编辑，回车定位） */
  pathText: string;
  onPathTextChange(v: string): void;
  onPathSubmit(v: string): void;
  /** 定位滚动目标；n 变化时触发一次滚动 */
  scrollTarget: { path: string; n: number };
  onToggle(path: string): void;
  onSelect(path: string): void;
  onParseNest(path: string, raw: string): void;
  onRevertNest(path: string): void;
  onCopyValue(v: unknown): void;
  onCopyPath(path: string): void;
  onExpandAll(): void;
  onCollapseAll(): void;
}

/** 右栏·树形视图：虚拟滚动，字符串值若是内嵌 JSON 可逐层解析/还原 */
export function TreeView(props: Props) {
  const { root, expanded, nested, selected, unicode, matchPaths, onlyPaths, filterOn } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(
    () => flattenTree(root, expanded, nested, unicode, filterOn ? onlyPaths : undefined),
    [root, expanded, nested, unicode, filterOn, onlyPaths],
  );

  // 定位滚动：scrollTarget.n 变化时滚到目标行
  const lastNonce = useRef(-1);
  useEffect(() => {
    const st = props.scrollTarget;
    if (!st || st.n === lastNonce.current) return;
    lastNonce.current = st.n;
    const el = scrollRef.current;
    if (!el || !st.path) return;
    const idx = rows.findIndex((r) => r.path === st.path);
    if (idx >= 0) el.scrollTop = Math.max(0, idx * ROW_H - el.clientHeight / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scrollTarget, rows]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 12);
  const end = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_H) + 12);
  const visible: TreeRow[] = [];
  for (let i = start; i < end; i++) visible.push(rows[i]);

  const hit = (p: string) => (matchPaths && matchPaths.has(p) ? ' hit' : '');

  return (
    <div className="treeview">
      <div className="tree-header">
        <span className="tree-path-label">路径</span>
        <input
          className="path-input"
          value={props.pathText}
          spellCheck={false}
          placeholder="JSONPath，如 $.data.user.name，回车定位"
          title="点击树节点自动填入；也可手动输入后回车跳转"
          onChange={(e) => props.onPathTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.onPathSubmit((e.target as HTMLInputElement).value);
          }}
        />
        <button className="mini-btn" title="复制当前路径" onClick={() => props.onCopyPath(props.pathText)}>
          ⧉
        </button>
        <span className="flex-spacer" />
        <button className="mini-btn" onClick={props.onExpandAll}>
          全部展开
        </button>
        <button className="mini-btn" onClick={props.onCollapseAll}>
          全部收起
        </button>
      </div>
      <div
        className="tree-scroll"
        ref={scrollRef}
        onScroll={() => setScrollTop(scrollRef.current ? scrollRef.current.scrollTop : 0)}
      >
        <div className="tree-inner" style={{ height: rows.length * ROW_H }}>
          {visible.map((r, vi) => (
            <div
              key={r.path + '#' + r.depth}
              className={
                'tree-row' + (r.path === selected ? ' selected' : '') + (r.isContainer ? ' container' : '')
              }
              style={{ top: (start + vi) * ROW_H, paddingLeft: 8 + Math.min(r.depth, 40) * 14, height: ROW_H }}
              onClick={() => props.onSelect(r.path)}
            >
              {r.isContainer ? (
                <span
                  className={'caret' + (r.expanded ? ' open' : '')}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onToggle(r.path);
                  }}
                >
                  <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.2 2.2l5 3.8-5 3.8" />
                  </svg>
                </span>
              ) : (
                <span className="caret-spacer" />
              )}
              <span
                className={
                  'tree-label' +
                  (r.depth === 0 ? ' root-label' : /^\d+$/.test(r.label) ? ' idx' : '') +
                  hit(r.path)
                }
              >
                {r.depth === 0 ? '$' : r.label + ':'}
              </span>
              {r.isContainer ? (
                <span className="tree-brace">
                  {r.kind === 'arr' ? '[' : '{'}
                  <span className="tree-count">{r.childCount} 项</span>
                  {r.kind === 'arr' ? ']' : '}'}
                  {!r.expanded && ' …'}
                </span>
              ) : (
                <span
                  className={'tree-value val-' + r.kind + hit(r.path)}
                  title={r.preview.length >= 160 ? r.preview : undefined}
                >
                  {r.preview}
                </span>
              )}
              {r.nestCandidate && (
                <button
                  className="nest-btn"
                  title="点击解析：这一层字符串本身是 JSON"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onParseNest(r.path, r.origValue as string);
                  }}
                >
                  解析 JSON
                </button>
              )}
              {r.nestedState && !r.nestedState.ok && (
                <span className="nest-err" title={r.nestedState.msg}>
                  解析失败
                </span>
              )}
              {r.nestedState && r.nestedState.ok && (
                <button
                  className="nest-btn parsed"
                  title="还原为转义字符串"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onRevertNest(r.path);
                  }}
                >
                  还原字符串
                </button>
              )}
              <span className="flex-spacer" />
              <button
                className="row-copy"
                title="复制此值（受「保留转义」开关影响）"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onCopyValue(r.origValue);
                }}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
                  <path d="M10.5 3.4V3A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.4" />
                </svg>
              </button>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="pane-empty">{filterOn ? '没有匹配的节点' : '空文档'}</div>
          )}
        </div>
      </div>
    </div>
  );
}
