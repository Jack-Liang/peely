/** JSONPath 构造与解析：$.a.b[0]['x.y'] 形式 */

type Seg = string | number;

export function pathAppend(parent: string, key: Seg): string {
  if (typeof key === 'number') return `${parent}[${key}]`;
  if (/^[A-Za-z0-9_$-]+$/.test(key)) return `${parent}.${key}`;
  const k = key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `${parent}['${k}']`;
}

export function parsePath(path: string): Seg[] {
  const segs: Seg[] = [];
  let i = 0;
  const n = path.length;
  if (path[0] !== '$') return segs;
  i = 1;
  while (i < n) {
    const c = path[i];
    if (c === '.') {
      let j = i + 1;
      while (j < n && !'.['.includes(path[j])) j++;
      segs.push(path.slice(i + 1, j));
      i = j;
    } else if (c === '[') {
      if (path[i + 1] === "'") {
        let j = i + 2;
        let key = '';
        while (j < n && path[j] !== "'") {
          if (path[j] === '\\' && j + 1 < n) {
            key += path[j + 1];
            j += 2;
          } else {
            key += path[j];
            j++;
          }
        }
        segs.push(key);
        i = j + 2; // 跳过 ']
      } else {
        let j = i + 1;
        while (j < n && path[j] !== ']') j++;
        const num = path.slice(i + 1, j);
        segs.push(/^-?\d+$/.test(num) ? parseInt(num, 10) : num);
        i = j + 1;
      }
    } else {
      break;
    }
  }
  return segs;
}

/** 祖先路径列表（不含自身），如 $.a.b[0].c → ['$.a','$.a.b','$.a.b[0]'] */
export function pathAncestors(path: string): string[] {
  const segs = parsePath(path);
  const out: string[] = [];
  let cur = '$';
  for (let i = 0; i < segs.length - 1; i++) {
    cur = pathAppend(cur, segs[i]);
    out.push(cur);
  }
  return out;
}
