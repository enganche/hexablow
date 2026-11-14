// Pretty-printer shared by the browser tool and node scripts. Keeps each file's existing style:
// 2-space indent; arrays of plain values stay on one line when the original file did that.
(function (g) {
  const isPrim = (v) => v === null || typeof v !== 'object';

  /** True when the original text keeps arrays of plain values on one line (e.g. "order": ["a", "b"]). */
  function detectInline(text) {
    return /:\s*\[[^\[\]{}\n]*\S[^\[\]{}\n]*\]/.test(text || '');
  }

  function stringify(v, inlineArrays, indent) {
    indent = indent || '';
    const next = indent + '  ';
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      if (inlineArrays && v.every(isPrim)) return '[' + v.map((x) => JSON.stringify(x)).join(', ') + ']';
      return '[\n' + v.map((x) => next + stringify(x, inlineArrays, next)).join(',\n') + '\n' + indent + ']';
    }
    if (v && typeof v === 'object') {
      const keys = Object.keys(v);
      if (!keys.length) return '{}';
      return '{\n' + keys.map((k) => next + JSON.stringify(k) + ': ' + stringify(v[k], inlineArrays, next)).join(',\n') + '\n' + indent + '}';
    }
    return JSON.stringify(v);
  }

  g.CfgFormat = { detectInline, stringify: (v, inlineArrays) => stringify(v, inlineArrays) + '\n' };
})(typeof window !== 'undefined' ? window : globalThis);
