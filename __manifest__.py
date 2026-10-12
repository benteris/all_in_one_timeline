# -*- coding: utf-8 -*-
{
    "name": "GanntLT",
    "summary": "GanntLT - Interaktyvus projektų ir užduočių Gantt tvarkaraštis (Timeline)",
    "description": """
GanntLT - Pažangus Gantt tvarkaraštis projektams ir užduotims
============================================================

Idėjos autorius ir savininkas:
-----------------------------
Benas Jasiulis

100% Standalone (Zero External Dependencies):
--------------------------------------------
* Veikia visiškai autonomiškai be jokių išorinių ar trečiųjų šalių modulių (nereikia project_timeline ar web_timeline).
* Automatiškai sukuria planuojamų datų laukus (planned_date_start, planned_date_end) su integruotu daterange pasirinkimu.
* Integruoja modernų DHTMLX Gantt (Timeline) vaizdą tiesiogiai į Odoo projektus ir užduotis.

Pagrindinės funkcijos:
---------------------
* Interaktyvus vilkimas (Drag-and-Drop) ir trukmės keitimas realiuoju laiku.
* Pilnas veiksmų atšaukimas (Undo / Atšaukti mygtukas ir Ctrl+Z trumpinys).
* Daugiapakopis hierarchinis vaizdas: Projektai -> Gairės (Milestones) -> Užduotys -> Po-užduotys (Subtasks) -> Po-po-užduotys.
* Kaskadinis perkėlimas: perkeliant projektą ar tėvinę užduotį, visi vidiniai elementai sinchroniškai pasislenka kartu.
* Procentinis progresas atvaizduojamas tiesiogiai juostoje; užbaigtos užduotys ir pasiektos gairės žymimos žalia spalva.
* Konteinerio ribų apsauga: gairė ar projektas niekada negali būti mažesnis nei vidinės užduotys.
* Išmanus pritraukimas (Magnetic Snapping) prie tinklelio ir gretimų užduočių pradžios/pabaigos taškų.
* Dinaminis mastelis: 13 zoom lygių nuo 10% iki 600% (Metai, Pusmečiai, Mėnesiai, Savaitės, Dienos, Valandos ir 15 minučių žingsnis).
* Pažymėti savaitgaliai ir Lietuvos valstybinės šventės.
* Darbo valandų (8:00 - 17:00, 8 val./d.) vizualinis išskyrimas.
* Tiesioginis realaus laiko chronometras (Laikmatis) su start/pause/baigti mygtukais bei darbo žiniaraščių (Timesheets) integracija.
* Pritaikymo ekrane („Pritaikyti ekrane“) funkcija pagal pasirinktą elementą arba visą tvarkaraštį.
* Dvikryptis elastinis slinkimas į praeitį ir ateitį be dirbtinių apribojimų.
* Šiandienos vertikali žyma („ŠIANDIEN“).
* Užduočių priklausomybių ryšiai (Finish-to-Start) su rodyklėmis.
* Užrakintų (Locked) užduočių apsauga ir automatinis kaskadinis progreso anuliavimas atvėrus pirmtakų užduotis.
* Tiesioginis planuoto laiko sinchronizavimas su faktinėmis darbo valandomis velkant tvarkaraštį.
* Greitas eksportas į PDF, PNG paveikslėlį ir Excel (.xlsx).
""",
    "version": "1.6.1",
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
            "GanntLT/static/lib/dhtmlx_gantt/dhtmlxgantt.js",
            "GanntLT/static/lib/dhtmlx_gantt/dhtmlxgantt.css",
            "GanntLT/static/lib/xlsx/xlsx.mini.min.js",
            "GanntLT/static/lib/html2canvas/html2canvas.min.js",
            "GanntLT/static/src/scss/gannt_lt.scss",
            "GanntLT/static/src/components/task_timer_widget/task_timer_widget.js",
            "GanntLT/static/src/components/task_timer_widget/task_timer_widget.xml",
            "GanntLT/static/src/views/timeline_client_action.js",
            "GanntLT/static/src/views/timeline_client_action.xml",
        ],
    },
    "application": True,
    "installable": True,
}
