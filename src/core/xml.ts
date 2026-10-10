// Minimal, dependency-free XML parser (works in browser and Node).
export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&');
}

export function parseXml(src: string): XmlNode {
  let i = 0;
  const root: XmlNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '<') {
      if (src.startsWith('<!--', i)) {
        const j = src.indexOf('-->', i);
        i = j === -1 ? n : j + 3;
        continue;
      }
      if (src.startsWith('<?', i)) {
        const j = src.indexOf('?>', i);
        i = j === -1 ? n : j + 2;
        continue;
      }
      if (src.startsWith('<!', i)) {
        const j = src.indexOf('>', i);
        i = j === -1 ? n : j + 1;
        continue;
      }
      if (src.startsWith('</', i)) {
        const j = src.indexOf('>', i);
        if (stack.length > 1) stack.pop();
        i = j === -1 ? n : j + 1;
        continue;
      }
      const j = src.indexOf('>', i);
      if (j === -1) break;
      let inner = src.slice(i + 1, j);
      const selfClose = inner.endsWith('/');
      if (selfClose) inner = inner.slice(0, -1);
      const tm = /^([^\s/]+)/.exec(inner);
      const tag = tm ? tm[1] : 'x';
      const attrs: Record<string, string> = {};
      const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let am: RegExpExecArray | null;
      while ((am = re.exec(inner))) attrs[am[1]] = decodeEntities(am[2] ?? am[3] ?? '');
      const node: XmlNode = { tag, attrs, children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      if (!selfClose) stack.push(node);
      i = j + 1;
    } else {
      const j = src.indexOf('<', i);
      const end = j === -1 ? n : j;
      stack[stack.length - 1].text += decodeEntities(src.slice(i, end));
      i = end;
    }
  }
  return root;
}

export function findAll(node: XmlNode, tag: string, out: XmlNode[] = []): XmlNode[] {
  for (const c of node.children) {
    if (c.tag === tag) out.push(c);
    findAll(c, tag, out);
  }
  return out;
}
export function first(node: XmlNode, tag: string): XmlNode | null {
  for (const c of node.children) if (c.tag === tag) return c;
  return null;
}
export function textOf(node: XmlNode | null): string {
  if (!node) return '';
  return node.text.trim();
}
