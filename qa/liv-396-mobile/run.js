'use strict';

/**
 * Runner pro LIV-396 - mobile view provereni rizikovosti osob na realnych
 * zarizenich BrowserStack Automate.
 *
 * Zarizeni bezi JEDNO PO DRUHEM (ne paralelne) - staging se kazde ~3 minuty
 * odhlasuje a soubezne session si navzajem shazuji sezeni.
 *
 * Spusteni:
 *   npm install
 *   node preflight.js
 *   node run.js
 *
 * Promenne prostredi - viz README.md. Zadna z nich neni v repu.
 */

const fs = require('fs');
const path = require('path');

require('./env').loadDotEnv();

const devices = require('./devices');
const H = require('./helpers');
const { runCore, runDeep, runLandscape } = require('./scenarios');

const cfg = {
  bsUser: process.env.BROWSERSTACK_USERNAME,
  bsKey: process.env.BROWSERSTACK_ACCESS_KEY,
  localIdentifier: process.env.BROWSERSTACK_LOCAL_IDENTIFIER || null,
  baseUrl: (process.env.LIVENDO_BASE_URL || '').replace(/\/$/, ''),
  email: process.env.LIVENDO_EMAIL,
  password: process.env.LIVENDO_PASSWORD,
  detailId: process.env.LIV396_DETAIL_ID || null,
  // Kontrolni cista osoba - u ni se necekaji zadne zaznamy, takze beh
  // neni zavisly na obsahu rejstriku.
  person: {
    firstName: process.env.LIV396_FIRST_NAME || 'Ilona',
    lastName: process.env.LIV396_LAST_NAME || 'Barkociová',
    birthDate: process.env.LIV396_BIRTH_DATE || '24.03.1966',
  },
  allowPayment: process.env.LIV396_ALLOW_PAYMENT !== '0',
  projectName: 'Livendo FE radixal',
  buildName: process.env.LIV396_BUILD_NAME || `LIV-396 mobile real device ${new Date().toISOString().slice(0, 16)}`,
};

const OUT = path.resolve(process.env.LIV396_OUT || 'out');

function requireEnv() {
  const missing = [];
  if (!cfg.bsUser) missing.push('BROWSERSTACK_USERNAME');
  if (!cfg.bsKey) missing.push('BROWSERSTACK_ACCESS_KEY');
  if (!cfg.baseUrl) missing.push('LIVENDO_BASE_URL');
  if (!cfg.email) missing.push('LIVENDO_EMAIL');
  if (!cfg.password) missing.push('LIVENDO_PASSWORD');
  if (missing.length) {
    console.error('Chybi promenne prostredi: ' + missing.join(', '));
    console.error('Viz README.md.');
    process.exit(1);
  }
}

/** Vybrana zarizeni: DEVICES=iphone-se-2022,galaxy-a55 */
function selectDevices() {
  const filter = (process.env.DEVICES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!filter.length) return devices;
  const picked = devices.filter((d) => filter.includes(d.slug));
  const unknown = filter.filter((f) => !devices.some((d) => d.slug === f));
  if (unknown.length) console.warn('Neznamy slug zarizeni: ' + unknown.join(', '));
  return picked;
}

async function runOne(device, mode) {
  const scenarioName = mode === 'landscape' ? 'landscape' : device.deep ? 'deep' : 'core';
  const label = `${device.label} [${scenarioName}]`;
  console.log(`\n=== ${label} ===`);

  const sessionCfg = { ...cfg, scenarioName, orientation: mode === 'landscape' ? 'landscape' : null };
  let driver = null;
  const started = Date.now();
  try {
    driver = await H.buildDriver(device, sessionCfg);
    const sid = await H.sessionId(driver);
    console.log(`    session ${sid}`);
    await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000, implicit: 0 });

    const ctx = { driver, device, cfg: sessionCfg, outDir: OUT, shotSeq: 0 };
    const rec = mode === 'landscape' ? await runLandscape(ctx) : device.deep ? await runDeep(ctx) : await runCore(ctx);

    const blockers = rec.findings.filter((f) => f.severity === 'blocker');
    await H.markSession(
      driver,
      blockers.length ? 'failed' : 'passed',
      blockers.length ? blockers[0].title : `${rec.findings.length} nalezu`
    );

    return {
      device: device.slug,
      label: device.label,
      deviceName: device.deviceName,
      osVersion: device.osVersion,
      browser: device.browserName,
      expectedViewport: device.viewport,
      mode: scenarioName,
      sessionId: sid,
      buildName: cfg.buildName,
      durationMs: Date.now() - started,
      steps: rec.steps,
      findings: rec.findings,
    };
  } catch (e) {
    console.error(`    CHYBA: ${e.message}`);
    if (driver) await H.markSession(driver, 'failed', e.message);
    return {
      device: device.slug,
      label: device.label,
      mode: scenarioName,
      durationMs: Date.now() - started,
      error: e.message,
      stack: String(e.stack || '').split('\n').slice(0, 6).join('\n'),
      steps: [],
      findings: [],
    };
  } finally {
    if (driver) {
      try {
        await driver.quit();
      } catch (_) {}
    }
  }
}

