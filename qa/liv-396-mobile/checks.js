'use strict';

/**
 * Merici funkce, ktere se posilaji do stranky pres driver.executeScript().
 *
 * Kazda musi byt SOBESTACNA - selenium posle jen zdrojak te jedne funkce,
 * nic z tohohle modulu se do stranky nedostane. Proto je `describe` a spol.
 * naklonovany uvnitr kazde funkce, i kdyz to vypada redundantne.
 *
 * Vsechny vraci jen serializovatelna data (cisla, retezce, pole, objekty).
 */

/** Zakladni rozmery stranky + visual viewport. */
function pageMetrics() {
  var vv = window.visualViewport;
  var de = document.documentElement;
  var probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;' +
    'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);';
  document.body.appendChild(probe);
  var cs = getComputedStyle(probe);
  var safeTop = parseFloat(cs.paddingTop) || 0;
  var safeBottom = parseFloat(cs.paddingBottom) || 0;
  probe.remove();

  return {
    url: location.href,
    title: document.title,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    dpr: window.devicePixelRatio,
    docScrollWidth: de.scrollWidth,
    bodyScrollWidth: document.body ? document.body.scrollWidth : 0,
    docScrollHeight: de.scrollHeight,
    horizontalOverflow: Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0) - window.innerWidth,
    visualViewport: vv
      ? { width: Math.round(vv.width), height: Math.round(vv.height), offsetTop: Math.round(vv.offsetTop), scale: vv.scale }
      : null,
    safeAreaTop: safeTop,
    safeAreaBottom: safeBottom,
    orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
  };
}

/**
 * Prvky, ktere presahuji viewport doprava (nebo zacinaji vlevo mimo).
 * Hlasi jen nejvyssi vinika v kazde vetvi - jinak vypadne cely podstrom.
 */
function overflowingElements() {
  var w = window.innerWidth;
  var out = [];
  var els = document.querySelectorAll('body *');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.right <= w + 1 && r.left >= -1) continue;
    // preskoc, kdyz uz je nahlaseny nejaky predek - hlasime nejvyssi uroven
    var covered = false;
    for (var j = 0; j < out.length; j++) {
      if (out[j].el && out[j].el.contains(el)) { covered = true; break; }
    }
    if (covered) continue;
    out.push({
      el: el,
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute('data-testid'),
      cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0, 80),
      text: (el.innerText || '').trim().slice(0, 60),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      overflowPx: Math.round(r.right - w),
    });
    if (out.length >= 15) break;
  }
  return out.map(function (o) { delete o.el; return o; });
}

/** Text orezany na sirku (scrollWidth > clientWidth) - bod 74) jmeno se nevejde. */
function clippedText() {
  var out = [];
  var els = document.querySelectorAll('h1,h2,h3,h4,p,span,a,button,td,th,li,label,div');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    if (el.children.length > 0) continue; // jen listove uzly, jinak sum
    var txt = (el.innerText || '').trim();
    if (!txt) continue;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    var cs = getComputedStyle(el);
    out.push({
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute('data-testid'),
      text: txt.slice(0, 60),
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      clippedPx: el.scrollWidth - el.clientWidth,
      textOverflow: cs.textOverflow,
      whiteSpace: cs.whiteSpace,
    });
    if (out.length >= 15) break;
  }
  return out;
}

/** Interaktivni prvky mensi nez 44x44 CSS px (Apple HIG / WCAG 2.5.5 AAA). */
function smallTapTargets() {
  var MIN = 44;
  var sel = 'a,button,[role="button"],[role="radio"],[role="tab"],[role="checkbox"],input,select,summary';
  var out = [];
  var els = document.querySelectorAll(sel);
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
    if (r.width >= MIN && r.height >= MIN) continue;
    if (el.type === 'hidden') continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      role: el.getAttribute('role'),
      testid: el.getAttribute('data-testid'),
      label: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 50),
      width: Math.round(r.width),
      height: Math.round(r.height),
    });
    if (out.length >= 20) break;
  }
  return out;
}

/**
 * Pole s font-size < 16px. Na iOS Safari to pri focusu spusti automaticky zoom
 * cele stranky - klasika, kterou emulovany viewport v Playwrightu neukaze.
 */
function smallFontInputs() {
  var out = [];
  var els = document.querySelectorAll('input,select,textarea');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs >= 16) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      testid: el.getAttribute('data-testid'),
      name: el.getAttribute('name'),
      placeholder: el.getAttribute('placeholder'),
      fontSize: fs,
    });
  }
  return out;
}

