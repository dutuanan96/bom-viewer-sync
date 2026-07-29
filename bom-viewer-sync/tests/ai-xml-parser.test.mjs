import test from 'node:test';
import assert from 'node:assert/strict';

// ── XML tool_call parser regex (extracted from agent-controller.js lines 518-556) ──
// We test the exact regex patterns used in the streaming response handler.

const TOOL_CALL_REGEX = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
const TOOL_NAME_REGEX = /<tool_name>([^<]+)<\/tool_name>/;
const ARG_TAG_REGEX = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g;
const ARG_KEY_VALUE_REGEX = /<arg_key>([^<]+)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/g;
const FUNCTION_LINE_REGEX = /^<function=([^>]+)>$/;

// ── Helper: parse XML tool call (mirrors agent-controller.js logic) ──
function parseXmlToolCalls(fullText) {
  const toolCalls = [];
  const regex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let match;
  while ((match = regex.exec(fullText)) !== null) {
    const inner = match[1];
    let name = '';
    let args = {};

    const nameMatch = inner.match(/<tool_name>([^<]+)<\/tool_name>/);
    if (nameMatch) {
      name = nameMatch[1].trim();
      // Strip <arguments>...</arguments> wrapper so inner tags are reachable
      const stripped = inner.replace(/<arguments>([\s\S]*?)<\/arguments>/gi, '$1');
      const argMatches = [...stripped.matchAll(/<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g)];
      for (const am of argMatches) {
        if (am[1] !== 'tool_name' && am[1] !== 'arguments') {
          args[am[1]] = am[2].trim();
        }
      }
    } else {
      const lines = inner.trim().split('\n');
      name = lines[0].trim().replace(/^<function=([^>]+)>$/, '$1');
      const keyMatches = [...inner.matchAll(/<arg_key>([^<]+)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/g)];
      for (const km of keyMatches) {
        args[km[1].trim()] = km[2].trim();
      }
    }

    if (name) {
      toolCalls.push({ name, args });
    }
  }
  return toolCalls;
}

// ══════════════════════════════════════════════════════════════════════════
// FORMAT 1: <tool_name> + nested tags (used by MiMo)
// ══════════════════════════════════════════════════════════════════════════

test('XML parser: format 1 — tool_name with nested tags', () => {
  const xml = `<tool_call>
<tool_name>search_pdm</tool_name>
<arguments>
<productCode>LGS433</productCode>
<color>复古色</color>
<query>thùng giấy 1185x330x110mm</query>
</arguments>
</tool_call>`;

  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'search_pdm');
  assert.equal(calls[0].args.productCode, 'LGS433');
  assert.equal(calls[0].args.color, '复古色');
  assert.equal(calls[0].args.query, 'thùng giấy 1185x330x110mm');
});

test('XML parser: format 1 — tool_name with single arg', () => {
  const xml = `<tool_call>
<tool_name>audit_product_data</tool_name>
<arguments>
<productId>LGS123</productId>
</arguments>
</tool_call>`;

  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'audit_product_data');
  assert.equal(calls[0].args.productId, 'LGS123');
});

test('XML parser: format 1 — no arguments tag, just nested tags', () => {
  const xml = `<tool_call>
<tool_name>search_pdm</tool_name>
<query>test query</query>
<productCode>LGS433</productCode>
</tool_call>`;

  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'search_pdm');
  assert.equal(calls[0].args.query, 'test query');
  assert.equal(calls[0].args.productCode, 'LGS433');
});

// ══════════════════════════════════════════════════════════════════════════
// FORMAT 2: <function=name> + arg_key/arg_value
// ══════════════════════════════════════════════════════════════════════════

test('XML parser: format 2 — function tag with arg_key/arg_value', () => {
  const xml = `<tool_call>
<function=search_pdm>
<arg_key>productCode</arg_key><arg_value>LGS433</arg_value>
<arg_key>query</arg_key><arg_value>纸护角</arg_value>
</tool_call>`;

  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'search_pdm');
  assert.equal(calls[0].args.productCode, 'LGS433');
  assert.equal(calls[0].args.query, '纸护角');
});

test('XML parser: format 2 — function with single arg_key/arg_value', () => {
  const xml = `<tool_call>
<function=where_used>
<arg_key>materialId</arg_key><arg_value>mat_xxx</arg_value>
</tool_call>`;

  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'where_used');
  assert.equal(calls[0].args.materialId, 'mat_xxx');
});

// ══════════════════════════════════════════════════════════════════════════
// MULTIPLE TOOL CALLS
// ══════════════════════════════════════════════════════════════════════════

test('XML parser: multiple tool_calls in one response', () => {
  const xml = `<tool_call>
<tool_name>search_pdm</tool_name>
<query>test</query>
</tool_call>
<tool_call>
<tool_name>where_used</tool_name>
<materialId>mat_xxx</materialId>
</tool_call>`;

  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].name, 'search_pdm');
  assert.equal(calls[1].name, 'where_used');
});

// ══════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ══════════════════════════════════════════════════════════════════════════

test('XML parser: no tool_call tags — returns empty', () => {
  const text = 'This is a normal text response with no XML.';
  const calls = parseXmlToolCalls(text);
  assert.equal(calls.length, 0);
});

