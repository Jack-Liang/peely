export type TokType = 'punc' | 'key' | 'str' | 'num' | 'lit' | 'nest';

/** 文本视图里的一个 token；nest 表示「字符串值本身是 JSON」可点击解析 */
export interface Tok {
  t: TokType;
  v: string;
  /** 仅 nest：该字符串值在原文档中的 JSONPath */
  p?: string;
}

export interface Stats {
  bytes: number;
  nodes: number;
  maxDepth: number;
  topType: string;
}

export interface ParseOk {
  ok: true;
  value: unknown;
  text: string;
  lines: Tok[][];
  stats: Stats;
  parseMs: number;
}

export interface ParseErr {
  ok: false;
  message: string;
  line: number; // 1 起，-1 未知
  column: number;
  position: number;
}

export type ParseResult = ParseOk | ParseErr;

export interface RenderOptions {
  minify: boolean;
  unicode: boolean;
  sort: boolean;
}

/** 树中嵌套字符串的解析状态；raw 保留原始字符串以便「还原」与转义复制 */
export type NestedState =
  | { ok: true; value: unknown; raw: string }
  | { ok: false; msg: string };

export interface HistoryItem {
  ts: number;
  size: number;
  text: string;
}
