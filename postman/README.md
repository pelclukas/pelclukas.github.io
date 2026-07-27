# CC servisa — Postman kolekce

Testovací osoby z Confluence
[Osoby pro testing CC](https://livendo.atlassian.net/wiki/spaces/QA1/pages/1599176706/Osoby+pro+testing+CC).

Navazuje na kolekci **Credit Check staging** — používá stejné proměnné
(`cc-php-service-url`, `token_cc_service`, `url_ud_be`, `url_ud_be_api`,
`bearer_token`, `email`, `password`) i stejný styl testů, takže funguje
s existujícím environmentem bez úprav.

## Soubory

| soubor | co to je |
|---|---|
| `CC-servisa.postman_collection.json` | kolekce (68 requestů) |
| `CC-stage.postman_environment.json` | společný staging |
| `CC-pr.postman_environment.json` | feature staging PR (přednastaveno `cc_pr = 68`) |
| `CC-prod.postman_environment.json` | produkce |

Environmenty jsou jen pro pohodlí — pokud už máš vlastní, stačí importovat
kolekci a přidat si do svého environmentu `cc_pr` a `cc_url_override`.

## Přepínání URL

Base URL CC servisy se bere z `cc-php-service-url`. Přepnutí na feature staging
konkrétního PR je otázka jedné proměnné:

| proměnná | hodnota | výsledek |
|---|---|---|
| `cc_pr` | `68` | `https://php-credit-check-app-68.k8stage.ulovdomov.cz` |
| `cc_url_override` | libovolná URL | použije se přesně ta |
| obojí prázdné | — | `cc-php-service-url` z environmentu |

Pre-request skript kolekce environment nepřepisuje, jen pro daný běh nastaví
lokální proměnnou — stejně jako to dělal `Login` request s `base_url`.

## Endpointy

| metoda | cesta | popis |
|---|---|---|
| `POST` | `/v1/cc/create` | spustí prověření, vrátí `data.ccId` |
| `GET` | `/v1/cc/result/{id}` | průběžný i finální výsledek |
| `GET` | `/v1/cc/report/{parentCcId}` | report nad parent CC |
| `GET` | `/v1/doc/` | OpenAPI dokumentace |

Vše pod Bearer `{{token_cc_service}}` (auth je na úrovni kolekce).

Složka **Report API (UD BE)** jede na `{{url_ud_be_api}}` s `{{bearer_token}}`
z `Login` requestu.

## Struktura

```
00 – Login & smoke             Login do UD BE, /v1/doc/, čtení podle {{parentCcId}}
CZ osoby (9)                   9× CREATE + RESULT, všech 5 CZ rejstříků
SK osoby (4)                   4× CREATE + RESULT, všech 8 SK rejstříků
UA osoby (4)                   4× CREATE + RESULT, všechny 3 UA rejstříky
  └ Varianty přepisu jména     8× CREATE + RESULT (transkripce / pasová translit.)
Doplňkové scénáře              adresa, child CC, 4 negativní případy
CC servisa – report            GET /v1/cc/report/{parentCcId}
Report API (UD BE)             create → run → add-result → report → PDF
```

Každá osoba má vlastní složku:

* **CREATE** — `POST /v1/cc/create`, uloží `ccId` do `{{parentCcId}}`
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

`permanentAddressCz` se nehledá podle jména, ale podle adresy — má samostatný
request ve složce *Doplňkové scénáře*.

## Testy

`RESULT` requesty ověřují:

1. odpověď obsahuje všechny vyžádané registry,
2. všechny jsou ve stavu `done` a bez `errorMessage`,
3. registry, kde wiki očekává záznam, opravdu nějaký vrátily,
4. ostatní registry jsou prázdné,
5. `report.hasRecords` odpovídá očekávání.

### Asynchronní běh

Scrapery běží ve frontě, takže hned po `CREATE` je většina registrů `pending`.
`RESULT` requesty se proto v **Collection Runneru** samy opakují
(`postman.setNextRequest`), dokud vše nedoběhne — max `{{pollMaxTries}}`
(výchozí 20) pokusů. V Runneru nastav **Delay ≈ 2000 ms**.

Vypnutí: `pollEnabled = false`. Mimo Runner se polling neuplatní, stačí
request pustit znovu.

## Na co pozor

* `executionRegisterCz` a `executionRegisterSk` jsou placené (Cribis) a **mimo
  produkci vracejí MOCK data** — první záznam končí `[MOCK]`. Testy je proto
  neověřují tvrdě, jen logují do konzole.
* Bez `scrapersList` se spustí všechny rejstříky **kromě** těch dvou placených.
* `patronym` je povinný jen u UA a **nejde doplnit dodatečně** přes `parentCcId`
  (známý problém, je na to negativní request).
* **Dva různé tvary odpovědi.** `POST /v1/cc/create` vrací
  `{"error": null, "ccRunId": 5338}`, kdežto `GET /v1/cc/result/{id}` vrací
  `{"success": true, "data": {...}}`. `CREATE` testy proto čtou `ccRunId`
  (s fallbackem na `data.ccId`), `RESULT` testy `data`.
* Tokeny a hesla jsou v environmentech **prázdné** — doplň si je ručně,
  v repozitáři žádné nejsou.

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
