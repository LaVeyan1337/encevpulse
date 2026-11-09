import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:tsx|jsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function openingTags(source, tagName) {
  const tags = [];
  const token = '<' + tagName;
  let cursor = 0;
  while ((cursor = source.indexOf(token, cursor)) !== -1) {
    const next = source[cursor + token.length];
    if (next && !/[\s/>]/.test(next)) {
      cursor += token.length;
      continue;
    }

    let index = cursor + token.length;
    let expressionDepth = 0;
    let quote = null;
    let escaped = false;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === "'" || character === '"' || character === '\`') {
        quote = character;
        continue;
      }
      if (character === '{') expressionDepth += 1;
      else if (character === '}') expressionDepth -= 1;
      else if (character === '>' && expressionDepth === 0) break;
    }
    if (index < source.length) {
      tags.push({
        raw: source.slice(cursor, index + 1),
        line: source.slice(0, cursor).split('\n').length,
      });
      cursor = index + 1;
    } else {
      break;
    }
  }
  return tags;
}

test('web arayüzündeki buton ve bağlantılar boş veya yer tutucu kontrol olarak bırakılmaz', async () => {
  const root = fileURLToPath(new URL('../app/', import.meta.url));
  const files = await sourceFiles(root);
  const findings = [];
  let buttonCount = 0;
  let anchorCount = 0;

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const fileName = relative(root, file);

    for (const element of openingTags(source, 'button')) {
      buttonCount += 1;
      const tag = element.raw;
      const hasAction = /\bonClick\s*=/.test(tag) || /\bonClickCapture\s*=/.test(tag);
      const submitsForm = /\btype\s*=\s*(?:["']submit["']|\{\s*["']submit["']\s*\})/.test(tag);
      const linkedToForm = /\bform\s*=/.test(tag);
      const intentionallyDisabled = /\bdisabled(?:\s|=|\/|>)/.test(tag);

      if (!hasAction && !submitsForm && !linkedToForm && !intentionallyDisabled) {
        findings.push(fileName + ':' + element.line + ' button has no action, submit behavior, or disabled state');
      }
      if (/\bonClick\s*=\s*\{\s*(?:undefined|null|false|\(\s*\)\s*=>\s*(?:\{\s*\}|undefined|null|false))\s*\}/.test(tag)) {
        findings.push(fileName + ':' + element.line + ' button has an empty/no-op click handler');
      }
    }

    for (const element of openingTags(source, 'a')) {
      anchorCount += 1;
      const tag = element.raw;
      const href = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["']([^"']*)["']\s*\})/);
      if (!/\bhref\s*=/.test(tag)) {
        findings.push(fileName + ':' + element.line + ' anchor has no href');
      } else if (href && ['#', '', 'javascript:'].includes((href[1] ?? href[2] ?? href[3] ?? '').trim().toLowerCase())) {
        findings.push(fileName + ':' + element.line + ' anchor uses a placeholder destination');
      }
    }

    // Clickable generic containers must either be explicitly hidden from assistive
    // technology (e.g. a pointer-only backdrop) or expose keyboard button semantics.
    for (const element of openingTags(source, 'div')) {
      const tag = element.raw;
      if (!/\bonClick\s*=/.test(tag)) continue;
      const decorativeBackdrop = /\baria-hidden\s*=\s*["']true["']/.test(tag);
      const keyboardButton = /\brole\s*=\s*["']button["']/.test(tag)
        && /\btabIndex\s*=\s*\{?\s*0\s*\}?/.test(tag)
        && /\bonKeyDown\s*=/.test(tag);
      if (!decorativeBackdrop && !keyboardButton) {
        findings.push(fileName + ':' + element.line + ' clickable div has no keyboard-accessible button semantics');
      }
    }

    for (const element of openingTags(source, 'tr')) {
      const tag = element.raw;
      if (!/\bonClick\s*=/.test(tag)) continue;
      const focusable = /\btabIndex\s*=\s*\{?\s*0\s*\}?/.test(tag);
      const keyboardHandler = /\bonKeyDown\s*=/.test(tag);
      const supportsEnter = /\.key\s*===\s*['"]Enter['"]/.test(tag);
      const supportsSpace = /\.key\s*===\s*['"] ['"]/.test(tag);
      if (!focusable || !keyboardHandler || !supportsEnter || !supportsSpace) {
        findings.push(fileName + ':' + element.line + ' clickable table row lacks complete keyboard activation');
      }
    }
  }

  assert.deepEqual(findings, [], findings.join('\n'));
  assert.ok(buttonCount > 0, 'at least one button should be audited');
  assert.ok(anchorCount > 0, 'at least one link should be audited');
});
