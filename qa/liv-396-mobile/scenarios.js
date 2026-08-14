'use strict';

const checks = require('./checks');
const H = require('./helpers');
const { By } = H;

/**
 * Sberac nalezu. Kazdy zaznam nese cislo bodu z LIV-396, pokud k nekteremu patri,
 * aby se dal report primo porovnat s predchozimi koly.
 */
class Recorder {
  constructor(device) {
    this.device = device;
    this.steps = [];
    this.findings = [];
    this.current = null;
  }
  step(name) {
    this.current = { name, startedAt: new Date().toISOString(), data: {}, screenshots: [] };
    this.steps.push(this.current);
    return this.current;
  }
  data(key, value) {
    if (this.current) this.current.data[key] = value;
  }
  shot(rel) {
    if (this.current) this.current.screenshots.push(rel);
  }
  /** severity: blocker | should | nice | info */
  find(severity, title, detail, extra = {}) {
    const f = {
      device: this.device.slug,
      step: this.current ? this.current.name : null,
      severity,
      title,
      detail,
      ...extra,
    };
    this.findings.push(f);
    console.log(`    [${severity.toUpperCase()}]${extra.liv396 ? ' ' + extra.liv396 + ')' : ''} ${title} - ${detail}`);
    return f;
  }
}

/** Spolecne kontroly na kazde strance: preteceni, orez textu, tap targety. */
async function pageAudit(ctx, rec, label) {
  const m = await ctx.driver.executeScript(checks.pageMetrics);
  rec.data('metrics', m);

  const expected = ctx.device.viewport;
  if (expected && Math.abs(m.innerWidth - expected[0]) > 2) {
    rec.find('info', 'Sirka viewportu se lisi od ocekavane', `namereno ${m.innerWidth} px, plan ocekava ${expected[0]} px`, {
      data: { measured: m.innerWidth, expected: expected[0] },
    });
  }

  if (m.horizontalOverflow > 1) {
    const els = await ctx.driver.executeScript(checks.overflowingElements);
    rec.data('overflowingElements', els);
    rec.find('should', 'Horizontalni preteceni stranky', `${label}: scrollWidth ${Math.max(m.docScrollWidth, m.bodyScrollWidth)} px proti innerWidth ${m.innerWidth} px (+${m.horizontalOverflow} px)`, {
      data: { overflowPx: m.horizontalOverflow, culprits: els.slice(0, 5) },
    });
  }

  const clipped = await ctx.driver.executeScript(checks.clippedText);
  if (clipped.length) {
    rec.data('clippedText', clipped);
    rec.find('nice', 'Orezany text', `${label}: ${clipped.length} prvku ma scrollWidth > clientWidth, napr. "${clipped[0].text}" (+${clipped[0].clippedPx} px)`, {
      data: clipped.slice(0, 5),
    });
  }

  const small = await ctx.driver.executeScript(checks.smallTapTargets);
  if (small.length) {
    rec.data('smallTapTargets', small);
    rec.find('nice', 'Male tap targety', `${label}: ${small.length} interaktivnich prvku pod 44x44 px, napr. "${small[0].label || small[0].tag}" ${small[0].width}x${small[0].height}`, {
      data: small.slice(0, 8),
    });
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* CORE - bezi na vsech zarizenich                                      */
/* ------------------------------------------------------------------ */

async function stepLogin(ctx, rec) {
  rec.step('login');
  const res = await H.ensureLoggedIn(ctx.driver, ctx.cfg, checks);
  rec.data('login', res);
  if (res.ok === false) {
    rec.find('blocker', 'Prihlaseni selhalo', res.reason || 'po odeslani formulare neni v hlavicce user button');
    rec.shot(await H.shot(ctx, 'login-failed'));
    return false;
  }
  return true;
}

/** Landing + bod 73) "Provereni zajemcu" na dva radky. */
async function stepLanding(ctx, rec) {
  rec.step('landing');
  await H.goto(ctx.driver, `${ctx.cfg.baseUrl}/useful-tools/credit-check`);
  await pageAudit(ctx, rec, 'landing');

  const h1 = await ctx.driver.executeScript(checks.lineCount, 'h1');
  rec.data('h1', h1);
  if (h1.found && /Prověření/i.test(h1.text) && h1.approxLines > 2) {
    rec.find('nice', 'Nadpis se lame na vic nez dva radky', `"${h1.text}" ma ${h1.approxLines} radku (vyska ${h1.height} px / line-height ${h1.lineHeight} px)`, { liv396: '73' });
  }

  rec.shot(await H.shot(ctx, 'landing'));
}

/** Bod 76) - po prihlaseni musi byt CC dostupne z hamburger menu. */
async function stepHamburger(ctx, rec) {
  rec.step('hamburger-menu');
  const opened = await H.tap(ctx.driver, H.byTestId('header.menu.button'));
  if (!opened) {
    rec.find('should', 'Hamburger menu se neotevrelo', 'testid header.menu.button neni viditelny', { liv396: '76' });
    rec.shot(await H.shot(ctx, 'hamburger-missing'));
    return;
  }
  await H.sleep(1200);
  const items = await ctx.driver.executeScript(checks.menuItems);
  rec.data('menuItems', items);
  rec.shot(await H.shot(ctx, 'hamburger-open'));

  const cc = items.find((i) => /Prověření zájemc/i.test(i.text));
  if (!cc) {
    rec.find('should', 'V mobilnim menu chybi Proveřeni zajemcu', `v otevrenem menu je ${items.length} polozek, zadna neodpovida "Prověření zájemců"`, {
      liv396: '76',
      data: items.slice(0, 20).map((i) => i.text),
    });
  } else {
    rec.data('ccMenuItem', cc);
  }

  // Bod 1) - na touch neexistuje hover, menu musi jit zavrit.
  await H.sleep(400);
  const closed = await H.tap(ctx.driver, H.byTestId('header.menu.button'));
  await H.sleep(1000);
  const after = await ctx.driver.executeScript(checks.menuItems);
  rec.data('menuItemsAfterClose', after.length);
  if (closed && after.length >= items.length) {
    rec.find('should', 'Mobilni menu nejde zavrit stejnym tlacitkem', `po druhem tapnuti je v DOM porad ${after.length} viditelnych polozek (pred zavrenim ${items.length})`, { liv396: '1' });
    rec.shot(await H.shot(ctx, 'menu-not-closing'));
  }
}

/**
 * Formular - tezisko celeho behu.
 * Klavesnice, iOS auto-zoom, datepicker, bod 72) a 75).
 */
async function stepForm(ctx, rec, { url = null, label = 'form' } = {}) {
  rec.step(label);
  await H.goto(ctx.driver, url || `${ctx.cfg.baseUrl}/useful-tools/credit-check/form`);
  await pageAudit(ctx, rec, label);

  // iOS Safari zoomne stranku pri focusu do pole s font-size < 16px.
  const smallFonts = await ctx.driver.executeScript(checks.smallFontInputs);
  rec.data('smallFontInputs', smallFonts);
  if (smallFonts.length && ctx.device.platform === 'ios') {
    rec.find('should', 'Pole s font-size pod 16 px spusti na iOS auto-zoom', `${smallFonts.length} poli: ${smallFonts.map((f) => `${f.placeholder || f.name || f.type} ${f.fontSize}px`).join(', ')}`, {
      data: smallFonts,
    });
  }

  const textInputs = By.css('form input[type="text"]');
  const all = await ctx.driver.findElements(textInputs);
  rec.data('textInputCount', all.length);
  if (all.length < 3) {
    rec.find('blocker', 'Formular nema ocekavana tri textova pole', `nalezeno ${all.length}`);
    rec.shot(await H.shot(ctx, `${label}-unexpected`));
    return;
  }

  const fields = [
    { idx: 0, name: 'jmeno', value: ctx.cfg.person.firstName },
    { idx: 1, name: 'prijmeni', value: ctx.cfg.person.lastName },
    { idx: 2, name: 'datum-narozeni', value: ctx.cfg.person.birthDate },
  ];

  for (const f of fields) {
    const el = all[f.idx];
    await ctx.driver.executeScript('arguments[0].scrollIntoView({block:"center"})', el);
    await H.sleep(400);
    const before = await ctx.driver.executeScript(checks.pageMetrics);

    await el.click();
    await H.sleep(1400); // nativni klavesnice potrebuje cas vyjet

    const ks = await ctx.driver.executeScript(
      checks.keyboardState,
      `form input[type="text"]:nth-of-type(${f.idx + 1})`,
      null
    );
    // Presnejsi mereni primo z elementu, nez spolehat na nth-of-type.
    const rect = await ctx.driver.executeScript(
      'var r=arguments[0].getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height)};',
      el
    );
    const covered = ks.visibleBottom != null && rect.bottom > ks.visibleBottom + 1;
    const detail = {
      field: f.name,
      inputRect: rect,
      vvHeightBefore: before.visualViewport ? before.visualViewport.height : null,
      vvHeightAfter: ks.vvHeight,
      keyboardHeightPx: ks.keyboardHeightPx,
      visibleBottom: ks.visibleBottom,
      vvScale: ks.vvScale,
      covered,
    };
    rec.data(`keyboard-${f.name}`, detail);
    rec.shot(await H.shot(ctx, `${label}-keyboard-${f.name}`));

    if (covered) {
      rec.find('blocker', 'Nativni klavesnice prekryva editovane pole', `${f.name}: spodni hrana pole je na ${rect.bottom} px, viditelna oblast konci na ${ks.visibleBottom} px (klavesnice ${ks.keyboardHeightPx} px)`, {
        data: detail,
      });
    }
    if (ks.vvScale && ks.vvScale > 1.02) {
      rec.find('should', 'Stranka se pri focusu do pole zoomne', `${f.name}: visualViewport.scale ${ks.vvScale} (na iOS nastava u poli s font-size < 16 px)`, {
        data: detail,
      });
    }

    await el.clear();
    await el.sendKeys(f.value);
    await H.sleep(500);
  }

  await H.dismissKeyboard(ctx.driver, ctx.device.platform);

  // Datepicker po vyplneni data zustava otevreny a prekryva submit (viz skill).
  const dp = await ctx.driver.executeScript(checks.dialogFit);
  rec.data('datepickerDialog', dp);
  if (dp.found && dp.overflowsBottom) {
    rec.find('should', 'Otevreny datepicker presahuje pres spodni hranu viewportu', `dialog konci na ${dp.bottom} px, viditelna oblast na ${dp.viewportHeight} px, scrollovatelny: ${dp.scrollable}`, {
      data: dp,
    });
  }

  // Bod 75) - prekryvajici se text u checkboxu trvale adresy.
  const overlaps = await ctx.driver.executeScript(checks.overlappingSiblings, 'form');
  rec.data('overlappingInForm', overlaps);
  if (Array.isArray(overlaps) && overlaps.length) {
    rec.find('should', 'Prekryvajici se texty ve formulari', `${overlaps.length} dvojic, napr. "${overlaps[0].a}" x "${overlaps[0].b}" (prekryv ${overlaps[0].overlapX}x${overlaps[0].overlapY} px)`, {
      liv396: '75',
      data: overlaps.slice(0, 5),
    });
    rec.shot(await H.shot(ctx, `${label}-overlap`));
  }

  // Bod 72) - vlajecky u variant rozsahu + kontrola semantiky (bod 97).
  const group = await ctx.driver.executeScript(checks.scopeRadioGroup);
  rec.data('scopeRadioGroup', group);
  if (!group.found) {
    rec.find('should', 'Vyber rozsahu nema role=radiogroup', 'v DOM neni zadny [role="radiogroup"] - bod 97) se v mobilnim view neprojevil', { liv396: '97' });
  } else {
    const brokenFlags = group.items.filter((i) => i.flags.some((f) => !f.rendered || f.naturalWidth === 0));
    if (brokenFlags.length) {
      rec.find('should', 'Vlajecky u variant rozsahu se nevykreslily', `${brokenFlags.length} dlazdic ma nenactenou vlajecku`, {
        liv396: '72',
        data: brokenFlags.map((i) => ({ label: i.label.slice(0, 40), flags: i.flags })),
      });
    }
    const nested = group.items.filter((i) => i.nestedButtons > 0);
    if (nested.length) {
      rec.data('nestedButtonsInScope', nested.length);
    }
  }

  // Vyber CZ rozsahu tapem.
  const scopeTapped = await H.tap(ctx.driver, H.byText('Základní a rozšířené CZ'));
  rec.data('scopeTapped', scopeTapped);
  await H.sleep(900);
  const groupAfter = await ctx.driver.executeScript(checks.scopeRadioGroup);
  rec.data('scopeRadioGroupAfter', groupAfter);
  if (scopeTapped && groupAfter.found) {
    const checked = groupAfter.items.filter((i) => i.ariaChecked === 'true');
    if (checked.length !== 1) {
      rec.find('should', 'Po tapnuti na rozsah nesedi aria-checked', `zaskrtnutych dlazdic: ${checked.length}`, {
        data: groupAfter.items.map((i) => ({ label: i.label.slice(0, 40), ariaChecked: i.ariaChecked })),
      });
    }
  }

  rec.shot(await H.shot(ctx, `${label}-filled`));

  // Submit nesmi byt pod foldem ani prekryty.
  const submit = await H.firstVisible(ctx.driver, H.byText('Prověřit zájemce'));
  if (!submit) {
    rec.find('blocker', 'Submit "Proverit zajemce" neni viditelny', 'po vyplneni formulare a vyberu rozsahu');
  } else {
    const sr = await ctx.driver.executeScript(
      'var r=arguments[0].getBoundingClientRect();var vv=window.visualViewport;' +
        'return {top:Math.round(r.top),bottom:Math.round(r.bottom),width:Math.round(r.width),height:Math.round(r.height),' +
        'visibleBottom:Math.round(vv?vv.offsetTop+vv.height:window.innerHeight)};',
      submit
    );
    rec.data('submitRect', sr);
    if (sr.height < 44 || sr.width < 44) {
      rec.find('nice', 'Submit je mensi nez 44x44 px', `${sr.width}x${sr.height} px`, { data: sr });
    }
  }
}

/** Bod 75) jeste jednou v modalu ?modal=new. */
async function stepModalNew(ctx, rec) {
  rec.step('modal-new');
  await H.goto(ctx.driver, `${ctx.cfg.baseUrl}/useful-tools/credit-check/list?modal=new`);
  const dlg = await ctx.driver.executeScript(checks.dialogFit);
  rec.data('dialog', dlg);
  rec.shot(await H.shot(ctx, 'modal-new'));

  if (!dlg.found) {
    rec.find('info', 'Modal noveho provereni se neotevrel', 'na /useful-tools/credit-check/list?modal=new neni [role=dialog] - route se mohla zmenit na /dashboard/credit-check');
    return;
  }
  if (dlg.tallerThanViewport && !dlg.scrollable) {
    rec.find('blocker', 'Modal je vyssi nez viewport a nejde odscrollovat', `vyska dialogu ${dlg.height} px, viditelna oblast ${dlg.viewportHeight} px, scrollHeight ${dlg.scrollHeight} / clientHeight ${dlg.clientHeight}`, { data: dlg });
  }
  const hidden = dlg.buttons.filter((b) => b.belowFold);
  if (hidden.length) {
    rec.find('should', 'Tlacitka v modalu jsou pod spodni hranou viewportu', hidden.map((b) => `"${b.label}" bottom ${b.bottom} px`).join(', '), { data: hidden });
  }
  const overlaps = await ctx.driver.executeScript(checks.overlappingSiblings, '[role="dialog"]');
  if (Array.isArray(overlaps) && overlaps.length) {
    rec.find('should', 'Prekryvajici se texty v modalu noveho provereni', `napr. "${overlaps[0].a}" x "${overlaps[0].b}"`, { liv396: '75', data: overlaps.slice(0, 5) });
  }
}

/** Platebni modal - vejde se, jde odscrollovat, tlacitka nad foldem. Neplati. */
async function stepPaymentDialog(ctx, rec) {
  rec.step('payment-dialog');
  const ok = await H.tap(ctx.driver, H.byText('Prověřit zájemce'));
  if (!ok) {
    rec.find('info', 'Nepodarilo se otevrit platebni dialog', 'tlacitko "Prověřit zájemce" nebylo klikatelne');
    return false;
  }
  await H.sleep(3500);
  const dlg = await ctx.driver.executeScript(checks.dialogFit);
  rec.data('paymentDialog', dlg);
  rec.shot(await H.shot(ctx, 'payment-dialog'));

  if (!dlg.found) {
    rec.find('should', 'Platebni dialog se neotevrel', 'po tapnuti na "Prověřit zájemce" neni v DOM [role=dialog]');
    return false;
  }
  if (dlg.tallerThanViewport && !dlg.scrollable) {
    rec.find('blocker', 'Platebni dialog je vyssi nez viewport a nejde odscrollovat', `vyska ${dlg.height} px proti viditelnym ${dlg.viewportHeight} px`, { data: dlg });
  }
  const hidden = dlg.buttons.filter((b) => b.belowFold);
  if (hidden.length) {
    rec.find('should', 'Tlacitka platebniho dialogu jsou pod foldem', hidden.map((b) => `"${b.label}" bottom ${b.bottom} px`).join(', '), { data: hidden });
  }
  const small = dlg.buttons.filter((b) => b.height < 44);
  if (small.length) {
    rec.find('nice', 'Tlacitka platebniho dialogu jsou nizsi nez 44 px', small.map((b) => `"${b.label}" ${b.width}x${b.height}`).join(', '), { data: small });
  }
  return true;
}

/** Seznam provereni. */
async function stepList(ctx, rec) {
  rec.step('list');
  await H.goto(ctx.driver, `${ctx.cfg.baseUrl}/dashboard/credit-check`);
  await pageAudit(ctx, rec, 'seznam provereni');
  rec.shot(await H.shot(ctx, 'list'));
}

/** Detail provereni - body 71), 74), 74a). */
async function stepDetail(ctx, rec, detailId) {
  rec.step('detail');
  if (!detailId) {
    rec.find('info', 'Detail preskocen', 'neni nastavene LIV396_DETAIL_ID ani nevzniklo nove provereni');
    return;
  }
  await H.goto(ctx.driver, `${ctx.cfg.baseUrl}/dashboard/credit-check/${detailId}`, { wait: 5000 });
  await pageAudit(ctx, rec, `detail ${detailId}`);

  // Bod 74) - jmeno se nevejde.
  const h1 = await ctx.driver.executeScript(checks.lineCount, 'h1');
  rec.data('detailH1', h1);
  const clipped = await ctx.driver.executeScript(checks.clippedText);
  const nameClipped = clipped.filter((c) => /^h[1-3]$/.test(c.tag));
  if (nameClipped.length) {
    rec.find('should', 'Jmeno na detailu je orezane', nameClipped.map((c) => `"${c.text}" +${c.clippedPx} px`).join(', '), { liv396: '74', data: nameClipped });
    rec.shot(await H.shot(ctx, 'detail-name-clipped'));
  }

  // Bod 74a) - uskocene vrchni menu po scrollu.
  const before = await ctx.driver.executeScript(checks.stickyHeaderState);
  await ctx.driver.executeScript('window.scrollTo(0, 600)');
  await H.sleep(1200);
  const after = await ctx.driver.executeScript(checks.stickyHeaderState);
  rec.data('stickyHeaderBefore', before);
  rec.data('stickyHeaderAfter', after);
  rec.shot(await H.shot(ctx, 'detail-scrolled'));
  for (let i = 0; i < Math.min(before.headers.length, after.headers.length); i++) {
    const b = before.headers[i];
    const a = after.headers[i];
    if (/fixed|sticky/.test(b.position) && Math.abs(a.top - b.top) > 4) {
      rec.find('should', 'Sticky hlavicka po scrollu uskoci', `${b.tag}${b.testid ? ' [' + b.testid + ']' : ''}: top ${b.top} px pred scrollem, ${a.top} px po scrollu (position: ${b.position})`, {
        liv396: '74a',
        data: { before: b, after: a },
      });
    }
  }
  await ctx.driver.executeScript('window.scrollTo(0, 0)');
  await H.sleep(800);

  // Bod 71) - rozbaleni rozpisu a proklik na zaznam.
  const expanded = await H.tap(ctx.driver, H.byText('Zobrazit detailní rozpis'));
  rec.data('expandTapped', expanded);
  if (!expanded) {
    rec.find('should', 'Tlacitko "Zobrazit detailni rozpis" nejde tapnout', 'prvek nebyl nalezen nebo neni viditelny', { liv396: '71' });
  } else {
    await H.sleep(1800);
    rec.shot(await H.shot(ctx, 'detail-expanded'));
    const rec2 = await ctx.driver.findElements(H.byText('Zobrazit záznam'));
    let visibleCount = 0;
    let firstRect = null;
    for (const el of rec2) {
      try {
        if (await el.isDisplayed()) {
          visibleCount++;
          if (!firstRect) {
            firstRect = await ctx.driver.executeScript(
              'var r=arguments[0].getBoundingClientRect();return {width:Math.round(r.width),height:Math.round(r.height),top:Math.round(r.top)};',
              el
            );
          }
        }
      } catch (_) {}
    }
    rec.data('zobrazitZaznam', { visibleCount, firstRect });
    if (visibleCount === 0) {
      rec.find('info', 'Po rozbaleni rozpisu neni zadne "Zobrazit zaznam"', 'muze byt v poradku, kdyz je osoba bez zaznamu', { liv396: '71' });
    } else if (firstRect && (firstRect.height < 44 || firstRect.width < 44)) {
      rec.find('should', '"Zobrazit zaznam" ma maly tap target', `${firstRect.width}x${firstRect.height} px`, { liv396: '71', data: firstRect });
    }
  }
}

/* ------------------------------------------------------------------ */
/* DEEP - jen na vybranych zarizenich                                   */
/* ------------------------------------------------------------------ */

/** Dokonci platbu kredity (dva kroky!) a vrati id noveho provereni. */
async function stepPayWithCredits(ctx, rec) {
  rec.step('pay-credits');
  const payTapped =
    (await H.tap(ctx.driver, H.byTestId('creditCheck.verifyPayment.submit.button'))) ||
    (await H.tap(ctx.driver, H.byText('Zaplatit', { exact: true })));
  if (!payTapped) {
    rec.find('should', 'Tlacitko Zaplatit nejde tapnout', 'v platebnim dialogu nebylo klikatelne');
    return null;
  }
  await H.sleep(2500);
  rec.shot(await H.shot(ctx, 'pay-confirm-dialog'));

  // DRUHY krok - bez nej se tise zalozi nezaplaceny report.
  const confirmed = await H.tap(ctx.driver, H.byText('Ano, potvrdit'));
  if (!confirmed) {
    rec.find('should', 'Potvrzovaci krok "Ano, potvrdit" nejde tapnout', 'druhy krok platby neni na mobilu dosazitelny');
    return null;
  }

  const deadline = Date.now() + 30000;
  let id = null;
  while (Date.now() < deadline) {
    await H.sleep(2000);
    const url = await ctx.driver.getCurrentUrl();
    const m = url.match(/credit-check\/(\d+)/);
    if (m) {
      id = m[1];
      break;
    }
  }
  rec.data('newReportId', id);
  rec.shot(await H.shot(ctx, 'after-payment'));
  if (!id) {
    rec.find('should', 'Po platbe nedoslo k presmerovani na detail', `po 30 s je URL ${await ctx.driver.getCurrentUrl()}`);
  }
  return id;
}

/* ------------------------------------------------------------------ */

async function runCore(ctx) {
  const rec = new Recorder(ctx.device);
  ctx.rec = rec;
  if (!(await stepLogin(ctx, rec))) return rec;
  await stepLanding(ctx, rec);
  await stepHamburger(ctx, rec);
  await stepForm(ctx, rec);
  await stepPaymentDialog(ctx, rec);
  await stepModalNew(ctx, rec);
  await stepList(ctx, rec);
  await stepDetail(ctx, rec, ctx.cfg.detailId);
  return rec;
}

async function runDeep(ctx) {
  const rec = new Recorder(ctx.device);
  ctx.rec = rec;
  if (!(await stepLogin(ctx, rec))) return rec;
  await stepLanding(ctx, rec);
  await stepHamburger(ctx, rec);
  await stepForm(ctx, rec);
  const dialogOk = await stepPaymentDialog(ctx, rec);
  let newId = null;
  if (dialogOk && ctx.cfg.allowPayment) {
    newId = await stepPayWithCredits(ctx, rec);
  }
  await stepModalNew(ctx, rec);
  await stepList(ctx, rec);
  await stepDetail(ctx, rec, newId || ctx.cfg.detailId);
  return rec;
}

/** Landscape bezi ve vlastni session (orientace se zadava v capabilities). */
async function runLandscape(ctx) {
  const rec = new Recorder(ctx.device);
  ctx.rec = rec;
  if (!(await stepLogin(ctx, rec))) return rec;
  rec.step('landscape-landing');
  await H.goto(ctx.driver, `${ctx.cfg.baseUrl}/useful-tools/credit-check`);
  await pageAudit(ctx, rec, 'landing landscape');
  rec.shot(await H.shot(ctx, 'landscape-landing'));
  await stepForm(ctx, rec, { label: 'landscape-form' });
  await stepDetail(ctx, rec, ctx.cfg.detailId);
  return rec;
}

module.exports = { runCore, runDeep, runLandscape, Recorder };