/** Prehledovy markdown, ze ktereho se pise QA report do Jiry. */
function writeSummary(results) {
  const order = { blocker: 0, should: 1, nice: 2, info: 3 };
  const all = results.flatMap((r) => r.findings);

  // Seskupeni podle nalezu, ne podle zarizeni - zajima nas, na kolika kusech se to projevilo.
  const byTitle = new Map();
  for (const f of all) {
    const key = `${f.severity}|${f.liv396 || '-'}|${f.title}`;
    if (!byTitle.has(key)) byTitle.set(key, { ...f, devices: [], details: [] });
    const g = byTitle.get(key);
    if (!g.devices.includes(f.device)) g.devices.push(f.device);
    g.details.push(`${f.device}: ${f.detail}`);
  }
  const groups = [...byTitle.values()].sort(
    (a, b) => order[a.severity] - order[b.severity] || b.devices.length - a.devices.length
  );

  const lines = [];
  lines.push('# LIV-396 - real mobile device, vysledky');
  lines.push('');
  lines.push(`Build: ${cfg.buildName}`);
  lines.push(`Zarizeni: ${results.length} behu`);
  lines.push('');
  lines.push('## Behy');
  lines.push('');
  lines.push('| Zarizeni | Rezim | OS | Prohlizec | Nalezu | Session |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of results) {
    lines.push(
      `| ${r.label} | ${r.mode} | ${r.osVersion || '-'} | ${r.browser || '-'} | ${r.error ? 'CHYBA' : r.findings.length} | ${r.sessionId || '-'} |`
    );
  }
  lines.push('');
  lines.push('## Nalezy');
  lines.push('');
  for (const g of groups) {
    const tag = g.liv396 ? ` (LIV-396 bod ${g.liv396})` : '';
    lines.push(`### [${g.severity.toUpperCase()}] ${g.title}${tag}`);
    lines.push('');
    lines.push(`Projevilo se na ${g.devices.length} zarizenich: ${g.devices.join(', ')}`);
    lines.push('');
    for (const d of g.details.slice(0, 12)) lines.push(`- ${d}`);
    lines.push('');
  }
  if (!groups.length) {
    lines.push('Zadne nalezy.');
    lines.push('');
  }

  fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'));
}

(async () => {
  requireEnv();
  fs.mkdirSync(OUT, { recursive: true });

  const selected = selectDevices();
  console.log(`Build: ${cfg.buildName}`);
  console.log(`Zarizeni k projeti: ${selected.length} (${selected.map((d) => d.slug).join(', ')})`);
  console.log(`Vystup: ${OUT}`);

  const results = [];
  for (const device of selected) {
    results.push(await runOne(device, 'portrait'));
    // Deep zarizeni jedou navic landscape - orientaci nejde prepnout za behu.
    if (device.deep && process.env.LIV396_SKIP_LANDSCAPE !== '1') {
      results.push(await runOne(device, 'landscape'));
    }
    // Prubezny zapis, aby pad uprostred matice neshodil uz hotove vysledky.
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ config: { baseUrl: cfg.baseUrl, buildName: cfg.buildName }, results }, null, 2));
    writeSummary(results);
  }

  const total = results.flatMap((r) => r.findings);
  const blockers = total.filter((f) => f.severity === 'blocker').length;
  console.log('');
  console.log(`Hotovo. Behu: ${results.length}, nalezu: ${total.length} (blockeru: ${blockers}).`);
  console.log(`  ${path.join(OUT, 'results.json')}`);
  console.log(`  ${path.join(OUT, 'report.md')}`);
  console.log(`  screenshoty: ${OUT}/<slug>/`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