/**
 * Stav po otevreni klavesnice. Volat AZ po tapnuti do pole.
 *
 * `visualViewport.height` je jediny spolehlivy signal napric iOS i Androidem:
 * Android Chrome zmensi i window.innerHeight, iOS Safari ne - tam se meni
 * jen visual viewport. Pole je prekryte, kdyz jeho spodni hrana lezi
 * pod spodni hranou visual viewportu.
 */
function keyboardState(focusedSelector, submitSelector) {
  var vv = window.visualViewport;
  function rect(sel) {
    if (!sel) return null;
    var el = document.querySelector(sel);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) };
  }
  var active = document.activeElement;
  var activeRect = active && active.getBoundingClientRect ? active.getBoundingClientRect() : null;
  // Spodni hrana viditelne oblasti v souradnicich layout viewportu.
  var visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  var visibleTop = vv ? vv.offsetTop : 0;

  function covered(r) {
    if (!r) return null;
    return r.bottom > visibleBottom + 1 || r.top < visibleTop - 1;
  }

  var target = focusedSelector ? rect(focusedSelector) : (activeRect ? { top: Math.round(activeRect.top), bottom: Math.round(activeRect.bottom), left: Math.round(activeRect.left), right: Math.round(activeRect.right), width: Math.round(activeRect.width), height: Math.round(activeRect.height) } : null);
  var submit = rect(submitSelector);

  return {
    activeElement: active ? {
      tag: active.tagName.toLowerCase(),
      type: active.getAttribute ? active.getAttribute('type') : null,
      testid: active.getAttribute ? active.getAttribute('data-testid') : null,
      placeholder: active.getAttribute ? active.getAttribute('placeholder') : null,
    } : null,
    innerHeight: window.innerHeight,
    vvHeight: vv ? Math.round(vv.height) : null,
    vvOffsetTop: vv ? Math.round(vv.offsetTop) : null,
    vvScale: vv ? vv.scale : null,
    visibleTop: Math.round(visibleTop),
    visibleBottom: Math.round(visibleBottom),
    keyboardHeightPx: vv ? Math.round(window.innerHeight - vv.height) : null,
    targetRect: target,
    targetCovered: covered(target),
    submitRect: submit,
    submitCovered: covered(submit),
    scrollY: Math.round(window.scrollY),
  };
}

/**
 * Prvky, ktere se vizualne prekryvaji (bod 75 - prekryvajici se text
 * u checkboxu "Chci proverit trvalou adresu").
 * Porovnava jen sourozence, aby rodic-ditko nedelalo sum.
 */
function overlappingSiblings(rootSelector) {
  var root = rootSelector ? document.querySelector(rootSelector) : document.body;
  if (!root) return { error: 'root nenalezen: ' + rootSelector };
  var out = [];
  var walk = root.querySelectorAll('*');
  function box(el) {
    var r = el.getBoundingClientRect();
    return { t: r.top, b: r.bottom, l: r.left, r: r.right, w: r.width, h: r.height };
  }
  function visible(el) {
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
    if (cs.position === 'absolute' || cs.position === 'fixed') return false; // zamerne vrstveni
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  for (var i = 0; i < walk.length; i++) {
    var el = walk[i];
    if (!visible(el)) continue;
    var txt = (el.innerText || '').trim();
    if (!txt || el.children.length > 0) continue;
    var a = box(el);
    var sib = el.parentElement ? el.parentElement.children : [];
    for (var j = 0; j < sib.length; j++) {
      var s = sib[j];
      if (s === el || !visible(s)) continue;
      var stxt = (s.innerText || '').trim();
      if (!stxt) continue;
      var b = box(s);
      var ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      var oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (ox > 2 && oy > 2) {
        out.push({
          a: txt.slice(0, 40),
          b: stxt.slice(0, 40),
          overlapX: Math.round(ox),
          overlapY: Math.round(oy),
        });
      }
    }
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * Pozice sticky/fixed hlavicky. Volat pred a po scrollu - bod 74a)
 * "uskocene vrchni menu" na detailu proverenim.
 */
function stickyHeaderState() {
  var cands = document.querySelectorAll('header,[role="banner"],nav');
  var out = [];
  for (var i = 0; i < cands.length && out.length < 4; i++) {
    var el = cands[i];
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute('data-testid'),
      position: cs.position,
      top: Math.round(r.top),
      height: Math.round(r.height),
      zIndex: cs.zIndex,
    });
  }
  return { scrollY: Math.round(window.scrollY), headers: out };
}

