/// <reference lib="webworker" />
import { extractError, stringifyOpts, computeStats, sortValue } from '../lib/jsonx';
import { tokenizeLines } from '../lib/tokenize';
import type { ParseResult, RenderOptions, Stats } from '../types';

interface ParseMsg {
  type: 'parse';
  id: number;
  text: string;
  options: RenderOptions;
}
interface RenderMsg {
  type: 'render';
  id: number;
  options: RenderOptions;
}
type InMsg = ParseMsg | RenderMsg;

let lastValue: unknown = null;
let lastStats: Stats = { bytes: 0, nodes: 0, maxDepth: 0, topType: 'unknown' };
let hasValue = false;

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === 'parse') {
    const t0 = performance.now();
    try {
      const value = JSON.parse(msg.text);
      lastValue = value;
      hasValue = true;
      const base = computeStats(value);
      lastStats = { ...base, bytes: msg.text.length };
      const viewValue = msg.options.sort ? sortValue(value) : value;
      const text = stringifyOpts(viewValue, msg.options);
      const result: ParseResult = {
        ok: true,
        value: viewValue,
        text,
        lines: tokenizeLines(text),
        stats: lastStats,
        parseMs: Math.round(performance.now() - t0),
      };
      post({ type: 'result', id: msg.id, result, rerender: false });
    } catch (err) {
      post({ type: 'result', id: msg.id, result: extractError(err, msg.text), rerender: false });
    }
  } else if (msg.type === 'render' && hasValue) {
    try {
      const viewValue = msg.options.sort ? sortValue(lastValue) : lastValue;
      const text = stringifyOpts(viewValue, msg.options);
      const result: ParseResult = {
        ok: true,
        value: viewValue,
        text,
        lines: tokenizeLines(text),
        stats: lastStats,
        parseMs: 0,
      };
      post({ type: 'result', id: msg.id, result, rerender: true });
    } catch {
      /* 重渲染失败时保留旧结果 */
    }
  }
};
