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
* Tikslus darbo dienų ir darbo valandų (8:00 - 17:00, 8 val./d.) skaičiavimas informaciniame lange.
* Pritaikymo ekrane („Pritaikyti ekrane“) funkcija pagal pasirinktą elementą arba visą tvarkaraštį.
* Dvikryptis elastinis slinkimas į praeitį ir ateitį be dirbtinių apribojimų.
* Šiandienos vertikali žyma („ŠIANDIEN“).
* Užduočių priklausomybių ryšiai (Finish-to-Start) su rodyklėmis.
* Greitas eksportas į PDF, PNG paveikslėlį ir Excel (.xlsx).
""",
    "version": "19.0.1.0.0",
    "category": "Project Management",
    "author": "Benas Jasiulis",
    "maintainer": "Benas Jasiulis",
    "license": "LGPL-3",
    "depends": ["project"],
    "data": [
        "views/timeline_menus.xml",
        "views/project_project_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "all_in_one_timeline/static/lib/dhtmlx_gantt/dhtmlxgantt.js",
            "all_in_one_timeline/static/lib/dhtmlx_gantt/dhtmlxgantt.css",
            "all_in_one_timeline/static/lib/xlsx/xlsx.mini.min.js",
            "all_in_one_timeline/static/lib/html2canvas/html2canvas.min.js",
            "all_in_one_timeline/static/src/scss/all_in_one_timeline.scss",
            "all_in_one_timeline/static/src/views/timeline_client_action.js",
            "all_in_one_timeline/static/src/views/timeline_client_action.xml",
        ],
    },
    "application": True,
    "installable": True,
}
