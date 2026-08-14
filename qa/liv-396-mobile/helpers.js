'use strict';

const fs = require('fs');
const path = require('path');
const { Builder, By, until } = require('selenium-webdriver');

const HUB = 'https://hub-cloud.browserstack.com/wd/hub';

/** Sestavi W3C capabilities pro jedno zarizeni a otevre session. */
async function buildDriver(device, cfg) {
  const bstack = {
    userName: cfg.bsUser,
    accessKey: cfg.bsKey,
    deviceName: device.deviceName,
    osVersion: device.osVersion,
    realMobile: 'true',
    projectName: cfg.projectName,
    buildName: cfg.buildName,
    sessionName: `${device.label} - ${cfg.scenarioName}`,
    // Livendo staging je jen za VPN - tunnel bezi na stroji uvnitr VPN.
    local: 'true',
    networkLogs: true,
    consoleLogs: 'errors',
    idleTimeout: 300,
    seleniumVersion: '4.0.0',
  };
  if (cfg.localIdentifier) bstack.localIdentifier = cfg.localIdentifier;
  // Orientaci nejde u realnych zarizeni prepnout za behu - landscape se resi
  // samostatnou session s touto capability.
  if (cfg.orientation) bstack.deviceOrientation = cfg.orientation;

  const caps = { browserName: device.browserName, 'bstack:options': bstack };

  return new Builder().usingServer(HUB).withCapabilities(caps).build();
}

/** Oznaci session v BrowserStack dashboardu jako passed/failed. */
async function markSession(driver, status, reason) {
  try {
    await driver.executeScript(
      'browserstack_executor: ' +
        JSON.stringify({
          action: 'setSessionStatus',
          arguments: { status, reason: String(reason || '').slice(0, 250) },
        })
    );
  } catch (_) {
    /* nepodstatne, session uz muze byt zavrena */
  }
}

