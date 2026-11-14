const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SRC = path.join(DIR, 'artifact.html');
const QA = path.join(DIR, '_qa');
fs.mkdirSync(QA, { recursive: true });
const WRAP = path.join(QA, 'wrapped.html');
const body = fs.readFileSync(SRC, 'utf8');
fs.writeFileSync(WRAP, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>' + body + '</body></html>');
const URL = 'file://' + WRAP;
const SECTIONS = ['hero', 'why', 'incidents', 'questions', 'connect', 'sentinel', 'verdict', 'scorer', 'checklist', 'exercise', 'glossary', 'sources'];
const ALLOWED_LATIN = new Set(('GitHub LobeHub Claude Code pnpm curl npm OpenAI Anthropic Google Docker Redis PostgreSQL MCP API VPN SECURITY LICENSE README Security Actions OAuth XSS RCE SSRF CVE CVSS CISA Wiz Semgrep Aikido Check Point Research Palo Alto Networks Unit OWASP EFF Model Context Protocol Electronic Frontier Foundation Manual Pro Max Ultra Free Team Enterprise ZIP Mac Ctrl Cookie Grafana MinIO Casdoor Logto Desktop Cloud postinstall prepare lockfile fork xz utils chalk debug Shai Hulud Report Vulnerability Authorize Revoke Settings').split(' '));

const results = [];
function log(ok, msg) { results.push((ok ? 'PASS ' : 'FAIL ') + msg); }

(async () => {
  const browser = await chromium.launch();
  for (const width of [400, 1280]) {
    for (const scheme of ['light', 'dark']) {
      for (const lang of ['en', 'zh']) {
        const tag = `${width}-${scheme}-${lang}`;
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: scheme, locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
        await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
        await ctx.addInitScript(() => {
          window.__copied = [];
          try {
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s) => { window.__copied.push(s); return window.__failCopy ? Promise.reject(new Error('no')) : Promise.resolve(); } } });
          } catch (e) {}
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto(URL);
        await page.waitForTimeout(200);

        const info = await page.evaluate((S) => ({
          lang: document.documentElement.lang,
          sw: document.documentElement.scrollWidth, iw: innerWidth,
          bodySw: document.body.scrollWidth,
          empty: S.filter(id => { const el = document.getElementById(id); return !el || el.innerText.trim().length < 60; }),
          bg: getComputedStyle(document.body).backgroundColor,
          wide: [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 && !el.closest('.table-wrap, pre, .nav ul') && r.width > 0; }).slice(0, 5).map(el => el.tagName + '.' + el.className + ' ' + Math.round(el.getBoundingClientRect().right)),
        }), SECTIONS);
        log(info.lang === (lang === 'zh' ? 'zh-Hans' : 'en'), `${tag} html lang=${info.lang}`);
        log(info.sw <= info.iw, `${tag} no horizontal scroll (scrollWidth ${info.sw} <= ${info.iw})`);
        log(info.wide.length === 0, `${tag} nothing past the right edge ${JSON.stringify(info.wide)}`);
        log(info.empty.length === 0, `${tag} all sections non-empty ${JSON.stringify(info.empty)}`);
        log(true, `${tag} body bg ${info.bg}`);

        if (lang === 'zh') {
          const latin = await page.evaluate(() => {
            const out = {};
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let n;
            while ((n = w.nextNode())) {
              const p = n.parentElement;
              if (!p || p.closest('script, style, noscript, code, pre, [lang="en"], .sr-only, .adv-wrap, .src-list, .mini-links, .evidence, .c-where')) continue;
              if (!p.offsetParent && getComputedStyle(p).position !== 'fixed') continue;
              (n.textContent.match(/[A-Za-z][A-Za-z-]{3,}/g) || []).forEach(x => { out[x] = (out[x] || 0) + 1; });
            }
            return out;
          });
          const bad = Object.keys(latin).filter(x => !x.split('-').every(p => ALLOWED_LATIN.has(p)));
          log(true, `${tag} Latin words in ZH prose outside code/sources (review): ${bad.join(', ')}`);
        }

        if (width === 1280 && scheme === 'light' && lang === 'en') {
          // toggle keeps scroll position and switches text
          await page.evaluate(() => document.getElementById('verdict').scrollIntoView({ behavior: 'instant' }));
          await page.waitForTimeout(100);
          const before = await page.evaluate(() => ({ top: document.getElementById('verdict').getBoundingClientRect().top, h2: document.getElementById('verdict-title').textContent }));
          await page.click('#lang-zh');
          const after = await page.evaluate(() => ({ top: document.getElementById('verdict').getBoundingClientRect().top, h2: document.getElementById('verdict-title').textContent, lang: document.documentElement.lang, pressed: document.getElementById('lang-zh').getAttribute('aria-pressed') }));
          log(after.lang === 'zh-Hans' && after.h2 !== before.h2 && after.pressed === 'true', `${tag} toggle to 中文: lang ${after.lang}, h2 "${after.h2}"`);
          log(Math.abs(after.top - before.top) < 30, `${tag} toggle keeps scroll (verdict top ${Math.round(before.top)} -> ${Math.round(after.top)})`);
          await page.click('#lang-en');

          // copy
          await page.click('#copy-install');
          await page.waitForTimeout(50);
          const c1 = await page.evaluate(() => ({ copied: window.__copied.slice(-1)[0] || '', btn: document.getElementById('copy-install').textContent }));
          log(/^Check this repository/.test(c1.copied) && c1.btn === 'Copied', `${tag} copy prompt EN -> "${c1.copied.slice(0, 40)}…", button "${c1.btn}"`);
          await page.click('#lang-zh');
          await page.click('#copy-share');
          await page.waitForTimeout(50);
          const c2 = await page.evaluate(() => window.__copied.slice(-1)[0] || '');
          log(/[一-鿿]/.test(c2), `${tag} copy prompt in ZH copies Chinese: "${c2.slice(0, 20)}…"`);
          await page.evaluate(() => { window.__failCopy = true; });
          await page.click('#copy-connect');
          await page.waitForTimeout(50);
          const c3 = await page.evaluate(() => ({ sel: String(window.getSelection()).slice(0, 20), status: document.querySelector('#prompt-card-connect .copy-status').textContent }));
          log(c3.sel.length > 0 && c3.status.length > 0, `${tag} copy fallback selects text: "${c3.sel}…", status "${c3.status}"`);
          await page.click('#lang-en');

          // scorer
          const s0 = await page.evaluate(() => ({ o: document.getElementById('scorer-verdict').dataset.outcome, badge: !document.getElementById('scorer-example').hidden, proj: document.getElementById('scorer-project').value }));
          log(s0.o === 'stop' && s0.badge && s0.proj.includes('lobehub'), `${tag} scorer opens with LobeHub example: ${JSON.stringify(s0)}`);
          await page.click('#scorer-reset');
          const s1 = await page.evaluate(() => document.getElementById('scorer-verdict').dataset.outcome);
          log(s1 === 'empty', `${tag} scorer reset -> ${s1}`);
          for (let n = 1; n <= 7; n++) await page.click(`label[for="score-q${n}-ok"]`);
          const s2 = await page.evaluate(() => document.getElementById('scorer-verdict').dataset.outcome);
          await page.click('label[for="score-q3-low"]');
          const s2b = await page.evaluate(() => document.getElementById('scorer-verdict').dataset.outcome);
          await page.click('label[for="score-q4-medium"]');
          const s3 = await page.evaluate(() => document.getElementById('scorer-verdict').dataset.outcome);
          await page.click('label[for="score-q2-not_checked"]');
          const s3b = await page.evaluate(() => document.getElementById('scorer-verdict').dataset.outcome);
          await page.click('label[for="score-q5-high"]');
          const s4 = await page.evaluate(() => ({ o: document.getElementById('scorer-verdict').dataset.outcome, text: document.getElementById('scorer-verdict').innerText.replace(/\s+/g, ' ').slice(0, 120) }));
          log(s2 === 'ok' && s2b === 'ok' && s3 === 'caution' && s3b === 'caution' && s4.o === 'stop', `${tag} scorer outcomes all-OK=${s2}, +Low=${s2b}, +Medium=${s3}, +not checked=${s3b}, +High=${s4.o} | ${s4.text}`);
          await page.fill('#scorer-project', 'acme/widget');
          await page.fill('#scorer-notes', 'test note');
          // checklist
          await page.check('#check-official-link');
          await page.check('#check-no-pipe');
          const k1 = await page.textContent('#checklist-progress');
          log(k1 === '2 of 10 done', `${tag} checklist progress "${k1}"`);
          await page.reload();
          await page.waitForTimeout(150);
          const r = await page.evaluate(() => ({
            o: document.getElementById('scorer-verdict').dataset.outcome,
            q5: document.getElementById('score-q5-high').checked,
            q4: document.getElementById('score-q4-medium').checked,
            proj: document.getElementById('scorer-project').value, notes: document.getElementById('scorer-notes').value,
            badge: !document.getElementById('scorer-example').hidden,
            ck: document.getElementById('check-no-pipe').checked, prog: document.getElementById('checklist-progress').textContent,
            lang: document.documentElement.lang
          }));
          log(r.o === 'stop' && r.q5 && r.q4 && r.proj === 'acme/widget' && r.notes === 'test note' && !r.badge && r.ck && r.prog === '2 of 10 done', `${tag} reload keeps scorer + checklist ${JSON.stringify(r)}`);
          // language persisted then toggle state kept
          await page.click('#lang-zh');
          const r2 = await page.evaluate(() => ({ q5: document.getElementById('score-q5-high').checked, proj: document.getElementById('scorer-project').value, prog: document.getElementById('checklist-progress').textContent }));
          log(r2.q5 && r2.proj === 'acme/widget', `${tag} switching language keeps scorer/checklist ${JSON.stringify(r2)}`);
          await page.reload();
          const l3 = await page.evaluate(() => document.documentElement.lang);
          log(l3 === 'zh-Hans', `${tag} language choice remembered after reload (${l3})`);
          // load example
          await page.click('#scorer-load-example');
          const r3 = await page.evaluate(() => ({ o: document.getElementById('scorer-verdict').dataset.outcome, badge: !document.getElementById('scorer-example').hidden, notes: document.getElementById('scorer-notes').value.slice(0, 12) }));
          log(r3.o === 'stop' && r3.badge, `${tag} load example ${JSON.stringify(r3)}`);
          await page.click('#lang-en');
          await page.click('#scorer-reset');
          await page.click('#checklist-clear');
        }

        // screenshots
        if (['400-light-en', '1280-dark-zh', '1280-light-en', '400-dark-zh'].includes(tag)) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(QA, `shot-${tag}-top.png`) });
          for (const id of ['why', 'questions', 'connect', 'scorer']) {
            await page.evaluate((id) => { const el = document.getElementById(id); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 60, behavior: 'instant' }); }, id);
            await page.waitForTimeout(50);
            await page.screenshot({ path: path.join(QA, `shot-${tag}-${id}.png`) });
          }
          if (tag === '1280-light-en') await page.screenshot({ path: path.join(QA, `shot-${tag}-full.png`), fullPage: true });
        }
        log(errors.length === 0, `${tag} console errors: ${JSON.stringify(errors)}`);
        await ctx.close();
      }
    }
  }
  // no localStorage at all
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL);
  const ok = await p.evaluate(() => document.querySelectorAll('#main section').length);
  await p.click('label[for="score-q1-high"]');
  log(ok === 12 && errs.length === 0, `storage blocked: ${ok} sections, errors ${JSON.stringify(errs)}`);
  await browser.close();
  console.log(results.join('\n'));
  console.log('\n' + results.filter(r => r.startsWith('FAIL')).length + ' failures');
})();
