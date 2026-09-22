import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorPane } from './components/EditorPane';
import type { EditorHandle } from './components/EditorPane';
import { TextView } from './components/TextView';
import { TreeView } from './components/TreeView';
import { Toolbar, ErrorBar, StatusBar, SearchBar } from './components/Chrome';
import type { ThemeMode } from './components/Chrome';
import type { HistoryItem, NestedState, ParseErr, ParseResult, RenderOptions } from './types';
import { copyText, pasteText, downloadText, loadJSON, saveJSON } from './lib/browser';
import { copyValueText, formatBytes, tryParseLayer } from './lib/jsonx';
import { autoExpand, autoExpandDeep, collectContainers, parseAllNested, resolvePath } from './lib/tree';
import { findTreeMatches, findLineMatches } from './lib/search';
import { toYaml, toXml } from './lib/convert';
import { pathAncestors } from './lib/path';
import { EXAMPLE } from './lib/example';

const LS_HISTORY = 'jt:history';
const LS_PREFS = 'jt:prefs';
const LS_THEME = 'jt:theme';

interface Prefs {
  minify: boolean;
  keepEscape: boolean;
  unicode: boolean;
  parseAll: boolean;
  sortKeys: boolean;
}

interface WorkerOutMsg {
  type: 'result';
  id: number;
  result: ParseResult;
  rerender: boolean;
}

