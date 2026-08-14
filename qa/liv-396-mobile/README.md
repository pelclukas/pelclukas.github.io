# LIV-396 - real mobile device runner

Automatizovaný průchod mobilního view prověření rizikovosti osob na reálných zařízeních
BrowserStack Automate. Doplňuje bod `real mobile device`, který visí ve **FOR FURTHER TESTING**
od 8. kola testování LIV-396 a nikdy se neudělal.

Rozsah a mapování na body z ticketu je v [PLAN.md](PLAN.md).

## Proč vlastní runner a ne BrowserStack MCP

MCP konektor umí spravovat test casy, spouštět accessibility scany a **sestavit odkaz**
na Live session. Neumí ale krok po kroku řídit prohlížeč na zařízení - `runBrowserLiveSession`
vrátí URL, na kterou musí kliknout člověk. Měření typu „překryla nativní klávesnice
právě editované pole" potřebuje WebDriver session, kterou drží skript. Proto tenhle runner.

## Předpoklady

- Node 18+ (používá se globální `fetch`)
- **BrowserStack Local tunnel** běžící na stroji uvnitř firemní VPN - bez něj se cloudové
  zařízení na interní doménu vůbec nedostane
- síťová dostupnost `hub-cloud.browserstack.com` a `api.browserstack.com` ze stroje,
  kde běží tenhle skript

## Proměnné prostředí

V repu není žádná z nich - repozitář je veřejný. Nejjednodušší je zkopírovat
šablonu a vyplnit ji:

```bash
cp .env.example .env
```

`.env` je v `.gitignore`. Runner ho načte sám, žádná závislost na `dotenv`.
Proměnná už nastavená v shellu má přednost před souborem, takže jednorázový
`DEVICES=... node run.js` funguje i s vyplněným `.env`.

| Proměnná | Povinná | Popis |
| --- | --- | --- |
| `BROWSERSTACK_USERNAME` | ano | z BrowserStack Account Settings |
| `BROWSERSTACK_ACCESS_KEY` | ano | tamtéž |
| `BROWSERSTACK_LOCAL_IDENTIFIER` | ne | jen když byl tunnel spuštěný s `--local-identifier` |
| `LIVENDO_BASE_URL` | ano | základ stagingu bez koncového lomítka |
| `LIVENDO_EMAIL` | ano | testovací účet |
| `LIVENDO_PASSWORD` | ano | heslo testovacího účtu |
| `LIV396_DETAIL_ID` | doporučeno | id existujícího prověření pro test detailu bez placení |
| `LIV396_FIRST_NAME` / `LIV396_LAST_NAME` / `LIV396_BIRTH_DATE` | ne | testovací osoba, výchozí je kontrolní čistá osoba |
| `LIV396_ALLOW_PAYMENT` | ne | `0` = nedokončovat platbu ani v deep režimu |
| `LIV396_SKIP_LANDSCAPE` | ne | `1` = vynechat landscape session |
| `DEVICES` | ne | čárkou oddělené slugy z `devices.js`, jinak se jede celá matice |
| `LIV396_OUT` | ne | výstupní adresář, výchozí `out/` |

## Spuštění

```bash
npm install
node preflight.js   # ověří credentials, tunnel a dostupnost zařízení
node run.js
```

Jedno zařízení:

```bash
DEVICES=iphone-se-2022 node run.js
```

Zařízení jedou **sekvenčně, jedno po druhém**. Není to opomenutí - staging se každé
zhruba 3 minuty odhlašuje a souběžné session si navzájem shazují sezení.

## Výstup

```
out/
  results.json        strukturovaná data všech měření a nálezů
  report.md           přehled nálezů seskupený podle nálezu, ne podle zařízení
  <slug>/*.png        screenshoty včetně snímků s vyjetou nativní klávesnicí
```

`results.json` se přepisuje po každém zařízení, takže pád uprostřed matice
nezahodí už hotové výsledky.

## Zařízení

`devices.js` drží matici z testovacího plánu (Confluence, prostor QA1, stránka Testing,
sekce Doporučená zařízení pro BrowserStack). `preflight.js` ověří, jestli konkrétní
kombinace zařízení a verze OS na účtu existuje, a navrhne nejbližší dostupnou.

Ověřeno 14. 8. 2026: **iPhone SE 2022 má na účtu jen iOS 15.0**, ne 16.

Zařízení označená `deep: true` jedou navíc dokončení platby kredity a samostatnou
landscape session - orientaci nejde u reálného zařízení přepnout za běhu, zadává se
v capabilities.

## Jak se čtou měření klávesnice

`window.visualViewport.height` je jediný signál, který funguje na iOS i Androidu.
Android Chrome při vyjetí klávesnice zmenší i `window.innerHeight`, iOS Safari ne -
tam se mění jen visual viewport. Pole je vyhodnoceno jako překryté, když jeho spodní
hrana leží pod `visualViewport.offsetTop + visualViewport.height`.

`visualViewport.scale > 1` po tapnutí do pole znamená, že iOS Safari stránku
automaticky přiblížil - stává se u polí s `font-size` pod 16 px a na emulovaném
viewportu se to neprojeví vůbec.
