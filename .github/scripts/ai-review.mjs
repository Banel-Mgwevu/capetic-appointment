// AI pull-request reviewer, powered by GitHub Models (free with any GitHub
// account; authenticates with the workflow's GITHUB_TOKEN, no API key needed).
//
// 1. Fetches the PR's changed files and annotates each patch with new-file line numbers.
// 2. Asks the model for a structured JSON review.
// 3. Posts it as a real PR review with inline comments on the exact lines.
//
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, AI_REVIEW_MODEL (optional),
//      AI_REVIEW_BLOCKING ("true" fails the check on critical findings).

import { appendFileSync } from 'node:fs';

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const prNumber = Number(process.env.PR_NUMBER);
const models = [process.env.AI_REVIEW_MODEL || 'openai/gpt-4.1', 'openai/gpt-4.1-mini'];
const blocking = process.env.AI_REVIEW_BLOCKING === 'true';

// Free-tier GitHub Models requests are capped at ~8k input tokens, so the diff
// we send is budgeted in characters (~4 chars per token) after the prompt.
const DIFF_BUDGET_CHARS = 18_000;
const MAX_INLINE_COMMENTS = 12;
const MARKER = '<!-- ai-review -->';

const IGNORED = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)dist\//,
  /\.(png|jpe?g|gif|ico|webp|svg|woff2?|ttf|pdf|db)$/i,
  /\.min\.(js|css)$/,
  /\.snap$/,
];

if (!token || !repo || !prNumber) {
  console.error('GITHUB_TOKEN, GITHUB_REPOSITORY and PR_NUMBER are required.');
  process.exit(1);
}

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function listFiles() {
  const files = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`/pulls/${prNumber}/files?per_page=100&page=${page}`);
    files.push(...batch);
    if (batch.length < 100) break;
  }
  return files;
}

/** Prefixes each patch line with its new-file line number and returns the commentable lines. */
function annotatePatch(patch) {
  const out = [];
  const commentable = new Set();
  let newLine = 0;
  for (const line of patch.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      out.push(line);
    } else if (line.startsWith('-')) {
      out.push(`     ${line}`);
    } else if (line.startsWith('\\')) {
      out.push(line);
    } else {
      commentable.add(newLine);
      out.push(`${String(newLine).padStart(4)} ${line}`);
      newLine++;
    }
  }
  return { text: out.join('\n'), commentable };
}

