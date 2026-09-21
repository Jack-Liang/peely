import { useEffect, useRef, useState } from 'react';
import type { HistoryItem, ParseErr } from '../types';
import { formatBytes } from '../lib/jsonx';

export type ThemeMode = 'auto' | 'light' | 'dark';

/* ---------- 线性 SVG 图标 ---------- */

function Ico({ children, size = 14 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const Paste = (
  <>
    <rect x="5.5" y="1.5" width="5" height="2.8" rx="1" />
    <path d="M5.5 2.9H4A1.8 1.8 0 0 0 2.2 4.7v8.5A1.8 1.8 0 0 0 4 15h8a1.8 1.8 0 0 0 1.8-1.8V4.7A1.8 1.8 0 0 0 12 2.9h-1.5" />
    <path d="M5.4 8.2h5.2M5.4 11h3" />
  </>
);
const Trash = (
  <>
    <path d="M2.8 4.4h10.4" />
    <path d="M6.4 4.4V3.2a1 1 0 0 1 1-1h1.2a1 1 0 0 1 1 1v1.2" />
    <path d="M4.4 4.4l.5 8.4a1.2 1.2 0 0 0 1.2 1.1h3.8a1.2 1.2 0 0 0 1.2-1.1l.5-8.4" />
  </>
);
const Sparkle = (
  <>
    <path d="M8 1.8l1.3 3.4 3.4 1.3-3.4 1.3L8 11.2 6.7 7.8 3.3 6.5l3.4-1.3Z" />
    <path d="M12.2 11l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5Z" />
  </>
);
const Upload = (
  <>
    <path d="M8 10.8V2.6" />
    <path d="M4.8 5.8L8 2.6l3.2 3.2" />
    <path d="M2.8 13.4h10.4" />
  </>
);
const Download = (
  <>
    <path d="M8 2.6v8.2" />
    <path d="M4.8 7.6L8 10.8l3.2-3.2" />
    <path d="M2.8 13.4h10.4" />
  </>
);
const Copy = (
  <>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
    <path d="M10.5 3.4V3A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.4" />
  </>
);
const Braces = (
  <>
    <path d="M6.5 1.8c-1.6 0-2.3 1-2.3 2.4v1.4c0 1.1-.6 1.7-1.7 1.9 1.1.2 1.7.8 1.7 1.9v1.4c0 1.4.7 2.4 2.3 2.4" />
    <path d="M9.5 1.8c1.6 0 2.3 1 2.3 2.4v1.4c0 1.1.6 1.7 1.7 1.9-1.1.2-1.7.8-1.7 1.9v1.4c0 1.4-.7 2.4-2.3 2.4" />
  </>
);
const Swap = (
  <>
    <path d="M4.2 5.4h7.6L9.2 2.8" />
    <path d="M11.8 10.6H4.2l2.6 2.6" />
  </>
);
const Clock = (
  <>
    <circle cx="8" cy="8" r="5.6" />
    <path d="M8 5v3.1l2.2 1.6" />
  </>
);
const Search = (
  <>
    <circle cx="7" cy="7" r="4.6" />
    <path d="M10.4 10.4L14 14" />
  </>
);
const ChevronUp = <path d="M4 9.5l4-4 4 4" />;
const ChevronDown = <path d="M4 6.5l4 4 4-4" />;
const ThemeAuto = (
  <>
    <circle cx="8" cy="8" r="5.2" />
    <path d="M8 2.8a5.2 5.2 0 0 1 0 10.4Z" fill="currentColor" stroke="none" />
  </>
);
const ThemeLight = (
  <>
    <circle cx="8" cy="8" r="3.2" />
    <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1" />
  </>
);
const ThemeDark = <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" />;

/* ---------- 工具栏 ---------- */

interface ToolbarProps {
  canCopy: boolean;
  minify: boolean;
  setMinify(v: boolean): void;
  keepEscape: boolean;
  setKeepEscape(v: boolean): void;
  unicode: boolean;
  setUnicode(v: boolean): void;
  parseAll: boolean;
  setParseAll(v: boolean): void;
  sortKeys: boolean;
  setSortKeys(v: boolean): void;
  theme: ThemeMode;
  onCycleTheme(): void;
  history: HistoryItem[];
  onPaste(): void;
  onClear(): void;
  onExample(): void;
  onUploadFile(file: File): void;
  onDownload(): void;
  onCopyResult(): void;
  onCopySerialized(): void;
  onCopyYaml(): void;
  onCopyXml(): void;
  onDownloadYaml(): void;
  onDownloadXml(): void;
  onPickHistory(item: HistoryItem): void;
  onClearHistory(): void;
}

function Switch(props: { checked: boolean; onChange(v: boolean): void; label: string; title: string }) {
  return (
    <label className="switch" title={props.title}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      <span className="switch-text">{props.label}</span>
    </label>
  );
}

function HistoryMenu(props: { history: HistoryItem[]; onPick(i: HistoryItem): void; onClear(): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="history-wrap" ref={ref}>
      <button className="tool-btn" onClick={() => setOpen((v) => !v)} disabled={props.history.length === 0}>
        <Ico>{Clock}</Ico>历史 ▾
      </button>
      {open && (
        <div className="history-menu">
          {props.history.map((h, i) => (
            <button
              key={h.ts + '-' + i}
              className="history-item"
              onClick={() => {
                props.onPick(h);
                setOpen(false);
              }}
            >
              <span className="history-meta">
                {new Date(h.ts).toLocaleString('zh-CN', { hour12: false })} · {formatBytes(h.size)}
              </span>
              <span className="history-preview">{h.text.slice(0, 120)}</span>
            </button>
          ))}
          <button
            className="history-clear"
            onClick={() => {
              props.onClear();
              setOpen(false);
            }}
          >
            清空历史
          </button>
        </div>
      )}
    </div>
  );
}

function ConvertMenu(props: {
  onCopyYaml(): void;
  onCopyXml(): void;
  onDownloadYaml(): void;
  onDownloadXml(): void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const item = (label: string, icon: React.ReactNode, fn: () => void) => (
    <button
      className="convert-item"
      onClick={() => {
        fn();
        setOpen(false);
      }}
    >
      <Ico size={13}>{icon}</Ico>
      {label}
    </button>
  );

  return (
    <div className="history-wrap" ref={ref}>
      <button className="tool-btn" onClick={() => setOpen((v) => !v)} title="把当前结果转换为其他格式">
        <Ico>{Swap}</Ico>转换 ▾
      </button>
      {open && (
        <div className="history-menu convert-menu">
          {item('复制为 YAML', Copy, props.onCopyYaml)}
          {item('复制为 XML', Copy, props.onCopyXml)}
          <div className="menu-sep" />
          {item('下载 .yaml', Download, props.onDownloadYaml)}
          {item('下载 .xml', Download, props.onDownloadXml)}
        </div>
      )}
    </div>
  );
}

export function SearchBar(props: {
  value: string;
  onChange(v: string): void;
  total: number;
  index: number;
  onPrev(): void;
  onNext(): void;
  filterOn: boolean;
  setFilterOn(v: boolean): void;
  showFilter: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="search-row">
      <span className="search-icon">
        <Ico>{Search}</Ico>
      </span>
      <input
        ref={props.inputRef}
        className="search-input"
        value={props.value}
        spellCheck={false}
        placeholder="搜索 key 或值（Ctrl+F），Enter 下一个"
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            props.onNext();
          }
          if (e.key === 'Escape') props.onChange('');
        }}
      />
      <span className="search-count">
        {props.total === 0 ? '0' : props.index + 1}/{props.total}
      </span>
      <button className="mini-btn" title="上一个" onClick={props.onPrev}>
        <Ico size={12}>{ChevronUp}</Ico>
      </button>
      <button className="mini-btn" title="下一个" onClick={props.onNext}>
        <Ico size={12}>{ChevronDown}</Ico>
      </button>
      {props.showFilter && (
        <label className="filter-check" title="只在树中显示命中的节点及其祖先">
          <input
            type="checkbox"
            checked={props.filterOn}
            onChange={(e) => props.setFilterOn(e.target.checked)}
          />
          仅看匹配
        </label>
      )}
    </div>
  );
}