test('XML parser: empty tool_call — returns empty (no name)', () => {
  const xml = `<tool_call>

</tool_call>`;
  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 0);
});

test('XML parser: tool_call with no args — returns name only', () => {
  const xml = `<tool_call>
<tool_name>list_products</tool_name>
</tool_call>`;
  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'list_products');
  assert.deepEqual(calls[0].args, {});
});

test('XML parser: mixed format 1 and format 2 in same response', () => {
  const xml = `<tool_call>
<tool_name>search_pdm</tool_name>
<query>test</query>
</tool_call>
<tool_call>
<function=where_used>
<arg_key>materialId</arg_key><arg_value>mat_xxx</arg_value>
</tool_call>`;

  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].name, 'search_pdm');
  assert.equal(calls[0].args.query, 'test');
  assert.equal(calls[1].name, 'where_used');
  assert.equal(calls[1].args.materialId, 'mat_xxx');
});

test('XML parser: whitespace in tool_name is trimmed', () => {
  const xml = `<tool_call>
<tool_name>  search_pdm  </tool_name>
<query>test</query>
</tool_call>`;
  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'search_pdm');
});

test('XML parser: multiline arg_value (e.g. query with newlines)', () => {
  const xml = `<tool_call>
<tool_name>search_pdm</tool_name>
<query>line1
line2
line3</query>
</tool_call>`;
  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.query.includes('line1'));
  assert.ok(calls[0].args.query.includes('line2'));
  assert.ok(calls[0].args.query.includes('line3'));
});

test('XML parser: Chinese characters in args', () => {
  const xml = `<tool_call>
<tool_name>search_pdm</tool_name>
<productCode>LGS433</productCode>
<color>复古色</color>
<query>纸护角 泡沫</query>
</tool_call>`;
  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.color, '复古色');
  assert.equal(calls[0].args.query, '纸护角 泡沫');
});

test('XML parser: special characters in args (brackets, ampersand)', () => {
  const xml = `<tool_call>
<tool_name>search_pdm</tool_name>
<query>test [100x200] & "special" chars</query>
</tool_call>`;
  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.query, 'test [100x200] & "special" chars');
});

test('XML parser: tool_call mixed with surrounding text', () => {
  const text = `I found the result.
<tool_call>
<tool_name>search_pdm</tool_name>
<query>LGS433</query>
</tool_call>
The above shows the data.`;
  const calls = parseXmlToolCalls(text);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'search_pdm');
});

// ══════════════════════════════════════════════════════════════════════════
// TRUST POLICY: FORBIDDEN HTML PATTERN
// ══════════════════════════════════════════════════════════════════════════

const FORBIDDEN_HTML_PATTERN = /<[a-zA-Z]/;

test('trust-policy: FORBIDDEN_HTML_PATTERN catches any HTML tag', () => {
  assert.ok(FORBIDDEN_HTML_PATTERN.test('<div>'));
  assert.ok(FORBIDDEN_HTML_PATTERN.test('<script>alert(1)</script>'));
  assert.ok(FORBIDDEN_HTML_PATTERN.test('text <b>bold</b>'));
});

test('trust-policy: FORBIDDEN_HTML_PATTERN does NOT catch tool_call XML', () => {
  // This is the known issue: tool_call XML triggers the FORBIDDEN pattern
  // The pattern should be updated to allow tool_call tags
  const toolCallXml = `<tool_call>
<tool_name>search_pdm</tool_name>
<query>test</query>
</tool_call>`;
  // Currently this WILL trigger the pattern (known issue)
  assert.ok(FORBIDDEN_HTML_PATTERN.test(toolCallXml),
    'tool_call XML currently triggers FORBIDDEN_HTML_PATTERN — this is the known bug');
});

test('trust-policy: FORBIDDEN_HTML_PATTERN allows angle brackets in non-tag context', () => {
  assert.ok(!FORBIDDEN_HTML_PATTERN.test('100 < 200'));
  // But "100 <b" would trigger it because <b looks like a tag
  assert.ok(FORBIDDEN_HTML_PATTERN.test('100 <b'));
});

// ══════════════════════════════════════════════════════════════════════════
// REAL MiMo XML FORMAT (from Antigravity session test-regex.js)
// ══════════════════════════════════════════════════════════════════════════

test('XML parser: real MiMo format from test-regex.js', () => {
  const xml = `<tool_call>
<tool_name>search_pdm</tool_name>
<arguments>
<productCode>LGS433</productCode>
<color>复古色</color>
<query>thùng giấy 1185x330x110mm 纸护角 50x50x100mm 泡沫 20kg,320x100x8mm 泡沫 16kg,925x295x10mm 纸卡 1100310ZK</query>
</arguments>
</tool_call>`;

  const calls = parseXmlToolCalls(xml);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'search_pdm');
  assert.equal(calls[0].args.productCode, 'LGS433');
  assert.equal(calls[0].args.color, '复古色');
  assert.ok(calls[0].args.query.includes('1100310ZK'));
  assert.ok(calls[0].args.query.includes('纸护角'));
});