async function sessionId(driver) {
  const s = await driver.getSession();
  return s.getId();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** XPath literal odolny vuci apostrofum v ceskych textech. */
function xpathLiteral(s) {
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return 'concat(' + s.split("'").map((p) => `'${p}'`).join(`,"'",`) + ')';
}

/**
 * Najde klikatelny prvek podle viditelneho textu.
 * Na mobilu je to spolehlivejsi nez CSS - polovina prvku nema testid.
 */
function byText(text, { exact = false, tags = ['button', 'a', '*[@role="button"]', '*[@role="radio"]', 'label'] } = {}) {
  const lit = xpathLiteral(text);
  const cond = exact ? `normalize-space(.)=${lit}` : `contains(normalize-space(.), ${lit})`;
  const parts = tags.map((t) => (t.startsWith('*') ? `//${t}[${cond}]` : `//${t}[${cond}]`));
  return By.xpath(parts.join(' | '));
}

const byTestId = (id) => By.css(`[data-testid="${id}"]`);

async function exists(driver, locator) {
  const els = await driver.findElements(locator);
  return els.length > 0;
}

/** Prvni VIDITELNY prvek z lokatoru - stranka ma casto skryte duplikaty v DOM. */
async function firstVisible(driver, locator) {
  const els = await driver.findElements(locator);
  for (const el of els) {
    try {
      if (await el.isDisplayed()) return el;
    } catch (_) {
      /* stale element, jdi dal */
    }
  }
  return null;
}

/** Doscrolluje prvek do stredu viewportu a klikne. Vraci false, kdyz prvek neni. */
async function tap(driver, locator, { timeout = 8000 } = {}) {
  const started = Date.now();
  let el = null;
  while (Date.now() - started < timeout) {
    el = await firstVisible(driver, locator);
    if (el) break;
    await sleep(400);
  }
  if (!el) return false;
  try {
    await driver.executeScript('arguments[0].scrollIntoView({block:"center",inline:"nearest"})', el);
    await sleep(350);
    await el.click();
    return true;
  } catch (e) {
    // fallback pro prvky prekryte stickym prvkem
    try {
      await driver.executeScript('arguments[0].click()', el);
      return true;
    } catch (_) {
      return false;
    }
  }
}

/** Vyplni pole. `tapFirst` simuluje realny dotyk, ktery vyvola klavesnici. */
async function fill(driver, locator, value, { tapFirst = true } = {}) {
  const el = await firstVisible(driver, locator);
  if (!el) return false;
  await driver.executeScript('arguments[0].scrollIntoView({block:"center"})', el);
  await sleep(300);
  if (tapFirst) {
    await el.click();
    await sleep(900); // cas na vyjeti nativni klavesnice
  }
  await el.clear();
  await el.sendKeys(value);
  return true;
}

/** Zavre nativni klavesnici (Hotovo / Done / Escape podle platformy). */
async function dismissKeyboard(driver, platform) {
  try {
    if (platform === 'ios') {
      await driver.executeScript('browserstack_executor: {"action":"hideKeyboard"}');
    } else {
      await driver.executeScript('document.activeElement && document.activeElement.blur()');
    }
  } catch (_) {
    try {
      await driver.executeScript('document.activeElement && document.activeElement.blur()');
    } catch (_) {}
  }
  await sleep(800);
}

/** Ulozi screenshot do out/<slug>/NN-<name>.png a vrati relativni cestu. */
async function shot(ctx, name) {
  const dir = path.join(ctx.outDir, ctx.device.slug);
  fs.mkdirSync(dir, { recursive: true });
  ctx.shotSeq = (ctx.shotSeq || 0) + 1;
  const file = `${String(ctx.shotSeq).padStart(2, '0')}-${name.replace(/[^a-z0-9-]+/gi, '-')}.png`;
  const b64 = await ctx.driver.takeScreenshot();
  fs.writeFileSync(path.join(dir, file), Buffer.from(b64, 'base64'));
  return path.join(ctx.device.slug, file);
}

async function goto(driver, url, { wait = 4000 } = {}) {
  await driver.get(url);
  await sleep(wait);
}

/**
 * Zajisti prihlaseni. Staging odhlasuje cca kazde 3 minuty (known issue
 * v testovacim planu), takze se to vola pred kazdym chranenym krokem.
 */
async function ensureLoggedIn(driver, cfg, checks) {
  const state = await driver.executeScript(checks.loginState);
  if (state.hasUserButton) return { alreadyIn: true };

  await goto(driver, `${cfg.baseUrl}/login`, { wait: 4000 });
  const emailOk = await fill(driver, By.css('main input'), cfg.email, { tapFirst: false });
  const passOk = await fill(driver, By.css('main input[type="password"]'), cfg.password, { tapFirst: false });
  if (!emailOk || !passOk) return { alreadyIn: false, ok: false, reason: 'prihlasovaci pole nenalezena' };

  // V hlavicce je druhe tlacitko "Prihlasit se", ktere jen otevira rozcestnik.
  const btns = await driver.findElements(byText('Přihlásit se', { exact: true }));
  let clicked = false;
  for (let i = btns.length - 1; i >= 0; i--) {
    try {
      if (await btns[i].isDisplayed()) {
        await btns[i].click();
        clicked = true;
        break;
      }
    } catch (_) {}
  }
  if (!clicked) return { alreadyIn: false, ok: false, reason: 'submit tlacitko nenalezeno' };

  await sleep(5000);
  const after = await driver.executeScript(checks.loginState);
  return { alreadyIn: false, ok: after.hasUserButton };
}

module.exports = {
  HUB,
  By,
  until,
  buildDriver,
  markSession,
  sessionId,
  sleep,
  byText,
  byTestId,
  xpathLiteral,
  exists,
  firstVisible,
  tap,
  fill,
  dismissKeyboard,
  shot,
  goto,
  ensureLoggedIn,
};