function fileStamp(): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}`;
}

export default function App() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [tab, setTab] = useState<'text' | 'tree'>('tree');
  const [prefs, setPrefs] = useState<Prefs>(() => ({
    minify: false,
    keepEscape: false,
    unicode: true,
    parseAll: false,
    sortKeys: false,
    ...loadJSON<Partial<Prefs>>(LS_PREFS, {}),
  }));
  const [theme, setTheme] = useState<ThemeMode>(
    () => (localStorage.getItem(LS_THEME) as ThemeMode | null) ?? 'auto',
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [nested, setNested] = useState<Map<string, NestedState>>(() => new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [inspect, setInspect] = useState<{ path: string; text: string; origValue: unknown } | null>(
    null,
  );
  const [search, setSearch] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const [filterOn, setFilterOn] = useState(false);
  const [pathText, setPathText] = useState('$');
  const [navNonce, setNavNonce] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadJSON<HistoryItem[]>(LS_HISTORY, []));
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);

  const editorRef = useRef<EditorHandle>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const historyTimer = useRef<number | undefined>(undefined);

  const parseOptions: RenderOptions = {
    minify: prefs.minify,
    unicode: prefs.unicode,
    sort: prefs.sortKeys,
  };
  const optionsRef = useRef(parseOptions);
  optionsRef.current = parseOptions;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const resultRef = useRef<ParseResult | null>(null);
  resultRef.current = result;

  // Worker：解析 / 重渲染
  useEffect(() => {
    const w = new Worker(new URL('./worker/parse.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerOutMsg>) => {
      const m = e.data;
      if (m.type !== 'result') return;
      setResult(m.result);
      if (m.result.ok && !m.rerender) {
        setInspect(null);
        if (prefsRef.current.parseAll) {
          const nm = parseAllNested(m.result.value);
          setNested(nm);
          setExpanded(autoExpandDeep(m.result.value, nm, 200));
        } else {
          setNested(new Map());
          setExpanded(autoExpand(m.result.value));
        }
        setSelected(null);
      }
    };
    workerRef.current = w;
    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  // 输入变化 → 防抖 300ms 后交给 Worker
  useEffect(() => {
    const text = input;
    if (text.trim() === '') {
      setResult(null);
      setNested(new Map());
      setExpanded(new Set());
      return;
    }
    const t = window.setTimeout(() => {
      workerRef.current?.postMessage({
        type: 'parse',
        id: ++reqIdRef.current,
        text,
        options: optionsRef.current,
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [input]);

  // 压缩 / 中文还原 / Key 排序 变化 → 用 Worker 里的已解析结果重新渲染
  useEffect(() => {
    workerRef.current?.postMessage({
      type: 'render',
      id: ++reqIdRef.current,
      options: optionsRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.minify, prefs.unicode, prefs.sortKeys]);

  // 「解析全部」开关：开 → 对当前文档递归解析所有层；关 → 全部还原为字符串
  useEffect(() => {
    const cur = resultRef.current;
    if (!cur || !cur.ok) return;
    if (prefs.parseAll) {
      const nm = parseAllNested(cur.value);
      setNested(nm);
      setExpanded((prev) => {
        const s = new Set(prev);
        for (const p of autoExpandDeep(cur.value, nm, 200)) s.add(p);
        return s;
      });
    } else {
      setNested(new Map());
      setExpanded(autoExpand(cur.value));
    }
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.parseAll]);

  // 解析成功后延迟记录历史
  useEffect(() => {
    if (!result || !result.ok) return;
    const text = input;
    if (text.trim() === '') return;
    window.clearTimeout(historyTimer.current);
    historyTimer.current = window.setTimeout(() => {
      setHistory((prev) => {
        if (prev[0] && prev[0].text === text) return prev;
        const next = [
          { ts: Date.now(), size: text.length, text },
          ...prev.filter((h) => h.text !== text),
        ]
          .filter((h) => h.size <= 1024 * 1024)
          .slice(0, 20);
        saveJSON(LS_HISTORY, next);
        return next;
      });
    }, 1500);
    return () => window.clearTimeout(historyTimer.current);
  }, [result, input]);

  useEffect(() => {
    saveJSON(LS_PREFS, prefs);
  }, [prefs]);

  useEffect(() => {
    localStorage.setItem(LS_THEME, theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'auto' ? (mq.matches ? 'dark' : 'light') : theme;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const showToast = useCallback((msg: string) => {
    setToast({ id: Date.now(), msg });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const setEditorText = useCallback((text: string) => {
    editorRef.current?.setValue(text);
    setInput(text);
  }, []);

  const doCopy = useCallback(
    async (text: string, what: string) => {
      if (text === '') return;
      if (await copyText(text)) showToast(`已复制${what}（${text.length.toLocaleString()} 字符）`);
      else showToast('复制失败：浏览器未授权剪贴板权限');
    },
    [showToast],
  );

  const onPaste = useCallback(async () => {
    const t = await pasteText();
    if (t == null) {
      showToast('无法读取剪贴板，请直接在左侧输入框按 Ctrl+V');
      return;
    }
    if (t === '') {
      showToast('剪贴板是空的');
      return;
    }
    setEditorText(t);
  }, [setEditorText, showToast]);

  const okResult = result && result.ok ? result : null;
  const errResult: ParseErr | null = result && !result.ok ? result : null;

  // —— 搜索 ——
  const treeMatches = useMemo(
    () =>
      okResult
        ? findTreeMatches(okResult.value, nested, search)
        : { matches: [], visible: new Set<string>() },
    [okResult, nested, search],
  );
  const matchPathSet = useMemo(
    () => new Set(treeMatches.matches.map((m) => m.path)),
    [treeMatches],
  );
  const lineMatches = useMemo(
    () => (okResult ? findLineMatches(okResult.lines, search) : []),
    [okResult, search],
  );
  const lineMatchSet = useMemo(() => new Set(lineMatches), [lineMatches]);

  const wrap = (len: number) => (len ? ((matchIdx % len) + len) % len : 0);
  const treeIdx = wrap(treeMatches.matches.length);
  const lineIdx = wrap(lineMatches.length);
  const curTreeMatch = treeMatches.matches[treeIdx];
  const curLine = lineMatches[lineIdx] ?? -1;
  const curTotal = tab === 'tree' ? treeMatches.matches.length : lineMatches.length;
  const curIdx = tab === 'tree' ? treeIdx : lineIdx;

  useEffect(() => {
    setMatchIdx(0);
    setNavNonce((n) => n + 1);
  }, [search]);

  const navPrev = useCallback(() => {
    setMatchIdx((i) => i - 1);
    setNavNonce((n) => n + 1);
  }, []);
  const navNext = useCallback(() => {
    setMatchIdx((i) => i + 1);
    setNavNonce((n) => n + 1);
  }, []);

  // Ctrl+F 聚焦搜索框；Esc 关闭值详情面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (e.key === 'Escape') setInspect(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 全局粘贴：焦点不在任何可编辑元素上时，Ctrl+V 直接进入左侧输入框
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('input, textarea, [contenteditable="true"], .cm-editor')) return;
      const text = e.clipboardData?.getData('text');
      if (!text) return;
      e.preventDefault();
      setEditorText(text);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [setEditorText]);

  // 右栏空状态点击：聚焦编辑器并尝试读取剪贴板
  const onEmptyClick = useCallback(async () => {
    editorRef.current?.focus();
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        setEditorText(t);
        return;
      }
    } catch {
      /* 无剪贴板权限时仅聚焦，让用户直接 Ctrl+V */
    }
    showToast('已聚焦左侧输入框，按 Ctrl+V 粘贴');
  }, [setEditorText, showToast]);

  // —— JSONPath 定位 ——
  useEffect(() => {
    setPathText(selected ?? '$');
  }, [selected]);

  const submitPath = useCallback(
    (raw: string) => {
      let p = raw.trim();
      if (!p) return;
      if (p === '$') {
        setSelected('$');
        setNavNonce((n) => n + 1);
        return;
      }
      if (!p.startsWith('$')) p = p.startsWith('[') ? '$' + p : '$.' + p;
      const v = okResult ? resolvePath(okResult.value, nested, p) : undefined;
      const viaLayer = nested.get(p)?.ok === true;
      if (v === undefined && !viaLayer) {
        showToast(`未找到路径 ${p}（若经过内嵌 JSON 层，需先解析该层）`);
        return;
      }
      setExpanded((prev) => {
        const s = new Set(prev);
        for (const a of pathAncestors(p)) s.add(a);
        return s;
      });
      setSelected(p);
      setNavNonce((n) => n + 1);
    },
    [okResult, nested, showToast],
  );

  const onCopyResult = useCallback(() => {
    if (okResult) doCopy(okResult.text, '结果');
  }, [okResult, doCopy]);

  const onCopySerialized = useCallback(() => {
    if (okResult) doCopy(copyValueText(okResult.value, prefs.keepEscape, prefs.unicode), '序列化结果');
  }, [okResult, prefs.keepEscape, prefs.unicode, doCopy]);

  const onDownload = useCallback(() => {
    const text = okResult ? okResult.text : input;
    if (!text) return;
    downloadText(text, `json-${fileStamp()}.json`);
    showToast('已开始下载');
  }, [okResult, input, showToast]);

  const onCopyYaml = useCallback(() => {
    if (okResult) doCopy(toYaml(okResult.value, prefs.unicode), 'YAML');
  }, [okResult, prefs.unicode, doCopy]);

  const onCopyXml = useCallback(() => {
    if (okResult) doCopy(toXml(okResult.value, prefs.unicode), 'XML');
  }, [okResult, prefs.unicode, doCopy]);

  const onDownloadYaml = useCallback(() => {
    if (!okResult) return;
    downloadText(toYaml(okResult.value, prefs.unicode), `json-${fileStamp()}.yaml`);
    showToast('已开始下载');
  }, [okResult, prefs.unicode, showToast]);

  const onDownloadXml = useCallback(() => {
    if (!okResult) return;
    downloadText(toXml(okResult.value, prefs.unicode), `json-${fileStamp()}.xml`);
    showToast('已开始下载');
  }, [okResult, prefs.unicode, showToast]);

  const onUploadFile = useCallback(
    async (f: File) => {
      const text = await f.text();
      setEditorText(text);
      showToast(`已载入 ${f.name}（${formatBytes(text.length)}）`);
    },
    [setEditorText, showToast],
  );

  const onPickHistory = useCallback(
    (h: HistoryItem) => {
      setEditorText(h.text);
      showToast('已从历史载入');
    },
    [setEditorText, showToast],
  );

  const onClearHistory = useCallback(() => {
    setHistory([]);
    saveJSON(LS_HISTORY, []);
    showToast('历史已清空');
  }, [showToast]);

  // —— 嵌套层解析 ——

  const parseNest = useCallback((path: string, raw: string) => {
    const r = tryParseLayer(raw);
    setNested((prev) => {
      const m = new Map(prev);
      m.set(path, r.ok ? { ok: true, value: r.value, raw } : { ok: false, msg: r.msg });
      return m;
    });
    if (r.ok) {
      setExpanded((prev) => {
        const s = new Set(prev);
        s.add(path);
        // 解析出的新层默认展开，策略与初次解析一致：BFS 至约 120 个可见节点
        for (const p of autoExpand(r.value)) s.add(p === '$' ? path : path + p.slice(1));
        return s;
      });
      setSelected(path);
    }
  }, []);

  const revertNest = useCallback((path: string) => {
    setNested((prev) => {
      const m = new Map(prev);
      m.delete(path);
      return m;
    });
    setExpanded((prev) => {
      const s = new Set(prev);
      s.delete(path);
      return s;
    });
  }, []);

  // 文本视图里点击内嵌 JSON 字符串 → 切到树形并解析该层
  const onNestClickFromText = useCallback(
    (path: string) => {
      const v = okResult ? resolvePath(okResult.value, nested, path) : undefined;
      if (typeof v === 'string') parseNest(path, v);
      setTab('tree');
      setExpanded((prev) => {
        const s = new Set(prev);
        for (const a of pathAncestors(path)) s.add(a);
        return s;
      });
    },
    [okResult, nested, parseNest],
  );

  const onToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(path)) s.delete(path);
      else s.add(path);
      return s;
    });
  }, []);

  const onExpandAll = useCallback(() => {
    if (!okResult) return;
    const { paths, capped } = collectContainers(okResult.value, nested, 20000);
    setExpanded(new Set(paths));
    if (capped) showToast('节点太多，已展开前 2 万个容器');
  }, [okResult, nested, showToast]);

  const onCollapseAll = useCallback(() => setExpanded(new Set()), []);

  const onCopyValue = useCallback(
    (v: unknown) => {
      doCopy(copyValueText(v, prefs.keepEscape, prefs.unicode), '该值');
    },
    [doCopy, prefs.keepEscape, prefs.unicode],
  );

  const onCopyPath = useCallback((path: string) => doCopy(path, '路径'), [doCopy]);

  const onJumpError = useCallback((line: number, column: number) => {
    editorRef.current?.jumpTo(line, column);
  }, []);

  const cycleTheme = useCallback(() => {
    setTheme((t) => (t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto'));
  }, []);

  return (
    <div className="app">
      <Toolbar
        canCopy={!!okResult}
        minify={prefs.minify}
        setMinify={(v) => setPrefs((p) => ({ ...p, minify: v }))}
        keepEscape={prefs.keepEscape}
        setKeepEscape={(v) => setPrefs((p) => ({ ...p, keepEscape: v }))}
        unicode={prefs.unicode}
        setUnicode={(v) => setPrefs((p) => ({ ...p, unicode: v }))}
        parseAll={prefs.parseAll}
        setParseAll={(v) => setPrefs((p) => ({ ...p, parseAll: v }))}
        sortKeys={prefs.sortKeys}
        setSortKeys={(v) => setPrefs((p) => ({ ...p, sortKeys: v }))}
        theme={theme}
        onCycleTheme={cycleTheme}
        history={history}
        onPaste={onPaste}
        onClear={() => setEditorText('')}
        onExample={() => setEditorText(EXAMPLE)}
        onUploadFile={onUploadFile}
        onDownload={onDownload}
        onCopyResult={onCopyResult}
        onCopySerialized={onCopySerialized}
        onCopyYaml={onCopyYaml}
        onCopyXml={onCopyXml}
        onDownloadYaml={onDownloadYaml}
        onDownloadXml={onDownloadXml}
        onPickHistory={onPickHistory}
        onClearHistory={onClearHistory}
      />
      <ErrorBar error={errResult} onJump={onJumpError} />
      <main className="main">
        <section className="pane pane-left">
          <div className="pane-head">
            <span className="pane-title">输入</span>
            <span className="flex-spacer" />
            <span className="pane-hint">支持 JSON / 转义字符串，修改后自动解析</span>
          </div>
          <div className="pane-body">
            <EditorPane ref={editorRef} initial="" onChange={setInput} />
            {input === '' && (
              <div
                className="pane-empty clickable overlay left-empty"
                onClick={onEmptyClick}
                title="点击此处直接粘贴剪贴板内容"
              >
                <div className="empty-mark">{'{ }'}</div>
                <div className="empty-title">点击此处粘贴，或按 Ctrl + V</div>
                <div className="empty-sub">支持 JSON / 多层转义字符串 / 单行压缩报文</div>
              </div>
            )}
          </div>
        </section>
        <section className="pane pane-right">
          <div className="pane-head">
            <div className="seg">
              <button
                className={'tab-btn' + (tab === 'tree' ? ' active' : '')}
                onClick={() => setTab('tree')}
              >
                树形
              </button>
              <button
                className={'tab-btn' + (tab === 'text' ? ' active' : '')}
                onClick={() => setTab('text')}
              >
                文本
              </button>
            </div>
            <span className="flex-spacer" />
            <span className="pane-hint">
              {tab === 'tree' ? '字符串是内嵌 JSON 时点「解析」逐层剥开' : '带下划线的字符串可点击解析'}
            </span>
          </div>
          {okResult && (
            <SearchBar
              value={search}
              onChange={setSearch}
              total={curTotal}
              index={curIdx}
              onPrev={navPrev}
              onNext={navNext}
              filterOn={filterOn}
              setFilterOn={setFilterOn}
              showFilter={tab === 'tree'}
              inputRef={searchInputRef}
            />
          )}
          <div className="pane-body">
            {!result && (
              <div className="guide">
                <div className="guide-title">功能导览</div>
                <ul className="guide-list">
                  <li>
                    <b>逐层解析</b>
                    <span>字符串值本身是 JSON 时，点「解析 JSON」一层层剥开，可随时还原为字符串</span>
                  </li>
                  <li>
                    <b>转义控制</b>
                    <span>「保留转义」开启时，复制/序列化输出带引号和 \ 的转义字符串，可直接嵌回代码或报文</span>
                  </li>
                  <li>
                    <b>中文还原</b>
                    <span>\uXXXX 自动显示为中文，可一键开关</span>
                  </li>
                  <li>
                    <b>搜索定位</b>
                    <span>Ctrl+F 搜索 key 或值，支持「仅看匹配」；树形顶部输入 $.a.b[0] 回车直达节点</span>
                  </li>
                  <li>
                    <b>格式转换</b>
                    <span>结果可一键复制 / 下载为 YAML 或 XML</span>
                  </li>
                  <li>
                    <b>更多</b>
                    <span>「解析全部」一键展开所有嵌套层 · 「Key 排序」按字母序重排 · 深浅主题切换</span>
                  </li>
                </ul>
                <button className="tool-btn primary" onClick={() => setEditorText(EXAMPLE)}>
                  载入示例，试试逐层解析
                </button>
              </div>
            )}
            {errResult && <div className="pane-empty">解析失败：{errResult.message}</div>}
            {okResult && tab === 'tree' && (
              <TreeView
                root={okResult.value}
                expanded={expanded}
                nested={nested}
                selected={selected}
                unicode={prefs.unicode}
                matchPaths={matchPathSet}
                onlyPaths={treeMatches.visible}
                filterOn={filterOn && !!search}
                pathText={pathText}
                onPathTextChange={setPathText}
                onPathSubmit={submitPath}
                scrollTarget={{ path: curTreeMatch ? curTreeMatch.path : '', n: navNonce }}
                inspect={inspect}
                onInspect={setInspect}
                onInspectClose={() => setInspect(null)}
                onToggle={onToggle}
                onSelect={setSelected}
                onParseNest={parseNest}
                onRevertNest={revertNest}
                onCopyValue={onCopyValue}
                onCopyPath={onCopyPath}
                onExpandAll={onExpandAll}
                onCollapseAll={onCollapseAll}
              />
            )}
            {okResult && tab === 'text' && (
              <TextView
                lines={okResult.lines}
                onNestClick={onNestClickFromText}
                matchLines={lineMatchSet}
                currentLine={curLine}
                scrollTarget={{ line: curLine, n: navNonce }}
              />
            )}
          </div>
        </section>
      </main>
      <StatusBar
        inputLen={input.length}
        parseMs={okResult ? okResult.parseMs : null}
        nodes={okResult ? okResult.stats.nodes : null}
        maxDepth={okResult ? okResult.stats.maxDepth : null}
        topType={okResult ? okResult.stats.topType : null}
        state={errResult ? 'error' : okResult ? 'ok' : 'idle'}
      />
      {toast && (
        <div className="toast" key={toast.id}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
