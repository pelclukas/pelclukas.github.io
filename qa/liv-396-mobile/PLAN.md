# LIV-396 - testovací plán pro reálná mobilní zařízení

Vykrystalizováno z popisu ticketu a všech 34 komentářů (11 kol testování).
Bod `real mobile device` je ve **FOR FURTHER TESTING** od 8. kola (komentář 59390)
až do posledního reportu a nikdy se neudělal.

Zdroj matice zařízení: Confluence, prostor QA1, stránka Testing, sekce
Doporučená zařízení pro BrowserStack.

## Východisko

Mobil-specifické body z ticketu jsou **1), 71), 72), 73), 74), 74a), 75), 76)**.
Všechny jsou odškrtnuté jako opravené, ale ověřené jen na **emulovaném viewportu
390×844 v Playwrightu** (retest v komentáři 59390 to uvádí přímo: „desktop 1440×900
+ mobile 390×844"). Emulace nezachytí nativní klávesnici, iOS auto-zoom při focusu,
dynamickou spodní lištu Safari ani safe-area. To je díra, kterou tenhle běh zavírá.

Funkční správnost se netestuje - zadání zní ověřit, že mobilní view drží.

## A. Retest dřívějších mobilních nálezů

| Bod | Co se ověřuje | Kde v kódu |
| --- | --- | --- |
| 1) | Rozbalené hlavní menu jde na touch zavřít - hover na dotyku neexistuje | `stepHamburger` |
| 71) | Tap na „Zobrazit detailní rozpis" rozbalí řádky, „Zobrazit záznam" je klikatelné | `stepDetail` |
| 72) | Vlaječky u variant rozsahu se vykreslily (`naturalWidth > 0`) | `stepForm` |
| 73) | Nadpis „Prověření zájemců" se neláme na víc než dva řádky | `stepLanding` |
| 74) | Jméno na detailu se vejde bez ořezu (`scrollWidth > clientWidth`) | `stepDetail` |
| 74a) | Sticky hlavička na detailu po scrollu neuskočí | `stepDetail` |
| 75) | Label „Chci prověřit trvalou adresu na úřadě" se s ničím nepřekrývá - na `/form` i v modalu | `stepForm`, `stepModalNew` |
| 76) | Po přihlášení je prověření dostupné z hamburger menu | `stepHamburger` |
| 97) | Výběr rozsahu má `role="radiogroup"` a `aria-checked` i v mobilním view | `stepForm` |

## B. Klávesnice a formulář

Čistě real-device téma, na emulaci neměřitelné.

- Jméno, Příjmení, Datum narození - po tapnutí nesmí nativní klávesnice překrýt
  editované pole ani submit. Měří se `visualViewport` proti `getBoundingClientRect()`,
  ke každému poli je screenshot s reálnou vyjetou klávesnicí.
- **iOS auto-zoom** při focusu do pole s `font-size` pod 16 px (`visualViewport.scale > 1`).
- Datepicker po vyplnění data - přesahuje přes spodní hranu viewportu? Jde odscrollovat?
- Checkbox trvalé adresy - překryv sousedních textů, velikost tap targetu.
- Submit „Prověřit zájemce" - viditelný, ne pod foldem, aspoň 44×44 px.

## C. Co emulace nezachytí

- Horizontální přetečení (`scrollWidth > innerWidth`) na landingu, formuláři,
  seznamu i detailu, s výpisem konkrétních viníků.
- Safe-area (`env(safe-area-inset-*)`) - Dynamic Island nahoře, home indicator dole.
- Platební modál - vejde se na nejmenší viewport, jde odscrollovat, tlačítka
  nad foldem a dost velká na dotyk.
- Tap targety pod 44×44 px napříč stránkami.
- Landscape na vybraných zařízeních (samostatná session).
- **Samsung Internet** - jediný běh tohohle prohlížeče v celé matici.

## D. Základní proklikání

landing → hamburger → formulář → výběr rozsahu → platební modál → seznam → detail

V deep režimu navíc dokončení platby **kredity** (dva kroky: „Zaplatit", pak
„Ano, potvrdit") a kontrola čerstvě vzniklého prověření.

Kartou se neplatí - platba kartou na stagingu končí přesměrováním na produkční URL
(bod 14, známý blocker) a je o dvě obrazovky delší.

Testovací osoba je kontrolní čistá osoba, u které se nečekají žádné záznamy.
Běh tak není závislý na obsahu rejstříků.

## Mimo rozsah

- funkční správnost rejstříků a obsah reportů
- bod 15) promokódy - čeká na platný kód, není mobilní téma
- body 88) a 89a) - kontrasty a konzistence fontů, čekají na Sherpas
- platební brána samotná - dle WONT DO v ticketu se o ni stará GoPay

## Matice zařízení

| # | Zařízení | Viewport | Pokrývá | Režim |
| --- | --- | --- | --- | --- |
| 1 | iPhone SE (2022) | 375×667 | nejmenší viewport, nejrizikovější | deep + landscape |
| 2 | iPhone 14 | 390×844 | shodné s emulací z předchozích kol | core |
| 3 | iPhone 11 | 414×896 | největší podíl CZ mobilního provozu | core |
| 4 | iPhone 16 Pro | 402×874 | aktuální mainstream, Dynamic Island | core |
| 5 | iPhone 16 Pro Max | 440×956 | největší displej, safe-area dole | core |
| 6 | Galaxy S23 (Chrome) | 360×780 | hlavní Android zástupce | deep + landscape |
| 7 | Galaxy S23 (Samsung Internet) | 360×780 | jediný Samsung Internet v matici | core |
| 8 | Galaxy A55 | 412×892 | nejprodávanější Android řada v ČR | core |
| 9 | Pixel 9 | 412×915 | Chrome mimo Samsung ekosystém | core |
| 10 | iPad 10th | 820×1180 | primární tablet viewport | deep + landscape |

Pořadí je od nejmenšího iOS - tam se problémy s překryvem projeví nejdřív.

## Provozní poznámky

- Staging se odhlašuje zhruba každé 3 minuty. Runner proto před každým chráněným
  krokem kontroluje stav přihlášení a případně se přihlásí znovu.
- Zařízení jedou sekvenčně. Souběžné session si navzájem shazují sezení.
- Kredity na stagingu jsou sandboxové.
