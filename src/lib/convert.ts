import { escapeNonAscii } from './jsonx';

/** JSON → YAML（2 空格缩进；字符串按需加引号，采用 YAML 双引号风格） */
export function toYaml(value: unknown, unicode = true): string {
  const scalar = (v: unknown): string => {
    if (v === null) return 'null';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    let s = String(v);
    if (!unicode) s = escapeNonAscii(s);
    const risky =
      s === '' ||
      /[\s]/.test(s[0] ?? '') ||
      /[\s]/.test(s[s.length - 1] ?? '') ||
      /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
      s.includes(': ') ||
      s.includes(' #') ||
      s.includes('\n') ||
      ['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~'].includes(s.toLowerCase()) ||
      (s !== '' && !isNaN(Number(s)));
    return risky ? JSON.stringify(s) : s;
  };

  const keyText = (k: string): string =>
    /^[\w.-]+$/.test(k) ? k : JSON.stringify(unicode ? k : escapeNonAscii(k));

  const isContainer = (v: unknown): v is object =>
    v !== null && typeof v === 'object';

  const entries = (v: unknown, indent: number): string[] => {
    const pad = ' '.repeat(indent);
    const out: string[] = [];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (!isContainer(item)) out.push(`${pad}- ${scalar(item)}`);
        else if (Array.isArray(item)) {
          if (item.length === 0) out.push(`${pad}- []`);
          else {
            out.push(`${pad}-`);
            out.push(...entries(item, indent + 2));
          }
        } else if (Object.keys(item).length === 0) out.push(`${pad}- {}`);
        else {
          out.push(`${pad}-`);
          out.push(...entries(item, indent + 2));
        }
      }
      return out;
    }
    const obj = v as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      const child = obj[k];
      if (!isContainer(child)) out.push(`${pad}${keyText(k)}: ${scalar(child)}`);
      else if (Array.isArray(child)) {
        if (child.length === 0) out.push(`${pad}${keyText(k)}: []`);
        else {
          out.push(`${pad}${keyText(k)}:`);
          out.push(...entries(child, indent + 2));
        }
      } else if (Object.keys(child).length === 0) out.push(`${pad}${keyText(k)}: {}`);
      else {
        out.push(`${pad}${keyText(k)}:`);
        out.push(...entries(child, indent + 2));
      }
    }
    return out;
  };

  if (!isContainer(value)) return scalar(value) + '\n';
  const head = Array.isArray(value)
    ? value.length === 0
      ? '[]\n'
      : entries(value, 0).join('\n') + '\n'
    : Object.keys(value as object).length === 0
      ? '{}\n'
      : entries(value, 0).join('\n') + '\n';
  return head;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function xmlTag(k: string): string {
  const t = k.replace(/[^\w.-]/g, '_');
  return t === '' || /^[^A-Za-z_]/.test(t) ? '_' + t : t;
}

/** JSON → XML（对象变标签、数组重复父标签、标量变文本；根节点 <root>） */
export function toXml(value: unknown, unicode = true): string {
  const out: string[] = [];

  const emit = (tag: string, v: unknown, indent: number): void => {
    const pad = ' '.repeat(indent);
    const text = (s: string) => escXml(unicode ? s : escapeNonAscii(s));
    if (v === null || typeof v !== 'object') {
      const t = v === null ? '' : typeof v === 'string' ? text(v) : String(v);
      out.push(t === '' ? `${pad}<${tag}/>` : `${pad}<${tag}>${t}</${tag}>`);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) emit(tag, item, indent);
      return;
    }
    const keys = Object.keys(v as Record<string, unknown>);
    if (keys.length === 0) {
      out.push(`${pad}<${tag}/>`);
      return;
    }
    out.push(`${pad}<${tag}>`);
    const obj = v as Record<string, unknown>;
    for (const k of keys) emit(xmlTag(k), obj[k], indent + 2);
    out.push(`${pad}</${tag}>`);
  };

  emit('root', value, 0);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + out.join('\n') + '\n';
}
