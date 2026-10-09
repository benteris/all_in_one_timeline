# -*- coding: utf-8 -*-
{
    "name": "All In One Timeline",
    "summary": "Interaktyvus projektų ir užduočių Gantt tvarkaraštis (Timeline)",
    "description": """
All In One Timeline - Pažangus Gantt tvarkaraštis projektams ir užduotims
========================================================================

Idėjos autorius ir savininkas:
-----------------------------
Benas Jasiulis

Pagrindinės funkcijos:
---------------------
* Interaktyvus vilkimas (Drag-and-Drop) ir trukmės keitimas realiuoju laiku.
* Pilnas veiksmų atšaukimas (Undo / Atšaukti mygtukas ir Ctrl+Z trumpinys).
* Daugiapakopis hierarchinis vaizdas: Projektai -> Gairės (Milestones) -> Užduotys -> Po-užduotys (Subtasks).
* Kaskadinis perkėlimas: perkeliant projektą ar tėvinę užduotį, visi vidiniai elementai sinchroniškai pasislenka kartu.
* Procentinis progresas atvaizduojamas tiesiogiai juostoje; užbaigtos užduotys ir pasiektos gairės žymimos žalia spalva.
* Konteinerio ribų apsauga: gairė ar projektas niekada negali būti mažesnis nei vidinės užduotys.
* Išmanus pritraukimas (Magnetic Snapping) prie tinklelio ir gretimų užduočių pradžios/pabaigos taškų.
* Dinaminis mastelis: Diena, Savaitė, Mėnuo ir Metai (numatytasis vaizdas) su lietuviškais mėnesių ir dienų pavadinimais.
* Pažymėti savaitgaliai ir Lietuvos valstybinės šventės.
* Pilnas užduočių ir projektų būsenų atvaizdavimas (Vykdoma, Laukiama, Patvirtinta, Koregavimas, Atšaukta, Užbaigta) su atitinkamomis spalvomis ir piktogramomis.
* Gairių planuojamos datos (Planned Date) ir automatinis gairių termino pratęsimas pagal vėluojančias užduotis.
* Projektų viršutinio lygio terminai ir vėlavimo vizualizacija.
* Tikslus vėlavimo darbo dienų ir darbo valandų skaičiavimas be savaitgalių ir švenčių dienų.
* Tikslus darbo dienų ir darbo valandų (8:00 - 17:00, 8 val./d.) skaičiavimas informaciniame lange.
* Pritaikymo ekrane („Pritaikyti ekrane“) funkcija pagal pasirinktą elementą arba visą tvarkaraštį.
* Dvikryptis elastinis slinkimas į praeitį ir ateitį be dirbtinių apribojimų.
* Šiandienos vertikali žyma („ŠIANDIEN“).
* Užduočių priklausomybių ryšiai (Finish-to-Start) su rodyklėmis.
* Užrakintų (Locked) užduočių apsauga: blokuojamos užduotys negali turėti progreso (0%), automatinis progreso anuliavimas atvėrus pirmtakų užduotis.
* Tiesioginis planuoto laiko (Allocated Time) sinchronizavimas su faktinėmis darbo valandomis (Darbo valandos) velkant tvarkaraštį.
* Detalus valandinis mastelis (300%, 400%, 500%) su darbo valandų (8:00 - 17:00) vizualiniu išskyrimu ir valandinių užduočių vilkimu realiuoju laiku.
* Greitas eksportas į PDF, PNG paveikslėlį ir Excel (.xlsx).
""",
    "version": "1.6",
    "category": "Project Management",
    "author": "Benas Jasiulis",
    "maintainer": "Benas Jasiulis",
    "license": "LGPL-3",
    "depends": ["project", "hr_timesheet"],
    "data": [
        "security/ir.model.access.csv",
        "views/project_task_pause_wizard_views.xml",
        "views/project_task_views.xml",
        "views/project_project_views.xml",
        "views/project_milestone_views.xml",
        "views/timeline_menus.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "all_in_one_timeline/static/lib/dhtmlx_gantt/dhtmlxgantt.js",
            "all_in_one_timeline/static/lib/dhtmlx_gantt/dhtmlxgantt.css",
            "all_in_one_timeline/static/lib/xlsx/xlsx.mini.min.js",
            "all_in_one_timeline/static/lib/html2canvas/html2canvas.min.js",
            "all_in_one_timeline/static/src/scss/all_in_one_timeline.scss",
            "all_in_one_timeline/static/src/components/task_timer_widget/task_timer_widget.js",
            "all_in_one_timeline/static/src/components/task_timer_widget/task_timer_widget.xml",
            "all_in_one_timeline/static/src/views/timeline_client_action.js",
            "all_in_one_timeline/static/src/views/timeline_client_action.xml",
        ],
    },
    "application": True,
    "installable": True,
}
