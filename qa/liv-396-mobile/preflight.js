'use strict';

/**
 * Preflight: overi credentials, dostupnost zarizeni a bezici Local tunnel.
 * Spustit pred ostrym behem - usetri to padle session uprostred matice.
 *
 *   node preflight.js
 */

const { loadDotEnv } = require('./env');
const devices = require('./devices');

const dotenv = loadDotEnv();
if (dotenv.loaded) console.log(`.env nacten: ${dotenv.keys.length} promennych${dotenv.skipped.length ? `, ${dotenv.skipped.length} prebito shellem` : ''}\n`);

const BS_USER = process.env.BROWSERSTACK_USERNAME;
const BS_KEY = process.env.BROWSERSTACK_ACCESS_KEY;
const BASE_URL = process.env.LIVENDO_BASE_URL;

function auth() {
  return 'Basic ' + Buffer.from(`${BS_USER}:${BS_KEY}`).toString('base64');
}

async function api(path) {
  const res = await fetch(`https://api.browserstack.com${path}`, { headers: { Authorization: auth() } });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

/** Vybere nejblizsi dostupnou osVersion, kdyz presna shoda na uctu neni. */
function pickVersion(available, wanted) {
  if (available.includes(wanted)) return wanted;
  const num = (v) => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0;
  const sorted = [...available].sort((a, b) => num(a) - num(b));
  const higher = sorted.find((v) => num(v) >= num(wanted));
  return higher || sorted[sorted.length - 1] || null;
}

(async () => {
  const missing = [];
  if (!BS_USER) missing.push('BROWSERSTACK_USERNAME');
  if (!BS_KEY) missing.push('BROWSERSTACK_ACCESS_KEY');
  if (!BASE_URL) missing.push('LIVENDO_BASE_URL');
  if (!process.env.LIVENDO_EMAIL) missing.push('LIVENDO_EMAIL');
  if (!process.env.LIVENDO_PASSWORD) missing.push('LIVENDO_PASSWORD');
  if (missing.length) {
    console.error('Chybi promenne prostredi: ' + missing.join(', '));
    process.exit(1);
  }

  console.log('1) Plan uctu');
  const plan = await api('/automate/plan.json');
  console.log(`   ${plan.automate_plan || 'n/a'} - paralelnich session ${plan.parallel_sessions_running}/${plan.parallel_sessions_max_allowed}`);

  console.log('2) Local tunnel');
  let localOk = false;
  try {
    const local = await api('/automate/browsers/local.json').catch(() => null);
    if (local) console.log('   ' + JSON.stringify(local).slice(0, 200));
  } catch (_) {}
  try {
    const res = await fetch(`https://api.browserstack.com/local/v1/list?state=running`, { headers: { Authorization: auth() } });
    const body = await res.json();
    const instances = body.instances || [];
    localOk = instances.length > 0;
    console.log(`   bezicich Local instanci: ${instances.length}`);
    instances.forEach((i) => console.log(`   - localIdentifier: ${i.localIdentifier || '(zadny)'}  ${i.hashed_id || ''}`));
    if (!localOk) {
      console.log('   ! Zadny bezici tunnel. Bez nej se zarizeni na interni domenu nedostane.');
    }
  } catch (e) {
    console.log('   nepodarilo se zjistit stav tunnelu: ' + e.message);
  }

  console.log('3) Dostupnost zarizeni');
  const browsers = await api('/automate/browsers.json');
  const report = [];
  for (const d of devices) {
    const matches = browsers.filter(
      (b) => b.device === d.deviceName && String(b.browser).toLowerCase() === d.browserName.toLowerCase()
    );
    if (!matches.length) {
      const anyDevice = browsers.filter((b) => b.device === d.deviceName);
      report.push({
        slug: d.slug,
        ok: false,
        note: anyDevice.length
          ? `zarizeni existuje, ale ne s prohlizecem ${d.browserName} (k dispozici: ${[...new Set(anyDevice.map((b) => b.browser))].join(', ')})`
          : 'zarizeni na uctu neni',
      });
      continue;
    }
    const versions = [...new Set(matches.map((b) => b.os_version))];
    const picked = pickVersion(versions, d.osVersion);
    report.push({
      slug: d.slug,
      ok: true,
      wanted: d.osVersion,
      picked,
      changed: picked !== d.osVersion,
      versions,
    });
  }
  for (const r of report) {
    if (!r.ok) console.log(`   ✗ ${r.slug}: ${r.note}`);
    else if (r.changed) console.log(`   ~ ${r.slug}: osVersion ${r.wanted} neni, pouzije se ${r.picked} (dostupne: ${r.versions.join(', ')})`);
    else console.log(`   ✓ ${r.slug}: osVersion ${r.picked}`);
  }

  const bad = report.filter((r) => !r.ok);
  console.log('');
  console.log(bad.length ? `Uprav devices.js u ${bad.length} zarizeni.` : 'Vsechna zarizeni dostupna.');
  if (!localOk) console.log('Spust BrowserStack Local na stroji ve VPN, jinak beh skonci na timeoutu.');
})().catch((e) => {
  console.error('Preflight selhal: ' + e.message);
  process.exit(1);
});
