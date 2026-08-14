'use strict';

/**
 * Matice zarizeni dle testovaciho planu v Confluence (prostor QA1, page 1563295753,
 * sekce "Doporucena zarizeni pro BrowserStack").
 *
 * Sloupec `viewport` je ocekavana CSS sirka x vyska - runner ji porovna s realne
 * namerenym `innerWidth`/`innerHeight` a odchylku zaznamena. Neni to assert,
 * prohlizecove listy vysku bezne ubiraji.
 *
 * osVersion se pred behem validuje proti api.browserstack.com/automate/browsers.json
 * (viz preflight.js) - kdyz konkretni verze na uctu neni, vybere se nejblizsi vyssi.
 */
module.exports = [
  {
    slug: 'iphone-se-2022',
    label: 'iPhone SE (2022)',
    platform: 'ios',
    deviceName: 'iPhone SE 2022',
    // Overeno proti uctu 14. 8. 2026: iOS 16 na tomto zarizeni neni, nejvyssi je 15.0.
    osVersion: '15.0',
    browserName: 'safari',
    viewport: [375, 667],
    note: 'nejmensi viewport, nejrizikovejsi',
    deep: true,
  },
  {
    slug: 'iphone-14',
    label: 'iPhone 14',
    platform: 'ios',
    deviceName: 'iPhone 14',
    osVersion: '16',
    browserName: 'safari',
    viewport: [390, 844],
    note: 'nejsirsi pokryti napric generacemi - shodne s emulovanym viewportem z predchozich kol',
  },
  {
    slug: 'iphone-11',
    label: 'iPhone 11',
    platform: 'ios',
    deviceName: 'iPhone 11',
    osVersion: '16',
    browserName: 'safari',
    viewport: [414, 896],
    note: 'nejvetsi podil CZ mobilniho provozu (13,3 %)',
  },
  {
    slug: 'iphone-16-pro',
    label: 'iPhone 16 Pro',
    platform: 'ios',
    deviceName: 'iPhone 16 Pro',
    osVersion: '18',
    browserName: 'safari',
    viewport: [402, 874],
    note: 'aktualni mainstream generace, Dynamic Island',
  },
  {
    slug: 'iphone-16-pro-max',
    label: 'iPhone 16 Pro Max',
    platform: 'ios',
    deviceName: 'iPhone 16 Pro Max',
    osVersion: '18',
    browserName: 'safari',
    viewport: [440, 956],
    note: 'nejvetsi displej, safe-area dole',
  },
  {
    slug: 'galaxy-s23-chrome',
    label: 'Samsung Galaxy S23 (Chrome)',
    platform: 'android',
    deviceName: 'Samsung Galaxy S23',
    osVersion: '13.0',
    browserName: 'chrome',
    viewport: [360, 780],
    note: 'hlavni Android zastupce',
    deep: true,
  },
  {
    slug: 'galaxy-s23-samsung-internet',
    label: 'Samsung Galaxy S23 (Samsung Internet)',
    platform: 'android',
    deviceName: 'Samsung Galaxy S23',
    osVersion: '13.0',
    browserName: 'samsung',
    viewport: [360, 780],
    note: 'jediny beh Samsung Internetu v cele matici',
  },
  {
    slug: 'galaxy-a55',
    label: 'Samsung Galaxy A55',
    platform: 'android',
    deviceName: 'Samsung Galaxy A55',
    osVersion: '14.0',
    browserName: 'chrome',
    viewport: [412, 892],
    note: 'nejprodavanejsi Android rada v CR',
  },
  {
    slug: 'pixel-9',
    label: 'Google Pixel 9',
    platform: 'android',
    deviceName: 'Google Pixel 9',
    osVersion: '15.0',
    browserName: 'chrome',
    viewport: [412, 915],
    note: 'Chrome mimo Samsung ekosystem',
  },
  {
    slug: 'ipad-10',
    label: 'iPad 10th',
    platform: 'ios',
    deviceName: 'iPad 10th',
    osVersion: '16',
    browserName: 'safari',
    viewport: [820, 1180],
    note: 'primarni tablet viewport',
    deep: true,
  },
];
