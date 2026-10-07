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

        this.state = useState({
            selectedProjectId: defaultProjId,
            currentScale: "year",
            zoomLevel: 100,
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
            if (this.onKeyDown) {
                window.removeEventListener("keydown", this.onKeyDown);
                this.onKeyDown = null;
            }
            this.hideSnapGuide();
            if (this.onGridClickHandler && this.ganttElement.el) {
                this.ganttElement.el.removeEventListener("click", this.onGridClickHandler);
                this.onGridClickHandler = null;
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
                        const icon = task.is_done ? "fa fa-check-circle text-success" : "fa fa-folder-open text-primary";
                        return `<i class="${icon} me-1"></i><b>${task.text}</b>`;
                    }
                    if (task.is_milestone) {
                        const icon = task.is_done ? "fa fa-flag-checkered text-success" : "fa fa-flag text-warning";
                        return `<i class="${icon} me-1"></i><b>${task.text}</b>`;
                    }
                    const icon = task.is_done ? "fa fa-check-circle text-success" : "fa fa-tasks text-muted";
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

        // Set default scale (Month)
        this.applyScaleConfig(this.state.currentScale);

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

            if (task.is_milestone) {
                return `
                    <div class="gantt_tooltip_inner">
                        <div class="tooltip_title"><i class="fa fa-flag text-warning me-1"></i>${task.text}</div>
                        <div class="tooltip_row"><span class="tooltip_label">Tipas:</span> <span class="tooltip_val">Projekto gairė</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Projektas:</span> <span class="tooltip_val">${task.project_name || "-"}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Pradžia:</span> <span class="tooltip_val">${startStr}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Terminas:</span> <span class="tooltip_val">${endStr}</span></div>
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

        // Task Bar Text & Progress Template (Reflects progress directly in the line itself)
        g.templates.task_text = (start, end, task) => {
            const percent = Math.round((task.progress || 0) * 100);
            const isDone = task.is_done || percent >= 100;
            const badgeClass = isDone ? "bar_prog_badge bar_prog_100" : "bar_prog_badge";
            return `
                <span class="bar_content_wrapper">
                    <span class="bar_text">${task.text}</span>
                    <span class="${badgeClass}">${percent}%</span>
                </span>
            `;
        };

        // Task Bar Styling Template (Marks done tasks, done milestones, and done projects green)
        g.templates.task_class = (start, end, task) => {
            if (task.is_project) {
                if (task.is_done || task.progress >= 1.0) {
                    return "gantt_project project_done";
                }
                return "gantt_project";
            }
            if (task.is_milestone) {
                if (task.is_done || task.progress >= 1.0) {
                    return "timeline_milestone_bar milestone_done";
                }
                return "timeline_milestone_bar";
            }
            if (task.is_done || task.progress >= 1.0 || task.state === "1_done") {
                return "task_done";
            }
            return "task_standard";
        };

        // Mark Today, Weekends, and Lithuanian National Holidays in Scale Header
        g.templates.scale_cell_class = (date) => {
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

            // Bidirectional elastic infinite scroll: expand when scrolling near edges
            if (!this._isExpandingRange) {
                const scrollX = left !== undefined ? left : (g.getScrollState ? g.getScrollState().x : 0);
                if (scrollX <= 60) {
                    this.expandTimelineToPast(0);
                } else {
                    const dataArea = this.ganttElement.el ? this.ganttElement.el.querySelector(".gantt_data_area") : null;
                    if (dataArea) {
                        const scrollWidth = dataArea.scrollWidth;
                        const clientWidth = dataArea.clientWidth;
                        const maxScroll = scrollWidth - clientWidth;
                        if (maxScroll > 100 && scrollX >= maxScroll - 60) {
                            this.expandTimelineToFuture(0);
                        }
                    }
                }
            }
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

            // Expand timescale if dragged task is near past or future boundary
            if (g.config.start_date && task.start_date) {
                const diffPastMs = task.start_date.getTime() - g.config.start_date.getTime();
                if (diffPastMs < 90 * 86400000) {
                    this.expandTimelineToPast(0);
                }
            }
            if (g.config.end_date && task.end_date) {
                const diffFutureMs = g.config.end_date.getTime() - task.end_date.getTime();
                if (diffFutureMs < 90 * 86400000) {
                    this.expandTimelineToFuture(0);
                }
            }

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
                        const currentPx = g.posFromDate(task.start_date);
                        let bestDiff = Infinity;
                        let bestMs = null;
                        let bestTargetPx = null;

                        for (const targetMs of this._snapTargetTimestamps) {
                            const targetPx = g.posFromDate(new Date(targetMs));
                            const diff = Math.abs(currentPx - targetPx);
                            if (diff <= SNAP_THRESHOLD_PX && diff < bestDiff) {
                                bestDiff = diff;
                                bestMs = targetMs;
                                bestTargetPx = targetPx;
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
                        const currentPx = g.posFromDate(task.end_date);
                        let bestDiff = Infinity;
                        let bestMs = null;
                        let bestTargetPx = null;

                        for (const targetMs of this._snapTargetTimestamps) {
                            const targetPx = g.posFromDate(new Date(targetMs));
                            const diff = Math.abs(currentPx - targetPx);
                            if (diff <= SNAP_THRESHOLD_PX && diff < bestDiff) {
                                bestDiff = diff;
                                bestMs = targetMs;
                                bestTargetPx = targetPx;
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
                    const startPx = g.posFromDate(task.start_date);
                    const endPx = g.posFromDate(task.end_date);

                    let bestDiff = Infinity;
                    let bestType = null;
                    let bestMs = null;
                    let bestTargetPx = null;

                    for (const targetMs of this._snapTargetTimestamps) {
                        const targetPx = g.posFromDate(new Date(targetMs));

                        const diffStart = Math.abs(startPx - targetPx);
                        if (diffStart <= SNAP_THRESHOLD_PX && diffStart < bestDiff) {
                            bestDiff = diffStart;
                            bestType = "start";
                            bestMs = targetMs;
                            bestTargetPx = targetPx;
                        }

                        const diffEnd = Math.abs(endPx - targetPx);
                        if (diffEnd <= SNAP_THRESHOLD_PX && diffEnd < bestDiff) {
                            bestDiff = diffEnd;
                            bestType = "end";
                            bestMs = targetMs;
                            bestTargetPx = targetPx;
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

            try {
                await this.orm.call("project.task", "save_timeline_batch_schedule", [updates]);
                this.notification.add(_t("Tvarkaraštis atnaujintas"), { type: "success" });
                await this.loadTimelineData();
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
                    this.notification.add(_t("Priklausomybė pridėta"), { type: "info" });
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
                    this.notification.add(_t("Priklausomybė pašalinta"), { type: "info" });
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
            this.ganttElement.el.addEventListener("mousedown", () => this.hideTooltip());
        }

        // Initialize inside container
        g.init(this.ganttElement.el);
    }

    /**
     * Applies timeframe scales: Diena, Savaitė, Mėnuo, Metai
     * Translates months & weekdays to Lithuanian, marks weekends (#f1f3f7) and national holidays.
     */
    applyScaleConfig(scale, customColWidth = null) {
        const g = this.gantt;
        if (!g) return;

        let colWidth = customColWidth || 40;
        if (!customColWidth && this.state.zoomLevel !== 100) {
            colWidth = Math.round((colWidth * this.state.zoomLevel) / 100);
        }

        switch (scale) {
            case "day":
                g.config.scales = [
                    {
                        unit: "month",
                        step: 1,
                        format: (date) => {
                            const monthNum = date.getMonth() + 1;
                            const monthName = LITHUANIAN_MONTHS[date.getMonth()];
                            const year = date.getFullYear();
                            return `${year} m. ${monthName} (${monthNum})`;
                        },
                    },
                    {
                        unit: "day",
                        step: 1,
                        format: (date) => {
                            const d = date.getDate();
                            const monthGen = LITHUANIAN_MONTHS_GENITIVE[date.getMonth()];
                            const weekday = LITHUANIAN_WEEKDAYS[date.getDay()];
                            const hol = getLithuanianHoliday(date);
                            if (hol) {
                                return `<span class="holiday_day_cell" title="${hol}">★ ${weekday}, ${monthGen} ${d} d. (${hol})</span>`;
                            }
                            return `${weekday}, ${monthGen} ${d} d.`;
                        },
                        css: (date) => {
                            if (getLithuanianHoliday(date)) return "holiday_scale_cell";
                            if (isWeekend(date)) return "weekend_scale_cell";
                            return "";
                        },
                    },
                    { unit: "hour", step: 2, format: "%H:00" },
                ];
                g.config.scale_height = 80;
                g.config.min_column_width = customColWidth ? Math.max(20, customColWidth) : Math.max(45, colWidth);
                break;

            case "week":
                g.config.scales = [
                    {
                        unit: "month",
                        step: 1,
                        format: (date) => {
                            const monthNum = date.getMonth() + 1;
                            const monthName = LITHUANIAN_MONTHS[date.getMonth()];
                            const year = date.getFullYear();
                            return `${year} m. ${monthName} (${monthNum})`;
                        },
                    },
                    {
                        unit: "week",
                        step: 1,
                        format: (date) => {
                            const weekNum = getISOWeekNumber(date);
                            return `S${weekNum}`;
                        },
                    },
                    {
                        unit: "day",
                        step: 1,
                        format: (date) => {
                            const d = date.getDate();
                            const dStr = d < 10 ? `0${d}` : `${d}`;
                            const weekday = LITHUANIAN_WEEKDAYS_SHORT[date.getDay()];
                            const hol = getLithuanianHoliday(date);
                            if (hol) {
                                return `<span class="holiday_day_cell" title="${hol}">★ ${weekday} ${dStr}</span>`;
                            }
                            return `${weekday} ${dStr}`;
                        },
                        css: (date) => {
                            if (getLithuanianHoliday(date)) return "holiday_scale_cell";
                            if (isWeekend(date)) return "weekend_scale_cell";
                            return "";
                        },
                    },
                ];
                g.config.scale_height = 80;
                g.config.min_column_width = customColWidth ? Math.max(20, customColWidth) : Math.max(48, colWidth);
                break;

            case "year":
                // Year timeline:
                // 1. Metai (%Y m.)
                // 2. Mėnuo lietuviškai su numeriu: pvz. Spalis (10)
                // 3. Savaičių numeriai: S40, S41...
                // 4. Dienos: 1, 2, 3... su aiškiai pažymėtais savaitgaliais ir valstybinėmis šventėmis
                g.config.scales = [
                    { unit: "year", step: 1, format: "%Y m." },
                    {
                        unit: "month",
                        step: 1,
                        format: (date) => {
                            const monthNum = date.getMonth() + 1;
                            const monthName = LITHUANIAN_MONTHS[date.getMonth()];
                            return `${monthName} (${monthNum})`;
                        },
                    },
                    {
                        unit: "week",
                        step: 1,
                        format: (date) => {
                            const weekNum = getISOWeekNumber(date);
                            return `S${weekNum}`;
                        },
                    },
                    {
                        unit: "day",
                        step: 1,
                        format: (date) => {
                            const d = date.getDate();
                            const hol = getLithuanianHoliday(date);
                            if (hol) {
                                return `<span class="holiday_day_cell" title="${hol}">★${d}</span>`;
                            }
                            return d;
                        },
                        css: (date) => {
                            if (getLithuanianHoliday(date)) return "holiday_scale_cell";
                            if (isWeekend(date)) return "weekend_scale_cell";
                            return "";
                        },
                    },
                ];
                g.config.scale_height = 92;
                g.config.min_column_width = customColWidth ? Math.max(12, customColWidth) : Math.max(22, Math.round((24 * this.state.zoomLevel) / 100));
                break;

            case "month":
            default:
                // Month timeline:
                // 1. Mėnuo lietuviškai su numeriu ir metais: pvz. 2026 m. Spalis (10)
                // 2. Savaičių numeriai: S40, S41...
                // 3. Dienos: 01, 02... su aiškiai pažymėtais savaitgaliais ir valstybinėmis šventėmis
                g.config.scales = [
                    {
                        unit: "month",
                        step: 1,
                        format: (date) => {
                            const monthNum = date.getMonth() + 1;
                            const monthName = LITHUANIAN_MONTHS[date.getMonth()];
                            const year = date.getFullYear();
                            return `${year} m. ${monthName} (${monthNum})`;
                        },
                    },
                    {
                        unit: "week",
                        step: 1,
                        format: (date) => {
                            const weekNum = getISOWeekNumber(date);
                            return `S${weekNum}`;
                        },
                    },
                    {
                        unit: "day",
                        step: 1,
                        format: (date) => {
                            const d = date.getDate();
                            const dStr = d < 10 ? `0${d}` : `${d}`;
                            const hol = getLithuanianHoliday(date);
                            if (hol) {
                                return `<span class="holiday_day_cell" title="${hol}">★ ${dStr}</span>`;
                            }
                            return dStr;
                        },
                        css: (date) => {
                            if (getLithuanianHoliday(date)) return "holiday_scale_cell";
                            if (isWeekend(date)) return "weekend_scale_cell";
                            return "";
                        },
                    },
                ];
                g.config.scale_height = 80;
                g.config.min_column_width = customColWidth ? Math.max(18, customColWidth) : Math.max(38, colWidth);
                break;
        }
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

            // Preserve scroll position and open/closed branch states
            const scrollPos = this.gantt.getScrollState ? this.gantt.getScrollState() : null;
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

            if (scrollPos && (scrollPos.x !== undefined || scrollPos.y !== undefined)) {
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
        this.actionService.doAction({
            type: "ir.actions.act_window",
            res_model: "project.milestone",
            res_id: milestoneId,
            views: [[false, "form"]],
            target: "current",
        });
    }

    /**
     * Open standard Odoo Project Form (Full view with normal menus, chatter, breadcrumbs)
     */
    openProjectFormDialog(projectId) {
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

        let minDate = new Date(today);
        let maxDate = new Date(today);

        if (extraTaskStart && extraTaskStart instanceof Date && !isNaN(extraTaskStart.getTime())) {
            if (extraTaskStart < minDate) minDate = new Date(extraTaskStart);
            if (extraTaskStart > maxDate) maxDate = new Date(extraTaskStart);
        }
        if (extraTaskEnd && extraTaskEnd instanceof Date && !isNaN(extraTaskEnd.getTime())) {
            if (extraTaskEnd < minDate) minDate = new Date(extraTaskEnd);
            if (extraTaskEnd > maxDate) maxDate = new Date(extraTaskEnd);
        }

        if (g.eachTask) {
            g.eachTask((task) => {
                if (task.start_date) {
                    const s = new Date(task.start_date);
                    if (!isNaN(s.getTime()) && s < minDate) {
                        minDate = s;
                    }
                }
                if (task.end_date) {
                    const e = new Date(task.end_date);
                    if (!isNaN(e.getTime()) && e > maxDate) {
                        maxDate = e;
                    }
                }
            });
        }

        const scale = this.state.currentScale;
        let startDate, endDate;

        if (scale === "year") {
            // Generous past buffer: at least 2 full calendar years before minDate
            const startYear = Math.min(minDate.getFullYear() - 2, today.getFullYear() - 1);
            startDate = new Date(startYear, 0, 1, 0, 0, 0);
            // Generous future buffer: at least 2 full calendar years after maxDate
            const endYear = Math.max(maxDate.getFullYear() + 2, today.getFullYear() + 2);
            endDate = new Date(endYear, 11, 31, 23, 59, 59);
        } else if (scale === "month") {
            // Buffer past: at least 12 months before minDate
            startDate = new Date(minDate.getFullYear(), minDate.getMonth() - 12, 1, 0, 0, 0);
            // Buffer future: at least 18 months after maxDate
            endDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 18, 0, 23, 59, 59);
        } else if (scale === "week") {
            // Buffer past: at least 3 months before minDate
            startDate = new Date(minDate.getFullYear(), minDate.getMonth() - 3, 1, 0, 0, 0);
            endDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 6, 0, 23, 59, 59);
        } else {
            // Day scale: at least 1 month before minDate
            startDate = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1, 0, 0, 0);
            endDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 3, 0, 23, 59, 59);
        }

        // If config.start_date was already dynamically expanded further into the past, preserve that earlier start date
        if (g.config.start_date && g.config.start_date < startDate) {
            startDate = new Date(g.config.start_date);
        }
        // If config.end_date was already dynamically expanded further into the future, preserve that later end date
        if (g.config.end_date && g.config.end_date > endDate) {
            endDate = new Date(g.config.end_date);
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
            const scale = this.state.currentScale;

            if (scale === "year") {
                newStart.setFullYear(newStart.getFullYear() - 1);
            } else if (scale === "month") {
                newStart.setMonth(newStart.getMonth() - 6);
            } else if (scale === "week") {
                newStart.setMonth(newStart.getMonth() - 2);
            } else {
                newStart.setDate(newStart.getDate() - 14);
            }

            const scrollState = g.getScrollState ? g.getScrollState() : { x: 0, y: 0 };
            g.config.start_date = newStart;
            g.render();

            const addedPx = g.posFromDate ? g.posFromDate(oldStart) : 0;
            const newScrollX = Math.max(0, scrollState.x + addedPx - stepPx);
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
            const scale = this.state.currentScale;

            if (scale === "year") {
                newEnd.setFullYear(newEnd.getFullYear() + 1);
            } else if (scale === "month") {
                newEnd.setMonth(newEnd.getMonth() + 6);
            } else if (scale === "week") {
                newEnd.setMonth(newEnd.getMonth() + 2);
            } else {
                newEnd.setDate(newEnd.getDate() + 14);
            }

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
            const leftPos = g.posFromDate(today);
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
                this.notification.add(
                    _t("Atšauktas veiksmas: ") + (action.description || ""),
                    { type: "info" }
                );
                await this.loadTimelineData();
            } else if (action.type === "link_add") {
                await this.orm.call("project.task", "remove_timeline_dependency", [
                    action.sourceId,
                    action.targetId,
                ]);
                this.notification.add(_t("Atšauktas ryšio pridėjimas"), { type: "info" });
                await this.loadTimelineData();
            } else if (action.type === "link_delete") {
                await this.orm.call("project.task", "add_timeline_dependency", [
                    action.sourceId,
                    action.targetId,
                ]);
                this.notification.add(_t("Atstatytas ryšys"), { type: "info" });
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
        await this.loadTimelineData();
    }

    changeScale(scale) {
        this.state.currentScale = scale;
        this.applyScaleConfig(scale);
        if (this.gantt) {
            this.ensureTimelineRange();
            this.gantt.render();
            this.renderTodayMarker();
        }
    }

    zoomIn() {
        this.state.zoomLevel = Math.min(250, this.state.zoomLevel + 25);
        this.applyScaleConfig(this.state.currentScale);
        if (this.gantt) {
            this.ensureTimelineRange();
            this.gantt.render();
            this.renderTodayMarker();
        }
    }

    zoomOut() {
        this.state.zoomLevel = Math.max(50, this.state.zoomLevel - 25);
        this.applyScaleConfig(this.state.currentScale);
        if (this.gantt) {
            this.ensureTimelineRange();
            this.gantt.render();
            this.renderTodayMarker();
        }
    }

    navigateToday() {
        if (!this.gantt) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const state = this.gantt.getState ? this.gantt.getState() : {};
        if (!state.min_date || !state.max_date || today < state.min_date || today > state.max_date) {
            this.ensureTimelineRange();
            this.gantt.render();
        }

        const dataArea = this.ganttElement.el ? this.ganttElement.el.querySelector(".gantt_data_area") : null;
        const visibleWidth = dataArea ? dataArea.clientWidth : 800;
        const todayPx = this.gantt.posFromDate ? this.gantt.posFromDate(today) : -1;

        if (todayPx >= 0 && this.gantt.scrollTo) {
            const targetX = Math.max(0, todayPx - Math.floor(visibleWidth / 2));
            const currentY = this.gantt.getScrollState ? this.gantt.getScrollState().y : 0;
            this.gantt.scrollTo(targetX, currentY);
        } else if (this.gantt.showDate) {
            this.gantt.showDate(today);
        }
        this.renderTodayMarker();
    }

    navigatePrevious() {
        if (!this.gantt) return;
        const pos = this.gantt.getScrollState ? this.gantt.getScrollState() : { x: 0, y: 0 };
        const step = (this.state.currentScale === "year" ? 350 : 250);
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
        const step = (this.state.currentScale === "year" ? 350 : 250);
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
     * Automatically adjusts scale (week for short tasks, month for medium, year for projects)
     * and calculates column widths so the timeline fits horizontally without unnecessary scrolling.
     */
    fitToScreen() {
        if (!this.gantt) return;
        const g = this.gantt;

        const selectedId = g.getSelectedId ? g.getSelectedId() : null;
        let targetTask = null;
        if (selectedId && g.isTaskExists(selectedId)) {
            targetTask = g.getTask(selectedId);
        }

        let minStart = null;
        let maxEnd = null;

        if (targetTask && targetTask.start_date && targetTask.end_date) {
            minStart = new Date(targetTask.start_date);
            maxEnd = new Date(targetTask.end_date);
        } else {
            // No task selected: encompass all tasks across the entire timeline
            if (g.eachTask) {
                g.eachTask((t) => {
                    if (t.start_date && (!minStart || t.start_date < minStart)) {
                        minStart = new Date(t.start_date);
                    }
                    if (t.end_date && (!maxEnd || t.end_date > maxEnd)) {
                        maxEnd = new Date(t.end_date);
                    }
                });
            }
        }

        if (!minStart || !maxEnd) {
            this.notification.add(_t("Nėra užduočių pritaikymui ekrane"), { type: "warning" });
            return;
        }

        // Available visible pixel width for timeline data area
        const dataArea = this.ganttElement.el
            ? (this.ganttElement.el.querySelector(".gantt_data_area") || this.ganttElement.el.querySelector(".gantt_task"))
            : null;
        const totalContainerWidth = this.ganttElement.el ? this.ganttElement.el.clientWidth : 1200;
        const gridWidth = g.config.grid_width || 440;
        const visibleWidth = dataArea && dataArea.clientWidth > 100
            ? dataArea.clientWidth
            : Math.max(400, totalContainerWidth - gridWidth);
        const usableWidth = Math.max(350, visibleWidth - 30); // 30px buffer

        const durationDays = Math.max(1, Math.round((maxEnd.getTime() - minStart.getTime()) / 86400000));

        let targetScale = "year";
        let rangeStart = new Date(minStart);
        let rangeEnd = new Date(maxEnd);
        let totalUnits = durationDays;
        let colWidth = 40;

        if (durationDays <= 3) {
            // Very short task (1-3 days): switch to week view
            targetScale = "week";
            rangeStart.setDate(rangeStart.getDate() - 2);
            rangeEnd.setDate(rangeEnd.getDate() + 4);
            totalUnits = Math.max(7, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000));
            colWidth = Math.max(48, Math.floor(usableWidth / totalUnits));
        } else if (durationDays <= 35) {
            // Medium task or milestone (4 to 35 days): switch to month view
            targetScale = "month";
            rangeStart.setDate(rangeStart.getDate() - 3);
            rangeEnd.setDate(rangeEnd.getDate() + 4);
            totalUnits = Math.max(14, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000));
            colWidth = Math.max(28, Math.floor(usableWidth / totalUnits));
        } else {
            // Project or long duration (> 35 days): switch to year view
            targetScale = "year";
            rangeStart.setDate(rangeStart.getDate() - 7);
            rangeEnd.setDate(rangeEnd.getDate() + 10);
            totalUnits = Math.max(30, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000));
            colWidth = Math.max(14, Math.floor(usableWidth / totalUnits));
        }

        // Apply scale & date boundaries
        this.state.currentScale = targetScale;
        this.state.zoomLevel = 100;
        g.config.start_date = rangeStart;
        g.config.end_date = rangeEnd;
        this.applyScaleConfig(targetScale, colWidth);
        g.render();

        if (targetTask) {
            if (g.showTask) g.showTask(targetTask.id);
            if (g.selectTask) g.selectTask(targetTask.id);
            this.notification.add(
                _t("Pritaikyta ekrane: ") + targetTask.text,
                { type: "info" }
            );
        } else {
            if (g.showDate) g.showDate(minStart);
            if (g.scrollTo) g.scrollTo(0, 0);
            this.notification.add(
                _t("Visas tvarkaraštis pritaikytas ekrane"),
                { type: "info" }
            );
        }
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

// Register Timeline View to override standard timeline with All In One Advanced Gantt
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
registry.category("views").add("timeline", AllInOneTimelineView, { force: true });
