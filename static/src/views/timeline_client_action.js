/** @odoo-module **/

import { Component, onMounted, useRef, useState, onWillUnmount, onWillUpdateProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { Layout } from "@web/search/layout";
import { SearchBar } from "@web/search/search_bar/search_bar";
import { useSearchBarToggler } from "@web/search/search_bar/search_bar_toggler";
import { CogMenu } from "@web/search/cog_menu/cog_menu";
import { useSetupAction } from "@web/search/action_hook";
import { standardViewProps } from "@web/views/standard_view_props";

export const LITHUANIAN_MONTHS = [
    "Sausis",
    "Vasaris",
    "Kovas",
    "Balandis",
    "Gegužė",
    "Birželis",
    "Liepa",
    "Rugpjūtis",
    "Rugsėjis",
    "Spalis",
    "Lapkritis",
    "Gruodis",
];

export const LITHUANIAN_MONTHS_SHORT = [
    "Sau",
    "Vas",
    "Kov",
    "Bal",
    "Geg",
    "Bir",
    "Lie",
    "Rgp",
    "Rgs",
    "Spa",
    "Lap",
    "Gru",
];

export const ZOOM_STEPS = [10, 15, 20, 35, 50, 75, 100, 150, 200, 250];
export const TIMELINE_VIEW_STATE_KEY = "all_in_one_timeline_viewport_state";

export const ZOOM_PX_PER_DAY = {
    250: 80,
    200: 64,
    150: 48,
    100: 32,
    75: 24,
    50: 18,
    35: 32 / 7,
    20: 24 / 7,
    15: 18 / 7,
    10: 14 / 7,
};

export const LITHUANIAN_MONTHS_GENITIVE = [
    "sausio",
    "vasario",
    "kovo",
    "balandžio",
    "gegužės",
    "birželio",
    "liepos",
    "rugpjūčio",
    "rugsėjo",
    "spalio",
    "lapkričio",
    "gruodžio",
];

export const LITHUANIAN_WEEKDAYS = [
    "Sekmadienis",
    "Pirmadienis",
    "Antradienis",
    "Trečiadienis",
    "Ketvirtadienis",
    "Penktadienis",
    "Šeštadienis",
];

export const LITHUANIAN_WEEKDAYS_SHORT = [
    "Sk",
    "Pr",
    "An",
    "Tr",
    "Kt",
    "Pn",
    "Št",
];

/**
 * Returns official Lithuanian National Holiday name if the given date is a holiday.
 * Covers all 16 official non-working holidays according to Article 123 of the Labour Code of the Republic of Lithuania.
 */
export function getLithuanianHoliday(date) {
    if (!date) return null;
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1 - 12
    const day = date.getDate();

    // 1. Fixed annual Lithuanian National Holidays
    const fixedHolidays = {
        "1-1": "Naujieji metai",
        "2-16": "Lietuvos valstybės atkūrimo diena",
        "3-11": "Lietuvos nepriklausomybės atkūrimo diena",
        "5-1": "Tarptautinė darbo diena",
        "6-24": "Rasos ir Joninių diena",
        "7-6": "Valstybės (Lietuvos karaliaus Mindaugo karūnavimo) ir Tautiškos giesmės diena",
        "8-15": "Žolinė (Švč. Mergelės Marijos ėmimo į dangų diena)",
        "11-1": "Visų Šventųjų diena",
        "11-2": "Mirusiųjų atminimo (Vėlinių) diena",
        "12-24": "Kūčių diena",
        "12-25": "Kalėdų pirmoji diena",
        "12-26": "Kalėdų antroji diena",
    };

    const key = `${month}-${day}`;
    if (fixedHolidays[key]) {
        return fixedHolidays[key];
    }

    // 2. Movable Christian Easter calculation (Gregorian Computus)
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
    const easterDay = ((h + l - 7 * m + 114) % 31) + 1;

    // Easter Sunday (Krikščionių Velykos - 1 diena)
    if (month === easterMonth && day === easterDay) {
        return "Krikščionių Velykos (pirmoji diena)";
    }

    // Easter Monday (Krikščionių Velykos - 2 diena)
    const easterSundayDate = new Date(year, easterMonth - 1, easterDay);
    const easterMondayDate = new Date(easterSundayDate);
    easterMondayDate.setDate(easterSundayDate.getDate() + 1);
    if (month === easterMondayDate.getMonth() + 1 && day === easterMondayDate.getDate()) {
        return "Krikščionių Velykos (antroji diena)";
    }

    // 3. Mother's Day: First Sunday of May
    if (month === 5 && date.getDay() === 0 && day <= 7) {
        return "Motinos diena";
    }

    // 4. Father's Day: First Sunday of June
    if (month === 6 && date.getDay() === 0 && day <= 7) {
        return "Tėvo diena";
    }

    return null;
}

/**
 * Checks if a given date is a weekend (Saturday = 6 or Sunday = 0).
 */
export function isWeekend(date) {
    if (!date) return false;
    const day = date.getDay();
    return day === 0 || day === 6;
}

/**
 * Calculates ISO 8601 week number (standard in Lithuania and Europe).
 * Weeks start on Monday; Week 1 contains the first Thursday of the year.
 */
export function getISOWeekNumber(date) {
    if (!date) return 1;
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Format Date object to Odoo standard datetime string 'YYYY-MM-DD HH:mm:ss'
 */
export function formatOdooDateTime(date) {
    if (!date) return "";
    const d = new Date(date);
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Calculates actual working days and hours between start and end dates.
 * Excludes weekends (Saturday, Sunday) and Lithuanian national holidays.
 * Working hours are strictly counted as 8 hours per actual working day (8:00 - 17:00).
 */
export function calculateWorkingDaysAndHours(startDate, endDate) {
    if (!startDate || !endDate) {
        return { workDays: 0, workHours: 0, calendarDays: 0 };
    }
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) {
        return { workDays: 0, workHours: 0, calendarDays: 0 };
    }

    // Determine calendar start day and end day
    const startDay = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    let endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate());

    // If endDate is exactly midnight (00:00:00) and is on a later day than startDay,
    // in Gantt semantics it designates the boundary ending the previous day.
    if (e.getHours() === 0 && e.getMinutes() === 0 && e.getSeconds() === 0 && endDay.getTime() > startDay.getTime()) {
        endDay.setDate(endDay.getDate() - 1);
    }

    let workDays = 0;
    let totalCalendarDays = 0;
    const curr = new Date(startDay);

    while (curr <= endDay) {
        totalCalendarDays++;
        if (!isWeekend(curr) && !getLithuanianHoliday(curr)) {
            workDays++;
        }
        curr.setDate(curr.getDate() + 1);
    }

    const workHours = workDays * 8;
    return {
        workDays,
        workHours,
        calendarDays: totalCalendarDays,
    };
}

/**
 * Computes standard business work dates (08:00:00 - 17:00:00) from Gantt grid dates.
 * Gantt visual dates represent intervals [startDay 00:00:00, endDayBoundary 00:00:00).
 * If endDayBoundary is at 00:00:00 and > startDay, the last active work day is endDayBoundary - 1 day.
 */
export function computeWorkDates(startDate, endDate) {
    if (!startDate || !endDate) {
        const now = new Date();
        const defStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
        const defEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0);
        return { workStart: defStart, workEnd: defEnd };
    }
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
        const now = new Date();
        return {
            workStart: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0),
            workEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0),
        };
    }

    const workStart = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 8, 0, 0);

    let endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    // In Gantt half-open interval [start, end), if endDate is midnight (00:00:00) and after startDay,
    // the task ended on the preceding calendar day.
    if (e.getHours() === 0 && e.getMinutes() === 0 && e.getSeconds() === 0) {
        const startDayMidnight = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
        if (endDay.getTime() > startDayMidnight) {
            endDay.setDate(endDay.getDate() - 1);
        }
    }

    let workEnd = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 17, 0, 0);
    if (workEnd.getTime() <= workStart.getTime()) {
        workEnd = new Date(workStart.getFullYear(), workStart.getMonth(), workStart.getDate(), 17, 0, 0);
    }

    return { workStart, workEnd };
}

export class AllInOneTimelineAction extends Component {
    static template = "all_in_one_timeline.AllInOneTimelineView";
    static components = { Layout, SearchBar, CogMenu };
    static props = {
        ...standardViewProps,
    };

