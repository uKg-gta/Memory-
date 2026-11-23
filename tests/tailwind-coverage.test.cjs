'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const generatedCommand = [
  '--yes',
  'tailwindcss@3.4.17',
  '-c', 'tailwind.config.cjs',
  '-i', './src/tailwind.css',
  '-o'
];

const NON_UTILITY_CLASSES = new Map([
  ['group', 'Tailwind group marker used by group-* variants; the generated selector belongs to descendants.'],
  ['dark', 'Theme-state marker toggled on the root element; dark:* variants generate the actual utility selectors.'],
  ['drag-handle', 'Application drag-interaction hook; its appearance is defined by the custom stylesheet in index.html.'],
  ['fmt-btn', 'Formatting-toolbar event hook; visual styling comes from the utility classes on the same button.']
]);

function sourceFiles() {
  return [
    path.join(root, 'index.html'),
    path.join(root, 'app.js'),
    ...fs.readdirSync(root)
      .filter(name => /^note-.*\\.js$/.test(name))
      .sort()
      .map(name => path.join(root, name))
  ];
}

function collectClassTokens(source) {
  const tokens = new Set();
  const add = value => {
    // Dynamic template expressions are runtime values, not literal class names.
    const staticValue = value.replace(/\\$\\{[^{}]*\\}/g, ' ');
    for (const token of staticValue.split(/\\s+/)) {
      if (token && !token.includes('${')) tokens.add(token);
    }
  };

  // HTML class attributes and JS className string assignments, including template markup.
  const assignment = /\\bclass(?:Name)?\\s*=\\s*(["'`])([\\s\\S]*?)\\1/g;
  for (const match of source.matchAll(assignment)) add(match[2]);

  // Explicit classList operations also carry literal class strings in JavaScript.
  const classList = /\\.classList\\.(?:add|remove|toggle|contains)\\s*\\(\\s*(["'`])([^"'`]+)\\1/g;
  for (const match of source.matchAll(classList)) add(match[2]);

  return tokens;
}

function customCssClasses(indexHtml, tailwindInput) {
  const styleBlocks = [...indexHtml.matchAll(/<style\\b[^>]*>([\\s\\S]*?)<\\/style>/gi)]
    .map(match => match[1]);
  const classes = new Set();
  for (const css of [...styleBlocks, tailwindInput]) {
    for (const match of css.matchAll(/\\.([A-Za-z_][\\w-]*)/g)) classes.add(match[1]);
  }
  return classes;
}

function escapeTailwindSelector(token) {
  const escaped = new Set(['\\\\', ':', '/', '[', ']', '.', '(', ')', '%']);
  return [...token].map(character => escaped.has(character) ? '\\\\' + character : character).join('');
}

test('every literal source class has a generated Tailwind selector and committed CSS is current', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-tailwind-'));
  const generatedPath = path.join(tempDir, 'tailwind.css');
  try {
    const result = spawnSync('npx', [...generatedCommand, generatedPath, '--minify'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 120000
    });
    assert.equal(result.status, 0,
      'Tailwind 3.4.17 build failed.\\n' + (result.stdout || '') + (result.stderr || ''));

    const generatedCss = fs.readFileSync(generatedPath, 'utf8');
    const committedCss = fs.readFileSync(path.join(root, 'tailwind.css'), 'utf8');
    const sources = sourceFiles();
    const sourceContents = sources.map(file => fs.readFileSync(file, 'utf8'));
    const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const tailwindInput = fs.readFileSync(path.join(root, 'src/tailwind.css'), 'utf8');
    const customClasses = customCssClasses(indexHtml, tailwindInput);
    const tokens = new Set(sourceContents.flatMap(source => [...collectClassTokens(source)]));
    const missing = [...tokens]
      .filter(token => !token.includes('${'))
      .filter(token => !customClasses.has(token))
      .filter(token => !NON_UTILITY_CLASSES.has(token))
      .filter(token => !generatedCss.includes('.' + escapeTailwindSelector(token)))
      .sort();

    assert.deepEqual(missing, [], 'Missing generated Tailwind selectors for source classes:\\n' + missing.join('\\n'));
    assert.equal(committedCss, generatedCss,
      'Committed tailwind.css differs from a fresh Tailwind 3.4.17 build. Commit the regenerated stylesheet.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
