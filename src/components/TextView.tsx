import { useEffect, useRef, useState } from 'react';
import type { Tok } from '../types';

const ROW_H = 20;

interface Props {
  lines: Tok[][];
  onNestClick(path: string): void;
  /** 搜索：命中行号集合与当前行 */
  matchLines?: Set<number>;
  currentLine?: number;
  /** 定位滚动；n 变化时触发一次 */
  scrollTarget: { line: number; n: number };
}

/** 右栏·文本视图：虚拟滚动 + 语法高亮；内嵌 JSON 字符串可点击跳到树形解析 */
export function TextView(props: Props) {
  const { lines, onNestClick, matchLines, currentLine } = props;
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

  const lastNonce = useRef(-1);
  useEffect(() => {
    const st = props.scrollTarget;
    if (!st || st.n === lastNonce.current) return;
    lastNonce.current = st.n;
    const el = scrollRef.current;
    if (!el || st.line < 0) return;
    el.scrollTop = Math.max(0, st.line * ROW_H - el.clientHeight / 2);
  }, [props.scrollTarget]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 10);
  const end = Math.min(lines.length, Math.ceil((scrollTop + height) / ROW_H) + 10);
  const gutterW = `${String(Math.max(1, lines.length)).length + 1}ch`;

  const rows = [];
  for (let i = start; i < end; i++) {
    const toks = lines[i] ?? [];
    const rowCls =
      'tv-row' +
      (matchLines && matchLines.has(i) ? ' tv-hit' : '') +
      (currentLine === i ? ' tv-hit-current' : '');
    const parts = toks.map((t, k) =>
      t.t === 'nest' ? (
        <span
          key={k}
          className="tv-tok tok-nest"
          title="点击在树形视图中解析此层"
          onClick={() => t.p && onNestClick(t.p)}
        >
          {t.v}
        </span>
      ) : (
        <span key={k} className={`tv-tok tok-${t.t}`}>
          {t.v}
        </span>
      ),
    );
    rows.push(
      <div className={rowCls} key={i} style={{ top: i * ROW_H }}>
        <span className="tv-gutter" style={{ width: gutterW }}>
          {i + 1}
        </span>
        {parts}
      </div>,
    );
  }

  return (
    <div
      className="textview"
      ref={scrollRef}
      onScroll={() => setScrollTop(scrollRef.current ? scrollRef.current.scrollTop : 0)}
    >
      <div className="tv-inner" style={{ height: lines.length * ROW_H }}>
        {rows}
      </div>
    </div>
  );
}
