# GanntLT (Odoo 19)

**Idėjos autorius ir savininkas:** Benas Jasiulis  
**Versija:** 1.6.1  
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

3. **Realaus laiko chronometras (Laikmatis) ir MRP mygtukai**:
   - Gyvas bėgantis laikas (sekundžių tikslumu) užduoties ir po-užduočių formose.
   - **Pradėti**, **Pristabdyti** (su priežasties nurodymu), **Baigti** ir **Atnaujinti** mygtukai.
   - Automatinis laiko registravimas darbo žiniaraščiuose (Timesheets).
   - Ad-hoc užduotims automatiškai nustatomos planuotos datos pagal faktinį atlikimo laiką.

4. **13 Mastelio lygių (Zoom 10% – 600%)**:
   - Nuo ilgalaikio planavimo (10% – 5+ metai) iki detalaus minutinio valdymo (600% – 15 min. žingsniai).
   - Valandinis detalumas (300%, 400%, 500%) su paryškintomis darbo valandomis (8:00 – 17:00).

5. **Lietuvos darbo kalendorius ir šventės**:
   - Oficialios Lietuvos valstybinės šventės (fiksuotos ir kilnojamos Velykos) bei savaitgaliai pažymėti vizualiai.
   - Darbo dienų ir darbo valandų (8 val./d.) skaičiavimas be išeiginių.

6. **Pilnas veiksmų atšaukimas (Undo)**:
   - Mygtukas **Atšaukti** įrankių juostoje bei klaviatūros trumpinys **Ctrl + Z**.
   - Iki 50 lygių saugi istorija.

7. **Kaskadinis perkėlimas ir priklausomybės**:
   - Užduočių ryšiai (Finish-to-Start) su rodyklėmis.
   - Sinchroninis vidinių elementų poslinkis velkant tėvinius elementus.
   - Blokuotų užduočių apsauga (0% progresas, kol neatlikti pirmtakai).

8. **Pritaikymas ekrane („Pritaikyti ekrane“)**:
   - Automatiškai pritaiko pasirinktą užduotį arba visą tvarkaraštį ekrane be rankinio slankiojimo.

9. **Eksportas**:
   - Greitas eksportas į PDF, PNG paveikslėlį ir Excel (.xlsx) failą.

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
