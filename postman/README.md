# CC servisa — Postman kolekce

Kolekce pro testování **credit-check-api** (CC servisa) nad testovacími osobami
z Confluence stránky
[Osoby pro testing CC](https://livendo.atlassian.net/wiki/spaces/QA1/pages/1599176706/Osoby+pro+testing+CC).

## Soubory

| soubor | co to je |
|---|---|
| `CC-servisa.postman_collection.json` | kolekce (66 requestů) |
| `CC-stage.postman_environment.json` | společný staging |
| `CC-pr.postman_environment.json` | feature staging pro PR (přednastaveno `prNumber = 68`) |
| `CC-prod.postman_environment.json` | produkce |

## Přepínání URL

Base URL se **skládá automaticky** v pre-request skriptu kolekce, takže se
nikde nemusí přepisovat ručně. Řídí ji tři proměnné:

| `env` | `prNumber` | výsledná base URL |
|---|---|---|
| `stage` | — | `https://php-credit-check-app.k8stage.ulovdomov.cz` |
| `pr` | `68` | `https://php-credit-check-app-68.k8stage.ulovdomov.cz` |
| `prod` | — | `https://php-cc.api.ulovdomov.cz` |

Testování PR [#68](https://github.com/ulovdomov/credit-check-api/pull/68) =
vybrat environment **CC – PR (feature staging)**. Jiné PR = jen přepsat
`prNumber`.

Proměnná `baseUrlOverride` přebije všechno ostatní (lokální běh, tunel, …).

## Struktura kolekce

```
00 – Info & smoke              GET /v1/doc/, čtení výsledku podle {{ccId}}
CZ osoby (9)                   9× START + RESULT, všech 5 CZ rejstříků
SK osoby (4)                   4× START + RESULT, všech 8 SK rejstříků
UA osoby (4)                   4× START + RESULT, všechny 3 UA rejstříky
  └ Varianty přepisu jména     8× START + RESULT (transkripce / pasová translit.)
Doplňkové scénáře              adresa, doplnění scraperu, 5 negativních případů
Report API                     /v1/cc/report/*, /run, /user-reports-list (Bearer)
```

Každá osoba má vlastní složku se dvěma requesty:

* **START** — `POST /v1/cc/start/`, uloží `parentCcId` do `{{ccId}}`
  a do vlastní proměnné (např. `{{cz04_kanak_ccId}}`)
* **RESULT** — `GET /v1/cc/result/{id}` s testy na stavy registrů a očekávané nálezy

## Sady rejstříků

Podle zadání dostane každá osoba **kompletní sadu své země**, ne jen ty
rejstříky, kde má očekávaný záznam.

**CZ (5)** `businessRegisterCz`, `tradeRegisterCz`, `insolvencyRegisterCz`,
`policeRegisterCz`, `executionRegisterCz`

**SK (8)** `tradeRegisterSk`, `insolvencyRegisterSk`, `policeRegisterSk`,
`financialRegisterSk`, `healthInsuranceRegisterSk`, `unionRegisterSk`,
`vzpRegisterSk`, `executionRegisterSk`

**UA (3)** `corruptionRegisterUa`, `debtRegisterUa`, `wantedPersonUa`

`permanentAddressCz` (skupina `CZ_ADDRESS`) se nespouští podle jména, ale podle
adresy — má samostatný request ve složce *Doplňkové scénáře*.

## Testy

`RESULT` requesty ověřují:

1. odpověď obsahuje všechny vyžádané registry,
2. všechny jsou ve stavu `done` a bez `errorMessage`,
3. registry, kde wiki očekává záznam, opravdu nějaký vrátily,
4. ostatní registry jsou prázdné,
5. `report.hasRecords` odpovídá očekávání.

### Asynchronní běh

Scrapery běží ve frontě, takže hned po `START` je většina registrů `pending`.
`RESULT` requesty se proto v **Collection Runneru** samy opakují
(`postman.setNextRequest`), dokud vše nedoběhne — max `{{pollMaxTries}}`
(výchozí 20) pokusů. V Runneru nastav **Delay ≈ 2000 ms**.

Vypnutí: `pollEnabled = false`. Mimo Runner (jednotlivý request) se polling
neuplatní, stačí request pustit znovu.

## Na co pozor

* `executionRegisterCz` a `executionRegisterSk` jsou placené (Cribis) a **mimo
  produkci vracejí MOCK data** — první záznam končí textem `[MOCK]`. Testy je
  proto neověřují tvrdě, jen logují do konzole.
* Bez parametru `scrapersList` se spustí všechny rejstříky **kromě** těch dvou placených.
* `patronym` je povinný jen u UA a **nejde doplnit dodatečně** přes `parentCcId`
  (známý problém, je na to negativní request).
* Proměnná `token` pro *Report API* je **prázdná** — doplň si ji ručně,
  v repozitáři žádný token není.

## Předpoklady

* **Ilona Barkociová** nemá ve wiki u sebe žádný rejstřík. Je zařazená mezi CZ
  osoby jako negativní kontrola (očekává se `hasRecords: false`). Pokud má
  patřit jinam, stačí request přesunout.
* Mapování názvů z wiki na klíče scraperů podle
  [Technické dokumentace CC](https://livendo.atlassian.net/wiki/spaces/Y/pages/473071620/Technick+dokumentace+CC):
  *Registr živnostenského podnikání* → `businessRegisterCz`,
  *Obchodní rejstřík / Obchodný register* → `tradeRegisterCz` / `tradeRegisterSk`,
  *Dôvera ZP* → `healthInsuranceRegisterSk`,
  *Slovenská komora exekútorov* → `executionRegisterSk`.