const THEME_ICON: Record<ThemeMode, React.ReactNode> = {
  auto: ThemeAuto,
  light: ThemeLight,
  dark: ThemeDark,
};
const THEME_TITLE: Record<ThemeMode, string> = {
  auto: '主题：跟随系统（点击切换）',
  light: '主题：浅色（点击切换）',
  dark: '主题：深色（点击切换）',
};

export function Toolbar(p: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="toolbar">
      <div className="brand" aria-hidden="true">
        <span className="brand-mark">{'{}'}</span>
        <span className="brand-name">JSON 工具</span>
      </div>
      <span className="tool-sep" />
      <div className="tool-group">
        <button className="tool-btn" onClick={p.onPaste} title="读取剪贴板到输入框">
          <Ico>{Paste}</Ico>粘贴
        </button>
        <button className="tool-btn" onClick={p.onClear} title="清空输入">
          <Ico>{Trash}</Ico>清空
        </button>
        <button className="tool-btn" onClick={p.onExample} title="载入多层嵌套示例">
          <Ico>{Sparkle}</Ico>示例
        </button>
        <button className="tool-btn" onClick={() => fileRef.current?.click()} title="打开本地 .json/.txt/.log 文件">
          <Ico>{Upload}</Ico>上传
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.txt,.log,.jsonl,application/json,text/plain"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            if (f) p.onUploadFile(f);
            e.target.value = '';
          }}
        />
        <button className="tool-btn" onClick={p.onDownload} disabled={!p.canCopy} title="下载当前结果">
          <Ico>{Download}</Ico>下载
        </button>
      </div>
      <span className="tool-sep" />
      <div className="tool-group">
        <button className="tool-btn primary" onClick={p.onCopyResult} disabled={!p.canCopy} title="复制右侧当前结果">
          <Ico>{Copy}</Ico>复制结果
        </button>
        <button
          className="tool-btn primary"
          onClick={p.onCopySerialized}
          disabled={!p.canCopy}
          title="压缩为单行；按「保留转义」开关决定是否输出为带引号转义的字符串"
        >
          <Ico>{Braces}</Ico>序列化复制
        </button>
        <ConvertMenu
          onCopyYaml={p.onCopyYaml}
          onCopyXml={p.onCopyXml}
          onDownloadYaml={p.onDownloadYaml}
          onDownloadXml={p.onDownloadXml}
        />
      </div>
      <span className="tool-sep" />
      <div className="tool-group">
        <Switch
          checked={p.minify}
          onChange={p.setMinify}
          label="压缩"
          title="关闭=缩进格式化；开启=压缩为单行"
        />
        <Switch
          checked={p.keepEscape}
          onChange={p.setKeepEscape}
          label="保留转义"
          title="开启时复制/序列化输出带引号和 \\ 转义的字符串，可直接嵌回别处"
        />
        <Switch
          checked={p.unicode}
          onChange={p.setUnicode}
          label="中文还原"
          title="开启时 \\uXXXX 显示为中文；关闭时非 ASCII 全部转义为 \\uXXXX"
        />
        <Switch
          checked={p.parseAll}
          onChange={p.setParseAll}
          label="解析全部"
          title="开启后自动递归解析所有内嵌 JSON 字符串到最深层；关闭则全部还原为字符串"
        />
        <Switch
          checked={p.sortKeys}
          onChange={p.setSortKeys}
          label="Key 排序"
          title="开启后右侧结果的对象 key 按字母序递归排列（数组顺序不变），左侧原文不动"
        />
      </div>
      <span className="tool-sep" />
      <HistoryMenu history={p.history} onPick={p.onPickHistory} onClear={p.onClearHistory} />
      <span className="flex-spacer" />
      <button className="tool-btn icon-only" onClick={p.onCycleTheme} title={THEME_TITLE[p.theme]}>
        <Ico>{THEME_ICON[p.theme]}</Ico>
      </button>
    </div>
  );
}