    setup() {
        this.orm = useService("orm");
        this.actionService = useService("action");
        this.notification = useService("notification");
        this.root = useRef("root");
        this.ganttElement = useRef("ganttElement");

        if (this.env.searchModel) {
            useSetupAction({ rootRef: this.root });
            this.searchBarToggler = useSearchBarToggler();
        }

        const context = this.props.action?.context || this.props.context || {};
        let defaultProjId = context.default_project_id || 0;
        if (!defaultProjId && context.active_id && (this.props.resModel === "project.project" || context.active_model === "project.project")) {
            defaultProjId = context.active_id;
        }
        if (!defaultProjId && this.props.domain && Array.isArray(this.props.domain)) {
            for (const leaf of this.props.domain) {
                if (Array.isArray(leaf) && leaf[0] === "project_id" && (leaf[1] === "=" || leaf[1] === "in")) {
                    if (typeof leaf[2] === "number") {
                        defaultProjId = leaf[2];
                    } else if (Array.isArray(leaf[2]) && leaf[2].length === 1) {
                        defaultProjId = leaf[2][0];
                    }
                }
            }
        }

        let savedState = null;
        try {
            const raw = sessionStorage.getItem(TIMELINE_VIEW_STATE_KEY);
            if (raw) {
                savedState = JSON.parse(raw);
            }
        } catch {}

        let initialZoom = 100;
        if (savedState && typeof savedState.zoomLevel === "number" && ZOOM_STEPS.includes(savedState.zoomLevel)) {
            initialZoom = savedState.zoomLevel;
        }

        let initialProjId = defaultProjId;
        if (!initialProjId && savedState && typeof savedState.selectedProjectId === "number") {
            initialProjId = savedState.selectedProjectId;
        }

        this._savedViewState = savedState;

        this.state = useState({
            selectedProjectId: initialProjId,
            currentScale: "year",
            zoomLevel: initialZoom,
            projects: [],
            undoCount: 0,
        });

        this.undoStack = [];
        this._pendingUndoAction = null;
        this.gantt = null;
        this.eventIds = [];
        this.onGridClickHandler = null;
        this._initialScrollDone = false;
        this._isExpandingRange = false;
        this._saveViewStateTimer = null;

        this.onKeyDown = (e) => {
            if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable)) {
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
                e.preventDefault();
                this.undoAction();
            }
        };
        window.addEventListener("keydown", this.onKeyDown);

        onMounted(async () => {
            await this.initGantt();
            await this.loadTimelineData();
        });

        onWillUpdateProps(async (nextProps) => {
            if (nextProps.domain && JSON.stringify(nextProps.domain) !== JSON.stringify(this.props.domain)) {
                await this.loadTimelineData(nextProps.domain);
            }
        });

        onWillUnmount(() => {
            this.saveViewState();
            if (this._saveViewStateTimer) {
                clearTimeout(this._saveViewStateTimer);
                this._saveViewStateTimer = null;
            }
            if (this._sidebarClickTimer) {
                clearTimeout(this._sidebarClickTimer);
                this._sidebarClickTimer = null;
            }
            if (this.onKeyDown) {
                window.removeEventListener("keydown", this.onKeyDown);
                this.onKeyDown = null;
            }
            this.hideSnapGuide();
            if (this.onGridClickHandler && this.ganttElement.el) {
                this.ganttElement.el.removeEventListener("click", this.onGridClickHandler);
                this.onGridClickHandler = null;
            }
            if (this.onGridDblClickHandler && this.ganttElement.el) {
                this.ganttElement.el.removeEventListener("dblclick", this.onGridDblClickHandler);
                this.onGridDblClickHandler = null;
            }
            if (this.onWheelHandler && this.ganttElement.el) {
                this.ganttElement.el.removeEventListener("wheel", this.onWheelHandler);
                this.onWheelHandler = null;
            }
            if (this.gantt) {
                if (this.eventIds && this.eventIds.length) {
                    for (const id of this.eventIds) {
                        try {
                            this.gantt.detachEvent(id);
                        } catch {
                            // ignore
                        }
                    }
                    this.eventIds = [];
                }
                if (this.gantt.clearAll) {
                    this.gantt.clearAll();
                }
            }
        });
    }

    get canUndo() {
        return (this.state.undoCount || 0) > 0;
    }

    get display() {
        return {
            controlPanel: {},
            ...this.props.display,
        };
    }

    /**
     * Save current timeline viewport (zoom level, project filter, center date, and scroll positions)
     * into sessionStorage so that navigating to form views and returning restores exact viewport.
     */
    saveViewState() {
        if (!this.gantt) return;
        try {
            const scroll = this.gantt.getScrollState ? this.gantt.getScrollState() : { x: 0, y: 0 };
            const visWidth = this.getTimelineVisibleWidth();
            let centerDate = null;
            if (this.gantt.dateFromPos) {
                const centerPx = scroll.x + Math.floor(visWidth / 2);
                const d = this.gantt.dateFromPos(centerPx);
                if (d && !isNaN(d.getTime())) {
                    centerDate = d.getTime();
                }
            }
            const stateObj = {
                zoomLevel: this.state.zoomLevel,
                selectedProjectId: this.state.selectedProjectId,
                scrollX: scroll.x,
                scrollY: scroll.y,
                centerDate: centerDate,
            };
            sessionStorage.setItem(TIMELINE_VIEW_STATE_KEY, JSON.stringify(stateObj));
        } catch {}
    }

    hideTooltip() {
        if (this.gantt && this.gantt.ext && this.gantt.ext.tooltips) {
            try {
                this.gantt.ext.tooltips.tooltip.hide();
            } catch {}
        }
        const tips = document.querySelectorAll(".gantt_tooltip");
        for (const tip of tips) {
            tip.style.display = "none";
        }
    }

    showSnapGuide(px) {
        if (!this.ganttElement || !this.ganttElement.el) return;
        const area = this.ganttElement.el.querySelector(".gantt_bars_area") || this.ganttElement.el.querySelector(".gantt_task_data");
        if (!area) return;
        let guide = area.querySelector(".gantt_magnetic_snap_line");
        if (!guide) {
            guide = document.createElement("div");
            guide.className = "gantt_magnetic_snap_line";
            area.appendChild(guide);
        }
        guide.style.display = "block";
        guide.style.left = `${px}px`;
    }

    hideSnapGuide() {
        if (!this.ganttElement || !this.ganttElement.el) return;
        const guide = this.ganttElement.el.querySelector(".gantt_magnetic_snap_line");
        if (guide) {
            guide.style.display = "none";
        }
    }

    /**
     * Initialize DHTMLX Gantt instance and event listeners
     */
    async initGantt() {
        if (!window.Gantt && !window.dhtmlxgantt) {
            console.error("DHTMLX Gantt library not loaded");
            return;
        }

        // Get fresh isolated Gantt instance
        this.gantt = window.Gantt ? window.Gantt.getGanttInstance() : window.gantt;

        // Enable plugins
        if (this.gantt.plugins) {
            this.gantt.plugins({
                marker: true,
                tooltip: true,
            });
        }

        const g = this.gantt;
        window.activeGantt = this.gantt;

        // Configure Lithuanian locale safely without touching g.date functions
        if (g.locale && g.locale.date) {
            g.locale.date.month_full = LITHUANIAN_MONTHS;
            g.locale.date.month_short = LITHUANIAN_MONTHS.map((m) => m.slice(0, 3));
            g.locale.date.day_full = LITHUANIAN_WEEKDAYS;
            g.locale.date.day_short = LITHUANIAN_WEEKDAYS_SHORT;
        }

        // Date formats & base config
        g.config.date_format = "%Y-%m-%d %H:%i:%s";
        g.config.row_height = 52;
        g.config.bar_height = 34;
        g.config.grid_resize = true;
        g.config.grid_width = 440;
        g.config.start_on_monday = true;
        g.config.open_tree_init = true;
        g.config.fit_tasks = false;
        g.config.autoscroll = true;
        g.config.autoscroll_speed = 30;
        g.config.drag_links = true;
        g.config.drag_progress = true;
        g.config.drag_resize = true;
        g.config.drag_move = true;
        g.config.order_branch = false;
        g.config.order_branch_free = false;
        g.config.round_dnd_dates = true;
        g.config.readonly = false;
        g.config.tooltip_timeout = 250;
        g.config.tooltip_hide_timeout = 30;
        g.config.show_errors = false;

        // Columns in Left Tree Grid (Only Task and Assignee columns)
        g.config.columns = [
            {
                name: "text",
                label: _t("Užduotis / Task"),
                tree: true,
                width: 290,
                resize: true,
                template: (task) => {
                    if (task.is_project) {
                        const icon = (task.is_done || task.state === "1_done")
                            ? "fa fa-check-circle text-success"
                            : (task.state === "03_approved"
                                ? "fa fa-circle text-success"
                                : (task.state === "02_changes_requested"
                                    ? "fa fa-exclamation-triangle text-warning"
                                    : (task.state === "1_canceled"
                                        ? "fa fa-times-circle text-danger"
                                        : (task.state === "04_waiting_normal"
                                            ? "fa fa-clock-o text-secondary"
                                            : "fa fa-folder-open text-primary"))));
                        return `<i class="${icon} me-1"></i><b>${task.text}</b>`;
                    }
                    if (task.is_milestone) {
                        const icon = (task.is_done || task.state === "1_done")
                            ? "fa fa-check-circle text-success"
                            : "fa fa-flag text-primary";
                        return `<i class="${icon} me-1"></i><b>${task.text}</b>`;
                    }
                    const icon = (task.is_done || task.state === "1_done")
                        ? "fa fa-check-circle text-success"
                        : (task.state === "03_approved"
                            ? "fa fa-circle text-success"
                            : (task.state === "02_changes_requested"
                                ? "fa fa-exclamation-triangle text-warning"
                                : (task.state === "1_canceled"
                                    ? "fa fa-times-circle text-danger"
                                    : (task.state === "04_waiting_normal"
                                        ? "fa fa-clock-o text-secondary"
                                        : "fa fa-tasks text-muted"))));
                    return `<i class="${icon} me-1"></i>${task.text}`;
                },
            },
            {
                name: "assignees",
                label: _t("Atsakingas"),
                align: "left",
                width: 150,
                resize: true,
                template: (task) => {
                    if (task.assignee_avatars && task.assignee_avatars.length) {
                        const avatarHtml = task.assignee_avatars
                            .map((a) => `<img src="${a.avatar}" class="mini_avatar" title="${a.name}" alt="${a.name}"/>`)
                            .join("");
                        return `<div class="assignee_cell">${avatarHtml} <span class="assignee_name">${task.assignees}</span></div>`;
                    }
                    return `<span class="text-muted small">-</span>`;
                },
            },
        ];

        // Set default scale (Zoom-driven)
        this.applyScaleConfig();

        // Rich Tooltip (Translated to Lithuanian)
        g.templates.tooltip_date_format = (date) => {
            if (!date) return "";
            const d = new Date(date);
            const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
            const m = LITHUANIAN_MONTHS_GENITIVE[d.getMonth()];
            return `${d.getFullYear()} m. ${m} ${d.getDate()} d. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        g.templates.tooltip_text = (start, end, task) => {
            let effStart, effEnd;
            if (task.work_start_date && task.work_end_date && !task._is_dragged) {
                effStart = new Date(task.work_start_date.replace(/-/g, "/"));
                effEnd = new Date(task.work_end_date.replace(/-/g, "/"));
            } else {
                const computed = computeWorkDates(task.start_date || start, task.end_date || end);
                effStart = computed.workStart;
                effEnd = computed.workEnd;
            }

            const startStr = g.templates.tooltip_date_format(effStart);
            const endStr = g.templates.tooltip_date_format(effEnd);
            const percent = Math.round((task.progress || 0) * 100);
            const { workDays, workHours, calendarDays } = calculateWorkingDaysAndHours(effStart, effEnd);
            const durationDisplay = calendarDays || task.duration || 1;

            let deadlineHtml = "";
            let dlDate = null;
            if (task.date_deadline || task.has_deadline) {
                const dlRaw = task.date_deadline || task.deadline;
                if (dlRaw) {
                    dlDate = new Date(String(dlRaw).replace(/-/g, "/"));
                    if (!isNaN(dlDate.getTime())) {
                        const dlFormatted = g.templates.tooltip_date_format(dlDate);
                        deadlineHtml += `<div class="tooltip_row tooltip_deadline_row"><span class="tooltip_label">Terminas:</span> <span class="tooltip_val">${dlFormatted}</span></div>`;
                    } else {
                        dlDate = null;
                    }
                }
            }
            if (task.has_deadline_delay) {
                const delayDays = task.delay_days || 0;
                deadlineHtml += `<div class="tooltip_row tooltip_delay_row"><span class="tooltip_label">Vėlavimas:</span> <span class="tooltip_val text-danger fw-bold">+${delayDays} d. (pratęstas)</span></div>`;

                // Calculate actual working days and working hours in the delayed window (excluding weekends & holidays)
                let delayWorkDays = 0;
                let delayWorkHours = 0;
                if (effEnd && dlDate && dlDate > effEnd) {
                    const delayStart = new Date(effEnd.getFullYear(), effEnd.getMonth(), effEnd.getDate() + 1, 8, 0, 0);
                    const delayCalc = calculateWorkingDaysAndHours(delayStart, dlDate);
                    delayWorkDays = delayCalc.workDays;
                    delayWorkHours = delayCalc.workHours;
                }
                deadlineHtml += `<div class="tooltip_row tooltip_delay_row"><span class="tooltip_label">Vėlavimo d. dienos:</span> <span class="tooltip_val text-danger fw-bold">${delayWorkDays} d.</span></div>`;
                deadlineHtml += `<div class="tooltip_row tooltip_delay_row"><span class="tooltip_label">Vėlavimo d. valandos:</span> <span class="tooltip_val text-danger fw-bold">${delayWorkHours} val.</span></div>`;
            }

            if (task.is_milestone) {
                return `
                    <div class="gantt_tooltip_inner">
                        <div class="tooltip_title"><i class="fa fa-flag text-primary me-1"></i>${task.text}</div>
                        <div class="tooltip_row"><span class="tooltip_label">Tipas:</span> <span class="tooltip_val">Projekto gairė</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Projektas:</span> <span class="tooltip_val">${task.project_name || "-"}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Pradžia:</span> <span class="tooltip_val">${startStr}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Pabaiga:</span> <span class="tooltip_val">${endStr}</span></div>
                        ${deadlineHtml}
                        <div class="tooltip_row"><span class="tooltip_label">Trukmė:</span> <span class="tooltip_val">${durationDisplay} d.</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Darbo dienos:</span> <span class="tooltip_val"><b>${workDays} d.</b></span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Darbo valandos:</span> <span class="tooltip_val"><b>${workHours} val.</b></span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Būsena:</span> <span class="tooltip_val">${task.is_done ? "Pasiekta" : "Vykdoma"}</span></div>
                        ${task.task_count !== undefined ? `<div class="tooltip_row"><span class="tooltip_label">Užduotys:</span> <span class="tooltip_val">${task.done_task_count || 0} / ${task.task_count}</span></div>` : ""}
                        <div class="tooltip_progress_bar">
                            <div class="tooltip_progress_fill" style="width: ${percent}%;"></div>
                        </div>
                    </div>
                `;
            }

            if (task.is_project) {
                return `
                    <div class="gantt_tooltip_inner">
                        <div class="tooltip_title"><i class="fa fa-folder-open text-primary me-1"></i>${task.text}</div>
                        <div class="tooltip_row"><span class="tooltip_label">Tipas:</span> <span class="tooltip_val">Projektas</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Pradžia:</span> <span class="tooltip_val">${startStr}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Pabaiga:</span> <span class="tooltip_val">${endStr}</span></div>
                        ${deadlineHtml}
                        <div class="tooltip_row"><span class="tooltip_label">Trukmė:</span> <span class="tooltip_val">${durationDisplay} d.</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Darbo dienos:</span> <span class="tooltip_val"><b>${workDays} d.</b></span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Darbo valandos:</span> <span class="tooltip_val"><b>${workHours} val.</b></span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Atsakingas:</span> <span class="tooltip_val">${task.assignees || "-"}</span></div>
                        ${task.allocated_hours ? `<div class="tooltip_row"><span class="tooltip_label">Planuotos val.:</span> <span class="tooltip_val">${task.allocated_hours}</span></div>` : ""}
                        <div class="tooltip_progress_bar">
                            <div class="tooltip_progress_fill" style="width: ${percent}%;"></div>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="gantt_tooltip_inner">
                    <div class="tooltip_title">${task.text}</div>
                    <div class="tooltip_row"><span class="tooltip_label">Projektas:</span> <span class="tooltip_val">${task.project_name || "-"}</span></div>
                    <div class="tooltip_row"><span class="tooltip_label">Pradžia:</span> <span class="tooltip_val">${startStr}</span></div>
                    <div class="tooltip_row"><span class="tooltip_label">Pabaiga:</span> <span class="tooltip_val">${endStr}</span></div>
                    ${deadlineHtml}
                    <div class="tooltip_row"><span class="tooltip_label">Trukmė:</span> <span class="tooltip_val">${durationDisplay} d.</span></div>
                    <div class="tooltip_row"><span class="tooltip_label">Darbo dienos:</span> <span class="tooltip_val"><b>${workDays} d.</b></span></div>
                    <div class="tooltip_row"><span class="tooltip_label">Darbo valandos:</span> <span class="tooltip_val"><b>${workHours} val.</b></span></div>
                    ${task.allocated_hours ? `<div class="tooltip_row"><span class="tooltip_label">Planuotos val.:</span> <span class="tooltip_val">${task.allocated_hours}</span></div>` : ""}
                    ${task.assignees ? `<div class="tooltip_row"><span class="tooltip_label">Atsakingas:</span> <span class="tooltip_val">${task.assignees}</span></div>` : ""}
                    ${task.stage_name ? `<div class="tooltip_row"><span class="tooltip_label">Etapas:</span> <span class="tooltip_val">${task.stage_name}</span></div>` : ""}
                    <div class="tooltip_progress_bar">
                        <div class="tooltip_progress_fill" style="width: ${percent}%;"></div>
                    </div>
                </div>
            `;
        };

        // Task Bar Text & Progress Template (Reflects progress directly in the line itself and renders deadline delay bar)
        g.templates.task_text = (start, end, task) => {
            const percent = Math.round((task.progress || 0) * 100);
            const isDone = task.is_done || percent >= 100 || task.state === "1_done";
            const badgeClass = isDone ? "bar_prog_badge bar_prog_100" : "bar_prog_badge";

            // Status icon: Done gets a checkmark, Changes Requested gets an exclamation triangle,
            // Cancelled gets a cross, Waiting gets a clock.
            // Approved gets NO checkmark (just solid green as requested).
            let statusIcon = "";
            if (isDone) {
                statusIcon = `<i class="fa fa-check me-1"></i>`;
            } else if (task.state === "02_changes_requested") {
                statusIcon = `<i class="fa fa-exclamation-triangle me-1"></i>`;
            } else if (task.state === "1_canceled") {
                statusIcon = `<i class="fa fa-times-circle me-1"></i>`;
            } else if (task.state === "04_waiting_normal") {
                statusIcon = `<i class="fa fa-clock-o me-1"></i>`;
            }

            let delayBarHtml = "";
            if (task.has_deadline_delay && task.deadline_end) {
                const dlEnd = task.deadline_end instanceof Date
                    ? task.deadline_end
                    : new Date(String(task.deadline_end).replace(/-/g, "/"));
                if (!isNaN(dlEnd.getTime())) {
                    let widthPx = 0;
                    try {
                        const sPx = (typeof g.posFromDate === "function") ? g.posFromDate(end || task.end_date) : -1;
                        const ePx = (typeof g.posFromDate === "function") ? g.posFromDate(dlEnd) : -1;
                        if (sPx >= 0 && ePx > sPx) {
                            widthPx = Math.round(ePx - sPx);
                        }
                    } catch {
                        widthPx = 0;
                    }
                    if (!widthPx || widthPx <= 0) {
                        const eDate = (end || task.end_date) instanceof Date ? (end || task.end_date) : new Date(String(end || task.end_date).replace(/-/g, "/"));
                        const diffDays = Math.max(1, Math.round((dlEnd.getTime() - eDate.getTime()) / 86400000));
                        const pxPerDay = ZOOM_PX_PER_DAY[this.state.zoomLevel] || 32;
                        widthPx = Math.round(diffDays * pxPerDay);
                    }

                    const delayDays = task.delay_days || 0;
                    const badgeText = widthPx >= 28
                        ? `<i class="fa fa-clock-o me-1"></i>+${delayDays} d.`
                        : (widthPx >= 14 ? `+${delayDays}` : "");
                    delayBarHtml = `
                        <div class="timeline_deadline_delay_bar" style="position: absolute; left: 100%; top: -1px; width: ${widthPx}px; height: calc(100% + 2px);">
                            <span class="deadline_badge">${badgeText}</span>
                        </div>
                    `;
                }
            }

            return `
                <span class="bar_content_wrapper">
                    <span class="bar_text">${statusIcon}${task.text}</span>
                    <span class="${badgeClass}">${percent}%</span>
                </span>
                ${delayBarHtml}
            `;
        };

        // Task Bar Styling Template (Applies status classes)
        g.templates.task_class = (start, end, task) => {
            const extraClass = task.has_deadline_delay ? " has_deadline_delay" : "";
            const state = task.state || (task.is_done ? "1_done" : "01_in_progress");

            if (task.is_project) {
                let pClass = "gantt_project";
                if (state === "1_done" || task.is_done || task.progress >= 1.0) {
                    pClass += " project_done project_state_done";
                } else if (state === "03_approved") {
                    pClass += " project_state_approved";
                } else if (state === "02_changes_requested") {
                    pClass += " project_state_changes_requested";
                } else if (state === "1_canceled") {
                    pClass += " project_state_canceled";
                } else if (state === "04_waiting_normal") {
                    pClass += " project_state_waiting";
                } else {
                    pClass += " project_state_in_progress";
                }
                return pClass + extraClass;
            }

            if (task.is_milestone) {
                let mClass = "timeline_milestone_bar";
                if (state === "1_done" || task.is_done || task.progress >= 1.0) {
                    mClass += " milestone_done milestone_state_done";
                } else {
                    mClass += " milestone_state_in_progress";
                }
                return mClass + extraClass;
            }

            // Task / Subtask
            let tClass = "task_standard";
            if (state === "1_done" || task.is_done || task.progress >= 1.0) {
                tClass += " task_done task_state_done";
            } else if (state === "03_approved") {
                tClass += " task_approved task_state_approved";
            } else if (state === "02_changes_requested") {
                tClass += " task_changes_requested task_state_changes_requested";
            } else if (state === "1_canceled") {
                tClass += " task_canceled task_state_canceled";
            } else if (state === "04_waiting_normal") {
                tClass += " task_waiting task_state_waiting";
            } else {
                tClass += " task_in_progress task_state_in_progress";
            }
            return tClass + extraClass;
        };

        // Mark Today, Weekends, and Lithuanian National Holidays in Scale Header (strictly for day units only)
        g.templates.scale_cell_class = (date, scale) => {
            if (scale && scale.unit !== "day") {
                return "";
            }
            if (this.state.zoomLevel < 50) {
                return "";
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);

            const isToday = (
                d.getFullYear() === today.getFullYear() &&
                d.getMonth() === today.getMonth() &&
                d.getDate() === today.getDate()
            );

            const classes = [];
            if (isToday) {
                classes.push("today_scale_cell");
            }

            const hol = getLithuanianHoliday(d);
            if (hol) {
                classes.push("holiday_scale_cell");
            } else if (isWeekend(d)) {
                classes.push("weekend_scale_cell");
            }

            return classes.join(" ");
        };

        // Mark Today, Weekends, and Lithuanian National Holidays in Timeline Background Cells
        g.templates.timeline_cell_class = (task, date) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);

            const isMacroTimeline = this.state.zoomLevel < 65;
            if (isMacroTimeline) {
                // In quarter, month or week zoom mode, check if today is inside this cell interval
                if (this.state.zoomLevel <= 15) {
                    const qD = Math.floor(d.getMonth() / 3);
                    const qToday = Math.floor(today.getMonth() / 3);
                    if (d.getFullYear() === today.getFullYear() && qD === qToday) {
                        return "today_cell";
                    }
                } else if (this.state.zoomLevel < 35) {
                    if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) {
                        return "today_cell";
                    }
                } else {
                    const endWeek = new Date(d.getTime() + 7 * 86400000);
                    if (today >= d && today < endWeek) {
                        return "today_cell";
                    }
                }
                return "";
            }

            const isToday = (
                d.getFullYear() === today.getFullYear() &&
                d.getMonth() === today.getMonth() &&
                d.getDate() === today.getDate()
            );

            const classes = [];
            if (isToday) {
                classes.push("today_cell");
            }

            const hol = getLithuanianHoliday(d);
            if (hol) {
                classes.push("holiday_cell");
            } else if (isWeekend(d)) {
                classes.push("weekend_cell");
            }

            return classes.join(" ");
        };

        // Detach any previous Gantt events if re-initializing
        if (this.eventIds && this.eventIds.length) {
            for (const id of this.eventIds) {
                try {
                    g.detachEvent(id);
                } catch {
                    // ignore
                }
            }
            this.eventIds = [];
        }

        // Render dynamic Today vertical line marker on render and scroll
        this.eventIds.push(g.attachEvent("onGanttRender", () => this.renderTodayMarker()));
        this.eventIds.push(g.attachEvent("onGanttScroll", (oldLeft, oldTop, left, top) => {
            this.hideTooltip();
            this.renderTodayMarker();

            if (!this._isZooming) {
                if (this._saveViewStateTimer) {
                    clearTimeout(this._saveViewStateTimer);
                }
                this._saveViewStateTimer = setTimeout(() => {
                    this._saveViewStateTimer = null;
                    this.saveViewState();
                }, 150);
            }

            // Bidirectional elastic infinite scroll: expand only when user actively scrolls past edge
            if (!this._isExpandingRange && !this._isZooming) {
                if (oldLeft !== undefined && left !== undefined) {
                    if (left < oldLeft && left <= 15) {
                        this.expandTimelineToPast(0);
                    } else if (left > oldLeft) {
                        const dataArea = this.ganttElement.el ? this.ganttElement.el.querySelector(".gantt_data_area") : null;
                        if (dataArea) {
                            const scrollWidth = dataArea.scrollWidth;
                            const clientWidth = dataArea.clientWidth;
                            const maxScroll = scrollWidth - clientWidth;
                            if (maxScroll > 100 && left >= maxScroll - 15) {
                                this.expandTimelineToFuture(0);
                            }
                        }
                    }
                }
            }
        }));

        // Selection / Click Handler: NEVER scroll if click is on the timeline chart or after a drag!
        this.eventIds.push(g.attachEvent("onTaskClick", (id, e) => {
            if (this._justDragged) {
                return true;
            }
            // Check if the click occurred in the left sidebar tree grid
            const isGridClick = e && e.target && e.target.closest && !!e.target.closest(".gantt_grid");
            if (!isGridClick) {
                // Click is on the timeline chart / bar itself - keep viewport completely steady without jumping!
                return true;
            }

            // User clicked the row in the left sidebar grid: fit to screen and center project/task (debounced to allow double-click)
            if (id && g.isTaskExists(id)) {
                const isTreeIcon = e && e.target && (e.target.closest(".gantt_tree_icon") || e.target.closest(".gantt_tree_indent"));
                const isActionBtn = e && e.target && e.target.closest(".grid_action_btn");
                if (!isTreeIcon && !isActionBtn) {
                    if (this._sidebarClickTimer) {
                        clearTimeout(this._sidebarClickTimer);
                    }
                    this._sidebarClickTimer = setTimeout(() => {
                        this._sidebarClickTimer = null;
                        this.fitToScreen(id);
                    }, 250);
                }
            }
            return true;
        }));

        // Suppress tooltips completely while user is dragging or resizing
        this.eventIds.push(g.attachEvent("onBeforeTooltip", () => {
            const state = g.getState();
            if (state && (state.drag_id || state.drag_mode)) {
                return false;
            }
            return true;
        }));

        // Strictly forbid changing vertical row position or parent during drag / move
        this.eventIds.push(g.attachEvent("onBeforeTaskMove", () => false));
        this.eventIds.push(g.attachEvent("onBeforeRowDragMove", () => false));
        this.eventIds.push(g.attachEvent("onRowDrag", () => false));

        // Cascading Drag-and-Drop: record start/end dates for parent and all descendants
        this.eventIds.push(g.attachEvent("onBeforeTaskDrag", (id, mode) => {
            this.hideTooltip();
            const task = g.getTask(id);
            if (!task) return true;

            task._is_dragged = true;
            task._drag_start_origin = new Date(task.start_date);
            task._drag_end_origin = new Date(task.end_date);
            task._fixed_parent = task.parent;

            // Collect magnetic snap target timestamps from other tasks/milestones/projects
            const isDescendant = (parentId, childId) => {
                let curr = g.getTask(childId);
                while (curr && curr.parent) {
                    if (curr.parent === parentId) return true;
                    curr = g.getTask(curr.parent);
                }
                return false;
            };

            const snapTimestamps = [];
            if (g.eachTask) {
                g.eachTask((other) => {
                    if (other.id === id) return;
                    if (isDescendant(id, other.id)) return;
                    if (other.start_date) {
                        snapTimestamps.push(new Date(other.start_date).getTime());
                    }
                    if (other.end_date) {
                        snapTimestamps.push(new Date(other.end_date).getTime());
                    }
                });
            }
            this._snapTargetTimestamps = Array.from(new Set(snapTimestamps)).sort((a, b) => a - b);

            // Capture snapshot of affected tasks for undo before dragging
            const captureSnapshot = (t) => {
                let sStr = t.work_start_date;
                let eStr = t.work_end_date;
                if (!sStr || !eStr) {
                    const c = computeWorkDates(t.start_date, t.end_date);
                    sStr = formatOdooDateTime(c.workStart);
                    eStr = formatOdooDateTime(c.workEnd);
                }
                return {
                    id: t.id,
                    start_date: sStr,
                    end_date: eStr,
                    progress: t.progress !== undefined ? t.progress : 0,
                    text: t.text,
                };
            };

            const prevSnapshots = [captureSnapshot(task)];

            if (mode === "move") {
                const storeDescendants = (parentId) => {
                    const children = (typeof g.getChildren === "function" ? g.getChildren(parentId) : []) || [];
                    for (const childId of children) {
                        const childTask = g.getTask(childId);
                        if (childTask) {
                            childTask._drag_start_origin = new Date(childTask.start_date);
                            childTask._drag_end_origin = new Date(childTask.end_date);
                            prevSnapshots.push(captureSnapshot(childTask));
                            storeDescendants(childId);
                        }
                    }
                };
                storeDescendants(id);
            }

            this._pendingUndoAction = {
                type: "schedule",
                description: task.text || _t("Tvarkaraščio keitimas"),
                previous: prevSnapshots,
            };

            return true;
        }));

        // Cascading move and magnetic snapping in real-time on the Gantt chart
        this.eventIds.push(g.attachEvent("onTaskDrag", (id, mode) => {
            this.hideTooltip();
            const task = g.getTask(id);
            if (!task) return;

            // Strict hierarchy lockdown: ensure task.parent cannot change
            if (task._fixed_parent !== undefined && task.parent !== task._fixed_parent) {
                task.parent = task._fixed_parent;
            }

            // Magnetic snap threshold in pixels
            const SNAP_THRESHOLD_PX = 20;
            let snappedGuidePx = null;

            if (this._snapTargetTimestamps && this._snapTargetTimestamps.length > 0 && typeof g.posFromDate === "function") {
                if (mode === "resize") {
                    const state = g.getState ? g.getState() : {};
                    const isStartHandle = state.drag_from_start !== undefined
                        ? state.drag_from_start
                        : (task._drag_start_origin && Math.abs(task.start_date.getTime() - task._drag_start_origin.getTime()) > 0);

                    if (isStartHandle) {
                        const currentPx = this.safePosFromDate(task.start_date);
                        let bestDiff = Infinity;
                        let bestMs = null;
                        let bestTargetPx = null;

                        for (const targetMs of this._snapTargetTimestamps) {
                            const targetPx = this.safePosFromDate(new Date(targetMs));
                            if (targetPx >= 0 && currentPx >= 0) {
                                const diff = Math.abs(currentPx - targetPx);
                                if (diff <= SNAP_THRESHOLD_PX && diff < bestDiff) {
                                    bestDiff = diff;
                                    bestMs = targetMs;
                                    bestTargetPx = targetPx;
                                }
                            }
                        }

                        if (bestMs !== null && bestMs < task.end_date.getTime()) {
                            task.start_date = new Date(bestMs);
                            snappedGuidePx = bestTargetPx;
                            task._magnetically_snapped_start = true;
                        } else {
                            task._magnetically_snapped_start = false;
                        }
                    } else {
                        // Resizing end handle
                        const currentPx = this.safePosFromDate(task.end_date);
                        let bestDiff = Infinity;
                        let bestMs = null;
                        let bestTargetPx = null;

                        for (const targetMs of this._snapTargetTimestamps) {
                            const targetPx = this.safePosFromDate(new Date(targetMs));
                            if (targetPx >= 0 && currentPx >= 0) {
                                const diff = Math.abs(currentPx - targetPx);
                                if (diff <= SNAP_THRESHOLD_PX && diff < bestDiff) {
                                    bestDiff = diff;
                                    bestMs = targetMs;
                                    bestTargetPx = targetPx;
                                }
                            }
                        }

                        if (bestMs !== null && bestMs > task.start_date.getTime()) {
                            task.end_date = new Date(bestMs);
                            snappedGuidePx = bestTargetPx;
                            task._magnetically_snapped_end = true;
                        } else {
                            task._magnetically_snapped_end = false;
                        }
                    }

                    // Enforce container bounds: milestone or parent task cannot be smaller than its children
                    const children = (typeof g.getChildren === "function" ? g.getChildren(id) : []) || [];
                    if (children.length > 0) {
                        let minChildStart = null;
                        let maxChildEnd = null;
                        for (const childId of children) {
                            const childTask = g.getTask(childId);
                            if (childTask) {
                                if (!minChildStart || childTask.start_date < minChildStart) minChildStart = childTask.start_date;
                                if (!maxChildEnd || childTask.end_date > maxChildEnd) maxChildEnd = childTask.end_date;
                            }
                        }
                        if (minChildStart && task.start_date > minChildStart) {
                            task.start_date = new Date(minChildStart);
                        }
                        if (maxChildEnd && task.end_date < maxChildEnd) {
                            task.end_date = new Date(maxChildEnd);
                        }
                    }
                } else if (mode === "move") {
                    const origDurationMs = task._drag_end_origin && task._drag_start_origin
                        ? (task._drag_end_origin.getTime() - task._drag_start_origin.getTime())
                        : (task.end_date.getTime() - task.start_date.getTime());
                    const startPx = this.safePosFromDate(task.start_date);
                    const endPx = this.safePosFromDate(task.end_date);

                    let bestDiff = Infinity;
                    let bestType = null;
                    let bestMs = null;
                    let bestTargetPx = null;

                    for (const targetMs of this._snapTargetTimestamps) {
                        const targetPx = this.safePosFromDate(new Date(targetMs));

                        if (targetPx >= 0 && startPx >= 0) {
                            const diffStart = Math.abs(startPx - targetPx);
                            if (diffStart <= SNAP_THRESHOLD_PX && diffStart < bestDiff) {
                                bestDiff = diffStart;
                                bestType = "start";
                                bestMs = targetMs;
                                bestTargetPx = targetPx;
                            }
                        }

                        if (targetPx >= 0 && endPx >= 0) {
                            const diffEnd = Math.abs(endPx - targetPx);
                            if (diffEnd <= SNAP_THRESHOLD_PX && diffEnd < bestDiff) {
                                bestDiff = diffEnd;
                                bestType = "end";
                                bestMs = targetMs;
                                bestTargetPx = targetPx;
                            }
                        }
                    }

                    if (bestMs !== null) {
                        if (bestType === "start") {
                            task.start_date = new Date(bestMs);
                            task.end_date = new Date(bestMs + origDurationMs);
                            snappedGuidePx = bestTargetPx;
                            task._magnetically_snapped_start = true;
                        } else if (bestType === "end") {
                            task.end_date = new Date(bestMs);
                            task.start_date = new Date(bestMs - origDurationMs);
                            snappedGuidePx = bestTargetPx;
                            task._magnetically_snapped_end = true;
                        }
                    } else {
                        task._magnetically_snapped_start = false;
                        task._magnetically_snapped_end = false;
                    }
                }
            }

            if (snappedGuidePx !== null) {
                this.showSnapGuide(snappedGuidePx);
            } else {
                this.hideSnapGuide();
            }

            // Real-time cascading move for all descendants
            if (mode === "move" && task._drag_start_origin) {
                const diffMs = task.start_date.getTime() - task._drag_start_origin.getTime();
                if (diffMs !== 0) {
                    const shiftDescendants = (parentId) => {
                        const children = (typeof g.getChildren === "function" ? g.getChildren(parentId) : []) || [];
                        for (const childId of children) {
                            const childTask = g.getTask(childId);
                            if (childTask && childTask._drag_start_origin && childTask._drag_end_origin) {
                                childTask.start_date = new Date(childTask._drag_start_origin.getTime() + diffMs);
                                childTask.end_date = new Date(childTask._drag_end_origin.getTime() + diffMs);
                                g.updateTask(childId);
                                shiftDescendants(childId);
                            }
                        }
                    };
                    shiftDescendants(id);
                }
            }

            // Visually expand parent task / milestone in real-time if child bounds exceed them
            if (task.parent && g.isTaskExists && g.isTaskExists(task.parent)) {
                let p = g.getTask(task.parent);
                while (p) {
                    let parentUpdated = false;
                    if (task.start_date < p.start_date) {
                        p.start_date = new Date(task.start_date);
                        parentUpdated = true;
                    }
                    if (task.end_date > p.end_date) {
                        p.end_date = new Date(task.end_date);
                        parentUpdated = true;
                    }
                    if (parentUpdated) {
                        g.updateTask(p.id);
                    }
                    p = (p.parent && g.isTaskExists(p.parent)) ? g.getTask(p.parent) : null;
                }
            }
        }));

        // Attach Drag Event Handlers for Tasks, Milestones, and Projects (Batch Saving)
        this.eventIds.push(g.attachEvent("onAfterTaskDrag", async (id, mode) => {
            this.hideTooltip();
            this.hideSnapGuide();
            this._snapTargetTimestamps = null;
            this._justDragged = true;
            setTimeout(() => {
                this._justDragged = false;
            }, 400);

            const task = g.getTask(id);
            if (!task) return;

            if (task._fixed_parent !== undefined) {
                task.parent = task._fixed_parent;
                delete task._fixed_parent;
            }

            // Normalize task dates to clean midnight boundaries on the Gantt grid
            task.start_date = new Date(task.start_date.getFullYear(), task.start_date.getMonth(), task.start_date.getDate(), 0, 0, 0);
            task.end_date = new Date(task.end_date.getFullYear(), task.end_date.getMonth(), task.end_date.getDate(), 0, 0, 0);
            if (task.end_date.getTime() <= task.start_date.getTime()) {
                task.end_date = new Date(task.start_date.getTime() + 86400000);
            }

            delete task._magnetically_snapped_start;
            delete task._magnetically_snapped_end;
            delete task._is_dragged;

            const updates = [];
            const { workStart, workEnd } = computeWorkDates(task.start_date, task.end_date);
            task.work_start_date = formatOdooDateTime(workStart);
            task.work_end_date = formatOdooDateTime(workEnd);
            if (task.is_milestone) {
                task.planned_date_start = formatOdooDateTime(workStart);
                task.planned_date_end = formatOdooDateTime(workEnd);
            }

            updates.push({
                id: task.id,
                start_date: formatOdooDateTime(workStart),
                end_date: formatOdooDateTime(workEnd),
                progress: task.progress,
            });

            if (mode === "move") {
                const collectDescendants = (parentId) => {
                    const children = (typeof g.getChildren === "function" ? g.getChildren(parentId) : []) || [];
                    for (const childId of children) {
                        const childTask = g.getTask(childId);
                        if (childTask) {
                            childTask.start_date = new Date(childTask.start_date.getFullYear(), childTask.start_date.getMonth(), childTask.start_date.getDate(), 0, 0, 0);
                            childTask.end_date = new Date(childTask.end_date.getFullYear(), childTask.end_date.getMonth(), childTask.end_date.getDate(), 0, 0, 0);
                            if (childTask.end_date.getTime() <= childTask.start_date.getTime()) {
                                childTask.end_date = new Date(childTask.start_date.getTime() + 86400000);
                            }
                            const cWork = computeWorkDates(childTask.start_date, childTask.end_date);
                            childTask.work_start_date = formatOdooDateTime(cWork.workStart);
                            childTask.work_end_date = formatOdooDateTime(cWork.workEnd);
                            if (childTask.is_milestone) {
                                childTask.planned_date_start = formatOdooDateTime(cWork.workStart);
                                childTask.planned_date_end = formatOdooDateTime(cWork.workEnd);
                            }

                            updates.push({
                                id: childTask.id,
                                start_date: formatOdooDateTime(cWork.workStart),
                                end_date: formatOdooDateTime(cWork.workEnd),
                                progress: childTask.progress,
                            });
                            delete childTask._drag_start_origin;
                            delete childTask._drag_end_origin;
                            collectDescendants(childId);
                        }
                    }
                };
                collectDescendants(id);
            }

            delete task._drag_start_origin;
            delete task._drag_end_origin;

            // Check if anything actually changed compared to the previous snapshot
            if (this._pendingUndoAction && this._pendingUndoAction.previous) {
                let hasChanged = false;
                const prevMap = new Map();
                for (const p of this._pendingUndoAction.previous) {
                    prevMap.set(p.id, p);
                }
                for (const u of updates) {
                    const p = prevMap.get(u.id);
                    if (!p || p.start_date !== u.start_date || p.end_date !== u.end_date || p.progress !== u.progress) {
                        hasChanged = true;
                        break;
                    }
                }
                if (hasChanged) {
                    this.pushUndo(this._pendingUndoAction);
                }
                this._pendingUndoAction = null;
            }

            // Save the exact current scroll position before saving/rendering
            const scrollPos = g.getScrollState ? g.getScrollState() : { x: 0, y: 0 };
            const state = g.getState ? g.getState() : {};
            const minScale = state.min_date || g.config.start_date;
            const maxScale = state.max_date || g.config.end_date;
            const needsScaleExpand = (minScale && task.start_date < minScale) || (maxScale && task.end_date > maxScale);

            try {
                await this.orm.call("project.task", "save_timeline_batch_schedule", [updates]);

                if (needsScaleExpand) {
                    this.ensureTimelineRange(task.start_date, task.end_date);
                    g.render();
                    if (g.scrollTo && scrollPos) {
                        g.scrollTo(scrollPos.x, scrollPos.y);
                    }
                } else {
                    // Update affected tasks in-place: completely smooth, zero reload flicker, zero scroll jump!
                    g.updateTask(task.id);
                    for (const u of updates) {
                        if (u.id !== task.id && g.isTaskExists(u.id)) {
                            g.updateTask(u.id);
                        }
                    }
                    this.renderTodayMarker();
                }
            } catch (err) {
                this.notification.add(_t("Klaida atnaujinant: ") + err.message, { type: "danger" });
            }
        }));


        // Double-click to open Odoo Task Form Dialog, Milestone Dialog, or Project Dialog
        this.eventIds.push(g.attachEvent("onTaskDblClick", (id) => {
            const task = g.getTask(id);
            if (!task) return false;
            if (task.is_project) {
                this.openProjectFormDialog(task.odoo_id);
                return false;
            }
            if (task.is_milestone) {
                this.openMilestoneFormDialog(task.odoo_id);
                return false;
            }
            this.openTaskFormDialog(task.odoo_id);
            return false;
        }));

        // Dependency Link Events
        this.eventIds.push(g.attachEvent("onBeforeLinkAdd", () => {
            this.hideTooltip();
            return true;
        }));

        this.eventIds.push(g.attachEvent("onAfterLinkAdd", async (id, link) => {
            const sourceTask = g.getTask(link.source);
            const targetTask = g.getTask(link.target);
            if (sourceTask && targetTask && !sourceTask.is_project && !targetTask.is_project && !sourceTask.is_milestone && !targetTask.is_milestone) {
                try {
                    await this.orm.call("project.task", "add_timeline_dependency", [
                        sourceTask.odoo_id,
                        targetTask.odoo_id,
                    ]);
                    this.pushUndo({
                        type: "link_add",
                        description: `${sourceTask.text} → ${targetTask.text}`,
                        sourceId: sourceTask.odoo_id,
                        targetId: targetTask.odoo_id,
                    });
                } catch (err) {
                    this.notification.add(_t("Klaida pridedant ryšį: ") + err.message, { type: "danger" });
                }
            }
        }));

        this.eventIds.push(g.attachEvent("onAfterLinkDelete", async (id, link) => {
            if (link.source_id && link.target_id) {
                try {
                    await this.orm.call("project.task", "remove_timeline_dependency", [
                        link.source_id,
                        link.target_id,
                    ]);
                    this.pushUndo({
                        type: "link_delete",
                        description: _t("Priklausomybės ryšys"),
                        sourceId: link.source_id,
                        targetId: link.target_id,
                    });
                } catch (err) {
                    console.error("Error removing link", err);
                }
            }
        }));

        // Click on grid custom action buttons (Add Subtask, Add Milestone, Edit, Delete)
        if (this.ganttElement.el) {
            if (this.onGridClickHandler) {
                this.ganttElement.el.removeEventListener("click", this.onGridClickHandler);
            }
            this.onGridClickHandler = async (e) => {
                const btn = e.target.closest(".grid_action_btn");
                if (!btn) return;
                const action = btn.getAttribute("data-action");
                const id = parseInt(btn.getAttribute("data-id"));
                if (action === "edit") {
                    this.openTaskFormDialog(id);
                } else if (action === "edit_milestone") {
                    this.openMilestoneFormDialog(id);
                } else if (action === "delete") {
                    if (confirm(_t("Ar tikrai norite ištrinti šią užduotį?"))) {
                        await this.orm.call("project.task", "delete_timeline_task", [id]);
                        await this.loadTimelineData();
                        this.notification.add(_t("Užduotis ištrinta"), { type: "success" });
                    }
                } else if (action === "delete_milestone") {
                    if (confirm(_t("Ar tikrai norite ištrinti šią gairę?"))) {
                        await this.orm.call("project.task", "delete_timeline_milestone", [id]);
                        await this.loadTimelineData();
                        this.notification.add(_t("Gairė ištrinta"), { type: "success" });
                    }
                } else if (action === "add_subtask") {
                    const projectId = parseInt(btn.getAttribute("data-project-id")) || undefined;
                    const milestoneId = parseInt(btn.getAttribute("data-milestone-id")) || undefined;
                    this.addSubtaskDialog(id, projectId, milestoneId);
                } else if (action === "add_task_to_project") {
                    this.createTaskInProjectDialog(id);
                } else if (action === "add_task_to_milestone") {
                    const projectId = parseInt(btn.getAttribute("data-project-id")) || undefined;
                    this.createTaskInMilestoneDialog(id, projectId);
                } else if (action === "add_milestone_to_project") {
                    this.addMilestoneDialog(id);
                }
            };
            this.ganttElement.el.addEventListener("click", this.onGridClickHandler);

            if (this.onGridDblClickHandler) {
                this.ganttElement.el.removeEventListener("dblclick", this.onGridDblClickHandler);
            }
            this.onGridDblClickHandler = (e) => {
                const gridRow = e.target.closest(".gantt_grid .gantt_row");
                if (!gridRow) return;
                const isActionBtn = e.target.closest(".grid_action_btn");
                const isTreeIcon = e.target.closest(".gantt_tree_icon");
                if (isActionBtn || isTreeIcon) return;

                if (this._sidebarClickTimer) {
                    clearTimeout(this._sidebarClickTimer);
                    this._sidebarClickTimer = null;
                }

                const taskId = gridRow.getAttribute("task_id");
                if (taskId && g.isTaskExists(taskId)) {
                    const task = g.getTask(taskId);
                    if (task.is_project) {
                        this.openProjectFormDialog(task.odoo_id);
                    } else if (task.is_milestone) {
                        this.openMilestoneFormDialog(task.odoo_id);
                    } else {
                        this.openTaskFormDialog(task.odoo_id);
                    }
                }
            };
            this.ganttElement.el.addEventListener("dblclick", this.onGridDblClickHandler);

            this.ganttElement.el.addEventListener("mousedown", () => this.hideTooltip());

            if (this.onWheelHandler) {
                this.ganttElement.el.removeEventListener("wheel", this.onWheelHandler);
            }
            this.onWheelHandler = (e) => {
                if (e.ctrlKey) {
                    e.preventDefault();
                    let focalUnderCursor = null;
                    const dataArea = this.ganttElement.el
                        ? (this.ganttElement.el.querySelector(".gantt_data_area") || this.ganttElement.el.querySelector(".gantt_task"))
                        : null;
                    if (dataArea && g.dateFromPos) {
                        const rect = dataArea.getBoundingClientRect();
                        const scrollX = g.getScrollState ? g.getScrollState().x : 0;
                        const mouseXInData = e.clientX - rect.left + scrollX;
                        focalUnderCursor = g.dateFromPos(mouseXInData);
                    }
                    if (e.deltaY < 0) {
                        this.zoomIn(focalUnderCursor);
                    } else if (e.deltaY > 0) {
                        this.zoomOut(focalUnderCursor);
                    }
                }
            };
            this.ganttElement.el.addEventListener("wheel", this.onWheelHandler, { passive: false });
        }

        // Initialize inside container
        g.init(this.ganttElement.el);
    }

    /**
     * Safely calculate pixel X position from date without throwing dhtmlx "Invalid day index" assertions
     */
    safePosFromDate(date) {
        if (!this.gantt || !date) return -1;
        const g = this.gantt;
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return -1;
        const state = g.getState ? g.getState() : {};
        const min = state.min_date || g.config.start_date;
        const max = state.max_date || g.config.end_date;
        if (min && d < min) return -1;
        if (max && d > max) return -1;
        try {
            return g.posFromDate ? g.posFromDate(d) : -1;
        } catch {
            return -1;
        }
    }

    /**
     * Applies timeframe scales: Diena, Savaitė, Mėnuo, Metai
     * Translates months & weekdays to Lithuanian, marks weekends (#f1f3f7) and national holidays.
     */
    /**
     * Unified timescale configuration driven purely by zoomLevel.
     * Consistent Top-to-Bottom hierarchy across all zoom levels:
     * 1. Metai (Year: %Y)
     * 2. Ketvirtis (Quarter: 1, 2, 3, 4)
     * 3. Mėnuo (Month: with Lithuanian month name)
     * 4. Savaitė (Week: ISO week number)
     * 5. Diena (Day: day number, holidays, weekends) — shown when zoomLevel >= 50%.
     * Below 50% (< 50%): Day is omitted, keeping Year -> Quarter -> Month -> Week intact so UI doesn't jump.
     */
    applyScaleConfig(customColWidth = null) {
        if (typeof customColWidth === "string") {
            customColWidth = arguments[1] || null;
        }
        const g = this.gantt;
        if (!g) return;

        // Reset global scale_cell_class so non-day scales (Year, Month, etc.) are never styled as holidays
        g.templates.scale_cell_class = (date, scale) => {
            if (!scale || scale.unit !== "day") {
                return "";
            }
            const hol = getLithuanianHoliday(date);
            if (hol) {
                return "holiday_scale_cell";
            } else if (isWeekend(date)) {
                return "weekend_scale_cell";
            }
            return "";
        };

        const zoom = this.state.zoomLevel;

        // 1. Year scale: Metai (%Y, e.g. 2026)
        const yearScale = { unit: "year", step: 1, format: "%Y", css: () => "" };

        // 2. Quarter scale: Ketvirtis (1, 2, 3, 4)
        const quarterScale = {
            unit: "quarter",
            step: 1,
            format: (date) => Math.floor(date.getMonth() / 3) + 1,
            css: () => "",
        };

        // 3. Month scale: Mėnuo (First number then name across all zoom levels: (10) Spalis)
        let monthFormat;
        if (zoom <= 15) {
            monthFormat = (date) => {
                const monthNum = String(date.getMonth() + 1).padStart(2, "0");
                const shortName = LITHUANIAN_MONTHS_SHORT[date.getMonth()];
                return `(${monthNum}) ${shortName}`;
            };
        } else {
            monthFormat = (date) => {
                const monthNum = String(date.getMonth() + 1).padStart(2, "0");
                const monthName = LITHUANIAN_MONTHS[date.getMonth()];
                return `(${monthNum}) ${monthName}`;
            };
        }
        const monthScale = {
            unit: "month",
            step: 1,
            format: monthFormat,
            css: () => "",
        };

        // 4. Week scale: Savaitė (ISO week number: 36, 37, 38...)
        const weekScale = {
            unit: "week",
            step: 1,
            format: (date) => getISOWeekNumber(date),
            css: () => "",
        };

        // Below 50% (< 50%): 4 rows (Year, Quarter, Month, Week). Base unit is WEEK.
        if (zoom < 50) {
            g.config.scales = [yearScale, quarterScale, monthScale, weekScale];
            g.config.scale_height = 88; // 4 rows * 22px = 88px

            let colW = 32;
            if (zoom === 10) colW = 14;
            else if (zoom === 15) colW = 18;
            else if (zoom === 20) colW = 24;
            else if (zoom === 35) colW = 32;

            g.config.min_column_width = customColWidth ? Math.max(12, customColWidth) : colW;
            return;
        }

        // Zoom >= 50%: 5 rows (Year, Quarter, Month, Week, Day). Base unit is DAY.
        const dayScale = {
            unit: "day",
            step: 1,
            format: (date) => {
                const d = date.getDate();
                if (zoom >= 100) {
                    const hol = getLithuanianHoliday(date);
                    if (hol) {
                        return `<span class="holiday_day_cell" title="${hol}">★${d}</span>`;
                    }
                }
                return d;
            },
            css: (date) => {
                const today = new Date();
                if (date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear()) {
                    return "today_scale_cell";
                }
                if (getLithuanianHoliday(date)) return "holiday_scale_cell";
                if (isWeekend(date)) return "weekend_scale_cell";
                return "";
            },
        };

        g.config.scales = [yearScale, quarterScale, monthScale, weekScale, dayScale];
        g.config.scale_height = 110; // 5 rows * 22px = 110px

        let colW = 32;
        if (zoom === 50) colW = 18;
        else if (zoom === 75) colW = 24;
        else if (zoom === 100) colW = 32;
        else if (zoom === 150) colW = 48;
        else if (zoom === 200) colW = 64;
        else if (zoom >= 250) colW = 80;

        g.config.min_column_width = customColWidth ? Math.max(16, customColWidth) : colW;
    }

    /**
     * Fetch and parse timeline data
     */
    async loadTimelineData(customDomain = null) {
        if (!this.gantt) return;

        try {
            const domain = customDomain || this.props.domain || [];
            const data = await this.orm.call("project.task", "get_all_in_one_timeline_data", [], {
                project_id: this.state.selectedProjectId,
                domain: domain,
                model_name: this.props.resModel || "project.task",
            });

            this.state.projects = data.projects || [];

            // Preserve scroll position (both in pixel offset and anchor date) and open/closed branch states
            const scrollPos = this.gantt.getScrollState ? this.gantt.getScrollState() : null;
            let anchorDate = null;
            if (scrollPos && scrollPos.x !== undefined && this.gantt.dateFromPos) {
                const visibleWidth = this.getTimelineVisibleWidth();
                anchorDate = this.gantt.dateFromPos(scrollPos.x + Math.floor(visibleWidth / 2));
            }
            const openStates = {};
            if (this.gantt.eachTask) {
                this.gantt.eachTask((t) => {
                    openStates[t.id] = t.$open !== undefined ? t.$open : t.open;
                });
            }

            if (data.tasks && Object.keys(openStates).length > 0) {
                for (const t of data.tasks) {
                    if (openStates[t.id] !== undefined) {
                        t.open = openStates[t.id];
                    }
                }
            }

            this.gantt.clearAll();
            this.gantt.parse({
                data: data.tasks || [],
                links: data.links || [],
            });
            this.ensureTimelineRange();
            this.gantt.render();

            if (this._savedViewState) {
                const saved = this._savedViewState;
                this._savedViewState = null;
                this._initialScrollDone = true;

                const restoreViewport = () => {
                    if (!this.gantt) return;
                    const visWidth = this.getTimelineVisibleWidth();
                    if (saved.centerDate) {
                        const cDate = new Date(saved.centerDate);
                        const pos = this.safePosFromDate(cDate);
                        if (pos >= 0 && this.gantt.scrollTo) {
                            const targetX = Math.max(0, Math.round(pos - visWidth / 2));
                            this.gantt.scrollTo(targetX, saved.scrollY || 0);
                            this.renderTodayMarker();
                            return;
                        }
                    }
                    if (typeof saved.scrollX === "number" && this.gantt.scrollTo) {
                        this.gantt.scrollTo(saved.scrollX, saved.scrollY || 0);
                        this.renderTodayMarker();
                    }
                };

                restoreViewport();
                requestAnimationFrame(() => {
                    restoreViewport();
                    setTimeout(restoreViewport, 60);
                });
            } else if (this._projectChanged) {
                this._projectChanged = false;
                let firstTaskStart = null;
                if (data.tasks && data.tasks.length > 0) {
                    for (const t of data.tasks) {
                        if (t.start_date) {
                            const s = new Date(t.start_date);
                            if (!isNaN(s.getTime()) && (!firstTaskStart || s < firstTaskStart)) {
                                firstTaskStart = s;
                            }
                        }
                    }
                }
                if (firstTaskStart && this.gantt.scrollTo) {
                    const visibleWidth = this.getTimelineVisibleWidth();
                    const pos = this.safePosFromDate(firstTaskStart);
                    if (pos >= 0) {
                        this.gantt.scrollTo(Math.max(0, pos - Math.floor(visibleWidth / 3)), 0);
                    }
                } else {
                    this.navigateToday();
                }
            } else if (anchorDate) {
                const visibleWidth = this.getTimelineVisibleWidth();
                const newPos = this.safePosFromDate(anchorDate);
                if (newPos >= 0 && this.gantt.scrollTo) {
                    this.gantt.scrollTo(Math.max(0, newPos - Math.floor(visibleWidth / 2)), scrollPos ? scrollPos.y : 0);
                } else if (scrollPos && (scrollPos.x !== undefined || scrollPos.y !== undefined)) {
                    this.gantt.scrollTo(scrollPos.x, scrollPos.y);
                }
            } else if (scrollPos && (scrollPos.x !== undefined || scrollPos.y !== undefined)) {
                this.gantt.scrollTo(scrollPos.x, scrollPos.y);
            }

            if (!this._initialScrollDone) {
                this._initialScrollDone = true;
                setTimeout(() => {
                    this.navigateToday();
                }, 50);
            }
        } catch (err) {
            console.error("Error loading timeline data", err);
            this.notification.add(_t("Could not load timeline data: ") + err.message, { type: "danger" });
        }
    }

    /**
     * Open standard Odoo Task Form (Full view with chatter, normal menus, breadcrumbs)
     */
    openTaskFormDialog(taskId) {
        this.saveViewState();
        this.actionService.doAction({
            type: "ir.actions.act_window",
            res_model: "project.task",
            res_id: taskId,
            views: [[false, "form"]],
            target: "current",
        });
    }

    /**
     * Open dialog to create a new subtask under a parent task
     */
    addSubtaskDialog(parentTaskId, projectId, milestoneId) {
        this.actionService.doAction(
            {
                type: "ir.actions.act_window",
                res_model: "project.task",
                views: [[false, "form"]],
                target: "new",
                context: {
                    default_parent_id: parentTaskId,
                    default_project_id: projectId || this.state.selectedProjectId || undefined,
                    ...(milestoneId ? { default_milestone_id: milestoneId } : {}),
                },
            },
            {
                onClose: () => {
                    this.loadTimelineData();
                },
            }
        );
    }

    /**
     * Create a task directly inside a project
     */
    createTaskInProjectDialog(projectId) {
        this.actionService.doAction(
            {
                type: "ir.actions.act_window",
                res_model: "project.task",
                views: [[false, "form"]],
                target: "new",
                context: {
                    default_project_id: projectId,
                },
            },
            {
                onClose: () => {
                    this.loadTimelineData();
                },
            }
        );
    }

    /**
     * Create a task directly inside a milestone
     */
    createTaskInMilestoneDialog(milestoneId, projectId) {
        this.actionService.doAction(
            {
                type: "ir.actions.act_window",
                res_model: "project.task",
                views: [[false, "form"]],
                target: "new",
                context: {
                    default_project_id: projectId || this.state.selectedProjectId || undefined,
                    default_milestone_id: milestoneId,
                },
            },
            {
                onClose: () => {
                    this.loadTimelineData();
                },
            }
        );
    }

    /**
     * Open dialog to create a new milestone in a project
     */
    addMilestoneDialog(projectId) {
        this.actionService.doAction(
            {
                type: "ir.actions.act_window",
                res_model: "project.milestone",
                views: [[false, "form"]],
                target: "new",
                context: {
                    default_project_id: projectId || this.state.selectedProjectId || undefined,
                },
            },
            {
                onClose: () => {
                    this.loadTimelineData();
                },
            }
        );
    }

    /**
     * Open standard Odoo Milestone Form (Full view)
     */
    openMilestoneFormDialog(milestoneId) {
        this.saveViewState();
        this.actionService.doAction({
            type: "ir.actions.act_window",
            res_model: "project.milestone",
            res_id: milestoneId,
            views: [[false, "form"]],
            target: "current",
        });
    }

    /**
     * Open standard Odoo Project Form (Full view with chatter, normal menus, breadcrumbs)
     */
    openProjectFormDialog(projectId) {
        this.saveViewState();
        this.actionService.doAction({
            type: "ir.actions.act_window",
            res_model: "project.project",
            res_id: projectId,
            views: [[false, "form"]],
            target: "current",
        });
    }

    /**
     * Ensures the timeline timescale covers today, all tasks, and generous past/future buffers.
     * Prevents the past from being cut off or unreachable when tasks are moved into the future.
     */
    ensureTimelineRange(extraTaskStart = null, extraTaskEnd = null) {
        const g = this.gantt;
        if (!g) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let minDate = null;
        let maxDate = null;

        if (extraTaskStart) {
            const s = extraTaskStart instanceof Date ? extraTaskStart : new Date(extraTaskStart);
            if (!isNaN(s.getTime())) {
                minDate = new Date(s);
                maxDate = new Date(s);
            }
        }
        if (extraTaskEnd) {
            const e = extraTaskEnd instanceof Date ? extraTaskEnd : new Date(extraTaskEnd);
            if (!isNaN(e.getTime())) {
                if (!minDate || e < minDate) minDate = new Date(e);
                if (!maxDate || e > maxDate) maxDate = new Date(e);
            }
        }

        if (g.eachTask) {
            g.eachTask((task) => {
                if (task.start_date) {
                    const s = new Date(task.start_date);
                    if (!isNaN(s.getTime())) {
                        if (!minDate || s < minDate) minDate = s;
                        if (!maxDate || s > maxDate) maxDate = s;
                    }
                }
                if (task.end_date) {
                    const e = new Date(task.end_date);
                    if (!isNaN(e.getTime())) {
                        if (!minDate || e < minDate) minDate = e;
                        if (!maxDate || e > maxDate) maxDate = e;
                    }
                }
                if (task.deadline_end) {
                    const dl = task.deadline_end instanceof Date ? task.deadline_end : new Date(String(task.deadline_end).replace(/-/g, "/"));
                    if (!isNaN(dl.getTime())) {
                        if (!maxDate || dl > maxDate) maxDate = dl;
                    }
                }
            });
        }

        if (!minDate) minDate = new Date(today);
        if (!maxDate) maxDate = new Date(today);

        // Always include today in boundaries so today line is within scale
        let effectiveMin = new Date(minDate);
        let effectiveMax = new Date(maxDate);
        if (today < effectiveMin) {
            effectiveMin = new Date(today);
        }
        if (today > effectiveMax) {
            effectiveMax = new Date(today);
        }

        let startDate;
        let endDate;

        if (this.state.zoomLevel <= 15) {
            // Extreme zoom (10% - 15%): Multi-year buffer
            startDate = new Date(effectiveMin.getFullYear() - 1, 0, 1, 0, 0, 0);
            endDate = new Date(effectiveMax.getFullYear() + 2, 11, 31, 23, 59, 59);
        } else if (this.state.zoomLevel < 35) {
            // 20%: Multi-year buffer
            startDate = new Date(effectiveMin.getFullYear() - 1, 0, 1, 0, 0, 0);
            endDate = new Date(effectiveMax.getFullYear() + 1, 11, 31, 23, 59, 59);
        } else if (this.state.zoomLevel < 50) {
            // 35%: 1-2 years buffer
            startDate = new Date(effectiveMin.getFullYear(), effectiveMin.getMonth() - 2, 1, 0, 0, 0);
            endDate = new Date(effectiveMax.getFullYear(), effectiveMax.getMonth() + 4, 0, 23, 59, 59);
        } else {
            // Detailed zoom (>= 50%): Days buffer
            startDate = new Date(effectiveMin.getFullYear(), effectiveMin.getMonth() - 1, 1, 0, 0, 0);
            endDate = new Date(effectiveMax.getFullYear(), effectiveMax.getMonth() + 3, 0, 23, 59, 59);
        }

        // For zoom < 50% (unit: week), align startDate to Monday to avoid half-week cuts
        if (this.state.zoomLevel < 50) {
            const dayOfWeek = startDate.getDay();
            const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
            startDate.setDate(startDate.getDate() + diffToMon);
            startDate.setHours(0, 0, 0, 0);
        }

        g.config.start_date = startDate;
        g.config.end_date = endDate;
    }

    /**
     * Dynamically extends the timescale into the past and maintains smooth visual scroll.
     */
    expandTimelineToPast(stepPx = 0) {
        const g = this.gantt;
        if (!g || !g.config.start_date) return;
        if (this._isExpandingRange) return;
        this._isExpandingRange = true;

        try {
            const oldStart = new Date(g.config.start_date);
            const newStart = new Date(oldStart);
            const stepYears = this.state.zoomLevel < 35 ? 2 : 1;
            newStart.setFullYear(newStart.getFullYear() - stepYears);

            const scrollState = g.getScrollState ? g.getScrollState() : { x: 0, y: 0 };
            g.config.start_date = newStart;
            g.render();

            const addedPx = this.safePosFromDate(oldStart);
            const newScrollX = Math.max(0, scrollState.x + (addedPx > 0 ? addedPx : 0) - stepPx);
            g.scrollTo(newScrollX, scrollState.y);
            this.renderTodayMarker();
        } finally {
            this._isExpandingRange = false;
        }
    }

    /**
     * Dynamically extends the timescale into the future.
     */
    expandTimelineToFuture(stepPx = 0) {
        const g = this.gantt;
        if (!g || !g.config.end_date) return;
        if (this._isExpandingRange) return;
        this._isExpandingRange = true;

        try {
            const oldEnd = new Date(g.config.end_date);
            const newEnd = new Date(oldEnd);
            const stepYears = this.state.zoomLevel < 35 ? 2 : 1;
            newEnd.setFullYear(newEnd.getFullYear() + stepYears);

            const scrollState = g.getScrollState ? g.getScrollState() : { x: 0, y: 0 };
            g.config.end_date = newEnd;
            g.render();

            const newScrollX = scrollState.x + stepPx;
            g.scrollTo(newScrollX, scrollState.y);
            this.renderTodayMarker();
        } finally {
            this._isExpandingRange = false;
        }
    }

    /**
     * Render dynamic Today vertical line marker on timeline
     */
    renderTodayMarker() {
        if (!this.gantt || !this.ganttElement || !this.ganttElement.el) return;
        const g = this.gantt;
        const dataArea = this.ganttElement.el.querySelector(".gantt_data_area");
        if (!dataArea) return;

        let marker = dataArea.querySelector(".custom_today_marker");
        try {
            const today = new Date();
            today.setHours(12, 0, 0, 0);
            const leftPos = this.safePosFromDate(today);
            if (leftPos >= 0) {
                if (!marker) {
                    marker = document.createElement("div");
                    marker.className = "custom_today_marker";
                    dataArea.appendChild(marker);
                }
                const monthNameGen = LITHUANIAN_MONTHS_GENITIVE[today.getMonth()];
                marker.innerHTML = `<span class="today_marker_label">ŠIANDIEN (${monthNameGen} ${today.getDate()} d.)</span>`;
                marker.style.left = `${leftPos}px`;
                marker.style.height = `${Math.max(dataArea.offsetHeight, dataArea.scrollHeight)}px`;
                marker.style.display = "block";
            } else if (marker) {
                marker.style.display = "none";
            }
        } catch {
            if (marker) marker.style.display = "none";
        }
    }

    /**
     * Undo System: push action to stack and revert previous state
     */
    pushUndo(action) {
        if (!this.undoStack) this.undoStack = [];
        this.undoStack.push(action);
        if (this.undoStack.length > 50) {
            this.undoStack.shift();
        }
        this.state.undoCount = this.undoStack.length;
    }

    async undoAction() {
        if (!this.undoStack || !this.undoStack.length) {
            this.notification.add(_t("Nėra veiksmų atšaukimui"), { type: "warning" });
            return;
        }

        const action = this.undoStack.pop();
        this.state.undoCount = this.undoStack.length;

        try {
            if (action.type === "schedule") {
                await this.orm.call("project.task", "save_timeline_batch_schedule", [action.previous]);
                await this.loadTimelineData();
            } else if (action.type === "link_add") {
                await this.orm.call("project.task", "remove_timeline_dependency", [
                    action.sourceId,
                    action.targetId,
                ]);
                await this.loadTimelineData();
            } else if (action.type === "link_delete") {
                await this.orm.call("project.task", "add_timeline_dependency", [
                    action.sourceId,
                    action.targetId,
                ]);
                await this.loadTimelineData();
            }
        } catch (err) {
            console.error("Error executing undo:", err);
            this.notification.add(_t("Klaida atšaukiant: ") + err.message, { type: "danger" });
        }
    }

    /**
     * Toolbar Handlers
     */
    async onProjectChange(e) {
        this.state.selectedProjectId = parseInt(e.target.value);
        this._projectChanged = true;
        this.saveViewState();
        await this.loadTimelineData();
    }

    changeScale(scale) {
        if (scale === "year") this.setZoom(100);
        else if (scale === "month") this.setZoom(75);
        else if (scale === "week") this.setZoom(50);
        else if (scale === "day") this.setZoom(150);
        else this.setZoom(100);
    }

    zoomIn(focalDate = null) {
        const validFocalDate = (focalDate instanceof Date && !isNaN(focalDate.getTime())) ? focalDate : null;
        const nextStep = ZOOM_STEPS.find((step) => step > this.state.zoomLevel);
        this.setZoom(nextStep !== undefined ? nextStep : ZOOM_STEPS[ZOOM_STEPS.length - 1], validFocalDate);
    }

    zoomOut(focalDate = null) {
        const validFocalDate = (focalDate instanceof Date && !isNaN(focalDate.getTime())) ? focalDate : null;
        const nextStep = [...ZOOM_STEPS].reverse().find((step) => step < this.state.zoomLevel);
        this.setZoom(nextStep !== undefined ? nextStep : ZOOM_STEPS[0], validFocalDate);
    }

    setZoom(level, customFocalDate = null, customScrollY = null) {
        const g = this.gantt;
        if (!g) {
            this.state.zoomLevel = level;
            return;
        }

        this._isZooming = true;

        try {
            const visibleWidth = this.getTimelineVisibleWidth();
            const scrollState = g.getScrollState ? g.getScrollState() : { x: 0, y: 0 };
            const targetScrollY = (customScrollY !== null && customScrollY !== undefined) ? customScrollY : scrollState.y;

            // 1. Identify focal anchor date (valid Date only)
            let focalDate = (customFocalDate instanceof Date && !isNaN(customFocalDate.getTime())) ? customFocalDate : null;

            // If not explicitly provided (e.g. toolbar zoom buttons or scale dropdown), anchor to the visual center of current viewport
            if (!focalDate && g.dateFromPos) {
                const currentCenterPx = scrollState.x + Math.floor(visibleWidth / 2);
                const centerDate = g.dateFromPos(currentCenterPx);
                if (centerDate instanceof Date && !isNaN(centerDate.getTime())) {
                    focalDate = centerDate;
                }
            }

            if (!focalDate) {
                focalDate = new Date();
            }

            // 2. Apply the new zoom level and reconfigure scale & range
            this.state.zoomLevel = level;
            this.applyScaleConfig();
            this.ensureTimelineRange(focalDate, focalDate);
            g.render();

            // 3. Center viewport smoothly around focalDate
            const centerOnFocal = () => {
                if (focalDate && g.scrollTo) {
                    const newPos = this.safePosFromDate(focalDate);
                    if (newPos >= 0) {
                        const curVisWidth = this.getTimelineVisibleWidth();
                        const targetScrollX = Math.max(0, Math.round(newPos - curVisWidth / 2));
                        g.scrollTo(targetScrollX, targetScrollY);
                    }
                }
                this.renderTodayMarker();
            };

            centerOnFocal();

            requestAnimationFrame(() => {
                centerOnFocal();
                setTimeout(() => {
                    centerOnFocal();
                    this._isZooming = false;
                    this.saveViewState();
                }, 80);
            });
        } catch (err) {
            console.error("Error setting zoom:", err);
            this._isZooming = false;
        }
    }

    /**
     * Helper to get the exact visible pixel width of the timeline chart area (viewport)
     */
    getTimelineVisibleWidth() {
        if (this.ganttElement && this.ganttElement.el) {
            const taskContainer = this.ganttElement.el.querySelector(".gantt_task");
            if (taskContainer && taskContainer.clientWidth > 50) {
                return taskContainer.clientWidth;
            }
            const totalWidth = this.ganttElement.el.clientWidth;
            const gridWidth = (this.gantt && this.gantt.config && this.gantt.config.grid_width) || 440;
            if (totalWidth > gridWidth + 50) {
                return totalWidth - gridWidth;
            }
        }
        return 800;
    }

    /**
     * Centers the viewport directly on today's red line marker.
     */
    navigateToday() {
        if (!this.gantt) return;
        const g = this.gantt;
        const today = new Date();
        today.setHours(12, 0, 0, 0);

        // Ensure today is within timeline range
        const state = g.getState ? g.getState() : {};
        if (!state.min_date || !state.max_date || today < state.min_date || today > state.max_date) {
            this.ensureTimelineRange(today, today);
            g.render();
        }

        const scrollAndCenter = () => {
            this.renderTodayMarker();
            const visibleWidth = this.getTimelineVisibleWidth();
            const todayPx = this.safePosFromDate(today);

            if (todayPx >= 0 && g.scrollTo) {
                const targetX = Math.max(0, Math.round(todayPx - visibleWidth / 2));
                const scrollState = g.getScrollState ? g.getScrollState() : { y: 0 };
                g.scrollTo(targetX, scrollState.y);
            } else if (g.showDate) {
                g.showDate(today);
            }
        };

        scrollAndCenter();
        requestAnimationFrame(() => {
            scrollAndCenter();
            setTimeout(scrollAndCenter, 50);
        });
    }

    navigatePrevious() {
        if (!this.gantt) return;
        const pos = this.gantt.getScrollState ? this.gantt.getScrollState() : { x: 0, y: 0 };
        const step = 350;
        if (pos.x <= step) {
            this.expandTimelineToPast(step);
        } else {
            this.gantt.scrollTo(pos.x - step, pos.y);
        }
        this.renderTodayMarker();
    }

    navigateNext() {
        if (!this.gantt) return;
        const pos = this.gantt.getScrollState ? this.gantt.getScrollState() : { x: 0, y: 0 };
        const step = 350;
        const dataArea = this.ganttElement.el ? this.ganttElement.el.querySelector(".gantt_data_area") : null;
        const scrollWidth = dataArea ? dataArea.scrollWidth : 0;
        const clientWidth = dataArea ? dataArea.clientWidth : 0;
        const maxScroll = Math.max(0, scrollWidth - clientWidth);

        if (maxScroll > 0 && pos.x + step >= maxScroll - 100) {
            this.expandTimelineToFuture(step);
        } else {
            this.gantt.scrollTo(pos.x + step, pos.y);
        }
        this.renderTodayMarker();
    }

    expandAll() {
        if (this.gantt) {
            this.gantt.eachTask((task) => {
                task.$open = true;
            });
            this.gantt.render();
        }
    }

    collapseAll() {
        if (this.gantt) {
            this.gantt.eachTask((task) => {
                task.$open = false;
            });
            this.gantt.render();
        }
    }

    /**
     * Fit selected task/project/milestone or entire timeline to screen (Pritaikyti ekrane).
     * If a task, subtask, milestone or project is selected, fits that item's span to the screen.
     * Selects the best standard zoom level from ZOOM_STEPS based on visible screen width so the item fits horizontally,
     * and centers the item in the viewport.
     */
    fitToScreen(targetId = null) {
        if (!this.gantt) return;
        const g = this.gantt;

        const validTargetId = (typeof targetId === "string" || typeof targetId === "number") ? targetId : null;

        let targetTask = null;
        if (validTargetId && g.isTaskExists(validTargetId)) {
            targetTask = g.getTask(validTargetId);
        } else {
            const selectedId = g.getSelectedId ? g.getSelectedId() : null;
            if (selectedId && g.isTaskExists(selectedId)) {
                targetTask = g.getTask(selectedId);
            }
        }

        let minStart = null;
        let maxEnd = null;

        if (targetTask && targetTask.start_date && targetTask.end_date) {
            minStart = new Date(targetTask.start_date);
            maxEnd = new Date(targetTask.end_date);
            if (targetTask.deadline_end) {
                const tdl = targetTask.deadline_end instanceof Date ? targetTask.deadline_end : new Date(String(targetTask.deadline_end).replace(/-/g, "/"));
                if (!isNaN(tdl.getTime()) && tdl > maxEnd) maxEnd = tdl;
            }
            // If it's a project or parent task with children, encompass all descendants
            const encompassDescendants = (parentId) => {
                const children = (typeof g.getChildren === "function" ? g.getChildren(parentId) : []) || [];
                for (const childId of children) {
                    const child = g.getTask(childId);
                    if (child) {
                        if (child.start_date) {
                            const cs = new Date(child.start_date);
                            if (!minStart || cs < minStart) minStart = cs;
                        }
                        if (child.end_date) {
                            const ce = new Date(child.end_date);
                            if (!maxEnd || ce > maxEnd) maxEnd = ce;
                        }
                        if (child.deadline_end) {
                            const cdl = child.deadline_end instanceof Date ? child.deadline_end : new Date(String(child.deadline_end).replace(/-/g, "/"));
                            if (!isNaN(cdl.getTime()) && cdl > maxEnd) maxEnd = cdl;
                        }
                        encompassDescendants(childId);
                    }
                }
            };
            encompassDescendants(targetTask.id);
        } else {
            // No task selected: encompass all tasks across the entire timeline
            if (g.eachTask) {
                g.eachTask((t) => {
                    if (t.start_date) {
                        const s = new Date(t.start_date);
                        if (!minStart || s < minStart) minStart = s;
                    }
                    if (t.end_date) {
                        const e = new Date(t.end_date);
                        if (!maxEnd || e > maxEnd) maxEnd = e;
                    }
                    if (t.deadline_end) {
                        const tdl = t.deadline_end instanceof Date ? t.deadline_end : new Date(String(t.deadline_end).replace(/-/g, "/"));
                        if (!isNaN(tdl.getTime()) && tdl > maxEnd) maxEnd = tdl;
                    }
                });
            }
        }

        if (!minStart || !maxEnd) {
            return;
        }

        const durationDays = Math.max(1, Math.round((maxEnd.getTime() - minStart.getTime()) / 86400000));
        const midpointDate = new Date(minStart.getTime() + Math.round((maxEnd.getTime() - minStart.getTime()) / 2));

        // Dynamically find the best matching zoom level from predefined ZOOM_STEPS based on visible width:
        const visibleWidth = this.getTimelineVisibleWidth();
        const candidateZooms = [250, 200, 150, 100, 75, 50, 35, 20, 15, 10];
        let bestZoom = 10;
        for (const z of candidateZooms) {
            const pxPerDay = ZOOM_PX_PER_DAY[z] || 32;
            const estimatedPx = durationDays * pxPerDay;
            if (estimatedPx <= Math.max(300, visibleWidth * 1.25)) {
                bestZoom = z;
                break;
            }
        }

        let targetY = null;
        if (targetTask) {
            if (g.selectTask) g.selectTask(targetTask.id);
            const taskPos = (typeof g.getTaskPosition === "function") ? g.getTaskPosition(targetTask) : null;
            if (taskPos && taskPos.top !== undefined) {
                targetY = Math.max(0, taskPos.top - 80);
            }
        }

        // Apply standard zoom level centered on the task or project midpoint
        this.setZoom(bestZoom, midpointDate, targetY);
    }

    /**
     * Export to PDF
     */
    exportToPDF() {
        window.print();
    }

    /**
     * Export to PNG Image
     */
    async exportToPNG() {
        if (!window.html2canvas) {
            this.notification.add(_t("html2canvas library is loading, please try again"), { type: "warning" });
            return;
        }

        try {
            this.notification.add(_t("Capturing chart image..."), { type: "info" });
            const canvas = await window.html2canvas(this.ganttElement.el, {
                useCORS: true,
                scale: 2,
            });
            const link = document.createElement("a");
            link.download = `timeline_${new Date().toISOString().slice(0, 10)}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
            this.notification.add(_t("PNG paveikslėlis atsisiųstas"), { type: "success" });
        } catch (err) {
            console.error(err);
            this.notification.add(_t("Klaida eksportuojant PNG: ") + err.message, { type: "danger" });
        }
    }

    /**
     * Export to Excel (.xlsx) using SheetJS
     */
    exportToExcel() {
        if (!window.XLSX) {
            this.notification.add(_t("Excel export library loading..."), { type: "warning" });
            return;
        }

        if (!this.gantt) return;

        const tasks = [];
        this.gantt.eachTask((task) => {
            tasks.push({
                "Tipas / Type": task.is_project ? "Projektas" : "Užduotis",
                "Pavadinimas": task.text,
                "Pradžios data": task.work_start_date || formatOdooDateTime(task.start_date),
                "Pabaigos data": task.work_end_date || formatOdooDateTime(task.end_date),
                "Trukmė (D.)": task.duration || 0,
                "Progresas (%)": Math.round((task.progress || 0) * 100),
                "Planuotos val.": task.allocated_hours || "",
                "Atsakingas": task.assignees || "",
                "Etapas": task.stage_name || "",
                "Projektas": task.project_name || "",
            });
        });

        const ws = window.XLSX.utils.json_to_sheet(tasks);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Timeline");
        window.XLSX.writeFile(wb, `Timeline_${new Date().toISOString().slice(0, 10)}.xlsx`);
        this.notification.add(_t("Excel failas atsisiųstas"), { type: "success" });
    }
}

// Register Client Action
registry.category("actions").add("all_in_one_timeline.action", AllInOneTimelineAction);

// Register Timeline View to override timeline view with All In One Advanced Gantt
export const AllInOneTimelineView = {
    type: "timeline",
    display_name: _t("Timeline"),
    icon: "fa fa-tasks",
    multiRecord: true,
    Controller: AllInOneTimelineAction,
    props: (genericProps) => {
        return {
            ...genericProps,
        };
    },
};

const viewsRegistry = registry.category("views");
const origViewsAdd = viewsRegistry.add.bind(viewsRegistry);

viewsRegistry.add = function (key, value, options = {}) {
    if (key === "timeline") {
        if (value === AllInOneTimelineView) {
            return origViewsAdd(key, value, { ...options, force: true });
        }
        // If web_timeline or any other module attempts to register "timeline",
        // intercept it silently without throwing DuplicatedKeyError,
        // and keep AllInOneTimelineView as the active timeline view!
        return this;
    }
    return origViewsAdd(key, value, options);
};

// Register All In One Timeline as the timeline view
viewsRegistry.add("timeline", AllInOneTimelineView, { force: true });