function buildDiff(files) {
  const included = [];
  const skipped = [];
  const commentableByFile = new Map();
  let used = 0;
  // Source before tests/config so the budget goes to what matters most.
  const rank = (f) => (/\/(src)\//.test(f.filename) ? 0 : /test|spec|e2e/.test(f.filename) ? 1 : 2);
  for (const f of [...files].sort((a, b) => rank(a) - rank(b))) {
    if (!f.patch || IGNORED.some((re) => re.test(f.filename))) {
      skipped.push(f.filename);
      continue;
    }
    const { text, commentable } = annotatePatch(f.patch);
    const chunk = `### ${f.filename} (${f.status})\n${text}\n`;
    if (used + chunk.length > DIFF_BUDGET_CHARS) {
      skipped.push(f.filename);
      continue;
    }
    used += chunk.length;
    included.push(chunk);
    commentableByFile.set(f.filename, commentable);
  }
  return { diff: included.join('\n'), skipped, commentableByFile };
}

const SYSTEM_PROMPT = `You are a senior engineer reviewing a pull request for a bank branch appointment
booking system (Node.js 22 + TypeScript, Express, better-sqlite3, React 18, Vitest, Playwright).
It handles customer personal information under South Africa's POPIA, staff admin auth, and booking
capacity under concurrency.

Review ONLY the diff. Prioritise, in order: correctness bugs, security (injection, authz, secrets,
token handling), personal-data leaks or POPIA concerns, concurrency/transaction issues, missing tests
for risky logic, then maintainability. Do not nitpick formatting or style a linter would catch.
Do not invent problems: if the change looks good, say so and return few or no findings.

Each diff line is prefixed with its line number in the NEW file. Use those numbers for "line".

Respond with JSON only, matching:
{
  "summary": "2-4 sentence overview of what the PR does and its overall quality",
  "verdict": "approve" | "comment" | "request_changes",
  "score": 1-10,
  "highlights": ["short positive observations"],
  "findings": [
    {
      "file": "path exactly as shown after ###",
      "line": 123,
      "severity": "critical" | "major" | "minor" | "nit",
      "category": "bug" | "security" | "privacy" | "performance" | "tests" | "maintainability",
      "title": "short title",
      "body": "what is wrong and why it matters",
      "suggestion": "optional replacement code for that line, or empty string"
    }
  ]
}`;

async function callModel(model, userPrompt) {
  const res = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${model}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

const SEVERITY_ICON = { critical: '🛑', major: '🔶', minor: '🔹', nit: '💭' };
const VERDICT_LABEL = {
  approve: '✅ Looks good to merge',
  comment: '💬 Mergeable, with comments',
  request_changes: '🛑 Changes recommended',
};

function summary(name, value) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${name}\n${value}\n`);
}

async function main() {
  const pr = await gh(`/pulls/${prNumber}`);
  const files = await listFiles();
  const { diff, skipped, commentableByFile } = buildDiff(files);

  if (!diff) {
    console.log('Nothing reviewable in this PR (only lockfiles/binaries/generated files).');
    return;
  }

  const userPrompt = [
    `PR #${pr.number}: ${pr.title}`,
    `Merging ${pr.head.ref} -> ${pr.base.ref}`,
    pr.body ? `Description:\n${pr.body.slice(0, 1500)}` : '',
    skipped.length ? `(Not shown due to size or file type: ${skipped.length} file(s).)` : '',
    '',
    diff,
  ].join('\n');

  let review;
  let usedModel;
  const errors = [];
  for (const model of models) {
    try {
      review = await callModel(model, userPrompt);
      usedModel = model;
      break;
    } catch (err) {
      errors.push(err.message);
      console.warn(`Model attempt failed: ${err.message}`);
    }
  }
  if (!review) {
    // Rate limits on the free tier shouldn't block a merge; report and move on.
    console.log(`::warning::AI review unavailable: ${errors.join(' | ')}`);
    summary('### 🤖 AI review', 'Skipped: GitHub Models was unavailable or rate-limited. Re-run later or comment `/ai-review`.');
    return;
  }

  const findings = Array.isArray(review.findings) ? review.findings : [];
  const inline = [];
  const general = [];
  for (const f of findings) {
    const lines = commentableByFile.get(f.file);
    const body =
      `${SEVERITY_ICON[f.severity] ?? '🔹'} **${f.title}** · _${f.severity} · ${f.category}_\n\n${f.body}` +
      (f.suggestion ? `\n\n\`\`\`suggestion\n${f.suggestion}\n\`\`\`` : '');
    if (lines?.has(Number(f.line)) && inline.length < MAX_INLINE_COMMENTS) {
      inline.push({ path: f.file, line: Number(f.line), side: 'RIGHT', body });
    } else {
      general.push(`- \`${f.file}${f.line ? `:${f.line}` : ''}\` ${body.replace(/\n\n/g, ' ')}`);
    }
  }

  const counts = ['critical', 'major', 'minor', 'nit']
    .map((s) => [s, findings.filter((f) => f.severity === s).length])
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${SEVERITY_ICON[s]} ${n} ${s}`)
    .join(' · ');

  const reviewBody = [
    MARKER,
    `## 🤖 AI Code Review: ${VERDICT_LABEL[review.verdict] ?? VERDICT_LABEL.comment}`,
    '',
    `**Score:** ${review.score ?? '?'}/10${counts ? ` · ${counts}` : ' · no issues found'}`,
    '',
    review.summary ?? '',
    review.highlights?.length ? `\n**What's good**\n${review.highlights.map((h) => `- ${h}`).join('\n')}` : '',
    general.length ? `\n**Other findings**\n${general.join('\n')}` : '',
    skipped.length
      ? `\n<details><summary>${skipped.length} file(s) not reviewed (size budget or file type)</summary>\n\n${skipped.map((s) => `- \`${s}\``).join('\n')}\n</details>`
      : '',
    `\n<sub>Model: \`${usedModel}\` via GitHub Models · commit ${pr.head.sha.slice(0, 7)} · AI suggestions can be wrong; use judgment. Comment \`/ai-review\` to re-run.</sub>`,
  ]
    .filter(Boolean)
    .join('\n');

  // Inline comments can be rejected if a line falls outside the diff; fall back to body-only.
  try {
    await gh(`/pulls/${prNumber}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ commit_id: pr.head.sha, event: 'COMMENT', body: reviewBody, comments: inline }),
    });
  } catch (err) {
    console.warn(`Inline review failed (${err.message}); posting summary only.`);
    const extra = inline.map((c) => `- \`${c.path}:${c.line}\` ${c.body.replace(/\n\n/g, ' ')}`).join('\n');
    await gh(`/pulls/${prNumber}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ commit_id: pr.head.sha, event: 'COMMENT', body: `${reviewBody}\n\n${extra}` }),
    });
  }

  summary('### 🤖 AI review', `${VERDICT_LABEL[review.verdict] ?? ''} · score ${review.score}/10 · ${counts || 'no issues'}`);
  console.log(`Posted review: ${findings.length} finding(s), ${inline.length} inline.`);

  const critical = findings.filter((f) => f.severity === 'critical').length;
  if (blocking && critical > 0) {
    console.log(`::error::AI review found ${critical} critical issue(s).`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