export function ErrorBar(props: { error: ParseErr | null; onJump(line: number, column: number): void }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(false);
  }, [props.error]);
  if (!props.error || dismissed) return null;
  const e = props.error;
  return (
    <div className="error-bar">
      <span className="error-icon">!</span>
      <span className="error-msg" title={e.message}>
        JSON 解析失败：{e.message}
      </span>
      {e.line > 0 && (
        <button className="error-jump" onClick={() => props.onJump(e.line, e.column)}>
          定位 第 {e.line} 行 第 {e.column} 列
        </button>
      )}
      <span className="flex-spacer" />
      <button className="error-close" onClick={() => setDismissed(true)} title="关闭">
        ✕
      </button>
    </div>
  );
}

const TYPE_ZH: Record<string, string> = {
  object: '对象',
  array: '数组',
  string: '字符串',
  number: '数字',
  boolean: '布尔',
  null: 'null',
};

export function StatusBar(props: {
  inputLen: number;
  parseMs: number | null;
  nodes: number | null;
  maxDepth: number | null;
  topType: string | null;
  state: 'idle' | 'ok' | 'error';
}) {
  const { state } = props;
  return (
    <div className="status-bar">
      <span className="stat-chip">输入 {formatBytes(props.inputLen)}</span>
      {state !== 'idle' && (
        <span className="stat-chip">解析 {props.parseMs ?? '–'} ms</span>
      )}
      {state === 'ok' && (
        <span className="stat-chip">
          {props.nodes?.toLocaleString()} 节点 · 深度 {props.maxDepth} ·{' '}
          {props.topType ? (TYPE_ZH[props.topType] ?? props.topType) : ''}
        </span>
      )}
      <span className="flex-spacer" />
      <span className={'state-chip ' + state}>
        {state === 'ok' ? '有效' : state === 'error' ? '格式错误' : '待输入'}
      </span>
    </div>
  );
}
