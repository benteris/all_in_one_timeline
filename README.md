# GanntLT 2.0 (Odoo 19)

**Idėjos autorius ir savininkas:** Benas Jasiulis  
**Versija:** 2.0.0  
**Suderinamumas:** Odoo 19.0 Community & Enterprise  
**Priklausomybės (Dependencies):** Tik standartiniai Odoo moduliai `project` ir `hr_timesheet` (100% Standalone – nereikia jokių papildomų ar trečiųjų šalių modulių).

---

## Aprašymas ir Pagrindinės Funkcijos

**GanntLT** – tai pažangus, interaktyvus ir visiškai autonominis projektų, gairių ir užduočių Gantt tvarkaraštis, specialiai pritaikytas Odoo 19 sistemai su pilnu Lietuvos darbo kalendoriaus ir darbo teisės palaikymu.

### Pagrindiniai privalumai:
1. **100% Autonominis modulis (Zero Dependencies)**:
   - Veikia iš karto bet kurioje švarioje Odoo 19 bazėje.
   - Nereikia jokių OCA ar išorinių priklausomybių (jokių `project_timeline` ar `web_timeline`).
   - Turi integruotą planuojamų datų (`planned_date_start`, `planned_date_end`) palaikymą su daterange pasirinkimu.

2. **Daugiapakopė rekursyvi hierarchija**:
   - Griežta struktūra iš viršaus į apačią: **Projektai &rarr; Gairės &rarr; Užduotys &rarr; Po-užduotys &rarr; Po-po-užduotys**.
   - Integruota konteinerių ribų apsauga: tėvinis elementas automatiškai apgaubia visus vidinius elementus.

3. **Realaus laiko chronometras (Laikmatis) ir Gimtoji MRP Sąsaja**:
   - Gyvas bėgantis laikas (sekundžių tikslumu) užduoties ir po-užduočių formose.
   - Odoo gamybos (MRP) stiliaus mygtukai: **Pradėti** (`btn-primary`), **Pauzė** (`btn-warning`) ir **Baigti** (`btn-success`).
   - Integruotas pauzavimo vedlys su priežasčių sąrašu (Pietūs, Įrangos derinimas, Medžiagų trūkumas).
   - Automatinis laiko registravimas darbo žiniaraščiuose (Timesheets).

4. **Terminų ir Vėlavimo Logika (R1, R2, R3 Taisyklės)**:
   - **R1 (Ad-Hoc užduotys)**: Pradėjus ir baigus užduotį be išankstinio plano, nustatomos faktinės datos; vėlavimo uodegėlė **nerodoma**.
   - **R2 (Užduotys su planu)**: Pradinis planas lieka nepaliestas. Faktiškai vėluojant, įrašomas terminas ir rodoma raudona uodegėlė (`+X val.`).
   - **R3 (Kaskadavimas tėvams)**: Po-užduočiai vėluojant, tėvinė užduotis išlaiko savo planą ir automatiškai gauna raudoną uodegėlę iki vėliausio vaiko pabaigos.
   - **Minučių apvalinimas į viršų**: Visos trukmės apvalinamos į viršų iki minutės (15s &rarr; 1 min., 15m 43s &rarr; 16 min., mažiausia skalė 1 min.).
   - Aiškios užvedimo kortelės (Tooltips): rodoma `16 min.`, `1 val. 30 min.`, `+3 val.` be trupmeninių `0.1h`.

5. **24 Kalibruoti Mastelio Lygiai (Zoom 0% – 100%)**:
   - Nuo ilgalaikio strateginio planavimo (Metai, Pusmečiai, Mėnesiai) iki detalaus minutinio valdymo (Dienos, Darbo valandos, 15 min., 1 min.).
   - Dinaminės antraštės su nuliniu teksto persidengimu (Zero Overlap).
   - Klaviatūros trumpiniai `+` ir `-` bei patogus slankiklis įrankių juostoje.

6. **Darbo Valandų Popover Langas ir Lietuvos Šventės**:
   - Mygtukas **Darbo valandos** įrankių juostoje atveria langą su atskirais laukeliais kiekvienai savaitės dienai (pvz., 08:30 – 17:30).
   - Laiko įvedimo normalizavimas (`0830` &rarr; `08:30`) ir išsaugojimas naršyklės `localStorage`.
   - Oficialios Lietuvos valstybinės šventės (fiksuotos ir kilnojamos Velykos) bei savaitgaliai pažymėti vizualiai.

7. **Pilnas Veiksmų Atšaukimas (Undo)**:
   - Mygtukas **Atšaukti** įrankių juostoje bei klaviatūros trumpinys **Ctrl + Z** (iki 50 lygių saugi istorija).

8. **Kaskadinis Perkėlimas ir Priklausomybės**:
   - Užduočių ryšiai (Finish-to-Start) su rodyklėmis.
   - Sinchroninis vidinių elementų poslinkis velkant tėvinius elementus.
   - Blokuotų užduočių apsauga su spynos piktograma 🔒 (kortelėje rodoma „Blokuoja: ...“).

9. **Gimtieji Odoo Dialogai ir Formos Navigacija**:
   - Dvigubas paspaudimas atveria pilnavertę Odoo formą su Chatter ir valdymo juosta.
   - Trinant naudojamas gimtasis Odoo `ConfirmationDialog` su lietuviškais mygtukais „Ištrinti“ ir „Atšaukti“.

10. **Greitas Eksportas**:
    - Eksporto meniu su trimis opcijomis: Excel (.xlsx), PNG aukštos raiškos paveikslėlis ir PDF spausdinys.

11. **Prieigos Teisės (Access Rights)**:
    - `GanntLT: Can View` (tik peržiūra be galimybės stumdyti) ir `GanntLT: Can Edit` (pilnas redagavimas).

---

## Diegimo instrukcija į bet kurį Odoo 19:

1. **Nukopijuokite katalogą**:
   Išarchyvuokite `GanntLT` katalogą į savo Odoo priedų aplanką (pvz., `/opt/odoo/custom_addons/` arba `custom_addons/`).

2. **Atnaujinkite priedų sąrašą**:
   - Prisijunkite prie Odoo administratoriaus teisėmis.
   - Įjunkite kūrėjo režimą: **Nustatymai &rarr; Aktyvuoti programuotojo režimą** (Activate Developer Mode).
   - Eikite į meniu **Programos (Apps)** ir viršuje paspauskite **Atnaujinti programų sąrašą (Update Apps List)**.

3. **Įdiekite modulį**:
   - Paieškos laukelyje įveskite `GanntLT` (pašalinkite filtrą „Programos / Apps“).
   - Paspauskite mygtuką **Įdiegti (Activate)**.

4. **Naudojimas**:
   - Viršutiniame Odoo meniu: **Projektas &rarr; GanntLT Tvarkaraštis**.
   - Užduočių rodinyje: spauskite **Timeline** rodinio mygtuką (fa-tasks piktograma).
   - Projekto formoje: spauskite statinį mygtuką **GanntLT Tvarkaraštis**.