/** Stav skupiny pro vyber rozsahu proverovani (role=radiogroup + dlazdice). */
function scopeRadioGroup() {
  var group = document.querySelector('[role="radiogroup"]');
  if (!group) return { found: false };
  var radios = group.querySelectorAll('[role="radio"]');
  var items = [];
  for (var i = 0; i < radios.length; i++) {
    var el = radios[i];
    var r = el.getBoundingClientRect();
    var imgs = el.querySelectorAll('img,svg,[class*="flag"]');
    var flags = [];
    for (var k = 0; k < imgs.length; k++) {
      var ir = imgs[k].getBoundingClientRect();
      flags.push({
        tag: imgs[k].tagName.toLowerCase(),
        src: imgs[k].getAttribute('src'),
        alt: imgs[k].getAttribute('alt'),
        width: Math.round(ir.width),
        height: Math.round(ir.height),
        naturalWidth: imgs[k].naturalWidth === undefined ? null : imgs[k].naturalWidth,
        rendered: ir.width > 0 && ir.height > 0,
      });
    }
    items.push({
      testid: el.getAttribute('data-testid'),
      ariaChecked: el.getAttribute('aria-checked'),
      label: (el.innerText || '').trim().slice(0, 80),
      width: Math.round(r.width),
      height: Math.round(r.height),
      nestedButtons: el.querySelectorAll('button').length,
      flags: flags,
    });
  }
  return {
    found: true,
    ariaLabel: group.getAttribute('aria-label'),
    count: items.length,
    items: items,
  };
}

/** Otevreny dialog: vejde se do viewportu? Jde odscrollovat? Kde ma tlacitka? */
function dialogFit() {
  var d = document.querySelector('[role="dialog"],[role="alertdialog"]');
  if (!d) return { found: false };
  var r = d.getBoundingClientRect();
  var vv = window.visualViewport;
  var visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  var btns = [];
  var bs = d.querySelectorAll('button,[role="button"]');
  for (var i = 0; i < bs.length && btns.length < 12; i++) {
    var br = bs[i].getBoundingClientRect();
    if (br.width === 0 || br.height === 0) continue;
    btns.push({
      testid: bs[i].getAttribute('data-testid'),
      label: (bs[i].innerText || bs[i].getAttribute('aria-label') || '').trim().slice(0, 40),
      top: Math.round(br.top),
      bottom: Math.round(br.bottom),
      width: Math.round(br.width),
      height: Math.round(br.height),
      belowFold: br.bottom > visibleBottom + 1,
    });
  }
  return {
    found: true,
    testid: d.getAttribute('data-testid'),
    ariaLabel: d.getAttribute('aria-label'),
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    height: Math.round(r.height),
    width: Math.round(r.width),
    viewportHeight: Math.round(visibleBottom),
    tallerThanViewport: r.height > visibleBottom + 1,
    overflowsBottom: r.bottom > visibleBottom + 1,
    scrollable: d.scrollHeight > d.clientHeight + 1,
    scrollHeight: d.scrollHeight,
    clientHeight: d.clientHeight,
    buttons: btns,
  };
}

/** Je uzivatel prihlaseny? Staging odhlasuje cca kazde 3 minuty. */
function loginState() {
  var byTestid = function (id) { return document.querySelector('[data-testid="' + id + '"]'); };
  return {
    hasUserButton: !!(byTestid('header.user.button') || byTestid('header.user.mobile.button')),
    hasLoginButton: !!byTestid('header.login.button'),
    url: location.href,
    bodyText: (document.body ? document.body.innerText : '').slice(0, 200),
  };
}

/** Vypis viditelnych polozek otevreneho hamburger menu. */
function menuItems() {
  var out = [];
  var els = document.querySelectorAll('a,button,[role="menuitem"],[role="link"]');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    var t = (el.innerText || '').trim();
    if (!t) continue;
    out.push({
      text: t.slice(0, 60),
      href: el.getAttribute('href'),
      testid: el.getAttribute('data-testid'),
      top: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    });
    if (out.length >= 40) break;
  }
  return out;
}

/** Pocet radku, na ktere se text realne zalomil - bod 73). */
function lineCount(selector) {
  var el = document.querySelector(selector);
  if (!el) return { found: false };
  var r = el.getBoundingClientRect();
  var lh = parseFloat(getComputedStyle(el).lineHeight);
  if (!lh || isNaN(lh)) lh = parseFloat(getComputedStyle(el).fontSize) * 1.2;
  var rects = el.getClientRects();
  return {
    found: true,
    text: (el.innerText || '').trim().slice(0, 80),
    height: Math.round(r.height),
    lineHeight: Math.round(lh),
    approxLines: Math.round(r.height / lh),
    clientRects: rects.length,
  };
}

module.exports = {
  pageMetrics,
  overflowingElements,
  clippedText,
  smallTapTargets,
  smallFontInputs,
  keyboardState,
  overlappingSiblings,
  stickyHeaderState,
  scopeRadioGroup,
  dialogFit,
  loginState,
  menuItems,
  lineCount,
};
