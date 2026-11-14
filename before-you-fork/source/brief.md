# Brief: "Before You Fork" bilingual workshop page

## Purpose
A single published web page (Claude artifact) for a team meeting run as a cybersecurity workshop. Audience: a finance
team new to GitHub, bilingual English / 中文. The ask, in summary: not installing the project, but learning what
security checks to do before you fork or download any project from the internet, covering API connections, AI tools
that write code to your computer, hiding your IP address from strangers, and using Claude as a sentinel before
giving out sensitive information. LobeHub (github.com/lobehub/lobehub, v2.3.2) is the worked example.

Not investment or security-consulting advice: an educational guide. Say so in the footer, both languages.

## Sources the teams use
- research_security.json (Team 1): LobeHub findings per question, advisories, incidents, with sources.
- research_connect.json (Team 2): API keys, OAuth, AI agents, IP and identity, Claude as sentinel, with sources.
- The English slide deck already presented (content reference, may be improved):
  /tmp/claude-0/-home-user/ab89d745-cc63-5828-9f1d-4c696f4a6c91/scratchpad/deck/project/slides/*.html
  (order in ../deck.json). Speaker notes are in each slide's <aside>.
- Deck link (to cite on the page): https://claude.ai/artifact/Rd2hnhQkq7jYrh2vRNeiGB

## Page outline (sections, in order; each has an anchor id)
1. hero: title, one-line promise, "10 minutes, 7 questions, any project", meta (checked 11 Nov 2026, LobeHub v2.3.2).
2. why: four stages Browse → Download → Install & run → Connect, with risk level; "check between step 2 and 3".
3. incidents: three real cases (xz-utils, chalk/debug, Shai-Hulud; + Shai-Hulud 2.0 if Team 1 confirms), dated, sourced.
4. questions: the 7 questions. Each card: question, what to check, why it matters, how to stay safe, and
   "In LobeHub" finding with severity pill (OK / Low / Medium / High) and evidence file path.
5. connect: Connecting safely. Sub-parts: API keys (one per tool, spending cap, least access, never in chat/code,
   revoke when leaked; OpenAI/Anthropic specifics from Team 2); app permissions (OAuth review/revoke URLs);
   AI agents that write code / run commands (approvals, one folder, trusted plugins, fork Actions off);
   IP and identity table (where / what strangers see / what to do: VPN caveat, open ports, GitHub email privacy,
   screenshots and logs).
6. sentinel: Claude as sentinel — three copyable prompts (before you install / share / connect), each in English
   and Chinese versions (the copy button copies the version in the current language), plus the caution: pasted
   text goes to the AI service; remove known secrets first; second pair of eyes, not a guarantee.
7. verdict: LobeHub scorecard table and the team recommendation (hosted app or official desktop release; don't build
   from source on work laptops).
8. scorer: interactive "Score a project" tool: 7 questions × rating (OK/Low/Medium/High/Not checked) + project name
   field + notes; shows an overall verdict; remembered per viewer in localStorage (try/catch); "Reset" button;
   opens pre-filled with LobeHub as a marked example.
9. checklist: 10-step safe install checklist with checkboxes (per-viewer, localStorage).
10. exercise: 15-minute hands-on with timed steps.
11. glossary: 8–10 terms to google, each with a one-line plain definition (EN + 中文 term and definition).
12. sources: every source used, grouped, with date checked.
Footer: educational only, not professional security advice; prepared with Claude Code; both languages.

## Bilingual conventions (the team's usual format)
- Top-right button switches English / 中文; remembers the choice in localStorage (wrapped in try/catch); defaults to
  the browser language (zh* → 中文). Same pattern as /home/user/GL-AI-orders-debt/site/app.js (lines ~40–130) and
  i18n.js: all strings in a dictionary keyed by id, `data-i18n` attributes, `<html lang>` updated on switch.
- Chinese: Simplified, formal and plain (no slang, no internet memes); full-width punctuation in Chinese text;
  a space between Chinese and Latin words/numbers is NOT required but be consistent (prefer none except around
  code); dates as 2026 年 11 月 11 日; keep product and code names in Latin (GitHub, LobeHub, Claude, pnpm, curl);
  terms: supply-chain attack 供应链攻击, phishing 网络钓鱼, lockfile 锁定文件（lockfile）, API key API 密钥,
  port 端口, VPN 虚拟专用网络（VPN）, least privilege 最小权限原则, backdoor 后门, fork 复刻（fork）,
  repository 代码仓库, install script 安装脚本, prompt 提示词, spending limit 消费上限.
- Code, file paths and commands are identical in both languages.

## Artifact page contract (must follow)
- One self-contained .html file. No <!doctype>, <html>, <head>, <body> tags: start with <title>, then
  <meta name="claude:viewport-fit-sides" content="cover">, then <style>, content, <script>.
- <title>: "Before You Fork" (a name, not a summary).
- External resources: scripts only from cdnjs.cloudflare.com (none needed); stylesheets only Google Fonts
  (fonts.googleapis.com, files from fonts.gstatic.com) with real fallback stacks. Include a CJK font
  (e.g. Noto Sans SC) for Chinese. No other network requests, no images from the web, no iframes, no fetch().
- Theme: all colours as CSS custom properties on bare :root (light), redefined under
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...; color-scheme: dark} } and again under
  :root[data-theme="dark"] {...}; body has an explicit background from a token.
- Layout: works at 400px phone width with no horizontal page scroll; side gutter on body:
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  vertical padding with padding-block only. Tables and code blocks scroll inside their own overflow-x:auto box.
  Flex/grid children holding text get min-width:0. Use gap, not margins, between siblings.
- Sticky header (if any) uses top: env(safe-area-inset-top, 0px).
- Copy buttons: navigator.clipboard.writeText inside the click handler, catch rejection, fall back to selecting
  the text. No alert/confirm/prompt dialogs. No print button. No download links.
- localStorage only for per-viewer conveniences (language, scorer, checklist), every access in try/catch;
  the page must render fully without it.
- Visible focus states, prefers-reduced-motion respected, tabular-nums for numbers, form controls with stable ids
  and labels.
- Design: utilitarian-polished, like a field guide / pre-flight checklist; not the generic AI looks (no cream +
  terracotta serif, no purple gradient hero, no emoji section markers, not everything centred). A deliberate
  palette (ink navy, toned paper, one amber warning accent and semantic severity colours with text labels).
  Type: IBM Plex Sans + Noto Sans SC for text, JetBrains Mono for code/labels.
- Severity is never colour alone: each pill has its word.
