# -*- coding: utf-8 -*-
{
    "name": "GanntLT 2.0",
    "summary": "GanntLT 2.0 - Interaktyvus projektų ir užduočių Gantt tvarkaraštis (Timeline)",
    "description": """
GanntLT 2.0 - Pažangus Gantt tvarkaraštis projektams ir užduotims
================================================================

Idėjos autorius ir savininkas:
-----------------------------
Benas Jasiulis

100% Standalone (Zero External Dependencies):
--------------------------------------------
* Veikia visiškai autonomiškai be jokių išorinių ar trečiųjų šalių modulių (nereikia project_timeline ar web_timeline).
* Automatiškai sukuria planuojamų datų laukus (planned_date_start, planned_date_end) su integruotu daterange pasirinkimu.
* Integruoja modernų DHTMLX Gantt (Timeline) vaizdą tiesiogiai į Odoo projektus ir užduotis.

Pagrindinės funkcijos (v2.0):
----------------------------
* Interaktyvus vilkimas (Drag-and-Drop) ir trukmės keitimas dešine rankenėle realiuoju laiku.
* Pilnas veiksmų atšaukimas (Undo / Atšaukti mygtukas ir Ctrl+Z trumpinys iki 50 veiksmų).
* Daugiapakopis hierarchinis vaizdas: Projektai -> Gairės (Milestones) -> Užduotys -> Po-užduotys -> Po-po-užduotys.
* Kaskadinis perkėlimas: perkeliant projektą ar tėvinę užduotį, visi vidiniai elementai sinchroniškai pasislenka kartu.
* Konteinerio ribų apsauga: tėvinė užduotis ar projektas niekada negali būti trumpesnis nei vidinės užduotys.
* Išmanus pritraukimas (Magnetic Snapping) prie tinklelio ir gretimų užduočių pradžios/pabaigos taškų.
* Dinaminis kalibruotas mastelis: 24 zoom lygiai nuo 0% iki 100% (Metai, Pusmečiai, Mėnesiai, Savaitės, Dienos, Valandos, 30m, 15m, 1m) su nuliniu antraščių persidengimu.
* Pažymėti savaitgaliai ir Lietuvos valstybinės šventės.
* Darbo valandų (8:00 - 17:00, 8 val./d.) vizualinis išskyrimas bei interaktyvus konfigūravimo popover langas su localStorage išsaugojimu.
* Tiksli terminų ir vėlavimo logika (R1, R2, R3 taisyklės) su raudonomis vėlavimo uodegėlėmis bei kaskadavimu tėvams.
* Minučių apvalinimas į viršų (Ceil Rounding, min. 1 min., 15s -> 1 min.) ir aiškios užvedimo kortelės be trupmeninių 0.1h.
* Gimtoji Odoo MRP sąsaja: Pradėti (btn-primary), Pauzė (btn-warning) su Odoo pauzės vedliu ir Baigti (btn-success).
* Tiesioginis realaus laiko chronometras (Laikmatis) su darbo žiniaraščių (Timesheets) automatine integracija.
* Užduočių priklausomybių ryšiai (Finish-to-Start) su rodyklėmis ir spynos 🔒 apsauga blokuotiems darbams.
* Pilna formos navigacija dvigubu paspaudimu ir Odoo ConfirmationDialog trynimo patvirtinimui.
* Greitas eksportas į PDF, didelės raiškos PNG paveikslėlį ir Excel (.xlsx).
* Vartotojų prieigos teisės: GanntLT: Can View ir GanntLT: Can Edit.
""",
    "version": "2.0.0",
    "category": "Project Management",
    "author": "Benas Jasiulis",
    "maintainer": "Benas Jasiulis",
    "license": "LGPL-3",
    "depends": ["project", "hr_timesheet"],
    "data": [
        "security/gannt_lt_security.xml",
        "security/ir.model.access.csv",
        "views/project_task_pause_wizard_views.xml",
        "views/project_task_views.xml",
        "views/project_project_views.xml",
        "views/project_milestone_views.xml",
        "views/timeline_menus.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "GanntLT/static/src/vendor/dhtmlx_gantt/dhtmlxgantt.js",
            "GanntLT/static/src/vendor/dhtmlx_gantt/dhtmlxgantt.css",
            "GanntLT/static/src/vendor/xlsx/xlsx.mini.min.js",
            "GanntLT/static/src/vendor/html2canvas/html2canvas.min.js",
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
