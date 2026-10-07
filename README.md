# All In One Timeline (Odoo 19)

**Idėjos autorius ir savininkas:** Benas Jasiulis  
**Suderinamumas:** Odoo 19.0 Community & Enterprise  
**Priklausomybės (Dependencies):** Tik standartinis Odoo modulis `project`

---

## Aprašymas ir Pagrindinės Funkcijos

**All In One Timeline** – tai pažangus, interaktyvus projektų, gairių ir užduočių planavimo įrankis (Gantt tvarkaraštis), sukurtas Odoo 19 sistemai.

### Pagrindiniai privalumai:
1. **Pilnas veiksmų atšaukimas (Undo)**:
   - Mygtukas **Atšaukti** įrankių juostoje tiesiai šalia mygtuko *Išskleisti*.
   - Klaviatūros trumpinys **Ctrl + Z** (arba Cmd + Z).
   - Iki 50 lygių istorijos (atšaukia užduočių ir projektų perkėlimus, trukmės pakeitimus, priklausomybių ryšius).

2. **Daugiapakopė hierarchija**:
   - Griežta struktūra iš viršaus į apačią: **Projektai &rarr; Gairės &rarr; Užduotys &rarr; Po-užduotys**.
   - Kairėje lentelėje pateikiami tik esminiai duomenys: Užduoties pavadinimas ir Atsakingas asmuo su avataru.

3. **Kaskadinis perkėlimas (Cascading Drag & Drop)**:
   - Perkeliant projektą ar tėvinę užduotį, visos vidinės gairės ir užduotys sinchroniškai juda kartu, išlaikydamos tikslius intervalus.

4. **Konteinerio ribų apsauga**:
   - Gairė ar projektas niekada negali tapti mažesnis nei vidinės užduotys.

5. **Procento ir būsenos atvaizdavimas**:
   - Procentinė reikšmė atvaizduojama tiesiogiai laiko juostoje.
   - Užbaigtos užduotys ir pasiektos gairės vizualiai nusidažo žalia spalva.

6. **Lietuvos darbo kalendorius ir darbo valandos**:
   - Aiškiai pažymėti savaitgaliai ir Lietuvos valstybinės šventės.
   - Informaciniame lange automatiškai skaičiuojamos tikros darbo dienos ir darbo valandos (8:00 - 17:00, 8 val./d.).

7. **Elastinis slinkimas į praeitį ir ateitį**:
   - Laisvas horizontalus slinkimas be dirbtinių sienų. Slenkant į praeitį, tvarkaraštis automatiškai prideda praeities metus.
   - Numatytasis mastelis atidarius – **Metai**.

8. **Pritaikymas ekrane („Pritaikyti ekrane“)**:
   - Pasirinkus elementą, tvarkaraštis automatiškai parinka optimalų mastelį (Savaitė / Mėnuo / Metai) ir sutalpina elementą ekrane be papildomo slinkimo.

9. **Eksportas**:
   - Galimybė eksportuoti tvarkaraštį į PDF, PNG paveikslėlį ir Excel (.xlsx) failą.

---

## Diegimo instrukcija į bet kurį Odoo 19:

1. **Nukopijuokite katalogą**:
   Išarchyvuokite `all_in_one_timeline` katalogą į savo Odoo priedų aplanką (pvz., `/opt/odoo/custom_addons/` arba `addons/`).

2. **Atnaujinkite priedų sąrašą**:
   - Prisijunkite prie Odoo administratoriaus teisėmis.
   - Įjunkite kūrėjo režimą: **Nustatymai &rarr; Aktyvuoti programuotojo režimą** (Activate Developer Mode).
   - Eikite į meniu **Programos (Apps)** ir viršuje paspauskite **Atnaujinti programų sąrašą (Update Apps List)**.

3. **Įdiekite modulį**:
   - Paieškos laukelyje įveskite `All In One Timeline` (jei reikia, pašalinkite filtrą „Programos / Apps“).
   - Paspauskite mygtuką **Įdiegti (Activate)**.

4. **Naudojimas**:
   - Modulis automatiškai integruojasi į Odoo **Projektų (Projects)** modulį:
     - Užduočių rodinyje atsiranda **Timeline** (tvarkaraščio) piktograma.
     - Projekto kortelėje atsiranda mygtukas **All In One Timeline**.
