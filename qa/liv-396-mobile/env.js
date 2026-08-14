'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Nacte .env ze slozky runneru, kdyz existuje.
 *
 * Uz nastavena promenna prostredi ma prednost pred souborem - export v shellu
 * tedy prebije .env, ne naopak.
 *
 * Komentarem je jen cely radek zacinajici na #. Uvnitr hodnoty se # bere
 * doslova, aby se neusekavala hesla, ktera ho obsahuji.
 */
function loadDotEnv(file = path.join(__dirname, '.env')) {
  if (!fs.existsSync(file)) return { loaded: false, keys: [] };

  const keys = [];
  const skipped = [];
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let val = line.slice(eq + 1).trim();
    if (val.length > 1 && ((val[0] === '"' && val.endsWith('"')) || (val[0] === "'" && val.endsWith("'")))) {
      val = val.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = val;
      keys.push(key);
    } else {
      skipped.push(key);
    }
  }
  return { loaded: true, keys, skipped };
}

module.exports = { loadDotEnv };
