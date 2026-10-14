/** @odoo-module **/

import { Component, onMounted, useRef, useState, onWillUnmount, onWillUpdateProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
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
    "Saus",
    "Vas",
    "Kov",
    "Bal",
    "Geg",
    "Birž",
    "Liep",
    "Rugp",
    "Rugs",
    "Spal",
    "Lapkr",
    "Gruod",
];

export const ZOOM_STEPS = Array.from({ length: 21 }, (_, i) => i * 5);
export const DEFAULT_OVERVIEW_ZOOM = 0;
export const TIMELINE_VIEW_STATE_KEY = "gannt_lt_viewport_state";

export function getZoomPxPerDay(zoomLevel, visibleWidth = 1100) {
    const z = Math.max(0, Math.min(100, Number(zoomLevel) || 0));
    const t = z / 100.0;
    const vw = Math.max(600, Number(visibleWidth) || 1100);
    const minPx = vw / 2000.0; // At 0% zoom: ~5.5 years across visible width
    const p95 = vw * 24.0; // At 95% zoom: exactly 60 minutes (1 hour) fits visible width
    const base = Math.pow(p95 / minPx, 1.0 / 0.95);
    return minPx * Math.pow(base, t);
}

export const ZOOM_PX_PER_DAY = new Proxy({}, {
    get(target, prop) {
        const lvl = Number(prop);
        if (!isNaN(lvl)) {
            return getZoomPxPerDay(lvl);
        }
        return 32;
    }
});

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
 * Human duration from minutes: "16 min", "1 val. 5 min", "2 d. 3 val.".
 * Same rules as the backend: whole minutes, rounded UP, never below 1 minute when > 0.
 */
export function formatDurationMinutes(totalMin) {
    let m = Math.max(0, Math.ceil((Number(totalMin) || 0) - 1e-9));
    if (m < 60) return `${m} min`;
    const days = Math.floor(m / 1440);
    const rem = m % 1440;
    const hours = Math.floor(rem / 60);
    const mins = rem % 60;
    const parts = [];
    if (days) parts.push(`${days} d.`);
    if (hours) parts.push(`${hours} val.`);
    if (mins && !days) parts.push(`${mins} min`);
    return parts.join(" ") || "0 min";
}

/**
 * Compact allocated-hours label: "16 min", "8h", "1h 30min" (instead of "0.1h").
 */
export function formatHoursLabel(hours) {
    const h = Number(hours) || 0;
    if (h <= 0) return "";
    const total = Math.max(1, Math.round(h * 60));
    if (total < 60) return `${total} min`;
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return mm === 0 ? `${hh}h` : `${hh}h ${mm}min`;
}

/**
 * Parses labels produced by formatHoursLabel ("16 min", "8h", "1h 30min", legacy "0.1h") back to hours.
 */
export function parseHoursLabel(label) {
    if (typeof label === "number") return label;
    const s = String(label || "").trim();
    if (!s) return 0;
    let hours = 0;
    const h = s.match(/(\d+(?:[.,]\d+)?)\s*h/i);
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*min/i);
    if (h) hours += parseFloat(h[1].replace(",", "."));
    if (m) hours += parseFloat(m[1].replace(",", ".")) / 60;
    if (!h && !m) hours = parseFloat(s.replace(",", ".")) || 0;
    return hours;
}


/**
 * Default working hours schedule for Monday through Sunday.
 * Active days: Monday-Friday (08:00 - 17:00, lunch 12:45 - 13:45).
 * Inactive days: Saturday-Sunday.
 */
export const DEFAULT_WORKING_HOURS = {
    1: { dayIndex: 1, name: "Pirmadienis", shortName: "I", active: true, start: "08:00", lunchStart: "12:45", lunchEnd: "13:45", end: "17:00" },
    2: { dayIndex: 2, name: "Antradienis", shortName: "II", active: true, start: "08:00", lunchStart: "12:45", lunchEnd: "13:45", end: "17:00" },
    3: { dayIndex: 3, name: "Trečiadienis", shortName: "III", active: true, start: "08:00", lunchStart: "12:45", lunchEnd: "13:45", end: "17:00" },
    4: { dayIndex: 4, name: "Ketvirtadienis", shortName: "IV", active: true, start: "08:00", lunchStart: "12:45", lunchEnd: "13:45", end: "17:00" },
    5: { dayIndex: 5, name: "Penktadienis", shortName: "V", active: true, start: "08:00", lunchStart: "12:45", lunchEnd: "13:45", end: "17:00" },
    6: { dayIndex: 6, name: "Šeštadienis", shortName: "VI", active: false, start: "08:00", lunchStart: "12:45", lunchEnd: "13:45", end: "17:00" },
    0: { dayIndex: 0, name: "Sekmadienis", shortName: "VII", active: false, start: "08:00", lunchStart: "12:45", lunchEnd: "13:45", end: "17:00" },
};

export const STORAGE_KEY_WORK_HOURS = "gannt_lt_working_hours_schedule_v2";

/**
 * Normalizes user input time string into 24-hour HH:mm format (e.g. "8" -> "08:00", "1245" -> "12:45").
 */
export function normalizeTimeInput(val, defaultVal = "08:00") {
    if (!val || typeof val !== "string") return defaultVal;
    let s = val.trim().replace(/[^\d:]/g, "");
    if (!s) return defaultVal;

    if (/^\d{1,2}$/.test(s)) {
        let h = parseInt(s, 10);
        if (h >= 0 && h <= 23) {
            return `${h < 10 ? "0" + h : h}:00`;
        }
    }
    if (/^\d{3,4}$/.test(s)) {
        let h = parseInt(s.length === 3 ? s.slice(0, 1) : s.slice(0, 2), 10);
        let m = parseInt(s.slice(-2), 10);
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            return `${h < 10 ? "0" + h : h}:${m < 10 ? "0" + m : m}`;
        }
    }
    const match = s.match(/^(\d{1,2}):(\d{1,2})$/);
    if (match) {
        let h = parseInt(match[1], 10);
        let m = parseInt(match[2], 10);
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            return `${h < 10 ? "0" + h : h}:${m < 10 ? "0" + m : m}`;
        }
    }
    return defaultVal;
}

export function getActiveWorkingHoursSchedule() {
    try {
        if (typeof window !== "undefined" && window.localStorage) {
            const saved = window.localStorage.getItem(STORAGE_KEY_WORK_HOURS);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === "object") {
                    const merged = {};
                    for (let i = 0; i <= 6; i++) {
                        merged[i] = Object.assign({}, DEFAULT_WORKING_HOURS[i], parsed[i] || {});
                    }
                    return merged;
                }
            }
        }
    } catch {
        // fallback
    }
    return DEFAULT_WORKING_HOURS;
}

export function isWorkingDay(date, schedule = null) {
    if (!date) return false;
    const d = new Date(date);
    if (isNaN(d.getTime())) return false;
    if (getLithuanianHoliday(d)) return false;
    const sched = schedule || getActiveWorkingHoursSchedule();
    const cfg = sched ? sched[d.getDay()] : DEFAULT_WORKING_HOURS[d.getDay()];
    return !!(cfg && cfg.active);
}

export function getIntervalWorkMinutes(date, stepMinutes = 0, schedule = null) {
    if (!date) return 0;
    const d = new Date(date);
    if (isNaN(d.getTime())) return 0;
    if (getLithuanianHoliday(d)) return 0;

    const sched = schedule || getActiveWorkingHoursSchedule();
    const cfg = sched ? sched[d.getDay()] : DEFAULT_WORKING_HOURS[d.getDay()];
    if (!cfg || !cfg.active) return 0;

    const step = stepMinutes > 0 ? stepMinutes : 1;
    const startMin = d.getHours() * 60 + d.getMinutes();
    const endMin = startMin + step;

    const parseTimeToMin = (tStr, defVal) => {
        if (!tStr) return defVal;
        const parts = String(tStr).split(":");
        if (parts.length < 2) return defVal;
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    };

    const wStart = parseTimeToMin(cfg.start, 480);
    const wEnd = parseTimeToMin(cfg.end, 1020);
    const lStart = parseTimeToMin(cfg.lunchStart, null);
    const lEnd = parseTimeToMin(cfg.lunchEnd, null);

    const oStart = Math.max(startMin, wStart);
    const oEnd = Math.min(endMin, wEnd);
    if (oEnd <= oStart) return 0;

    let workDuration = oEnd - oStart;

    if (lStart !== null && lEnd !== null && lEnd > lStart) {
        const loStart = Math.max(oStart, lStart);
        const loEnd = Math.min(oEnd, lEnd);
        if (loEnd > loStart) {
            workDuration -= (loEnd - loStart);
        }
    }

    return Math.max(0, workDuration);
}

export function isWorkingDateTime(date, schedule = null, stepMinutes = 0) {
    if (!date) return false;
    const step = stepMinutes > 0 ? stepMinutes : 1;
    const workMins = getIntervalWorkMinutes(date, step, schedule);
    if (step <= 1) {
        return workMins > 0;
    }
    return workMins >= Math.ceil(step / 2);
}

/**
 * Calculates actual working days and hours between start and end dates.
 * Excludes weekends / inactive days and Lithuanian national holidays.
 * Respects configured intra-day working hours and lunch break.
 */
export function calculateWorkingDaysAndHours(startDate, endDate, schedule = null) {
    if (!startDate || !endDate) {
        return { workDays: 0, workHours: 0, calendarDays: 0 };
    }
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) {
        return { workDays: 0, workHours: 0, calendarDays: 0 };
    }

    const sched = schedule || getActiveWorkingHoursSchedule();

    // Determine calendar start day and end day
    const startDay = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    let endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate());

    if (e.getHours() === 0 && e.getMinutes() === 0 && e.getSeconds() === 0 && endDay.getTime() > startDay.getTime()) {
        endDay.setDate(endDay.getDate() - 1);
    }

    const isSingleDay = (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate());

    let totalWorkHours = 0;
    let totalWorkDays = 0;
    let totalCalendarDays = 0;
    const curr = new Date(startDay);

    const parseTimeToMin = (tStr, defVal) => {
        if (!tStr) return defVal;
        const p = String(tStr).split(":");
        if (p.length < 2) return defVal;
        return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    };

    while (curr <= endDay) {
        totalCalendarDays++;
        const dayOfWeek = curr.getDay();
        const cfg = sched ? sched[dayOfWeek] : DEFAULT_WORKING_HOURS[dayOfWeek];

        if (cfg && cfg.active && !getLithuanianHoliday(curr)) {
            const startMin = parseTimeToMin(cfg.start, 480);
            const endMin = parseTimeToMin(cfg.end, 1020);
            const lunchStartMin = parseTimeToMin(cfg.lunchStart, null);
            const lunchEndMin = parseTimeToMin(cfg.lunchEnd, null);

            let lunchDurationHours = 0;
            if (lunchStartMin !== null && lunchEndMin !== null && lunchEndMin > lunchStartMin) {
                lunchDurationHours = (lunchEndMin - lunchStartMin) / 60;
            }
            const standardDayHours = Math.max(0, (endMin - startMin) / 60 - lunchDurationHours);

            const dayWorkStart = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate(), Math.floor(startMin / 60), startMin % 60, 0);
            const dayWorkEnd = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate(), Math.floor(endMin / 60), endMin % 60, 0);

            if (isSingleDay) {
                const isFullDayStd = (s <= dayWorkStart && e >= dayWorkEnd) || (s.getHours() === 0 && e.getHours() === 0);
                if (isFullDayStd) {
                    totalWorkHours += standardDayHours;
                    totalWorkDays += 1;
                } else {
                    const actStart = s > dayWorkStart ? s : dayWorkStart;
                    const actEnd = e < dayWorkEnd ? e : dayWorkEnd;
                    if (actEnd > actStart) {
                        let h = (actEnd.getTime() - actStart.getTime()) / 3600000;
                        if (lunchDurationHours > 0) {
                            const lStart = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate(), Math.floor(lunchStartMin / 60), lunchStartMin % 60, 0);
                            const lEnd = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate(), Math.floor(lunchEndMin / 60), lunchEndMin % 60, 0);
                            const oStart = actStart > lStart ? actStart : lStart;
                            const oEnd = actEnd < lEnd ? actEnd : lEnd;
                            if (oEnd > oStart) {
                                h -= (oEnd.getTime() - oStart.getTime()) / 3600000;
                            }
                        }
                        const roundedH = Math.round(Math.max(0, Math.min(standardDayHours, h)) * 100) / 100;
                        totalWorkHours += roundedH;
                        totalWorkDays += (roundedH >= standardDayHours ? 1 : Math.round((roundedH / (standardDayHours || 8)) * 10) / 10);
                    }
                }
            } else if (curr.getTime() === startDay.getTime()) {
                if (s <= dayWorkStart) {
                    totalWorkHours += standardDayHours;
                    totalWorkDays += 1;
                } else {
                    const actStart = s > dayWorkStart ? s : dayWorkStart;
                    if (dayWorkEnd > actStart) {
                        let h = (dayWorkEnd.getTime() - actStart.getTime()) / 3600000;
                        if (lunchDurationHours > 0) {
                            const lStart = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate(), Math.floor(lunchStartMin / 60), lunchStartMin % 60, 0);
                            const lEnd = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate(), Math.floor(lunchEndMin / 60), lunchEndMin % 60, 0);
                            const oStart = actStart > lStart ? actStart : lStart;
                            const oEnd = dayWorkEnd < lEnd ? dayWorkEnd : lEnd;
                            if (oEnd > oStart) {
                                h -= (oEnd.getTime() - oStart.getTime()) / 3600000;
                            }
                        }
                        const roundedH = Math.round(Math.max(0, Math.min(standardDayHours, h)) * 100) / 100;
                        totalWorkHours += roundedH;
                        totalWorkDays += Math.round((roundedH / (standardDayHours || 8)) * 10) / 10;
                    }
                }
            } else if (curr.getTime() === endDay.getTime()) {
                if (e >= dayWorkEnd) {
                    totalWorkHours += standardDayHours;
                    totalWorkDays += 1;
                } else {
                    const actEnd = e < dayWorkEnd ? e : dayWorkEnd;
                    if (actEnd > dayWorkStart) {
                        let h = (actEnd.getTime() - dayWorkStart.getTime()) / 3600000;
                        if (lunchDurationHours > 0) {
                            const lStart = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate(), Math.floor(lunchStartMin / 60), lunchStartMin % 60, 0);
                            const lEnd = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate(), Math.floor(lunchEndMin / 60), lunchEndMin % 60, 0);
                            const oStart = dayWorkStart > lStart ? dayWorkStart : lStart;
                            const oEnd = actEnd < lEnd ? actEnd : lEnd;
                            if (oEnd > oStart) {
                                h -= (oEnd.getTime() - oStart.getTime()) / 3600000;
                            }
                        }
                        const roundedH = Math.round(Math.max(0, Math.min(standardDayHours, h)) * 100) / 100;
                        totalWorkHours += roundedH;
                        totalWorkDays += Math.round((roundedH / (standardDayHours || 8)) * 10) / 10;
                    }
                }
            } else {
                totalWorkHours += standardDayHours;
                totalWorkDays += 1;
            }
        }
        curr.setDate(curr.getDate() + 1);
    }

    const workHours = Math.round(totalWorkHours * 10) / 10;
    const workDays = Math.round(totalWorkDays * 10) / 10;

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
 * If start/end dates already contain specific intra-day hours (e.g. 10:00, 14:00), preserves them directly!
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

    // Preserve intra-day specific hours if already present
    const hasSpecificHours = (s.getHours() !== 0 || s.getMinutes() !== 0 || (e.getHours() !== 0 && e.getHours() !== 23) || e.getMinutes() !== 0);
    if (hasSpecificHours && s < e) {
        return { workStart: new Date(s), workEnd: new Date(e) };
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

export function parseWorkDateStr(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : new Date(val);
    const d = new Date(String(val).replace(/-/g, "/"));
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Checks if a work interval has specific intra-day hours (not a standard full 08:00-17:00 workday).
 */
export function isIntraDayWorkSpan(workStartInput, workEndInput) {
    const ws = parseWorkDateStr(workStartInput);
    const we = parseWorkDateStr(workEndInput);
    if (!ws || !we) return false;
    const isStdStart = (ws.getHours() === 8 && ws.getMinutes() === 0) || (ws.getHours() === 0 && ws.getMinutes() === 0);
    const isStdEnd = (we.getHours() === 17 && we.getMinutes() === 0) || (we.getHours() === 0 && we.getMinutes() === 0) || (we.getHours() === 23 && we.getMinutes() === 59);
    return !(isStdStart && isStdEnd);
}

let _timelineViewportWidth = 1100;

/**
 * Remembers the current timeline viewport width (px) so grid helpers use the same
 * pixel thresholds as the scale header (applyScaleConfig).
 */
export function setTimelineViewportWidth(width) {
    const w = Number(width);
    if (w > 0) {
        _timelineViewportWidth = w;
    }
}

/**
 * True when the visible scale shows hour (or minute) columns, i.e. bars are positioned by real
 * clock time. Uses the same threshold as the hour scale in applyScaleConfig (>= 11 px per hour),
 * so snapping/positioning can never disagree with what the header shows.
 */
export function isExactTimeResolution(zoomLevel = 100, visibleWidth = _timelineViewportWidth) {
    return (getZoomPxPerDay(zoomLevel, visibleWidth) / 24.0) >= 11;
}

/**
 * Returns grid snapping step in minutes for the given zoom level (0 - 100).
 * Day-level scales: 1 day. Hour scale: 15 min. Minute scale: 1 min.
 */
export function getGridStepMinutes(zoomLevel = 100) {
    if (!isExactTimeResolution(zoomLevel)) return 1440; // 1 day
    const pxPerMin = getZoomPxPerDay(zoomLevel, _timelineViewportWidth) / 1440.0;
    return (pxPerMin * 30) >= 20 ? 1 : 15;
}

/**
 * Returns minimum allowable duration in ms for the given zoom level / task type.
 * Intra-day tasks and minute/hourly views always support 1-minute minimum duration.
 */
export function getMinGridDurationMs(zoomLevel = 100, isIntraDay = false) {
    if (isExactTimeResolution(zoomLevel) || isIntraDay) {
        return 60 * 1000; // 1 minute
    }
    return 1440 * 60 * 1000; // 1 day
}

/**
 * Cleanly snaps a date to the active grid step based on the zoom level.
 */
export function snapDateToGrid(date, zoomLevel = 100) {
    if (!date) return date;
    const d = new Date(date);
    const stepMin = getGridStepMinutes(zoomLevel);

    if (stepMin === 1) {
        if (d.getSeconds() >= 30) {
            d.setMinutes(d.getMinutes() + 1);
        }
        d.setSeconds(0, 0);
        return d;
    }
    if (stepMin < 60) {
        d.setSeconds(0, 0);
        const m = d.getMinutes();
        const snappedM = Math.round(m / stepMin) * stepMin;
        d.setMinutes(snappedM);
        return d;
    }
    if (stepMin === 60) {
        d.setSeconds(0, 0);
        const m = d.getMinutes();
        if (m >= 30) d.setHours(d.getHours() + 1);
        d.setMinutes(0);
        return d;
    }
    // Day level (>= 1440): snap to nearest midnight
    d.setSeconds(0, 0);
    const h = d.getHours();
    if (h >= 12) d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Converts actual working dates (e.g. 2026-10-13 08:00:00 .. 2026-10-13 10:00:00)
 * into visual DHTMLX Gantt coordinates [gridStart, gridEnd].
 * - For zoom >= 250% (Hourly / Minute scales): uses exact timestamps.
 * - For zoom < 250% (Daily / Weekly / Multi-year scales):
 *   Maps the working day window [08:00..17:00] proportionally onto the 24-hour day column [00:00..24:00]
 *   so sequential intra-day tasks/subtasks (e.g. 08:00-10:00, 10:00-13:00, 13:00-15:00, 15:00-17:00)
 *   appear one after another instead of stacking as identical full-day bars!
 */
export function workDatesToVisualGrid(workStartInput, workEndInput, zoomLevel = 100) {
    const ws = parseWorkDateStr(workStartInput);
    const we = parseWorkDateStr(workEndInput);

    if (!ws || !we) {
        const now = new Date();
        const defS = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const defE = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
        return { gridStart: defS, gridEnd: defE, start: defS, end: defE };
    }

    if (isExactTimeResolution(zoomLevel)) {
        const s = new Date(ws);
        let e = new Date(we);
        if (e.getTime() <= s.getTime()) {
            const minMs = getMinGridDurationMs(zoomLevel);
            e = new Date(s.getTime() + minMs);
        }
        return { gridStart: s, gridEnd: e, start: s, end: e };
    }

    const mapTimeOnDay = (dt, isEnd = false) => {
        const dayMidnight = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0);
        const h = dt.getHours() + (dt.getMinutes() / 60.0) + (dt.getSeconds() / 3600.0);
        if (!isEnd && h <= 8.0) {
            return dayMidnight;
        }
        if (isEnd && (h >= 17.0 || (h === 0 && dt.getMinutes() === 0))) {
            return new Date(dayMidnight.getTime() + 86400000);
        }
        const frac = Math.max(0.0, Math.min(1.0, (h - 8.0) / 9.0));
        const offsetMs = Math.round(frac * 86400000);
        return new Date(dayMidnight.getTime() + offsetMs);
    };

    const visStart = mapTimeOnDay(ws, false);
    let visEnd = mapTimeOnDay(we, true);

    if (visEnd.getTime() - visStart.getTime() < 5400000) {
        const endDayBound = new Date(we.getFullYear(), we.getMonth(), we.getDate() + 1, 0, 0, 0);
        if (visStart.getTime() + 5400000 <= endDayBound.getTime()) {
            visEnd = new Date(visStart.getTime() + 5400000);
        } else {
            visEnd = endDayBound;
        }
    }

    return { gridStart: visStart, gridEnd: visEnd, start: visStart, end: visEnd };
}

/**
 * Inverse mapping from visual Gantt grid dates back to working dates (08:00-17:00) on drag/resize.
 */
export function visualGridToWorkDates(visStartInput, visEndInput, zoomLevel = 100, prevWorkStart = null, prevWorkEnd = null, mode = "move") {
    const vs = new Date(visStartInput);
    const ve = new Date(visEndInput);
    if (isExactTimeResolution(zoomLevel)) {
        vs.setSeconds(0, 0);
        ve.setSeconds(0, 0);
        const minMs = getMinGridDurationMs(zoomLevel);
        if (ve.getTime() <= vs.getTime()) {
            ve.setTime(vs.getTime() + minMs);
        }
        return { workStart: vs, workEnd: ve };
    }

    const wasSubDayTask = (typeof prevWorkStart === "boolean")
        ? prevWorkStart
        : isIntraDayWorkSpan(prevWorkStart, prevWorkEnd);

    if (wasSubDayTask) {
        const unmapTimeOnDay = (dt, isEnd = false) => {
            const dayMidnight = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0);
            const elapsedMs = dt.getTime() - dayMidnight.getTime();
            if (isEnd && elapsedMs === 0) {
                const prevDay = new Date(dayMidnight.getTime() - 86400000);
                return new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 17, 0, 0);
            }
            const frac = Math.max(0.0, Math.min(1.0, elapsedMs / 86400000));
            const workHourFloat = Math.round((8.0 + frac * 9.0) * 4) / 4;
            const hours = Math.floor(workHourFloat);
            const mins = Math.round((workHourFloat - hours) * 60);
            return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), hours, mins, 0);
        };
        const ws = unmapTimeOnDay(vs, false);
        let we = unmapTimeOnDay(ve, true);
        if (we.getTime() <= ws.getTime()) {
            we = new Date(ws.getTime() + 3600000);
        }
        return { workStart: ws, workEnd: we };
    }

    const roundToMidnight = (dt) => {
        const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0);
        if (dt.getHours() >= 12) {
            d.setDate(d.getDate() + 1);
        }
        return d;
    };
    const sMid = roundToMidnight(vs);
    let eMid = roundToMidnight(ve);
    if (eMid.getTime() <= sMid.getTime()) {
        eMid = new Date(sMid.getTime() + 86400000);
    }
    return computeWorkDates(sMid, eMid);
}

export function addCalendarDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

function withTimeOfDay(dayRef, todRef) {
    const d = new Date(dayRef);
    d.setHours(todRef.getHours(), todRef.getMinutes(), todRef.getSeconds(), 0);
    return d;
}

/** Smallest valid end on the task's start day (keeps the end's time-of-day when possible). */
function clampSameDayEnd(ws, we) {
    let c = withTimeOfDay(ws, we);
    if (c.getTime() > ws.getTime()) return c;
    c = new Date(ws);
    c.setHours(17, 0, 0, 0);
    if (c.getTime() > ws.getTime()) return c;
    return new Date(ws.getTime() + 3600000);
}

/** Latest valid start on the task's end day (keeps the start's time-of-day when possible). */
function clampSameDayStart(ws, we) {
    let c = withTimeOfDay(we, ws);
    if (c.getTime() < we.getTime()) return c;
    c = new Date(we);
    c.setHours(8, 0, 0, 0);
    if (c.getTime() < we.getTime()) return c;
    return new Date(we.getTime() - 3600000);
}

/**
 * Computes the new work dates of a dragged task directly in work-time (never by inverse-mapping the
 * squeezed visual grid, which is lossy).
 * - Hour/minute scales: bars are at real clock time; the dragged edge is snapped to the grid step.
 * - Day-level scales: the pointer can only express whole days, so the result is original work dates
 *   shifted by whole calendar days; time-of-day and duration are preserved exactly.
 * - If the pointer did not move by at least half a grid step, nothing changes (no-op release).
 */
export function computeDragWorkDates({ mode, isStartHandle, origWS, origWE, origGS, origGE, rawStart, rawEnd, zoomLevel }) {
    const unchanged = { workStart: new Date(origWS), workEnd: new Date(origWE), changed: false };
    const minMs = 60 * 1000;

    if (isExactTimeResolution(zoomLevel)) {
        const stepMs = getGridStepMinutes(zoomLevel) * 60000;
        if (mode === "move") {
            if (Math.abs(rawStart.getTime() - origGS.getTime()) < stepMs / 2) return unchanged;
            const ns = snapDateToGrid(rawStart, zoomLevel);
            return { workStart: ns, workEnd: new Date(ns.getTime() + (origWE.getTime() - origWS.getTime())), changed: true };
        }
        if (isStartHandle) {
            if (Math.abs(rawStart.getTime() - origGS.getTime()) < stepMs / 2) return unchanged;
            let ns = snapDateToGrid(rawStart, zoomLevel);
            if (origWE.getTime() - ns.getTime() < minMs) ns = new Date(origWE.getTime() - minMs);
            return { workStart: ns, workEnd: new Date(origWE), changed: true };
        }
        if (Math.abs(rawEnd.getTime() - origGE.getTime()) < stepMs / 2) return unchanged;
        let ne = snapDateToGrid(rawEnd, zoomLevel);
        if (ne.getTime() - origWS.getTime() < minMs) ne = new Date(origWS.getTime() + minMs);
        return { workStart: new Date(origWS), workEnd: ne, changed: true };
    }

    const DAY = 86400000;
    if (mode === "move") {
        const k = Math.round((rawStart.getTime() - origGS.getTime()) / DAY);
        if (k === 0) return unchanged;
        return { workStart: addCalendarDays(origWS, k), workEnd: addCalendarDays(origWE, k), changed: true };
    }
    if (isStartHandle) {
        const k = Math.round((rawStart.getTime() - origGS.getTime()) / DAY);
        if (k === 0) return unchanged;
        let ns = addCalendarDays(origWS, k);
        if (ns.getTime() >= origWE.getTime()) ns = clampSameDayStart(origWS, origWE);
        return { workStart: ns, workEnd: new Date(origWE), changed: true };
    }
    const k = Math.round((rawEnd.getTime() - origGE.getTime()) / DAY);
    if (k === 0) return unchanged;
    let ne = addCalendarDays(origWE, k);
    if (ne.getTime() <= origWS.getTime()) ne = clampSameDayEnd(origWS, origWE);
    return { workStart: new Date(origWS), workEnd: ne, changed: true };
}

/**
 * Scales a child's work span proportionally from the parent's original work span into the parent's
 * new (shrunk) work span, entirely in work-time. Result always stays inside the new parent span.
 */
export function scaleWorkSpanIntoParent(cWS, cWE, pOrigWS, pOrigWE, pNewWS, pNewWE, roundMs = 60000) {
    const pOrigDur = pOrigWE.getTime() - pOrigWS.getTime();
    const pNewDur = pNewWE.getTime() - pNewWS.getTime();
    if (pOrigDur <= 0 || pNewDur <= 0) {
        return { workStart: new Date(cWS), workEnd: new Date(cWE) };
    }
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const fs = clamp01((cWS.getTime() - pOrigWS.getTime()) / pOrigDur);
    const fe = clamp01((cWE.getTime() - pOrigWS.getTime()) / pOrigDur);
    const rnd = (ms) => Math.round(ms / roundMs) * roundMs;
    let ns = rnd(pNewWS.getTime() + fs * pNewDur);
    let ne = rnd(pNewWS.getTime() + fe * pNewDur);
    const pS = pNewWS.getTime();
    const pE = pNewWE.getTime();
    const minChild = Math.min(roundMs, pNewDur);
    ns = Math.max(pS, Math.min(pE, ns));
    ne = Math.max(pS, Math.min(pE, ne));
    if (ne - ns < minChild) {
        ne = Math.min(pE, ns + minChild);
        ns = Math.max(pS, ne - minChild);
    }
    return { workStart: new Date(ns), workEnd: new Date(ne) };
}

export class GanntLTAction extends Component {
    static template = "gannt_lt.GanntLTView";
    static components = { Layout, SearchBar, CogMenu };
    static props = {
        ...standardViewProps,
    };

    setup() {
        this.orm = useService("orm");
        this.actionService = useService("action");
        this.notification = useService("notification");
        this.dialogService = useService("dialog");
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

        // Only restore saved state when returning from a form dialog opened inside GanntLT;
        // Upon reloading Odoo or newly entering Projects, always start at 40% scale with all items collapsed (Suskleisti).
        let savedState = null;
        try {
            const raw = sessionStorage.getItem(TIMELINE_VIEW_STATE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                sessionStorage.removeItem(TIMELINE_VIEW_STATE_KEY);
                if (parsed && parsed.fromFormNavigation) {
                    savedState = parsed;
                }
            }
        } catch {}

        let initialZoom = DEFAULT_OVERVIEW_ZOOM;
        if (savedState && typeof savedState.zoomLevel === "number") {
            const snapped = Math.max(0, Math.min(100, Math.round(savedState.zoomLevel / 5) * 5));
            initialZoom = snapped;
        }

        let initialProjId = defaultProjId;
        if (!initialProjId && savedState && typeof savedState.selectedProjectId === "number") {
            initialProjId = savedState.selectedProjectId;
        }

        this._savedViewState = savedState;

        this.state = useState({
            selectedProjectId: initialProjId,
            zoomLevel: initialZoom,
            projects: [],
            undoCount: 0,
            canEdit: true,
            showWorkHoursDropdown: false,
            workingHours: this.loadWorkingHoursSchedule(),
        });

        this.undoStack = [];
        this._pendingUndoAction = null;
        this.gantt = null;
        window.__timeline_action = this;
        this.eventIds = [];
        this.onGridClickHandler = null;
        this._initialScrollDone = false;
        this._isExpandingRange = false;
        this._saveViewStateTimer = null;
        this._zoomAnchorDate = null;
        this._zoomAnchorOffset = null;
        this._zoomResetTimer = null;
        this._currentHoveredTaskId = null;
        this._hoverActiveElements = [];
        this._verticalHighlightEl = null;
        this._verticalScaleHighlightEl = null;
        this.onMouseMoveHandler = null;
        this.onMouseLeaveHandler = null;
        this._resizeTimer = null;

        this.onKeyDown = (e) => {
            if ((e.key === "Escape" || e.key === "Esc") && this.state.showWorkHoursDropdown) {
                this.closeWorkHoursDropdown();
                return;
            }
            if (
                e.target &&
                (e.target.tagName === "INPUT" ||
                    e.target.tagName === "TEXTAREA" ||
                    e.target.tagName === "SELECT" ||
                    e.target.isContentEditable)
            ) {
                return;
            }
            if (document.querySelector(".modal.show, .o_dialog")) {
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
                e.preventDefault();
                this.undoAction();
                return;
            }
            // Keyboard + and - keys to zoom in and out smoothly while keeping current timeline center
            const isZoomInKey = (
                e.key === "+" ||
                e.key === "=" ||
                e.code === "Equal" ||
                e.code === "NumpadAdd"
            );
            const isZoomOutKey = (
                e.key === "-" ||
                e.key === "_" ||
                e.code === "Minus" ||
                e.code === "NumpadSubtract"
            );
            if (isZoomInKey || isZoomOutKey) {
                e.preventDefault();
                if (isZoomInKey) {
                    this.zoomIn();
                } else {
                    this.zoomOut();
                }
            }
        };
        this.onWindowResize = () => {
            if (this._resizeTimer) clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => {
                this._resizeTimer = null;
                if (this.gantt && this.ganttElement && this.ganttElement.el) {
                    this.applyScaleConfig();
                    this.gantt.render();
                    this.renderTodayMarker();
                }
            }, 100);
        };
        window.addEventListener("resize", this.onWindowResize);
        window.addEventListener("keydown", this.onKeyDown);
        document.addEventListener("keydown", this.onKeyDown);

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
            if (this.onWindowResize) {
                window.removeEventListener("resize", this.onWindowResize);
                this.onWindowResize = null;
            }
            if (this._resizeTimer) {
                clearTimeout(this._resizeTimer);
                this._resizeTimer = null;
            }
            if (this._saveViewStateTimer) {
                clearTimeout(this._saveViewStateTimer);
                this._saveViewStateTimer = null;
            }
            if (this._sidebarClickTimer) {
                clearTimeout(this._sidebarClickTimer);
                this._sidebarClickTimer = null;
            }
            if (this._zoomResetTimer) {
                clearTimeout(this._zoomResetTimer);
                this._zoomResetTimer = null;
            }
            if (this.onKeyDown) {
                window.removeEventListener("keydown", this.onKeyDown);
                document.removeEventListener("keydown", this.onKeyDown);
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
            if (this._wheelResetTimer) {
                clearTimeout(this._wheelResetTimer);
                this._wheelResetTimer = null;
            }
            if (this.onMouseMoveHandler && this.ganttElement.el) {
                this.ganttElement.el.removeEventListener("mousemove", this.onMouseMoveHandler);
                this.onMouseMoveHandler = null;
            }
            if (this.onMouseLeaveHandler && this.ganttElement.el) {
                this.ganttElement.el.removeEventListener("mouseleave", this.onMouseLeaveHandler);
                this.onMouseLeaveHandler = null;
            }
            this.clearHoverHighlight();
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
        return this.state.canEdit && (this.state.undoCount || 0) > 0;
    }

    get workDaysList() {
        const order = [1, 2, 3, 4, 5, 6, 0];
        if (!this.state.workingHours) return [];
        return order.map((idx) => this.state.workingHours[idx]).filter(Boolean);
    }

    toggleWorkHoursDropdown() {
        this.state.showWorkHoursDropdown = !this.state.showWorkHoursDropdown;
    }

    closeWorkHoursDropdown() {
        this.state.workingHours = this.loadWorkingHoursSchedule();
        this.state.showWorkHoursDropdown = false;
    }

    onPopoverClick(ev) {
        if (ev && typeof ev.stopPropagation === "function") {
            ev.stopPropagation();
        }
    }

    onTimeInputBlur(day, field, ev) {
        if (!day || !field) return;
        const inputVal = ev && ev.target ? ev.target.value : day[field];
        const defVal = (field === "lunchStart" ? "12:45" : (field === "lunchEnd" ? "13:45" : (field === "end" ? "17:00" : "08:00")));
        const normalized = normalizeTimeInput(inputVal, defVal);
        day[field] = normalized;
        if (ev && ev.target) {
            ev.target.value = normalized;
        }
    }

    applyWorkHoursToWeekdays() {
        const mon = this.state.workingHours[1];
        if (!mon) return;
        for (const idx of [2, 3, 4, 5]) {
            if (this.state.workingHours[idx]) {
                this.state.workingHours[idx].active = mon.active;
                this.state.workingHours[idx].start = mon.start;
                this.state.workingHours[idx].lunchStart = mon.lunchStart;
                this.state.workingHours[idx].lunchEnd = mon.lunchEnd;
                this.state.workingHours[idx].end = mon.end;
            }
        }
    }

    resetDefaultWorkHours() {
        this.state.workingHours = JSON.parse(JSON.stringify(DEFAULT_WORKING_HOURS));
    }

    saveWorkHours() {
        this.saveWorkingHoursSchedule(this.state.workingHours);
        this.state.showWorkHoursDropdown = false;
        if (this.gantt) {
            this.applyScaleConfig();
            this.gantt.render();
        }
        if (this.notification) {
            this.notification.add("Darbo valandų grafikas sėkmingai išsaugotas.", {
                type: "success",
            });
        }
    }

    loadWorkingHoursSchedule() {
        try {
            if (typeof window !== "undefined" && window.localStorage) {
                const saved = window.localStorage.getItem(STORAGE_KEY_WORK_HOURS);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && typeof parsed === "object") {
                        const merged = {};
                        for (let i = 0; i <= 6; i++) {
                            merged[i] = Object.assign({}, DEFAULT_WORKING_HOURS[i], parsed[i] || {});
                        }
                        return merged;
                    }
                }
            }
        } catch (e) {
            console.warn("Failed to load working hours schedule:", e);
        }
        return JSON.parse(JSON.stringify(DEFAULT_WORKING_HOURS));
    }

    saveWorkingHoursSchedule(sched) {
        try {
            if (typeof window !== "undefined" && window.localStorage) {
                window.localStorage.setItem(STORAGE_KEY_WORK_HOURS, JSON.stringify(sched));
            }
        } catch (e) {
            console.warn("Failed to save working hours schedule:", e);
        }
    }

    isWorkingDateTime(date, stepMinutes = 0) {
        return isWorkingDateTime(date, this.state.workingHours, stepMinutes);
    }

    isWorkingDay(date) {
        return isWorkingDay(date, this.state.workingHours);
    }

    get display() {
        return {
            controlPanel: {},
            ...this.props.display,
        };
    }

    /**
     * Save current timeline viewport (zoom level, project filter, center date, scroll positions, and open states)
     * into sessionStorage when opening a form view so returning restores exact viewport.
     */
    saveViewState(fromFormNavigation = false) {
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
            const openStates = {};
            if (this.gantt.eachTask) {
                this.gantt.eachTask((t) => {
                    openStates[t.id] = Boolean(t.$open !== undefined ? t.$open : t.open);
                });
            }
            const stateObj = {
                fromFormNavigation: Boolean(fromFormNavigation),
                zoomLevel: this.state.zoomLevel,
                selectedProjectId: this.state.selectedProjectId,
                scrollX: scroll.x,
                scrollY: scroll.y,
                centerDate: centerDate,
                openStates: openStates,
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
     * Recursively scales all descendants proportionally when a parent task / milestone / project shrinks.
     * Operates strictly in work-time using scaleWorkSpanIntoParent, preserving work duration integrity.
     */
    _applyScaleDescendants(parentId, pNewWS, pNewWE, pOrigWS, pOrigWE, isRealtime = false) {
        const g = this.gantt;
        if (!g) return;
        const zoomLevel = this.state.zoomLevel;
        const children = (typeof g.getChildren === "function" ? g.getChildren(parentId) : []) || [];
        for (const cid of children) {
            const ct = g.getTask(cid);
            if (ct && ct._drag_ws_origin && ct._drag_we_origin) {
                const scaled = scaleWorkSpanIntoParent(
                    ct._drag_ws_origin,
                    ct._drag_we_origin,
                    pOrigWS,
                    pOrigWE,
                    pNewWS,
                    pNewWE
                );
                ct.work_start_date = formatOdooDateTime(scaled.workStart);
                ct.work_end_date = formatOdooDateTime(scaled.workEnd);
                const { gridStart, gridEnd } = workDatesToVisualGrid(scaled.workStart, scaled.workEnd, zoomLevel);
                ct.start_date = gridStart;
                ct.end_date = gridEnd;
                if (isRealtime) {
                    g.refreshTask(cid);
                } else {
                    g.updateTask(cid);
                }
                this._applyScaleDescendants(cid, scaled.workStart, scaled.workEnd, ct._drag_ws_origin, ct._drag_we_origin, isRealtime);
            }
        }
    }

    /**
     * Recursively restores all descendants to their pre-drag original dates (when parent is extended or restored).
     */
    _restoreDescendants(parentId, isRealtime = false) {
        const g = this.gantt;
        if (!g) return;
        const zoomLevel = this.state.zoomLevel;
        const children = (typeof g.getChildren === "function" ? g.getChildren(parentId) : []) || [];
        for (const cid of children) {
            const ct = g.getTask(cid);
            if (ct && ct._drag_ws_origin && ct._drag_we_origin) {
                ct.work_start_date = formatOdooDateTime(ct._drag_ws_origin);
                ct.work_end_date = formatOdooDateTime(ct._drag_we_origin);
                const { gridStart, gridEnd } = workDatesToVisualGrid(ct._drag_ws_origin, ct._drag_we_origin, zoomLevel);
                ct.start_date = gridStart;
                ct.end_date = gridEnd;
                if (isRealtime) {
                    g.refreshTask(cid);
                } else {
                    g.updateTask(cid);
                }
                this._restoreDescendants(cid, isRealtime);
            }
        }
    }

    /**
     * Clears all hover highlight classes and vertical column highlights across both sidebar and timeline
     */
    clearHoverHighlight() {
        this._currentHoveredTaskId = null;
        if (this._hoverActiveElements && this._hoverActiveElements.length) {
            for (const el of this._hoverActiveElements) {
                el.classList.remove("gantt_hover_active", "gantt_hover_child");
            }
            this._hoverActiveElements = [];
        }
        if (this._verticalHighlightEl) {
            this._verticalHighlightEl.style.display = "none";
        }
        if (this._verticalScaleHighlightEl) {
            this._verticalScaleHighlightEl.style.display = "none";
        }
        if (this.ganttElement && this.ganttElement.el) {
            const extra = this.ganttElement.el.querySelectorAll(".custom_hover_vertical_highlight, .custom_hover_vertical_scale_highlight");
            for (const el of extra) {
                el.style.display = "none";
            }
        }
    }

    /**
     * Synchronously highlights the hovered parent task and all its expanded children
     * across both the left sidebar grid and the right timeline data area, as well as
     * rendering the vertical highlight for the length/span of the hovered task or project.
     */
    applyHoverHighlight(taskId) {
        this.clearHoverHighlight();
        const g = this.gantt;
        if (!g || !g.isTaskExists(taskId) || !this.ganttElement || !this.ganttElement.el) return;

        this._currentHoveredTaskId = taskId;
        const rootEl = this.ganttElement.el;

        // Collect all expanded/visible descendants recursively
        const childIds = [];
        const collectExpandedDescendants = (parentId) => {
            if (!g.isTaskExists(parentId)) return;
            const parent = g.getTask(parentId);
            const isOpen = (parent.$open !== false && parent.open !== false);
            if (!isOpen) return; // If parent is collapsed, children are not expanded/visible

            const children = (typeof g.getChildren === "function" ? g.getChildren(parentId) : []) || [];
            for (const childId of children) {
                childIds.push(childId);
                collectExpandedDescendants(childId);
            }
        };
        collectExpandedDescendants(taskId);

        const activeEls = [];
        const markTask = (id, cls) => {
            const escaped = window.CSS && CSS.escape ? CSS.escape(String(id)) : String(id).replace(/"/g, '\\"');
            const elements = rootEl.querySelectorAll(`[task_id="${escaped}"], [data-task-id="${escaped}"]`);
            for (const el of elements) {
                if (
                    el.classList.contains("gantt_row") ||
                    el.classList.contains("gantt_task_row") ||
                    el.classList.contains("gantt_task_line") ||
                    el.classList.contains("gantt_bar_task")
                ) {
                    el.classList.add(cls);
                    activeEls.push(el);
                }
            }
        };

        // Highlight hovered parent (or leaf row) horizontally
        markTask(taskId, "gantt_hover_active");

        // Highlight all expanded children / subtasks horizontally
        for (const cId of childIds) {
            markTask(cId, "gantt_hover_child");
        }

        this._hoverActiveElements = activeEls;

        // Render vertical highlight matching the exact length/span of the hovered task or project on the timeline
        const escaped = window.CSS && CSS.escape ? CSS.escape(String(taskId)) : String(taskId).replace(/"/g, '\\"');
        const taskEl = rootEl.querySelector(`.gantt_task_line[task_id="${escaped}"]`);
        let taskLeft = -1;
        let taskWidth = 0;

        if (taskEl) {
            taskLeft = taskEl.offsetLeft;
            taskWidth = taskEl.offsetWidth;
        } else {
            const task = g.getTask(taskId);
            if (task && task.start_date && task.end_date) {
                try {
                    const sPx = this.safePosFromDate(task.start_date);
                    const ePx = this.safePosFromDate(task.end_date);
                    if (sPx >= 0 && ePx >= sPx) {
                        taskLeft = sPx;
                        taskWidth = Math.max(4, ePx - sPx);
                    }
                } catch {}
            }
        }

        if (taskLeft >= 0 && taskWidth > 0) {
            const dataArea = rootEl.querySelector(".gantt_data_area");
            if (dataArea) {
                let vHighlight = dataArea.querySelector(".custom_hover_vertical_highlight");
                if (!vHighlight) {
                    vHighlight = document.createElement("div");
                    vHighlight.className = "custom_hover_vertical_highlight";
                    dataArea.appendChild(vHighlight);
                }
                const totalHeight = Math.max(dataArea.offsetHeight, dataArea.scrollHeight);
                vHighlight.style.left = `${taskLeft}px`;
                vHighlight.style.width = `${taskWidth}px`;
                vHighlight.style.height = `${totalHeight}px`;
                vHighlight.style.display = "block";
                this._verticalHighlightEl = vHighlight;
            }

            const scaleArea = rootEl.querySelector(".gantt_task_scale");
            if (scaleArea) {
                let vScaleHighlight = scaleArea.querySelector(".custom_hover_vertical_scale_highlight");
                if (!vScaleHighlight) {
                    vScaleHighlight = document.createElement("div");
                    vScaleHighlight.className = "custom_hover_vertical_scale_highlight";
                    scaleArea.appendChild(vScaleHighlight);
                }
                vScaleHighlight.style.left = `${taskLeft}px`;
                vScaleHighlight.style.width = `${taskWidth}px`;
                vScaleHighlight.style.height = "100%";
                vScaleHighlight.style.display = "block";
                this._verticalScaleHighlightEl = vScaleHighlight;
            }
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
        window.activeGanttAction = this;

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
        g.config.open_tree_init = false;
        g.config.fit_tasks = false;
        g.config.autoscroll = true;
        g.config.autoscroll_speed = 30;
        g.config.drag_links = true;
        g.config.drag_progress = false;
        g.config.drag_resize = true;
        g.config.drag_move = true;
        g.config.drag_project = true;
        g.config.order_branch = false;
        g.config.order_branch_free = false;
        g.config.round_dnd_dates = false;
        g.config.readonly = false;
        g.config.tooltip_timeout = 250;
        g.config.tooltip_hide_timeout = 30;
        g.config.duration_unit = "minute";
        g.config.duration_step = 1;
        g.config.min_duration = 60 * 1000; // 1 minute
        g.config.show_errors = false;

        // Ensure parent tasks with children are treated as resizable tasks rather than un-resizable summary tasks
        g.isSummaryTask = () => false;

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
                        const pStatus = task.last_update_status || "";
                        let icon = "fa fa-folder-open text-primary";
                        let customStyle = "";
                        if (pStatus === "on_hold" || task.state === "04_on_hold" || task.state === "04_waiting_normal") {
                            icon = "fa fa-circle";
                            customStyle = "color: #00a09d;";
                        } else if (pStatus === "on_track" || task.state === "03_on_track" || task.state === "03_approved") {
                            icon = "fa fa-circle text-success";
                        } else if (pStatus === "at_risk" || task.state === "02_at_risk" || task.state === "02_changes_requested") {
                            icon = "fa fa-circle text-warning";
                        } else if (pStatus === "off_track" || task.state === "1_off_track" || task.state === "1_canceled") {
                            icon = "fa fa-circle text-danger";
                        } else if (pStatus === "done" || task.is_done || task.state === "1_done") {
                            icon = "fa fa-check-circle text-success";
                        }
                        const styleAttr = customStyle ? ` style="${customStyle}"` : "";
                        return `<i class="${icon} me-1"${styleAttr}></i><b>${task.text}</b>`;
                    }
                    if (task.is_milestone) {
                        const icon = (task.is_done || task.state === "1_done")
                            ? "fa fa-check-circle text-success"
                            : "fa fa-flag text-primary";
                        return `<i class="${icon} me-1"></i><b>${task.text}</b>`;
                    }
                    const isSubtask = task.parent && typeof task.parent === "string" && task.parent.startsWith("task_");
                    const subtaskBadge = isSubtask ? `<span class="subtask_tree_elbow text-muted me-1" title="${_t("Po-užduotis")}">↳</span>` : "";
                    const isLocked = task.is_locked || task.state === "locked";
                    const icon = isLocked
                        ? "fa fa-lock text-warning"
                        : ((task.is_done || task.state === "1_done")
                            ? "fa fa-check-circle text-success"
                            : (task.state === "03_approved"
                                ? "fa fa-circle text-success"
                                : (task.state === "02_changes_requested"
                                    ? "fa fa-exclamation-triangle text-warning"
                                    : (task.state === "1_canceled"
                                        ? "fa fa-times-circle text-danger"
                                        : ((task.state === "04_waiting_normal" && isLocked)
                                            ? "fa fa-clock-o text-secondary"
                                            : "fa fa-tasks text-muted")))));
                    const titleAttr = isLocked ? ` title="${_t("Užrakinta užduotis (laukiama kitų užduočių)")}"` : "";
                    return `${subtaskBadge}<i class="${icon} me-1"${titleAttr}></i>${task.text}`;
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

        // Ensure quarter scale methods are explicitly defined on gantt.date
        if (g.date) {
            g.date.quarter_start = (date) => {
                const a = g.date.month_start(date);
                const s = a.getMonth();
                const r = s >= 9 ? 9 : s >= 6 ? 6 : s >= 3 ? 3 : 0;
                a.setMonth(r);
                return a;
            };
            g.date.add_quarter = (date, inc) => {
                return g.date.add(date, inc * 3, "month");
            };
        }

        // Set default scale (Zoom-driven)
        this.applyScaleConfig();

        // Tree grid hierarchy connector lines (IDE-like vertical lines & elbows)
        let currentIndentTaskId = null;
        let indentStep = 0;
        let cachedAncestors = [];

        g.templates.grid_indent = (task) => {
            if (!task) return `<div class="gantt_tree_indent"></div>`;
            const level = task.$level || 0;
            if (task.id !== currentIndentTaskId || indentStep >= level) {
                currentIndentTaskId = task.id;
                indentStep = 0;
                cachedAncestors = [];
                let cur = task;
                while (cur && cur.parent && cur.parent !== 0 && cur.parent !== "0") {
                    cachedAncestors.unshift(cur.id);
                    cur = (typeof g.isTaskExists === "function" && g.isTaskExists(cur.parent)) ? g.getTask(cur.parent) : null;
                }
            }

            const i = indentStep++;
            if (i >= cachedAncestors.length) {
                return `<div class="gantt_tree_indent"></div>`;
            }

            const ancId = cachedAncestors[i];
            const ancTask = (typeof g.isTaskExists === "function" && g.isTaskExists(ancId)) ? g.getTask(ancId) : null;
            if (!ancTask) {
                return `<div class="gantt_tree_indent"></div>`;
            }

            const siblings = (typeof g.getChildren === "function" ? g.getChildren(ancTask.parent) : []) || [];
            const isLast = siblings.length > 0 && (String(siblings[siblings.length - 1]) === String(ancId));
            const isSelf = (i === cachedAncestors.length - 1);

            let cls = "gantt_tree_indent";
            if (isSelf) {
                cls += isLast ? " gantt_tree_elbow_bottom" : " gantt_tree_elbow_tee";
            } else {
                cls += isLast ? " gantt_tree_line_blank" : " gantt_tree_line_through";
            }

            return `<div class="${cls}"></div>`;
        };

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
            const isItemLocked = task.is_locked || task.state === "locked";
            const percent = isItemLocked ? 0 : Math.round((task.progress || 0) * 100);
            const { workDays, workHours, calendarDays } = calculateWorkingDaysAndHours(effStart, effEnd);
            // Durations are always shown in minutes / hours / days (never "0.1h"); minutes are rounded UP, min 1.
            const spanMin = Math.max(1, Math.ceil((effEnd.getTime() - effStart.getTime()) / 60000));
            const durationText = formatDurationMinutes(spanMin);
            const workText = workHours > 0 ? formatDurationMinutes(Math.round(workHours * 60)) : "0 min";
            const timerSec = Number(task.timer_total_seconds) || 0;
            const timerRowHtml = timerSec > 0
                ? `<div class="tooltip_row"><span class="tooltip_label">Laikmatis:</span> <span class="tooltip_val">${formatDurationMinutes(Math.ceil(timerSec / 60))}</span></div>`
                : "";

            let deadlineHtml = "";
            let dlDate = null;
            if (task.has_deadline_delay && task.deadline_end) {
                // Red tail: planned end -> deadline (or live "now" for a running timer)
                dlDate = task.deadline_end instanceof Date ? task.deadline_end : new Date(String(task.deadline_end).replace(/-/g, "/"));
                if (isNaN(dlDate.getTime())) dlDate = null;
                if (dlDate) {
                    const dlFormatted = g.templates.tooltip_date_format(dlDate);
                    const dlLabel = task.delay_kind === "timer" ? "Dabar (laikmatis veikia):" : "Terminas / faktinė pabaiga:";
                    deadlineHtml += `<div class="tooltip_row tooltip_deadline_row"><span class="tooltip_label">${dlLabel}</span> <span class="tooltip_val">${dlFormatted}</span></div>`;
                }
            } else if (task.date_deadline) {
                const d = new Date(String(task.date_deadline).replace(/-/g, "/"));
                if (!isNaN(d.getTime())) {
                    dlDate = d;
                    deadlineHtml += `<div class="tooltip_row tooltip_deadline_row"><span class="tooltip_label">Terminas:</span> <span class="tooltip_val">${g.templates.tooltip_date_format(d)}</span></div>`;
                }
            }
            if (task.has_deadline_delay) {
                let delayMin = Number(task.delay_minutes) || 0;
                if (!delayMin && dlDate && effEnd && dlDate > effEnd) {
                    delayMin = Math.max(1, Math.ceil((dlDate.getTime() - effEnd.getTime()) / 60000));
                }
                const delayStr = delayMin > 0 ? `+${formatDurationMinutes(delayMin)}` : "+!";
                const liveTag = task.delay_kind === "timer" ? " (vyksta)" : "";
                deadlineHtml += `<div class="tooltip_row tooltip_delay_row"><span class="tooltip_label">Vėlavimas:</span> <span class="tooltip_val text-danger fw-bold">${delayStr}${liveTag}</span></div>`;

                // Working days / hours inside the late window (planned end -> deadline), excluding weekends & holidays
                let delayWorkDays = 0;
                let delayWorkHours = 0;
                if (effEnd && dlDate && dlDate > effEnd) {
                    const delayCalc = calculateWorkingDaysAndHours(effEnd, dlDate);
                    delayWorkDays = delayCalc.workDays;
                    delayWorkHours = delayCalc.workHours;
                }
                deadlineHtml += `<div class="tooltip_row tooltip_delay_row"><span class="tooltip_label">Vėlavimo d. dienos:</span> <span class="tooltip_val text-danger fw-bold">${delayWorkDays} d.</span></div>`;
                deadlineHtml += `<div class="tooltip_row tooltip_delay_row"><span class="tooltip_label">Vėlavimo d. valandos:</span> <span class="tooltip_val text-danger fw-bold">${delayWorkHours > 0 ? formatDurationMinutes(Math.round(delayWorkHours * 60)) : "0 min"}</span></div>`;
            }
            const getStatusBadge = (t) => {
                if (t.is_project) {
                    const pStatus = t.last_update_status || "";
                    if (pStatus === "on_hold" || t.state === "04_on_hold" || t.state === "04_waiting_normal") {
                        return `<span style="color: #00827f; font-weight: 700;"><i class="fa fa-circle me-1" style="color: #00a09d;"></i>Sustabdytas (On Hold)</span>`;
                    }
                    if (pStatus === "on_track" || t.state === "03_on_track" || t.state === "03_approved") {
                        return `<span style="color: #059669; font-weight: 700;"><i class="fa fa-circle text-success me-1"></i>Pagal planą (On Track)</span>`;
                    }
                    if (pStatus === "at_risk" || t.state === "02_at_risk" || t.state === "02_changes_requested") {
                        return `<span style="color: #d97706; font-weight: 700;"><i class="fa fa-circle text-warning me-1"></i>Rizikingas (At Risk)</span>`;
                    }
                    if (pStatus === "off_track" || t.state === "1_off_track" || t.state === "1_canceled") {
                        return `<span style="color: #dc2626; font-weight: 700;"><i class="fa fa-circle text-danger me-1"></i>Vėluojantis (Off Track)</span>`;
                    }
                    if (pStatus === "done" || t.is_done || t.state === "1_done") {
                        return `<span style="color: #16a34a; font-weight: 700;"><i class="fa fa-check-circle text-success me-1"></i>Užbaigtas (Complete)</span>`;
                    }
                    if (t.state === "03_approved") {
                        return `<span style="color: #059669; font-weight: 700;"><i class="fa fa-circle text-success me-1"></i>Patvirtinta</span>`;
                    }
                    if (t.state === "02_changes_requested") {
                        return `<span style="color: #d97706; font-weight: 700;"><i class="fa fa-exclamation-triangle text-warning me-1"></i>Koregavimas</span>`;
                    }
                    if (t.state === "1_canceled") {
                        return `<span style="color: #dc2626; font-weight: 700;"><i class="fa fa-times-circle text-danger me-1"></i>Atšaukta</span>`;
                    }
                    return `<span style="color: #5f5285; font-weight: 700;"><i class="fa fa-folder-open text-primary me-1"></i>Vykdomas</span>`;
                }

                if (t.is_milestone) {
                    if (t.is_done || t.state === "1_done") {
                        return `<span style="color: #16a34a; font-weight: 700;"><i class="fa fa-check-circle text-success me-1"></i>Pasiekta (Achieved)</span>`;
                    }
                    return `<span style="color: #2563eb; font-weight: 700;"><i class="fa fa-flag text-primary me-1"></i>Vykdoma (In Progress)</span>`;
                }

                // Task / Subtask
                if (t.is_locked || t.state === "locked") {
                    return `<span style="color: #cbd5e1; background: #1e293b; padding: 2px 7px; border-radius: 4px; border: 1px solid #475569; font-weight: 700;"><i class="fa fa-lock text-warning me-1"></i>Užrakinta / Laukiama</span>`;
                }
                const state = t.state || (t.is_done ? "1_done" : "01_in_progress");
                if (state === "1_done" || t.is_done) {
                    return `<span style="color: #16a34a; font-weight: 700;"><i class="fa fa-check-circle text-success me-1"></i>Atlikta (Done)</span>`;
                }
                if (state === "03_approved") {
                    return `<span style="color: #059669; font-weight: 700;"><i class="fa fa-circle text-success me-1"></i>Patvirtinta (Approved)</span>`;
                }
                if (state === "02_changes_requested") {
                    return `<span style="color: #d97706; font-weight: 700;"><i class="fa fa-exclamation-triangle text-warning me-1"></i>Koregavimas (Changes Requested)</span>`;
                }
                if (state === "1_canceled") {
                    return `<span style="color: #dc2626; font-weight: 700;"><i class="fa fa-times-circle text-danger me-1"></i>Atšaukta (Canceled)</span>`;
                }
                if (state === "04_waiting_normal" && (t.is_locked || t.state === "locked")) {
                    return `<span style="color: #64748b; font-weight: 700;"><i class="fa fa-clock-o text-secondary me-1"></i>Laukiama (Waiting)</span>`;
                }
                return `<span style="color: #71639e; font-weight: 700;"><i class="fa fa-tasks me-1" style="color: #71639e;"></i>Vykdoma (In Progress)</span>`;
            };

            if (task.is_milestone) {
                const statusHtml = getStatusBadge(task);
                return `
                    <div class="gantt_tooltip_inner">
                        <div class="tooltip_title"><i class="fa fa-flag text-primary me-1"></i>${task.text}</div>
                        <div class="tooltip_row"><span class="tooltip_label">Tipas:</span> <span class="tooltip_val">Projekto gairė</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Būsena:</span> <span class="tooltip_val">${statusHtml}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Projektas:</span> <span class="tooltip_val">${task.project_name || "-"}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Pradžia:</span> <span class="tooltip_val">${startStr}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Pabaiga:</span> <span class="tooltip_val">${endStr}</span></div>
                        ${deadlineHtml}
                        <div class="tooltip_row"><span class="tooltip_label">Trukmė:</span> <span class="tooltip_val">${durationText}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Darbo dienos:</span> <span class="tooltip_val"><b>${workDays} d.</b></span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Darbo valandos:</span> <span class="tooltip_val"><b>${workText}</b></span></div>
                        ${task.task_count !== undefined ? `<div class="tooltip_row"><span class="tooltip_label">Užduotys:</span> <span class="tooltip_val">${task.done_task_count || 0} / ${task.task_count}</span></div>` : ""}
                        <div class="tooltip_progress_bar">
                            <div class="tooltip_progress_fill" style="width: ${percent}%;"></div>
                        </div>
                    </div>
                `;
            }

            if (task.is_project) {
                const statusHtml = getStatusBadge(task);
                return `
                    <div class="gantt_tooltip_inner">
                        <div class="tooltip_title"><i class="fa fa-folder-open text-primary me-1"></i>${task.text}</div>
                        <div class="tooltip_row"><span class="tooltip_label">Tipas:</span> <span class="tooltip_val">Projektas</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Būsena:</span> <span class="tooltip_val">${statusHtml}</span></div>
                        ${task.stage_name ? `<div class="tooltip_row"><span class="tooltip_label">Etapas:</span> <span class="tooltip_val">${task.stage_name}</span></div>` : ""}
                        <div class="tooltip_row"><span class="tooltip_label">Pradžia:</span> <span class="tooltip_val">${startStr}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Pabaiga:</span> <span class="tooltip_val">${endStr}</span></div>
                        ${deadlineHtml}
                        <div class="tooltip_row"><span class="tooltip_label">Trukmė:</span> <span class="tooltip_val">${durationText}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Darbo dienos:</span> <span class="tooltip_val"><b>${workDays} d.</b></span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Darbo valandos:</span> <span class="tooltip_val"><b>${workText}</b></span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Atsakingas:</span> <span class="tooltip_val">${task.assignees || "-"}</span></div>
                        ${task.allocated_hours ? `<div class="tooltip_row"><span class="tooltip_label">Planuotos val.:</span> <span class="tooltip_val">${task.allocated_hours}</span></div>` : ""}
                        <div class="tooltip_progress_bar">
                            <div class="tooltip_progress_fill" style="width: ${percent}%;"></div>
                        </div>
                    </div>
                `;
            }

            const isSubtask = task.parent && typeof task.parent === "string" && task.parent.startsWith("task_");
            const typeLabel = isSubtask ? "Po-užduotis" : "Užduotis";
            const taskStatusHtml = getStatusBadge(task);
            const isTaskLocked = task.is_locked || task.state === "locked";
            const hasTaskDates = task.has_dates !== false && (task.has_dates || task.has_deadline || task.planned_date_start || task.planned_date_end || task.date_deadline || task._is_dragged);

            return `
                <div class="gantt_tooltip_inner">
                    <div class="tooltip_title"><i class="${isTaskLocked ? "fa fa-lock text-warning" : "fa fa-tasks text-primary"} me-1"></i>${task.text}</div>
                    <div class="tooltip_row"><span class="tooltip_label">Tipas:</span> <span class="tooltip_val">${typeLabel}</span></div>
                    <div class="tooltip_row"><span class="tooltip_label">Būsena:</span> <span class="tooltip_val">${taskStatusHtml}</span></div>
                    ${isTaskLocked && task.blocking_tasks ? `
                        <div class="tooltip_row" style="color: #f59e0b; font-weight: 600;">
                            <span class="tooltip_label" style="color: #f59e0b;"><i class="fa fa-lock me-1"></i>Blokuoja:</span>
                            <span class="tooltip_val" style="color: #f59e0b;">${task.blocking_tasks}</span>
                        </div>
                    ` : ""}
                    ${task.stage_name ? `<div class="tooltip_row"><span class="tooltip_label">Etapas:</span> <span class="tooltip_val">${task.stage_name}</span></div>` : ""}
                    <div class="tooltip_row"><span class="tooltip_label">Projektas:</span> <span class="tooltip_val">${task.project_name || "-"}</span></div>
                    ${task.milestone_name ? `<div class="tooltip_row"><span class="tooltip_label">Gairė:</span> <span class="tooltip_val">${task.milestone_name}</span></div>` : ""}
                    ${hasTaskDates ? `
                        <div class="tooltip_row"><span class="tooltip_label">Pradžia:</span> <span class="tooltip_val">${startStr}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Pabaiga:</span> <span class="tooltip_val">${endStr}</span></div>
                        ${deadlineHtml}
                        <div class="tooltip_row"><span class="tooltip_label">Trukmė:</span> <span class="tooltip_val">${durationText}</span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Darbo dienos:</span> <span class="tooltip_val"><b>${workDays} d.</b></span></div>
                        <div class="tooltip_row"><span class="tooltip_label">Darbo valandos:</span> <span class="tooltip_val"><b>${workText}</b></span></div>
                        ${task.allocated_hours ? `<div class="tooltip_row"><span class="tooltip_label">Planuotos val.:</span> <span class="tooltip_val">${task.allocated_hours}</span></div>` : ""}
                        ${timerRowHtml}
                    ` : `
                        <div class="tooltip_row"><span class="tooltip_label">Terminas:</span> <span class="tooltip_val text-muted">Nenurodytas (1 d. vaizdas)</span></div>
                    `}
                    ${task.assignees ? `<div class="tooltip_row"><span class="tooltip_label">Atsakingas:</span> <span class="tooltip_val">${task.assignees}</span></div>` : ""}
                    <div class="tooltip_progress_bar">
                        <div class="tooltip_progress_fill" style="width: ${percent}%;"></div>
                    </div>
                </div>
            `;
        };

        // Task Bar Text & Progress Template (Reflects progress directly in the line itself and renders deadline delay bar)
        g.templates.task_text = (start, end, task) => {
            const isLocked = task.is_locked || task.state === "locked";
            const percent = isLocked ? 0 : Math.round((task.progress || 0) * 100);
            const isDone = !isLocked && (task.is_done || percent >= 100 || task.state === "1_done");
            const badgeClass = isDone ? "bar_prog_badge bar_prog_100" : (isLocked ? "bar_prog_badge bar_prog_locked" : "bar_prog_badge");

            // Status icon: Locked gets a padlock, Done gets a checkmark, Changes Requested gets an exclamation triangle,
            // Cancelled gets a cross, Waiting gets a clock.
            // Approved gets NO checkmark (just solid green as requested).
            let statusIcon = "";
            if (isLocked) {
                statusIcon = `<i class="fa fa-lock text-warning me-1"></i>`;
            } else if (isDone) {
                statusIcon = `<i class="fa fa-check me-1"></i>`;
            } else if (task.state === "02_changes_requested") {
                statusIcon = `<i class="fa fa-exclamation-triangle me-1"></i>`;
            } else if (task.state === "1_canceled") {
                statusIcon = `<i class="fa fa-times-circle me-1"></i>`;
            } else if (task.state === "04_waiting_normal" && isLocked) {
                statusIcon = `<i class="fa fa-clock-o me-1"></i>`;
            }

            // Red tail: drawn right AFTER the bar, from the planned end up to the deadline (or live "now" for a running timer).
            let delayBarHtml = "";
            if (task.has_deadline_delay) {
                let diffMin = Number(task.delay_minutes) || 0;
                if (!diffMin && task.deadline_end) {
                    const dlEnd = task.deadline_end instanceof Date
                        ? task.deadline_end
                        : new Date(String(task.deadline_end).replace(/-/g, "/"));
                    const realWorkEnd = parseWorkDateStr(task.work_end_date) || (end || task.end_date);
                    if (!isNaN(dlEnd.getTime()) && realWorkEnd && dlEnd.getTime() > realWorkEnd.getTime()) {
                        diffMin = Math.max(1, Math.ceil((dlEnd.getTime() - realWorkEnd.getTime()) / 60000));
                    }
                }

                if (diffMin > 0) {
                    const diffMs = diffMin * 60000;
                    let widthPx = 0;
                    if (isExactTimeResolution(this.state.zoomLevel)) {
                        const pxPerHour = (ZOOM_PX_PER_DAY[this.state.zoomLevel] || 1200) / 24.0;
                        widthPx = Math.max(16, Math.round((diffMs / 3600000.0) * pxPerHour));
                    } else {
                        const diffDays = Math.max(0.2, diffMs / 86400000.0);
                        const pxPerDay = ZOOM_PX_PER_DAY[this.state.zoomLevel] || 32;
                        widthPx = Math.max(16, Math.round(diffDays * pxPerDay));
                    }

                    const delayText = `+${formatDurationMinutes(diffMin)}`;
                    const badgeText = widthPx >= 38
                        ? `<i class="fa fa-clock-o me-1"></i>${delayText}`
                        : (widthPx >= 18 ? delayText : "");
                    delayBarHtml = `
                        <div class="timeline_deadline_delay_bar" style="position: absolute; left: 100%; top: -1px; width: ${widthPx}px; height: calc(100% + 2px);">
                            <span class="deadline_badge">${badgeText}</span>
                        </div>
                    `;
                }
            }
            const getBarWidthPx = (sInput, eInput) => {
                let w = 100;
                try {
                    const sPx = this.safePosFromDate(sInput);
                    const ePx = this.safePosFromDate(eInput);
                    if (sPx >= 0 && ePx >= sPx) {
                        w = Math.max(4, Math.round(ePx - sPx));
                    } else {
                        const sD = sInput instanceof Date ? sInput : new Date(sInput);
                        const eD = eInput instanceof Date ? eInput : new Date(eInput);
                        const durDays = Math.max(0.05, (eD.getTime() - sD.getTime()) / 86400000);
                        const pxPerDay = ZOOM_PX_PER_DAY[this.state.zoomLevel] || 32;
                        w = Math.max(4, Math.round(durDays * pxPerDay));
                    }
                } catch {
                    w = 100;
                }
                return w;
            };

            const barWidthPx = getBarWidthPx(start || task.start_date, end || task.end_date);
            const hoursBadge = (task.allocated_hours && barWidthPx >= 110) ? ` <span class="bar_hours_badge">(${task.allocated_hours})</span>` : "";

            if (barWidthPx < 24) {
                return `
                    <span class="bar_content_wrapper bar_content_empty"></span>
                    ${delayBarHtml}
                `;
            }

            if (barWidthPx < 56) {
                return `
                    <span class="bar_content_wrapper">
                        <span class="bar_text">${statusIcon}${task.text}</span>
                    </span>
                    ${delayBarHtml}
                `;
            }

            return `
                <span class="bar_content_wrapper">
                    <span class="bar_text">${statusIcon}${task.text}${hoursBadge}</span>
                    <span class="${badgeClass}">${percent}%</span>
                </span>
                ${delayBarHtml}
            `;
        };

        // Task Bar Styling Template (Applies status classes and adaptive width classes)
        g.templates.task_class = (start, end, task) => {
            let barWidthPx = 100;
            try {
                const sPx = this.safePosFromDate(start || task.start_date);
                const ePx = this.safePosFromDate(end || task.end_date);
                if (sPx >= 0 && ePx >= sPx) {
                    barWidthPx = Math.max(4, Math.round(ePx - sPx));
                } else {
                    const sD = (start || task.start_date) instanceof Date ? (start || task.start_date) : new Date(start || task.start_date);
                    const eD = (end || task.end_date) instanceof Date ? (end || task.end_date) : new Date(end || task.end_date);
                    const durDays = Math.max(0.05, (eD.getTime() - sD.getTime()) / 86400000);
                    const pxPerDay = ZOOM_PX_PER_DAY[this.state.zoomLevel] || 32;
                    barWidthPx = Math.max(4, Math.round(durDays * pxPerDay));
                }
            } catch {
                barWidthPx = 100;
            }
            const sizeClass = barWidthPx < 24 ? " bar_ultra_compact" : (barWidthPx < 56 ? " bar_compact" : "");
            const extraClass = (task.has_deadline_delay ? " has_deadline_delay" : "") + sizeClass;
            const state = task.state || (task.is_done ? "1_done" : "01_in_progress");

            if (task.is_project) {
                let pClass = "gantt_project";
                const pStatus = task.last_update_status || "";
                if (pStatus === "on_hold" || state === "04_on_hold" || state === "04_waiting_normal") {
                    pClass += " project_status_on_hold project_state_waiting";
                } else if (pStatus === "on_track" || state === "03_on_track" || state === "03_approved") {
                    pClass += " project_status_on_track project_state_approved";
                } else if (pStatus === "at_risk" || state === "02_at_risk" || state === "02_changes_requested") {
                    pClass += " project_status_at_risk project_state_changes_requested";
                } else if (pStatus === "off_track" || state === "1_off_track" || state === "1_canceled") {
                    pClass += " project_status_off_track project_state_canceled";
                } else if (pStatus === "done" || state === "1_done" || task.is_done || task.progress >= 1.0) {
                    pClass += " project_done project_state_done project_status_done";
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
            if (task.is_locked || state === "locked") {
                tClass += " task_locked task_state_locked";
            } else if (state === "1_done" || task.is_done || task.progress >= 1.0) {
                tClass += " task_done task_state_done";
            } else if (state === "03_approved") {
                tClass += " task_approved task_state_approved";
            } else if (state === "02_changes_requested") {
                tClass += " task_changes_requested task_state_changes_requested";
            } else if (state === "1_canceled") {
                tClass += " task_canceled task_state_canceled";
            } else if (state === "04_waiting_normal" && (task.is_locked || state === "locked")) {
                tClass += " task_waiting task_state_waiting";
            } else {
                tClass += " task_in_progress task_state_in_progress";
            }
            return tClass + extraClass;
        };

        // Mark Today, Weekends, Lithuanian National Holidays, Work Hours, and Full-Height Boundary Lines in Timeline Background Cells
        g.templates.timeline_cell_class = (task, date) => {
            const today = new Date();
            const d = new Date(date);
            const isToday = (
                d.getFullYear() === today.getFullYear() &&
                d.getMonth() === today.getMonth() &&
                d.getDate() === today.getDate()
            );
            const hol = getLithuanianHoliday(d);
            const isWorkDay = this.isWorkingDay(d);

            const scales = g.config.scales || [];
            const baseScale = scales.length > 0 ? scales[scales.length - 1] : null;
            const baseUnit = baseScale ? baseScale.unit : "day";

            if (baseUnit === "minute") {
                const hour = d.getHours();
                const isWorkHour = this.isWorkingDateTime(d, baseScale.step || 15);
                const classes = [];
                if (isToday) classes.push("today_cell today_hour_cell");
                if (hol) classes.push("holiday_cell");
                else if (!isWorkDay) classes.push("weekend_cell");
                else if (!isWorkHour) classes.push("off_hours_cell");
                else classes.push("work_hours_cell");

                if (d.getMinutes() === 0) {
                    classes.push("hour_start_grid_cell");
                }
                if (hour === 0 && d.getMinutes() === 0) {
                    if (d.getMonth() === 0 && d.getDate() === 1) classes.push("year_start_grid_cell");
                    else if (d.getDate() === 1 && (d.getMonth() % 3 === 0)) classes.push("quarter_start_grid_cell");
                    else if (d.getDate() === 1) classes.push("month_start_grid_cell");
                    else classes.push("day_start_grid_cell");
                }
                return classes.join(" ");
            }

            if (baseUnit === "hour") {
                const hour = d.getHours();
                const isWorkHour = this.isWorkingDateTime(d, baseScale.step ? baseScale.step * 60 : 60);
                const classes = [];
                if (isToday) classes.push("today_cell today_hour_cell");
                if (hol) classes.push("holiday_cell");
                else if (!isWorkDay) classes.push("weekend_cell");
                else if (!isWorkHour) classes.push("off_hours_cell");
                else classes.push("work_hours_cell");

                classes.push("hour_start_grid_cell");
                if (hour === 0) {
                    if (d.getMonth() === 0 && d.getDate() === 1) classes.push("year_start_grid_cell");
                    else if (d.getDate() === 1 && (d.getMonth() % 3 === 0)) classes.push("quarter_start_grid_cell");
                    else if (d.getDate() === 1) classes.push("month_start_grid_cell");
                    else classes.push("day_start_grid_cell");
                }
                return classes.join(" ");
            }

            if (baseUnit === "week") {
                // Weekly view (15% - 25%): align boundary lines to Thursday of ISO week
                const thu = new Date(d.getTime() + (3 - ((d.getDay() + 6) % 7)) * 86400000);
                const classes = [];
                if (thu.getMonth() === 0 && getISOWeekNumber(thu) === 1) classes.push("year_start_grid_cell");
                else if (thu.getMonth() % 3 === 0 && thu.getDate() <= 7) classes.push("quarter_start_grid_cell");
                else if (thu.getDate() <= 7) classes.push("month_start_grid_cell");
                return classes.join(" ");
            }

            if (baseUnit === "month") {
                // Macro monthly view (0% - 10%)
                const isSameMonth = (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth());
                const classes = [];
                if (isSameMonth) classes.push("today_cell");
                if (d.getMonth() === 0) classes.push("year_start_grid_cell");
                else if (d.getMonth() % 3 === 0) classes.push("quarter_start_grid_cell");
                else classes.push("month_start_grid_cell");
                return classes.join(" ");
            }

            // Daily view (35% - 55%)
            const classes = [];
            if (isToday) classes.push("today_cell");
            if (hol) classes.push("holiday_cell");
            else if (!isWorkDay) classes.push("weekend_cell");

            if (d.getMonth() === 0 && d.getDate() === 1) {
                classes.push("year_start_grid_cell");
            } else if (d.getDate() === 1 && (d.getMonth() % 3 === 0)) {
                classes.push("quarter_start_grid_cell");
            } else if (d.getDate() === 1) {
                classes.push("month_start_grid_cell");
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
            this.clearHoverHighlight();
            this.renderTodayMarker();

            if (!this._isZooming && oldLeft !== undefined && left !== undefined && oldLeft !== left) {
                this._zoomAnchorDate = null;
                this._zoomAnchorOffset = null;
                if (this._zoomResetTimer) {
                    clearTimeout(this._zoomResetTimer);
                    this._zoomResetTimer = null;
                }
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
                const isTreeToggle = e && e.target && e.target.closest && (
                    e.target.closest(".gantt_tree_icon.gantt_close") ||
                    e.target.closest(".gantt_tree_icon.gantt_open") ||
                    e.target.closest(".gantt_close") ||
                    e.target.closest(".gantt_open")
                );
                const isActionBtn = e && e.target && e.target.closest && e.target.closest(".grid_action_btn");
                if (!isTreeToggle && !isActionBtn) {
                    if (this._sidebarClickTimer) {
                        clearTimeout(this._sidebarClickTimer);
                    }
                    this._sidebarClickTimer = setTimeout(() => {
                        this._sidebarClickTimer = null;
                        this.fitToScreen(id);
                    }, 60);
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

        this.eventIds.push(g.attachEvent("onTaskOpened", () => {
            this.clearHoverHighlight();
            return true;
        }));
        this.eventIds.push(g.attachEvent("onTaskClosed", () => {
            this.clearHoverHighlight();
            return true;
        }));

        // Cascading Drag-and-Drop: record start/end dates for parent and all descendants
        this.eventIds.push(g.attachEvent("onBeforeTaskDrag", (id, mode, e) => {
            if (!this.state.canEdit || mode === "progress") {
                return false;
            }
            this.clearHoverHighlight();
            this.hideTooltip();
            const task = g.getTask(id);
            if (!task) return true;

            task._is_dragged = true;
            task._drag_start_origin = new Date(task.start_date);
            task._drag_end_origin = new Date(task.end_date);
            task._drag_ws_origin = parseWorkDateStr(task.work_start_date) || new Date(task.start_date);
            task._drag_we_origin = parseWorkDateStr(task.work_end_date) || new Date(task.end_date);
            task._fixed_parent = task.parent;

            // Reliably capture whether the start (left) or end (right) handle is being dragged
            const state = (g.getState ? g.getState() : {}) || {};
            let isStart = undefined;
            if (state.drag_from_start !== undefined) {
                isStart = Boolean(state.drag_from_start);
            } else if (e && e.target && e.target.closest) {
                isStart = Boolean(e.target.closest('.task_left, .task_start_date, [data-bind-property="start_date"]'));
            }
            task._drag_from_start = isStart;

            // Collect magnetic snap target timestamps from other tasks/milestones/projects
            // (Exclude current task, its ancestors, and its descendants so subtasks never snap to parent boundaries)
            const snapTimestamps = [];
            const excludeIds = new Set([id]);
            let curP = task.parent;
            while (curP && g.isTaskExists && g.isTaskExists(curP)) {
                excludeIds.add(curP);
                curP = g.getTask(curP).parent;
            }
            const collectDesc = (pId) => {
                const kids = (typeof g.getChildren === "function" ? g.getChildren(pId) : []) || [];
                for (const k of kids) {
                    excludeIds.add(k);
                    collectDesc(k);
                }
            };
            collectDesc(id);

            if (g.eachTask) {
                g.eachTask((other) => {
                    if (excludeIds.has(other.id)) return;
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

            if (mode === "move" || mode === "resize") {
                const storeDescendants = (parentId) => {
                    const children = (typeof g.getChildren === "function" ? g.getChildren(parentId) : []) || [];
                    for (const childId of children) {
                        const childTask = g.getTask(childId);
                        if (childTask) {
                            childTask._drag_start_origin = new Date(childTask.start_date);
                            childTask._drag_end_origin = new Date(childTask.end_date);
                            childTask._drag_ws_origin = parseWorkDateStr(childTask.work_start_date) || new Date(childTask.start_date);
                            childTask._drag_we_origin = parseWorkDateStr(childTask.work_end_date) || new Date(childTask.end_date);
                            prevSnapshots.push(captureSnapshot(childTask));
                            storeDescendants(childId);
                        }
                    }
                };
                storeDescendants(id);

                let curAnc = task.parent;
                while (curAnc && g.isTaskExists && g.isTaskExists(curAnc)) {
                    prevSnapshots.push(captureSnapshot(g.getTask(curAnc)));
                    curAnc = g.getTask(curAnc).parent;
                }
            }

            this._pendingUndoAction = {
                type: "schedule",
                description: task.text || _t("Tvarkaraščio keitimas"),
                previous: prevSnapshots,
            };

            return true;
        }));

        // Real-time grid snapping, tight magnetic snapping to siblings, and cascading updates
        this.eventIds.push(g.attachEvent("onTaskDrag", (id, mode) => {
            this.hideTooltip();
            const task = g.getTask(id);
            if (!task) return;

            // Strict hierarchy lockdown: ensure task.parent cannot change
            if (task._fixed_parent !== undefined && task.parent !== task._fixed_parent) {
                task.parent = task._fixed_parent;
            }

            const zoomLevel = this.state.zoomLevel;
            const isIntraDay = task.is_hourly || isIntraDayWorkSpan(task.work_start_date, task.work_end_date);
            const minDurMs = getMinGridDurationMs(zoomLevel, isIntraDay);
            const SNAP_THRESHOLD_PX = 8;
            let snappedGuidePx = null;

            if (mode === "resize") {
                const state = g.getState ? g.getState() : {};
                const isStartHandle = (task._drag_from_start !== undefined)
                    ? task._drag_from_start
                    : (state.drag_from_start !== undefined
                        ? Boolean(state.drag_from_start)
                        : (task._drag_start_origin && Math.abs(task.start_date.getTime() - task._drag_start_origin.getTime()) > 0));

                if (isStartHandle) {
                    // Resizing left handle (start): snap to active grid step
                    let candidateStart = snapDateToGrid(task.start_date, zoomLevel);

                    // Magnetic snapping to nearby tasks (tight 8px threshold)
                    if (this._snapTargetTimestamps && this._snapTargetTimestamps.length > 0 && typeof g.posFromDate === "function") {
                        const currentPx = this.safePosFromDate(candidateStart);
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
                            candidateStart = new Date(bestMs);
                            snappedGuidePx = bestTargetPx;
                            task._magnetically_snapped_start = true;
                        } else {
                            task._magnetically_snapped_start = false;
                        }
                    }

                    // Enforce minimum duration: subtracting cannot invert or collapse task
                    if (task.end_date.getTime() - candidateStart.getTime() < minDurMs) {
                        candidateStart = new Date(task.end_date.getTime() - minDurMs);
                    }

                    // Ancestor container extension: extending start date expands parent containers in real-time
                    let curAncId = task.parent;
                    while (curAncId && g.isTaskExists && g.isTaskExists(curAncId)) {
                        const anc = g.getTask(curAncId);
                        if (anc && anc.start_date && candidateStart < anc.start_date) {
                            anc.start_date = new Date(candidateStart);
                            g.refreshTask(curAncId);
                        }
                        curAncId = anc.parent;
                    }

                    task.start_date = candidateStart;
                } else {
                    // Resizing right handle (end): snap to active grid step
                    let candidateEnd = snapDateToGrid(task.end_date, zoomLevel);

                    // Magnetic snapping to nearby tasks (tight 8px threshold)
                    if (this._snapTargetTimestamps && this._snapTargetTimestamps.length > 0 && typeof g.posFromDate === "function") {
                        const currentPx = this.safePosFromDate(candidateEnd);
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
                            candidateEnd = new Date(bestMs);
                            snappedGuidePx = bestTargetPx;
                            task._magnetically_snapped_end = true;
                        } else {
                            task._magnetically_snapped_end = false;
                        }
                    }

                    // Enforce minimum duration: subtracting cannot invert or collapse task
                    if (candidateEnd.getTime() - task.start_date.getTime() < minDurMs) {
                        candidateEnd = new Date(task.start_date.getTime() + minDurMs);
                    }

                    // Ancestor container extension: extending end date expands parent containers in real-time
                    let curAncId = task.parent;
                    while (curAncId && g.isTaskExists && g.isTaskExists(curAncId)) {
                        const anc = g.getTask(curAncId);
                        if (anc && anc.end_date && candidateEnd > anc.end_date) {
                            anc.end_date = new Date(candidateEnd);
                            g.refreshTask(curAncId);
                        }
                        curAncId = anc.parent;
                    }

                    task.end_date = candidateEnd;
                }

                // Proportional descendant scaling on parent shrink (only scale down when shrinking)
                if (task._drag_ws_origin && task._drag_we_origin) {
                    const pOrigDur = task._drag_we_origin.getTime() - task._drag_ws_origin.getTime();
                    const pDates = computeDragWorkDates({
                        mode: "resize",
                        isStartHandle,
                        origWS: task._drag_ws_origin,
                        origWE: task._drag_we_origin,
                        origGS: task._drag_start_origin || task.start_date,
                        origGE: task._drag_end_origin || task.end_date,
                        rawStart: task.start_date,
                        rawEnd: task.end_date,
                        zoomLevel,
                    });
                    const pCurDur = pDates.workEnd.getTime() - pDates.workStart.getTime();

                    if (pCurDur < pOrigDur && pOrigDur > 0) {
                        this._applyScaleDescendants(id, pDates.workStart, pDates.workEnd, task._drag_ws_origin, task._drag_we_origin, true);
                    } else {
                        this._restoreDescendants(id, true);
                    }
                }
            } else if (mode === "move") {
                const origDurationMs = task._drag_end_origin && task._drag_start_origin
                    ? (task._drag_end_origin.getTime() - task._drag_start_origin.getTime())
                    : (task.end_date.getTime() - task.start_date.getTime());

                let candidateStart = snapDateToGrid(task.start_date, zoomLevel);

                if (this._snapTargetTimestamps && this._snapTargetTimestamps.length > 0 && typeof g.posFromDate === "function") {
                    const startPx = this.safePosFromDate(candidateStart);
                    const candidateEnd = new Date(candidateStart.getTime() + origDurationMs);
                    const endPx = this.safePosFromDate(candidateEnd);

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
                            candidateStart = new Date(bestMs);
                            snappedGuidePx = bestTargetPx;
                            task._magnetically_snapped_start = true;
                        } else if (bestType === "end") {
                            candidateStart = new Date(bestMs - origDurationMs);
                            snappedGuidePx = bestTargetPx;
                            task._magnetically_snapped_end = true;
                        }
                    } else {
                        task._magnetically_snapped_start = false;
                        task._magnetically_snapped_end = false;
                    }
                }

                // Strict parent boundary rule: subtask cannot be moved outside parent task boundaries
                const isSubtaskOfTask = task.parent && typeof task.parent === "string" && task.parent.startsWith("task_");
                if (isSubtaskOfTask && g.isTaskExists && g.isTaskExists(task.parent)) {
                    const pTask = g.getTask(task.parent);
                    if (pTask && pTask.start_date && pTask.end_date) {
                        const pStartMs = pTask.start_date.getTime();
                        const pEndMs = pTask.end_date.getTime();

                        if (candidateStart.getTime() < pStartMs) {
                            candidateStart = new Date(pStartMs);
                        }
                        if (candidateStart.getTime() + origDurationMs > pEndMs) {
                            candidateStart = new Date(pEndMs - origDurationMs);
                            if (candidateStart.getTime() < pStartMs) {
                                candidateStart = new Date(pStartMs);
                            }
                        }
                    }
                } else if (task.parent && g.isTaskExists && g.isTaskExists(task.parent)) {
                    // Task inside milestone or project: moving task expands container if needed
                    let curAncId = task.parent;
                    while (curAncId && g.isTaskExists && g.isTaskExists(curAncId)) {
                        const anc = g.getTask(curAncId);
                        if (anc && anc.start_date && candidateStart < anc.start_date) {
                            anc.start_date = new Date(candidateStart);
                            g.refreshTask(curAncId);
                        }
                        if (anc && anc.end_date && (candidateStart.getTime() + origDurationMs) > anc.end_date.getTime()) {
                            anc.end_date = new Date(candidateStart.getTime() + origDurationMs);
                            g.refreshTask(curAncId);
                        }
                        curAncId = anc.parent;
                    }
                }

                task.start_date = candidateStart;
                task.end_date = new Date(candidateStart.getTime() + origDurationMs);
                if (isSubtaskOfTask && g.isTaskExists && g.isTaskExists(task.parent)) {
                    const pTask = g.getTask(task.parent);
                    if (pTask && pTask.end_date && task.end_date.getTime() > pTask.end_date.getTime()) {
                        task.end_date = new Date(pTask.end_date);
                        task.start_date = new Date(Math.max(pTask.start_date ? pTask.start_date.getTime() : 0, pTask.end_date.getTime() - origDurationMs));
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
                                g.refreshTask(childId);
                                shiftDescendants(childId);
                            }
                        }
                    };
                    shiftDescendants(id);
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

            const zoomLevel = this.state.zoomLevel;
            const isIntraDay = task.is_hourly || isIntraDayWorkSpan(task.work_start_date, task.work_end_date);
            const minDurMs = getMinGridDurationMs(zoomLevel, isIntraDay);
            const origDurationMs = (task._drag_end_origin && task._drag_start_origin)
                ? (task._drag_end_origin.getTime() - task._drag_start_origin.getTime())
                : (task.end_date.getTime() - task.start_date.getTime());

            const isSubtaskOfTask = task.parent && typeof task.parent === "string" && task.parent.startsWith("task_");

            const isStartHandle = mode === "resize" && (
                (task._drag_from_start !== undefined)
                    ? task._drag_from_start
                    : (task._drag_start_origin && Math.abs(task.start_date.getTime() - task._drag_start_origin.getTime()) > 0)
            );

            const origWS = task._drag_ws_origin || parseWorkDateStr(task.work_start_date) || task.start_date;
            const origWE = task._drag_we_origin || parseWorkDateStr(task.work_end_date) || task.end_date;
            const origGS = task._drag_start_origin || task.start_date;
            const origGE = task._drag_end_origin || task.end_date;

            let { workStart, workEnd, changed } = computeDragWorkDates({
                mode,
                isStartHandle,
                origWS,
                origWE,
                origGS,
                origGE,
                rawStart: task.start_date,
                rawEnd: task.end_date,
                zoomLevel,
            });

            // Strict parent boundary rule: subtask cannot be moved outside parent task boundaries
            if (mode === "move" && isSubtaskOfTask && g.isTaskExists && g.isTaskExists(task.parent)) {
                const pTask = g.getTask(task.parent);
                const pWS = parseWorkDateStr(pTask.work_start_date);
                const pWE = parseWorkDateStr(pTask.work_end_date);
                if (pWS && pWE) {
                    const taskDurMs = workEnd.getTime() - workStart.getTime();
                    if (workStart.getTime() < pWS.getTime()) {
                        workStart = new Date(pWS);
                        workEnd = new Date(workStart.getTime() + taskDurMs);
                        changed = true;
                    }
                    if (workEnd.getTime() > pWE.getTime()) {
                        workEnd = new Date(pWE);
                        workStart = new Date(Math.max(pWS.getTime(), workEnd.getTime() - taskDurMs));
                        changed = true;
                    }
                }
            } else if (task.parent && g.isTaskExists && g.isTaskExists(task.parent)) {
                // Task inside milestone or project: moving/resizing expands ancestor containers if needed
                let curAncId = task.parent;
                while (curAncId && g.isTaskExists && g.isTaskExists(curAncId)) {
                    const anc = g.getTask(curAncId);
                    const ancWS = parseWorkDateStr(anc.work_start_date);
                    const ancWE = parseWorkDateStr(anc.work_end_date);
                    let ancChanged = false;
                    let newAncWS = ancWS;
                    let newAncWE = ancWE;
                    if (ancWS && workStart < ancWS) {
                        newAncWS = new Date(workStart);
                        ancChanged = true;
                    }
                    if (ancWE && workEnd > ancWE) {
                        newAncWE = new Date(workEnd);
                        ancChanged = true;
                    }
                    if (ancChanged) {
                        anc.work_start_date = formatOdooDateTime(newAncWS);
                        anc.work_end_date = formatOdooDateTime(newAncWE);
                        const { gridStart: aGS, gridEnd: aGE } = workDatesToVisualGrid(newAncWS, newAncWE, zoomLevel);
                        anc.start_date = aGS;
                        anc.end_date = aGE;
                        g.updateTask(curAncId);
                    }
                    curAncId = anc.parent;
                }
            }

            const { gridStart, gridEnd } = workDatesToVisualGrid(workStart, workEnd, zoomLevel);
            task.start_date = gridStart;
            task.end_date = gridEnd;
            task.work_start_date = formatOdooDateTime(workStart);
            task.work_end_date = formatOdooDateTime(workEnd);

            if (typeof g.calculateDuration === "function") {
                task.duration = g.calculateDuration(task.start_date, task.end_date);
            }

            delete task._magnetically_snapped_start;
            delete task._magnetically_snapped_end;
            delete task._is_dragged;
            delete task._drag_from_start;

            // If parent was resized, finalize descendant scaling (only scale down when shrinking)
            if (mode === "resize" && origWS && origWE) {
                const pOrigDur = origWE.getTime() - origWS.getTime();
                const pFinalDur = workEnd.getTime() - workStart.getTime();

                if (pFinalDur < pOrigDur && pOrigDur > 0) {
                    this._applyScaleDescendants(id, workStart, workEnd, origWS, origWE, false);
                } else {
                    this._restoreDescendants(id, false);
                }
            }

            // Real-time cascading move for descendants in work-time
            if (mode === "move" && changed && origWS) {
                const isExact = isExactTimeResolution(zoomLevel);
                const deltaMs = workStart.getTime() - origWS.getTime();
                const kDays = Math.round(deltaMs / 86400000);

                const shiftDescendantsWork = (parentId) => {
                    const children = (typeof g.getChildren === "function" ? g.getChildren(parentId) : []) || [];
                    for (const childId of children) {
                        const childTask = g.getTask(childId);
                        if (childTask && childTask._drag_ws_origin && childTask._drag_we_origin) {
                            const cWorkStart = isExact
                                ? new Date(childTask._drag_ws_origin.getTime() + deltaMs)
                                : addCalendarDays(childTask._drag_ws_origin, kDays);
                            const cWorkEnd = isExact
                                ? new Date(childTask._drag_we_origin.getTime() + deltaMs)
                                : addCalendarDays(childTask._drag_we_origin, kDays);
                            childTask.work_start_date = formatOdooDateTime(cWorkStart);
                            childTask.work_end_date = formatOdooDateTime(cWorkEnd);
                            const { gridStart: cGridStart, gridEnd: cGridEnd } = workDatesToVisualGrid(cWorkStart, cWorkEnd, zoomLevel);
                            childTask.start_date = cGridStart;
                            childTask.end_date = cGridEnd;
                            g.updateTask(childId);
                            shiftDescendantsWork(childId);
                        }
                    }
                };
                shiftDescendantsWork(id);
            }

            const updates = [];
            task._established_start = new Date(gridStart);
            task._established_end = new Date(gridEnd);
            task._established_work_start = formatOdooDateTime(workStart);
            task._established_work_end = formatOdooDateTime(workEnd);
            task._established_alloc_hours = task.allocated_hours;
            if (task.is_milestone) {
                task.planned_date_start = formatOdooDateTime(workStart);
                task.planned_date_end = formatOdooDateTime(workEnd);
            }

            // Re-evaluate the red tail on the dragged task (real clock times, not grid coordinates).
            // Same rule as the backend: tail = planned end -> deadline when the deadline is LATER than the new end.
            // Dragging an auto-plan leaf makes its plan manual (user action); containers keep following their children.
            if (task.has_own_deadline !== false) {
                let newKind = "";
                let newMs = 0;
                const nowMs = Date.now();
                const hasKids = typeof g.hasChild === "function" ? g.hasChild(task.id) : false;
                if (!task.is_project && !task.is_milestone && !hasKids) {
                    task.plan_is_manual = true;
                }
                const tailAllowed = task.plan_is_manual !== false || hasKids || task.is_project || task.is_milestone;
                if (tailAllowed && task.deadline_end && (task.date_deadline || task.has_deadline)) {
                    const dlEnd = task.deadline_end instanceof Date
                        ? task.deadline_end
                        : new Date(String(task.deadline_end).replace(/-/g, "/"));
                    if (!isNaN(dlEnd.getTime()) && dlEnd.getTime() > workEnd.getTime()) {
                        newKind = "late";
                        newMs = dlEnd.getTime() - workEnd.getTime();
                    }
                }
                if (!newKind && task.is_timer_running && task.plan_is_manual !== false && nowMs > workEnd.getTime()) {
                    newKind = "timer";
                    newMs = nowMs - workEnd.getTime();
                }
                task.has_deadline_delay = Boolean(newKind);
                task.delay_kind = newKind;
                task.delay_minutes = newKind ? Math.max(1, Math.ceil(newMs / 60000)) : 0;
                task.delay_days = newKind ? Math.floor(newMs / 86400000) : 0;
                task.delay_hours = newKind ? Math.round((newMs / 3600000) * 10) / 10 : 0;
            }

            // Real-time update of allocated working hours from darbo valandos
            const workCalc = calculateWorkingDaysAndHours(workStart, workEnd);
            if (workCalc.workHours > 0) {
                task.allocated_hours = formatHoursLabel(workCalc.workHours);
            }
            if (changed) {
                updates.push({
                    id: task.id,
                    start_date: formatOdooDateTime(workStart),
                    end_date: formatOdooDateTime(workEnd),
                    progress: task.progress,
                    allocated_hours: workCalc.workHours,
                });
            }

            if (mode === "move" || mode === "resize") {
                const collectDescendants = (parentId) => {
                    const children = (typeof g.getChildren === "function" ? g.getChildren(parentId) : []) || [];
                    for (const childId of children) {
                        const childTask = g.getTask(childId);
                        if (!childTask) continue;
                        const cWorkStart = parseWorkDateStr(childTask.work_start_date);
                        const cWorkEnd = parseWorkDateStr(childTask.work_end_date);
                        const unchanged = Boolean(
                            childTask._drag_ws_origin && childTask._drag_we_origin && cWorkStart && cWorkEnd
                            && cWorkStart.getTime() === childTask._drag_ws_origin.getTime()
                            && cWorkEnd.getTime() === childTask._drag_we_origin.getTime()
                        );
                        if (!unchanged && cWorkStart && cWorkEnd) {
                            childTask._established_start = new Date(childTask.start_date);
                            childTask._established_end = new Date(childTask.end_date);
                            childTask._established_work_start = formatOdooDateTime(cWorkStart);
                            childTask._established_work_end = formatOdooDateTime(cWorkEnd);

                            if (childTask.is_milestone) {
                                childTask.planned_date_start = formatOdooDateTime(cWorkStart);
                                childTask.planned_date_end = formatOdooDateTime(cWorkEnd);
                            }
                            const cWorkCalc = calculateWorkingDaysAndHours(cWorkStart, cWorkEnd);
                            if (cWorkCalc.workHours > 0) childTask.allocated_hours = formatHoursLabel(cWorkCalc.workHours);
                            childTask._established_alloc_hours = childTask.allocated_hours;

                            updates.push({
                                id: childTask.id,
                                start_date: formatOdooDateTime(cWorkStart),
                                end_date: formatOdooDateTime(cWorkEnd),
                                progress: childTask.progress,
                                allocated_hours: cWorkCalc.workHours,
                            });
                        }
                        delete childTask._drag_start_origin;
                        delete childTask._drag_end_origin;
                        delete childTask._drag_ws_origin;
                        delete childTask._drag_we_origin;
                        collectDescendants(childId);
                    }
                };
                collectDescendants(id);
            }

            delete task._drag_start_origin;
            delete task._drag_end_origin;
            delete task._drag_ws_origin;
            delete task._drag_we_origin;

            // Save the exact current scroll position before saving/rendering
            const scrollPos = g.getScrollState ? g.getScrollState() : { x: 0, y: 0 };
            const state = g.getState ? g.getState() : {};
            const minScale = state.min_date || g.config.start_date;
            const maxScale = state.max_date || g.config.end_date;
            let needsScaleExpand = (minScale && task.start_date < minScale) || (maxScale && task.end_date > maxScale);

            // Update ancestor containers (parent task, milestone, project) in real-time to encompass children without creating fake deadline delays
            let currParentId = task.parent;
            while (currParentId && g.isTaskExists(currParentId)) {
                const parent = g.getTask(currParentId);
                const pChildren = (typeof g.getChildren === "function" ? g.getChildren(currParentId) : []) || [];
                if (pChildren.length > 0) {
                    let minCS = null;
                    let maxCE = null;
                    let minWorkS = null;
                    let maxWorkE = null;
                    for (const cid of pChildren) {
                        const ct = g.getTask(cid);
                        if (ct && ct.start_date && ct.end_date) {
                            if (!minCS || ct.start_date < minCS) minCS = new Date(ct.start_date);
                            if (!maxCE || ct.end_date > maxCE) maxCE = new Date(ct.end_date);
                            const cws = parseWorkDateStr(ct.work_start_date);
                            const cwe = parseWorkDateStr(ct.work_end_date);
                            if (cws && (!minWorkS || cws < minWorkS)) minWorkS = cws;
                            if (cwe && (!maxWorkE || cwe > maxWorkE)) maxWorkE = cwe;
                        }
                    }
                    // R3: a parent with a MANUAL plan keeps its own span; children beyond it become its red tail.
                    const parentIsManual = parent.plan_is_manual === true;
                    const pEstStart = parent._established_start || parent.start_date;
                    const pEstEnd = parent._established_end || parent.end_date;
                    const pEstWorkStart = parseWorkDateStr(parent._established_work_start || parent.work_start_date);
                    const pEstWorkEnd = parseWorkDateStr(parent._established_work_end || parent.work_end_date);

                    // RULE: Child cannot decrease parent's established length, only increase (expand) it!
                    const finalGridStart = (pEstStart && minCS) ? (minCS < pEstStart ? minCS : pEstStart) : (minCS || pEstStart);
                    const finalGridEnd = (pEstEnd && maxCE) ? (maxCE > pEstEnd ? maxCE : pEstEnd) : (maxCE || pEstEnd);

                    const finalWorkStart = (pEstWorkStart && minWorkS) ? (minWorkS < pEstWorkStart ? minWorkS : pEstWorkStart) : (minWorkS || pEstWorkStart);
                    const finalWorkEnd = (pEstWorkEnd && maxWorkE) ? (maxWorkE > pEstWorkEnd ? maxWorkE : pEstWorkEnd) : (maxWorkE || pEstWorkEnd);

                    let ancChanged = false;
                    if (!parentIsManual && finalGridStart && finalGridEnd) {
                        if (parent.start_date.getTime() !== finalGridStart.getTime() || parent.end_date.getTime() !== finalGridEnd.getTime()) {
                            ancChanged = true;
                        }
                        if (minScale && finalGridStart < minScale) needsScaleExpand = true;
                        if (maxScale && finalGridEnd > maxScale) needsScaleExpand = true;

                        parent.start_date = finalGridStart;
                        parent.end_date = finalGridEnd;
                        const pWork = (finalWorkStart && finalWorkEnd)
                            ? { workStart: finalWorkStart, workEnd: finalWorkEnd }
                            : visualGridToWorkDates(finalGridStart, finalGridEnd, zoomLevel, parent.work_start_date, parent.work_end_date, "move");
                        parent.work_start_date = formatOdooDateTime(pWork.workStart);
                        parent.work_end_date = formatOdooDateTime(pWork.workEnd);

                        // Only recalculate allocated_hours if the parent expanded beyond its established span
                        if ((pEstWorkStart && finalWorkStart < pEstWorkStart) || (pEstWorkEnd && finalWorkEnd > pEstWorkEnd)) {
                            const pWorkCalc = calculateWorkingDaysAndHours(pWork.workStart, pWork.workEnd);
                            if (pWorkCalc.workHours > 0) parent.allocated_hours = formatHoursLabel(pWorkCalc.workHours);
                            parent._established_alloc_hours = parent.allocated_hours;
                        } else if (parent._established_alloc_hours) {
                            parent.allocated_hours = parent._established_alloc_hours;
                        }

                        if (ancChanged) {
                            updates.push({
                                id: parent.id,
                                start_date: parent.work_start_date,
                                end_date: parent.work_end_date,
                                progress: parent.progress,
                                allocated_hours: parent.allocated_hours ? parseHoursLabel(parent.allocated_hours) : 0,
                            });
                        }
                    }
                    // Red tail of the parent = latest child end (planned end or deadline) beyond the parent's own end,
                    // or the parent's own typed deadline, whichever is later.
                    const parentWorkEnd = parseWorkDateStr(parent.work_end_date) || parent.end_date;
                    if (parent._manual_dl === undefined) {
                        parent._manual_dl = (parent.has_own_deadline && !parent.deadline_is_auto && parent.deadline_end)
                            ? (parent.deadline_end instanceof Date ? parent.deadline_end : new Date(String(parent.deadline_end).replace(/-/g, "/")))
                            : null;
                    }
                    let tailEnd = (parent._manual_dl && !isNaN(parent._manual_dl.getTime())) ? parent._manual_dl : null;
                    let tailKind = "late";
                    for (const cid of pChildren) {
                        const ct = g.getTask(cid);
                        if (!ct) continue;
                        let eff = parseWorkDateStr(ct.work_end_date) || ct.end_date;
                        if (ct.has_deadline_delay && ct.deadline_end) {
                            const cDl = ct.deadline_end instanceof Date
                                ? ct.deadline_end
                                : new Date(String(ct.deadline_end).replace(/-/g, "/"));
                            if (!isNaN(cDl.getTime()) && (!eff || cDl > eff)) {
                                eff = cDl;
                                if (ct.delay_kind === "timer") tailKind = "timer";
                            }
                        }
                        if (eff && (!tailEnd || eff > tailEnd)) tailEnd = eff;
                    }
                    if (tailEnd && parentWorkEnd && tailEnd.getTime() > parentWorkEnd.getTime()) {
                        const diffMs = tailEnd.getTime() - parentWorkEnd.getTime();
                        parent.has_deadline = true;
                        parent.has_deadline_delay = true;
                        parent.delay_kind = tailKind;
                        parent.deadline_end = formatOdooDateTime(tailEnd);
                        parent.date_deadline = parent.deadline_end;
                        parent.delay_minutes = Math.max(1, Math.ceil(diffMs / 60000));
                        parent.delay_days = Math.floor(diffMs / 86400000);
                        parent.delay_hours = Math.round((diffMs / 3600000) * 10) / 10;
                    } else {
                        parent.has_deadline_delay = false;
                        parent.delay_kind = "";
                        parent.delay_minutes = 0;
                        parent.delay_days = 0;
                        parent.delay_hours = 0;
                    }                    if (!needsScaleExpand) {
                        g.updateTask(currParentId);
                    }
                }
                currParentId = parent.parent;
            }

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
            if (!this.state.canEdit) {
                return false;
            }
            this.hideTooltip();
            return true;
        }));

        this.eventIds.push(g.attachEvent("onBeforeLinkDelete", () => {
            if (!this.state.canEdit) {
                return false;
            }
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
                    await this.loadTimelineData();
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
                    await this.loadTimelineData();
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
                } else if (!this.state.canEdit) {
                    this.notification.add(_t("Jūs turite tik peržiūros („Can View“) teises."), { type: "warning" });
                    return;
                } else if (action === "delete") {
                    if (await this.askConfirm(_t("Ar tikrai norite ištrinti šią užduotį?"))) {
                        await this.orm.call("project.task", "delete_timeline_task", [id]);
                        await this.loadTimelineData();
                        this.notification.add(_t("Užduotis ištrinta"), { type: "success" });
                    }
                } else if (action === "delete_milestone") {
                    if (await this.askConfirm(_t("Ar tikrai norite ištrinti šią gairę?"))) {
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

                    const now = Date.now();
                    if (this._lastWheelTime && (now - this._lastWheelTime) < 70) {
                        return; // Rate limit zoom steps during continuous wheel spin
                    }
                    this._lastWheelTime = now;

                    const taskViewport = this.ganttElement.el
                        ? (this.ganttElement.el.querySelector(".gantt_task") || this.ganttElement.el.querySelector(".gantt_data_area"))
                        : null;

                    // If a continuous wheel gesture is active within 400ms, maintain anchor date and screen position
                    if (!this._wheelAnchorDate || !this._wheelResetTimer) {
                        const taskIdUnderMouse = g.locate ? g.locate(e) : null;
                        if (taskIdUnderMouse && g.isTaskExists(taskIdUnderMouse)) {
                            g.selectTask(taskIdUnderMouse);
                        }
                        if (taskViewport && g.dateFromPos) {
                            const rect = taskViewport.getBoundingClientRect();
                            const relX = e.clientX - rect.left;
                            const visWidth = taskViewport.clientWidth || rect.width;
                            if (relX >= 0 && relX <= visWidth) {
                                this._wheelFocalOffset = relX;
                                const scrollX = g.getScrollState ? g.getScrollState().x : 0;
                                const mouseXInData = relX + scrollX;
                                const d = g.dateFromPos(mouseXInData);
                                if (d instanceof Date && !isNaN(d.getTime())) {
                                    this._wheelAnchorDate = d;
                                }
                            } else {
                                this._wheelFocalOffset = null;
                                this._wheelAnchorDate = null;
                            }
                        }
                    }

                    if (this._wheelResetTimer) {
                        clearTimeout(this._wheelResetTimer);
                    }
                    this._wheelResetTimer = setTimeout(() => {
                        this._wheelAnchorDate = null;
                        this._wheelFocalOffset = null;
                        this._wheelResetTimer = null;
                    }, 400);

                    const focalDate = this._wheelAnchorDate;
                    const focalOffset = this._wheelFocalOffset;

                    if (e.deltaY < 0) {
                        this.zoomIn(focalDate, focalOffset);
                    } else if (e.deltaY > 0) {
                        this.zoomOut(focalDate, focalOffset);
                    }
                }
            };
            this.ganttElement.el.addEventListener("wheel", this.onWheelHandler, { passive: false });
        }

        if (this.onMouseMoveHandler && this.ganttElement.el) {
            this.ganttElement.el.removeEventListener("mousemove", this.onMouseMoveHandler);
        }
        if (this.onMouseLeaveHandler && this.ganttElement.el) {
            this.ganttElement.el.removeEventListener("mouseleave", this.onMouseLeaveHandler);
        }

        this.onMouseMoveHandler = (e) => {
            const g = this.gantt;
            if (!g || this._isZooming) return;
            if (g.getState && (g.getState().drag_id || g.getState().drag_mode)) {
                this.clearHoverHighlight();
                return;
            }

            const target = e.target;
            if (!target) return;

            // If hovering over a holiday cell in the background or scale, dynamically set the holiday tooltip
            const holidayEl = target.closest ? target.closest(".holiday_cell, .holiday_scale_cell") : null;
            if (holidayEl && !holidayEl.title && g.dateFromPos) {
                try {
                    const taskArea = this.ganttElement.el.querySelector(".gantt_task") || this.ganttElement.el.querySelector(".gantt_data_area");
                    if (taskArea) {
                        const areaRect = taskArea.getBoundingClientRect();
                        const scrollX = g.getScrollState ? g.getScrollState().x : 0;
                        const dataX = (e.clientX - areaRect.left) + scrollX;
                        const d = g.dateFromPos(dataX);
                        if (d) {
                            const holName = getLithuanianHoliday(d);
                            if (holName) holidayEl.title = holName;
                        }
                    }
                } catch {}
            }

            const taskContainer = target.closest ? target.closest("[task_id], [data-task-id]") : null;
            let taskId = null;
            if (taskContainer) {
                taskId = taskContainer.getAttribute("task_id") || taskContainer.getAttribute("data-task-id");
            }
            if (!taskId && g.locate) {
                try {
                    taskId = g.locate(e);
                } catch {}
            }

            if (!taskId || !g.isTaskExists(taskId)) {
                if (this._currentHoveredTaskId !== null) {
                    this.clearHoverHighlight();
                }
                return;
            }

            if (taskId === this._currentHoveredTaskId) {
                return;
            }

            this.applyHoverHighlight(taskId);
        };

        this.onMouseLeaveHandler = () => {
            this.clearHoverHighlight();
        };

        this.ganttElement.el.addEventListener("mousemove", this.onMouseMoveHandler);
        this.ganttElement.el.addEventListener("mouseleave", this.onMouseLeaveHandler);

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
     * Unified timescale configuration driven purely by zoomLevel (10% to 600%).
     * - 10% (largest scale): 6 years visible across viewport (3 years backward, 3 years forward from center)
     * - 10% to 40%: Year -> Quarter -> Month -> Week
     * - 50% to 200%: Year -> Quarter -> Month -> Week -> Day
     * - 250% to 550%: Year -> Month -> Week -> Day -> Hour
     * - 600% (smallest scale): Year -> Month -> Day -> Hour -> Minute (kas 15 min.)
     */
    /**
     * Apply scale configuration dynamically based on zoomLevel and container width.
     * Ensures perfect alignment from very top to very bottom across Year, Quarter, Month, Week, Day.
     * Strips holidays of any stars and ensures uniform styling across all zoom levels.
     */
    applyScaleConfig(customColWidth = null) {
        const g = this.gantt;
        if (!g) return;

        // Reset global scale_cell_class for hour and day units (marks today, holidays, weekends, work hours)
        g.templates.scale_cell_class = (date, scale) => {
            if (!scale) return "";
            const today = new Date();
            const d = new Date(date);
            const isToday = (
                d.getFullYear() === today.getFullYear() &&
                d.getMonth() === today.getMonth() &&
                d.getDate() === today.getDate()
            );
            const hol = getLithuanianHoliday(d);
            const isWorkDay = this.isWorkingDay(d);

            if (scale.unit === "minute") {
                const isWorkHour = this.isWorkingDateTime(d, scale.step || 15);
                const m = d.getMinutes();
                const classes = ["minute_scale_cell"];
                if (isWorkHour) {
                    classes.push("work_hour_scale_cell");
                } else {
                    classes.push("off_hour_scale_cell");
                }
                if (m === 0) {
                    classes.push("hour_boundary_cell");
                }
                return classes.join(" ");
            }

            if (scale.unit === "hour") {
                const isWorkHour = this.isWorkingDateTime(d, scale.step ? scale.step * 60 : 60);
                if (isToday) {
                    return isWorkHour ? "today_scale_cell work_hour_scale_cell" : "today_scale_cell off_hour_scale_cell";
                }
                if (hol) return "holiday_scale_cell";
                if (!isWorkDay) return "weekend_scale_cell";
                return isWorkHour ? "work_hour_scale_cell" : "off_hour_scale_cell";
            }

            if (scale.unit === "day") {
                const classes = [];
                if (isToday) classes.push("today_scale_cell");
                if (hol) classes.push("holiday_scale_cell");
                else if (!isWorkDay) classes.push("weekend_scale_cell");

                if (d.getMonth() === 0 && d.getDate() === 1) classes.push("year_boundary_cell");
                else if (d.getDate() === 1 && (d.getMonth() % 3 === 0)) classes.push("quarter_boundary_cell");
                else if (d.getDate() === 1) classes.push("month_boundary_cell");

                return classes.join(" ");
            }

            if (scale.unit === "month") {
                const m = d.getMonth();
                if (m === 0) return "year_boundary_cell";
                if (m % 3 === 0) return "quarter_boundary_cell";
                return "month_boundary_cell";
            }

            if (scale.unit === "quarter") {
                if (d.getMonth() === 0) return "year_boundary_cell";
                return "quarter_boundary_cell";
            }

            return "";
        };

        const visibleWidth = this.getTimelineVisibleWidth();
        // Header labels of very wide cells are centred inside the visible part of the cell (see SCSS .gantt_scale_cell > span)
        if (this.ganttElement && this.ganttElement.el) {
            this.ganttElement.el.style.setProperty("--gantt-view-w", `${Math.max(120, Math.round(visibleWidth))}px`);
        }
        const pxPerDay = getZoomPxPerDay(this.state.zoomLevel, visibleWidth);
        const pxPerHour = pxPerDay / 24.0;
        const pxPerMin = pxPerDay / 1440.0;

        // Bounding box fit thresholds:
        const canFitDays = pxPerDay >= 13; // At >= 30% zoom (14.3px), Day numbers fit!
        const canFitWeeks = (pxPerDay * 7) >= 14; // At >= 15% zoom (19.6px), Week numbers fit!
        const isWeeklyBase = canFitWeeks && !canFitDays; // 15% to 25% zoom

        const getEffectiveDate = (date) => {
            if (!isWeeklyBase) return date;
            // When base scale is week, align Year, Quarter, and Month to the ISO Thursday of the week
            // so Year 2027, Q1, Month 1 Saus, and Week 1 ALL start at the exact same column (Week 1)!
            const d = new Date(date);
            const day = (d.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
            d.setDate(d.getDate() - day + 3); // Thursday of this ISO week
            return d;
        };

        // 1. Year scale: Metai (%Y, e.g. 2026)
        const yearScale = {
            unit: "year",
            step: 1,
            format: (date) => {
                const eff = getEffectiveDate(date);
                const y = eff.getFullYear();
                return `<span title="${y} metai">${y}</span>`;
            },
            css: (date) => "year_scale_cell year_boundary_cell",
            height: 22,
        };

        // 2. Quarter scale: Ketvirtis (1, 2, 3, 4)
        const quarterScale = {
            unit: "quarter",
            step: 1,
            format: (date) => {
                const eff = getEffectiveDate(date);
                const q = Math.floor(eff.getMonth() / 3) + 1;
                const fullTitle = `${eff.getFullYear()} m. ${q} ketvirtis`;
                return `<span title="${fullTitle}">${q}</span>`;
            },
            css: (date) => (date.getMonth() === 0) ? "quarter_scale_cell year_boundary_cell" : "quarter_scale_cell quarter_boundary_cell",
            height: 22,
        };

        // 3. Month scale: Mėnuo (Displays "10 Spal" when wide enough, or "10" at macro zoom)
        const monthWidth = pxPerDay * 30.4375;
        const monthScale = {
            unit: "month",
            step: 1,
            format: (date) => {
                const eff = getEffectiveDate(date);
                const monthNumber = eff.getMonth() + 1;
                const fullTitle = `${eff.getFullYear()} m. ${LITHUANIAN_MONTHS[eff.getMonth()]}`;
                if (monthWidth >= 44) {
                    const shortName = LITHUANIAN_MONTHS_SHORT[eff.getMonth()];
                    return `<span title="${fullTitle}">${monthNumber} ${shortName}</span>`;
                }
                if (monthWidth >= 14) {
                    return `<span title="${fullTitle}">${monthNumber}</span>`;
                }
                return "";
            },
            css: (date) => {
                const m = date.getMonth();
                if (m === 0) return "month_scale_cell year_boundary_cell";
                if (m % 3 === 0) return "month_scale_cell quarter_boundary_cell";
                return "month_scale_cell month_boundary_cell";
            },
            height: 22,
        };

        // 4. Week scale: Savaitė (ISO week number: 1..52)
        const weekColWidth = pxPerDay * 7;
        const weekScale = {
            unit: "week",
            step: 1,
            format: (date) => {
                if (!canFitWeeks) return "";
                const w = getISOWeekNumber(date);
                if (weekColWidth >= 44) {
                    return `<span title="${w} savaitė">${w} sav.</span>`;
                }
                return `<span title="${w} savaitė">${w}</span>`;
            },
            css: (date) => canFitWeeks ? "week_scale_cell" : "week_scale_cell no_division_cell",
            height: 22,
        };

        // 5. Day scale: Uniform holiday styling with NO star (★), native title tooltip on hover, format "14 Tr" or "14"
        const canFitWeekdays = pxPerDay >= 40;
        const dayScale = {
            unit: "day",
            step: 1,
            format: (date) => {
                if (!canFitDays) return "";
                const d = date.getDate();
                const hol = getLithuanianHoliday(date);
                const wd = canFitWeekdays ? ` ${LITHUANIAN_WEEKDAYS_SHORT[date.getDay()]}` : "";
                if (hol) {
                    return `<span class="holiday_day_cell" title="${hol}">${d}${wd}</span>`;
                }
                const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
                const fullDateTitle = `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(d)}`;
                return `<span title="${fullDateTitle}">${d}${wd}</span>`;
            },
            css: (date) => {
                if (!canFitDays) return "day_scale_cell no_division_cell";
                const d = date.getDate();
                const m = date.getMonth();
                const classes = ["day_scale_cell"];
                const today = new Date();
                if (d === today.getDate() && m === today.getMonth() && date.getFullYear() === today.getFullYear()) {
                    classes.push("today_scale_cell");
                }
                const hol = getLithuanianHoliday(date);
                if (hol) classes.push("holiday_scale_cell");
                else if (!this.isWorkingDay(date)) classes.push("weekend_scale_cell");

                if (m === 0 && d === 1) classes.push("year_boundary_cell");
                else if (d === 1 && m % 3 === 0) classes.push("quarter_boundary_cell");
                else if (d === 1) classes.push("month_boundary_cell");

                return classes.join(" ");
            },
            height: 22,
        };

        // 6. Hour scale: dynamic 1h or 2h step based on available width
        const canFitHours = pxPerHour >= 11;
        let hourStep = 1;
        if (pxPerHour >= 22) {
            hourStep = 1;
        } else if (pxPerHour >= 11) {
            hourStep = 2;
        }
        const hourColWidth = Math.max(16, Math.round(pxPerHour * hourStep));

        const hourScale = {
            unit: "hour",
            step: hourStep,
            format: (date) => {
                if (!canFitHours) return "";
                const h = date.getHours();
                const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
                const nextH = (h + hourStep) % 24;
                const tooltip = `${pad(h)}:00 – ${pad(nextH)}:00`;
                if (hourColWidth >= 38) {
                    return `<span title="${tooltip}">${pad(h)}:00</span>`;
                }
                return `<span title="${tooltip}">${h}</span>`;
            },
            css: (date) => {
                if (!canFitHours) return "hour_scale_cell no_division_cell";
                const h = date.getHours();
                const classes = ["hour_scale_cell"];
                if (this.isWorkingDateTime(date, hourStep * 60)) {
                    classes.push("work_hour_scale_cell");
                } else {
                    classes.push("off_hour_scale_cell");
                }
                if (h === 0) {
                    classes.push("day_boundary_cell");
                }
                return classes.join(" ");
            },
            height: 22,
        };

        // 7. Minute scale: dynamic 1m, 5m, 15m, 30m step based on available width
        // 95% to 100% is strictly 1-minute resolution (more zoomed out at 95% where 60m fits screen, more zoomed in at 100%)
        let minStep = 0;
        if (this.state.zoomLevel >= 95 || pxPerMin >= 15) {
            minStep = 1; // 1-minute resolution (1..60) at 95% - 100% zoom
        } else if ((pxPerMin * 5) >= 20) {
            minStep = 5; // 5-minute resolution (5, 10, 15..60) at 85% - 90% zoom
        } else if ((pxPerMin * 15) >= 20) {
            minStep = 15; // 15-minute resolution (15, 30, 45, 60) at 75% - 80% zoom
        } else if ((pxPerMin * 30) >= 20) {
            minStep = 30; // 30-minute resolution (30, 60) at 70% zoom
        }

        const canFitMinutes = minStep > 0;
        const minuteColWidth = canFitMinutes ? Math.max(14, Math.round(pxPerMin * minStep)) : 14;

        const minuteScale = {
            unit: "minute",
            step: minStep || 15,
            format: (date) => {
                if (!canFitMinutes) return "";
                const m = date.getMinutes();
                const h = date.getHours();
                const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
                const nextM = m + minStep;
                const endH = nextM >= 60 ? (h + 1) % 24 : h;
                const endM = nextM % 60;
                const mark = minStep === 1 ? m : (minuteColWidth >= 28 ? pad(m) : m);
                return `<span title="${pad(h)}:${pad(m)} – ${pad(endH)}:${pad(endM)}">${mark}</span>`;
            },
            css: (date) => {
                if (!canFitMinutes) return "minute_scale_cell no_division_cell";
                const m = date.getMinutes();
                const classes = ["minute_scale_cell"];
                if (this.isWorkingDateTime(date, minStep || 15)) {
                    classes.push("work_hour_scale_cell");
                } else {
                    classes.push("off_hour_scale_cell");
                }
                if (m === 0) {
                    classes.push("hour_boundary_cell");
                }
                return classes.join(" ");
            },
            height: 22,
        };

        // Dynamic Scale Selection: strictly based on whether each time unit fits on screen!
        let scales = [yearScale, quarterScale, monthScale];

        if (canFitMinutes) {
            // Minute timescale (70% - 100%): all 7 strips active [Year, Quarter, Month, Week, Day, Hour, Minute]
            scales = [yearScale, quarterScale, monthScale, weekScale, dayScale, hourScale, minuteScale];
            g.config.time_step = 1; // 1-minute precision across all minute zoom levels
            g.config.min_column_width = customColWidth ? Math.max(16, customColWidth) : minuteColWidth;
        } else if (canFitHours) {
            // Hourly timescale (60% - 65%): 6 strips active [Year, Quarter, Month, Week, Day, Hour]
            scales = [yearScale, quarterScale, monthScale, weekScale, dayScale, hourScale];
            g.config.time_step = 15; // 15-minute precision in hourly view
            g.config.min_column_width = customColWidth ? Math.max(16, customColWidth) : hourColWidth;
        } else if (canFitDays) {
            // Daily timescale (30% - 55%): 5 strips active [Year, Quarter, Month, Week, Day]
            scales = [yearScale, quarterScale, monthScale, weekScale, dayScale];
            g.config.time_step = 1440;
            g.config.min_column_width = customColWidth ? Math.max(13, customColWidth) : Math.round(pxPerDay);
        } else if (canFitWeeks) {
            // Weekly timescale (15% - 25%): 4 strips active [Year, Quarter, Month, Week]
            scales = [yearScale, quarterScale, monthScale, weekScale];
            g.config.time_step = 1440;
            g.config.min_column_width = customColWidth ? Math.max(14, customColWidth) : Math.round(pxPerDay * 7);
        } else {
            // Macro monthly timescale (0% - 10%): 3 strips active [Year, Quarter, Month]
            scales = [yearScale, quarterScale, monthScale];
            g.config.time_step = 1440;
            const defMonthColW = Math.max(14, Math.round(pxPerDay * 30.4375));
            g.config.min_column_width = customColWidth ? Math.max(14, customColWidth) : defMonthColW;
        }

        g.config.scales = scales;
        g.config.duration_unit = "minute";
        g.config.duration_step = 1;
        g.config.min_duration = 60 * 1000; // 1 minute (60,000 ms) minimum duration across all scales
        // Dynamically size header height to exact active scales count * 22px
        // Eliminates empty white gaps and fake stripes across all zoom levels!
        g.config.scale_height = scales.length * 22;
    }

    /**
     * Fetch and parse timeline data
     */
    async loadTimelineData(customDomain = null) {
        this.clearHoverHighlight();
        if (!this.gantt) return;

        try {
            const domain = customDomain || this.props.domain || [];
            const data = await this.orm.call("project.task", "get_all_in_one_timeline_data", [], {
                project_id: this.state.selectedProjectId,
                domain: domain,
                model_name: this.props.resModel || "project.task",
            });

            this.state.projects = data.projects || [];
            const canEdit = data.can_edit !== false;
            this.state.canEdit = canEdit;
            this.gantt.config.readonly = !canEdit;
            this.gantt.config.drag_move = canEdit;
            this.gantt.config.drag_resize = canEdit;
            this.gantt.config.drag_project = canEdit;
            this.gantt.config.drag_links = canEdit;

            // Preserve scroll position (both in pixel offset and anchor date) and open/closed branch states
            const scrollPos = this.gantt.getScrollState ? this.gantt.getScrollState() : null;
            let anchorDate = null;
            if (scrollPos && scrollPos.x !== undefined && this.gantt.dateFromPos) {
                const visibleWidth = this.getTimelineVisibleWidth();
                anchorDate = this.gantt.dateFromPos(scrollPos.x + Math.floor(visibleWidth / 2));
            }
            const savedOpenStates = (this._savedViewState && this._savedViewState.openStates)
                ? this._savedViewState.openStates
                : null;
            const openStates = {};
            if (this.gantt.eachTask) {
                this.gantt.eachTask((t) => {
                    openStates[t.id] = t.$open !== undefined ? t.$open : t.open;
                });
            }

            if (this._lastAddedParentId && data.tasks) {
                let currKey = `task_${this._lastAddedParentId}`;
                while (currKey) {
                    openStates[currKey] = true;
                    if (savedOpenStates) savedOpenStates[currKey] = true;
                    const found = data.tasks.find((t) => t.id === currKey);
                    currKey = found ? found.parent : null;
                }
                this._lastAddedParentId = null;
            }

            if (data.tasks) {
                const zoomLevel = this.state.zoomLevel;
                for (const t of data.tasks) {
                    t.auto_scheduling = false;
                    if (savedOpenStates && savedOpenStates[t.id] !== undefined) {
                        t.open = Boolean(savedOpenStates[t.id]);
                    } else if (openStates[t.id] !== undefined) {
                        t.open = Boolean(openStates[t.id]);
                    } else {
                        t.open = false;
                    }
                    if (t.work_start_date && t.work_end_date) {
                        const { gridStart, gridEnd } = workDatesToVisualGrid(t.work_start_date, t.work_end_date, zoomLevel);
                        t.start_date = formatOdooDateTime(gridStart);
                        t.end_date = formatOdooDateTime(gridEnd);
                        t._established_start = new Date(gridStart);
                        t._established_end = new Date(gridEnd);
                        t._established_work_start = t.work_start_date;
                        t._established_work_end = t.work_end_date;
                        t._established_alloc_hours = t.allocated_hours;
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
                this.navigateToday(true);
            } else if (!this._initialScrollDone) {
                this._initialScrollDone = true;
                this.navigateToday(true);
                setTimeout(() => {
                    this.navigateToday(true);
                }, 60);
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
        } catch (err) {
            console.error("Error loading timeline data", err);
            this.notification.add(_t("Could not load timeline data: ") + err.message, { type: "danger" });
        }
    }

    /**
     * Native Odoo confirmation dialog, resolved as a boolean promise.
     */
    askConfirm(body) {
        return new Promise((resolve) => {
            this.dialogService.add(
                ConfirmationDialog,
                {
                    title: _t("Patvirtinimas"),
                    body,
                    confirmLabel: _t("Ištrinti"),
                    cancelLabel: _t("Atšaukti"),
                    confirm: () => resolve(true),
                    cancel: () => resolve(false),
                },
                { onClose: () => resolve(false) }
            );
        });
    }

    /**
     * Open standard Odoo Task Form (Full view with chatter, normal menus, breadcrumbs)
     */
    openTaskFormDialog(taskId) {
        this.saveViewState(true);
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
        let effProjectId = projectId;
        let effMilestoneId = milestoneId;
        const taskKey = `task_${parentTaskId}`;
        if (this.gantt && this.gantt.isTaskExists(taskKey)) {
            const pTask = this.gantt.getTask(taskKey);
            if (pTask) {
                effProjectId = effProjectId || pTask.project_id || undefined;
                effMilestoneId = effMilestoneId || pTask.milestone_id || undefined;
            }
        }
        effProjectId = effProjectId || (this.state.selectedProjectId > 0 ? this.state.selectedProjectId : undefined);

        this._lastAddedParentId = parentTaskId;

        this.actionService.doAction(
            {
                type: "ir.actions.act_window",
                res_model: "project.task",
                views: [[false, "form"]],
                target: "new",
                context: {
                    default_parent_id: parentTaskId,
                    ...(effProjectId ? { default_project_id: effProjectId } : {}),
                    ...(effMilestoneId ? { default_milestone_id: effMilestoneId } : {}),
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
        this.saveViewState(true);
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
        this.saveViewState(true);
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
     * At 10% zoom, guarantees at least 5 years backward and 5 years forward so the 6-year viewport
     * (3 years backward, 3 years forward from center) is fully visible and horizontally scrollable in both directions.
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

        const isHighZoom = (this.state.zoomLevel >= 60);
        if (g.eachTask) {
            const hasFocalSpan = Boolean(extraTaskStart && extraTaskEnd);
            const focalCenterMs = hasFocalSpan ? Math.round((new Date(extraTaskStart).getTime() + new Date(extraTaskEnd).getTime()) / 2) : 0;
            const maxFocalDistMs = 35 * 86400000;

            g.eachTask((task) => {
                if (task.start_date) {
                    const s = new Date(task.start_date);
                    if (!isNaN(s.getTime())) {
                        if (!isHighZoom || !hasFocalSpan || Math.abs(s.getTime() - focalCenterMs) <= maxFocalDistMs) {
                            if (!minDate || s < minDate) minDate = s;
                            if (!maxDate || s > maxDate) maxDate = s;
                        }
                    }
                }
                if (task.end_date) {
                    const e = new Date(task.end_date);
                    if (!isNaN(e.getTime())) {
                        if (!isHighZoom || !hasFocalSpan || Math.abs(e.getTime() - focalCenterMs) <= maxFocalDistMs) {
                            if (!minDate || e < minDate) minDate = e;
                            if (!maxDate || e > maxDate) maxDate = e;
                        }
                    }
                }
                if (task.has_deadline_delay && task.deadline_end) {
                    // The red tail ends at the deadline: keep it inside the visible scale so it is never clipped.
                    const dl = task.deadline_end instanceof Date ? task.deadline_end : new Date(String(task.deadline_end).replace(/-/g, "/"));
                    if (!isNaN(dl.getTime())) {
                        if (!isHighZoom || !hasFocalSpan || Math.abs(dl.getTime() - focalCenterMs) <= maxFocalDistMs) {
                            if (!maxDate || dl > maxDate) maxDate = dl;
                        }
                    }
                }
            });
        }

        if (!minDate) minDate = new Date(today);
        if (!maxDate) maxDate = new Date(today);

        // Include today in boundaries if appropriate (for high zoom >= 250%, only if today is within 21 days of tasks to avoid immense column bloat)
        let effectiveMin = new Date(minDate);
        let effectiveMax = new Date(maxDate);
        const distFromToday = Math.min(
            Math.abs(today.getTime() - minDate.getTime()),
            Math.abs(today.getTime() - maxDate.getTime())
        );
        if (!isHighZoom || distFromToday <= 21 * 86400000) {
            if (today < effectiveMin) {
                effectiveMin = new Date(today);
            }
            if (today > effectiveMax) {
                effectiveMax = new Date(today);
            }
        }

        const visibleWidth = this.getTimelineVisibleWidth();
        const pxPerDay = getZoomPxPerDay(this.state.zoomLevel, visibleWidth);
        const canFitDays = pxPerDay >= 13;
        const isHourlyOrMinute = (pxPerDay / 24) >= 12;

        let startDate;
        let endDate;

        if (this.state.zoomLevel >= 90) {
            // Ultra-micro zoom (1-minute / 5-minute resolution): tight 1 day past, 2 days future buffer
            startDate = new Date(effectiveMin.getFullYear(), effectiveMin.getMonth(), effectiveMin.getDate() - 1, 0, 0, 0);
            endDate = new Date(effectiveMax.getFullYear(), effectiveMax.getMonth(), effectiveMax.getDate() + 2, 23, 59, 59);
        } else if (this.state.zoomLevel >= 60 || isHourlyOrMinute) {
            // Hourly / 15-minute zoom: 4 days past, 7 days future buffer
            startDate = new Date(effectiveMin.getFullYear(), effectiveMin.getMonth(), effectiveMin.getDate() - 4, 0, 0, 0);
            endDate = new Date(effectiveMax.getFullYear(), effectiveMax.getMonth(), effectiveMax.getDate() + 7, 23, 59, 59);
        } else if (!canFitDays) {
            // Macro multi-year zoom (0% - 30%): 5 years backward, 5 years forward strictly aligned to Jan 1
            startDate = new Date(effectiveMin.getFullYear() - 5, 0, 1, 0, 0, 0);
            endDate = new Date(effectiveMax.getFullYear() + 5, 11, 31, 23, 59, 59);
        } else {
            // Detailed daily zoom (35% - 55%): 1 year backward, 2 years forward strictly aligned to Jan 1
            startDate = new Date(effectiveMin.getFullYear() - 1, 0, 1, 0, 0, 0);
            endDate = new Date(effectiveMax.getFullYear() + 2, 11, 31, 23, 59, 59);
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
            const visibleWidth = this.getTimelineVisibleWidth();
            const pxPerDay = getZoomPxPerDay(this.state.zoomLevel, visibleWidth);
            const canFitDays = pxPerDay >= 13;
            if (pxPerDay >= 350) {
                const stepDays = pxPerDay >= 2000 ? 1 : 3;
                newStart.setDate(newStart.getDate() - stepDays);
            } else {
                const stepYears = !canFitDays ? 2 : 1;
                newStart.setFullYear(newStart.getFullYear() - stepYears);
                newStart.setMonth(0, 1);
                newStart.setHours(0, 0, 0, 0);
            }

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
            const visibleWidth = this.getTimelineVisibleWidth();
            const pxPerDay = getZoomPxPerDay(this.state.zoomLevel, visibleWidth);
            const canFitDays = pxPerDay >= 13;
            if (pxPerDay >= 350) {
                const stepDays = pxPerDay >= 2000 ? 1 : 3;
                newEnd.setDate(newEnd.getDate() + stepDays);
            } else {
                const stepYears = !canFitDays ? 2 : 1;
                newEnd.setFullYear(newEnd.getFullYear() + stepYears);
                newEnd.setMonth(11, 31);
                newEnd.setHours(23, 59, 59);
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
            if (this.state.zoomLevel < 60) {
                today.setHours(12, 0, 0, 0);
            }
            const leftPos = this.safePosFromDate(today);
            if (leftPos >= 0) {
                if (!marker) {
                    marker = document.createElement("div");
                    marker.className = "custom_today_marker";
                    dataArea.appendChild(marker);
                }
                const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
                const todayStr = `${today.getFullYear()}.${pad(today.getMonth() + 1)}.${pad(today.getDate())}`;
                marker.innerHTML = `<span class="today_marker_label">${todayStr}</span>`;
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
        if (!this.state.canEdit) {
            return;
        }
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
        await this.loadTimelineData();
    }

    zoomIn(focalDate = null, focalOffset = null) {
        const validFocalDate = (focalDate instanceof Date && !isNaN(focalDate.getTime())) ? focalDate : null;
        const nextStep = ZOOM_STEPS.find((step) => step > this.state.zoomLevel);
        this.setZoom(nextStep !== undefined ? nextStep : ZOOM_STEPS[ZOOM_STEPS.length - 1], validFocalDate, null, null, focalOffset);
    }

    zoomOut(focalDate = null, focalOffset = null) {
        const validFocalDate = (focalDate instanceof Date && !isNaN(focalDate.getTime())) ? focalDate : null;
        const nextStep = [...ZOOM_STEPS].reverse().find((step) => step < this.state.zoomLevel);
        this.setZoom(nextStep !== undefined ? nextStep : ZOOM_STEPS[0], validFocalDate, null, null, focalOffset);
    }

    setZoom(level, customFocalDate = null, customScrollY = null, itemSpan = null, customFocalOffset = null) {
        const g = this.gantt;
        if (!g) {
            this.state.zoomLevel = level;
            return;
        }

        this._isZooming = true;
        this.clearHoverHighlight();

        try {
            const visibleWidth = this.getTimelineVisibleWidth();
            const scrollState = g.getScrollState ? g.getScrollState() : { x: 0, y: 0 };
            let targetScrollY = (customScrollY !== null && customScrollY !== undefined) ? customScrollY : scrollState.y;

            // Define comfortable left margin so the focal item or visible date has breathing room (~60-80px)
            const leftMargin = Math.min(80, Math.max(40, Math.round(visibleWidth * 0.06)));

            let focalDate = (customFocalDate instanceof Date && !isNaN(customFocalDate.getTime())) ? customFocalDate : null;
            let focalOffset = (typeof customFocalOffset === "number" && !isNaN(customFocalOffset)) ? customFocalOffset : null;

            // 1. If explicit itemSpan is provided (e.g. from fitToScreen), anchor to itemSpan.minStart
            if (!focalDate && itemSpan && itemSpan.minStart instanceof Date) {
                focalDate = new Date(itemSpan.minStart);
                focalOffset = leftMargin;
            }

            // 2. If zooming rapidly via +/- keys or buttons, reuse the active anchor
            if (!focalDate && this._zoomAnchorDate && this._zoomResetTimer) {
                focalDate = new Date(this._zoomAnchorDate);
                focalOffset = (typeof this._zoomAnchorOffset === "number") ? this._zoomAnchorOffset : leftMargin;
            }

            // 3. Smart Anchor Selection: Selected Task (Priority 1) -> Visible Task / Today (Priority 2) -> Left Viewport Date (Priority 3)
            if (!focalDate && !itemSpan) {
                let selectedTask = null;
                const selectedId = g.getSelectedId ? g.getSelectedId() : null;
                if (selectedId && g.isTaskExists(selectedId)) {
                    selectedTask = g.getTask(selectedId);
                }

                if (selectedTask) {
                    const taskPos = (typeof g.getTaskPosition === "function") ? g.getTaskPosition(selectedTask) : null;
                    const isTaskVisible = taskPos && (
                        (taskPos.left + (taskPos.width || 0)) >= (scrollState.x - 100) &&
                        taskPos.left <= (scrollState.x + visibleWidth + 100)
                    );

                    if (isTaskVisible) {
                        let taskStart = parseWorkDateStr(selectedTask.work_start_date) || (selectedTask.start_date ? new Date(selectedTask.start_date) : null);
                        // If selected item is a parent with children, encompass earliest child start
                        if (typeof g.getChildren === "function") {
                            const encompassStart = (pId) => {
                                const children = g.getChildren(pId) || [];
                                for (const cId of children) {
                                    const child = g.getTask(cId);
                                    if (child) {
                                        const cs = parseWorkDateStr(child.work_start_date) || (child.start_date ? new Date(child.start_date) : null);
                                        if (cs && (!taskStart || cs < taskStart)) {
                                            taskStart = cs;
                                        }
                                        encompassStart(cId);
                                    }
                                }
                            };
                            encompassStart(selectedTask.id);
                        }

                        if (taskStart instanceof Date && !isNaN(taskStart.getTime())) {
                            focalDate = taskStart;
                            focalOffset = leftMargin;
                            if (taskPos && taskPos.top !== undefined && customScrollY === null) {
                                targetScrollY = Math.max(0, taskPos.top - 80);
                            }
                        }
                    }
                }

                // Priority 2: No task selected. Find the earliest task currently visible in the viewport or Today!
                if (!focalDate) {
                    const viewLeft = scrollState.x;
                    const viewRight = scrollState.x + visibleWidth;
                    let bestCandidateDate = null;
                    let minOffsetFromLeft = Infinity;

                    if (g.eachTask) {
                        g.eachTask((t) => {
                            const sDate = parseWorkDateStr(t.work_start_date) || (t.start_date ? new Date(t.start_date) : null);
                            const eDate = parseWorkDateStr(t.work_end_date) || (t.end_date ? new Date(t.end_date) : null);
                            if (!sDate || isNaN(sDate.getTime())) return;

                            const sPx = this.safePosFromDate(sDate);
                            const ePx = eDate ? this.safePosFromDate(eDate) : sPx;
                            if (sPx < 0 && ePx < 0) return;

                            // Check if task bar intersects the visible horizontal viewport
                            if (ePx >= viewLeft - 20 && sPx <= viewRight + 20) {
                                const dist = (sPx >= viewLeft) ? (sPx - viewLeft) : Math.abs(viewLeft - sPx) * 2;
                                if (dist < minOffsetFromLeft) {
                                    minOffsetFromLeft = dist;
                                    bestCandidateDate = sDate;
                                }
                            }
                        });
                    }

                    // Check if Today marker is visible in the viewport
                    const today = new Date();
                    if (this.state.zoomLevel < 60) today.setHours(12, 0, 0, 0);
                    const todayPx = this.safePosFromDate(today);
                    if (todayPx >= viewLeft - 20 && todayPx <= viewRight + 20) {
                        const todayDist = Math.max(0, todayPx - viewLeft);
                        if (!bestCandidateDate || todayDist <= minOffsetFromLeft) {
                            bestCandidateDate = today;
                        }
                    }

                    if (bestCandidateDate instanceof Date && !isNaN(bestCandidateDate.getTime())) {
                        focalDate = bestCandidateDate;
                        focalOffset = leftMargin;
                    }
                }

                // Priority 3: Fallback only if no tasks and no Today are on screen
                if (!focalDate && g.dateFromPos) {
                    const leftVisiblePx = scrollState.x + leftMargin;
                    const leftDate = g.dateFromPos(leftVisiblePx);
                    if (leftDate instanceof Date && !isNaN(leftDate.getTime())) {
                        focalDate = leftDate;
                        focalOffset = leftMargin;
                    }
                }

                // Cache anchor for rapid +/- clicking or keyboard bursts
                if (focalDate) {
                    this._zoomAnchorDate = new Date(focalDate);
                    this._zoomAnchorOffset = focalOffset;
                }
            }

            if (this._zoomResetTimer) {
                clearTimeout(this._zoomResetTimer);
            }
            this._zoomResetTimer = setTimeout(() => {
                this._zoomAnchorDate = null;
                this._zoomAnchorOffset = null;
                this._zoomResetTimer = null;
            }, 600);

            if (!focalDate) {
                focalDate = new Date();
                focalOffset = leftMargin;
            }
            if (focalOffset === null) {
                focalOffset = leftMargin;
            }

            // 4. Apply the new zoom level and reconfigure scale & range
            this.state.zoomLevel = level;
            this.applyScaleConfig();

            // Seamless transition of task visual grid coordinates across all zoom levels (10% to 600%)
            if (g.eachTask) {
                g.eachTask((t) => {
                    if (t.work_start_date && t.work_end_date) {
                        const { gridStart, gridEnd } = workDatesToVisualGrid(t.work_start_date, t.work_end_date, level);
                        t.start_date = gridStart;
                        t.end_date = gridEnd;
                        if (t._established_work_start && t._established_work_end) {
                            const estGrid = workDatesToVisualGrid(t._established_work_start, t._established_work_end, level);
                            t._established_start = estGrid.gridStart;
                            t._established_end = estGrid.gridEnd;
                        } else {
                            t._established_start = new Date(gridStart);
                            t._established_end = new Date(gridEnd);
                        }
                        g.updateTask(t.id);
                    }
                });
            }

            this.ensureTimelineRange(
                (itemSpan && itemSpan.minStart) ? itemSpan.minStart : focalDate,
                (itemSpan && itemSpan.maxEnd) ? itemSpan.maxEnd : focalDate
            );
            g.render();

            // 5. Keep the viewport anchored on focalDate at focalOffset without jumping
            const applyScroll = () => {
                if (!g.scrollTo) return;
                const curVisWidth = this.getTimelineVisibleWidth();

                if (itemSpan && itemSpan.minStart && itemSpan.maxEnd) {
                    const sPx = this.safePosFromDate(itemSpan.minStart);
                    const ePx = this.safePosFromDate(itemSpan.maxEnd);
                    let finalY = targetScrollY;
                    if (itemSpan.targetId && g.isTaskExists(itemSpan.targetId) && typeof g.getTaskPosition === "function") {
                        const tObj = g.getTask(itemSpan.targetId);
                        const tPos = g.getTaskPosition(tObj);
                        if (tPos && tPos.top !== undefined) {
                            finalY = Math.max(0, tPos.top - 80);
                        }
                    }

                    if (sPx >= 0) {
                        // Align item starting from left side (~60px margin) so the item bar expands smoothly from left to right without jarring center jumping
                        const leftMargin = Math.min(80, Math.max(40, Math.round(curVisWidth * 0.06)));
                        const targetScrollX = Math.max(0, Math.round(sPx - leftMargin));
                        g.scrollTo(targetScrollX, finalY);
                        this.renderTodayMarker();
                        return;
                    } else if (focalDate && g.showDate) {
                        g.showDate(focalDate);
                        g.scrollTo(undefined, finalY);
                        this.renderTodayMarker();
                        return;
                    }
                }

                if (focalDate) {
                    const newPos = this.safePosFromDate(focalDate);
                    if (newPos >= 0) {
                        const targetScrollX = Math.max(0, Math.round(newPos - focalOffset));
                        g.scrollTo(targetScrollX, targetScrollY);
                    } else if (g.showDate) {
                        g.showDate(focalDate);
                    }
                }
                this.renderTodayMarker();
            };

            applyScroll();

            requestAnimationFrame(() => {
                applyScroll();
                setTimeout(() => {
                    applyScroll();
                    setTimeout(() => {
                        applyScroll();
                        this._isZooming = false;
                    }, 50);
                }, 50);
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
                setTimelineViewportWidth(taskContainer.clientWidth);
                return taskContainer.clientWidth;
            }
            const totalWidth = this.ganttElement.el.clientWidth;
            const gridWidth = (this.gantt && this.gantt.config && this.gantt.config.grid_width) || 440;
            if (totalWidth > gridWidth + 50) {
                setTimelineViewportWidth(totalWidth - gridWidth);
                return totalWidth - gridWidth;
            }
        }
        return 800;
    }

    /**
     * Centers the viewport directly on today's red line marker.
     */
    navigateToday(resetVerticalScroll = false) {
        if (!this.gantt) return;
        const g = this.gantt;
        const today = new Date();
        if (this.state.zoomLevel < 60) {
            today.setHours(12, 0, 0, 0);
        }

        this._zoomAnchorDate = null;
        this._zoomAnchorOffset = null;
        if (this._zoomResetTimer) {
            clearTimeout(this._zoomResetTimer);
            this._zoomResetTimer = null;
        }

        // Always ensure today is well within the timeline range with sufficient margin to view
        let todayPx = this.safePosFromDate(today);
        if (todayPx < 80) {
            this.ensureTimelineRange(today, today);
            g.render();
        }

        const scrollAndAlignLeft = () => {
            this.renderTodayMarker();
            const curVisWidth = this.getTimelineVisibleWidth();
            const curTodayPx = this.safePosFromDate(today);

            if (curTodayPx >= 0 && g.scrollTo) {
                // Position Today marker on the left side (~80px margin) so the user sees Today on the left and future timeline on the right
                const leftMargin = Math.min(80, Math.max(40, Math.round(curVisWidth * 0.08)));
                const targetX = Math.max(0, Math.round(curTodayPx - leftMargin));
                const scrollState = g.getScrollState ? g.getScrollState() : { y: 0 };
                const targetY = (resetVerticalScroll === true) ? 0 : scrollState.y;
                g.scrollTo(targetX, targetY);
            } else if (g.showDate) {
                g.showDate(today);
            }
        };

        scrollAndAlignLeft();
        requestAnimationFrame(() => {
            scrollAndAlignLeft();
            setTimeout(scrollAndAlignLeft, 50);
        });
    }

    /**
     * Resets the view to the default overview: 40% scale, all items collapsed (Suskleisti), centered on Today.
     */
    resetView() {
        if (!this.gantt) return;
        const g = this.gantt;
        this._isZooming = true;
        this._zoomAnchorDate = null;
        this._zoomAnchorOffset = null;
        if (this._zoomResetTimer) {
            clearTimeout(this._zoomResetTimer);
            this._zoomResetTimer = null;
        }

        try {
            if (g.unselectTask) {
                g.unselectTask();
            }
            this.state.zoomLevel = DEFAULT_OVERVIEW_ZOOM;
            this.applyScaleConfig();

            if (g.eachTask) {
                g.eachTask((task) => {
                    task.$open = false;
                    task.open = false;
                    if (task.work_start_date && task.work_end_date) {
                        const { gridStart, gridEnd } = workDatesToVisualGrid(
                            task.work_start_date,
                            task.work_end_date,
                            DEFAULT_OVERVIEW_ZOOM
                        );
                        task.start_date = gridStart;
                        task.end_date = gridEnd;
                        if (task._established_work_start && task._established_work_end) {
                            const estGrid = workDatesToVisualGrid(task._established_work_start, task._established_work_end, DEFAULT_OVERVIEW_ZOOM);
                            task._established_start = estGrid.gridStart;
                            task._established_end = estGrid.gridEnd;
                        } else {
                            task._established_start = new Date(gridStart);
                            task._established_end = new Date(gridEnd);
                        }
                    }
                });
            }

            const today = new Date();
            today.setHours(12, 0, 0, 0);
            this.ensureTimelineRange(today, today);
            g.render();
            this.navigateToday(true);
        } finally {
            setTimeout(() => {
                this._isZooming = false;
            }, 80);
        }
    }

    expandAll() {
        if (this.gantt) {
            this.gantt.eachTask((task) => {
                task.$open = true;
                task.open = true;
            });
            this.gantt.render();
        }
    }

    collapseAll() {
        if (this.gantt) {
            this.gantt.eachTask((task) => {
                task.$open = false;
                task.open = false;
            });
            this.gantt.render();
        }
    }

    /**
     * Fit selected sidebar item (project, milestone, task, or sub-subtask) to the timeline screen.
     * Calculates the item's true working span across candidate zoom levels (600% down to 10%)
     * and selects the highest zoom level where the bar fits comfortably inside ~65% of the viewport width,
     * centering horizontally on the item's bar and vertically on its row.
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

        if (!targetTask) {
            this.resetView();
            return;
        }

        let minWorkStart = parseWorkDateStr(targetTask.work_start_date) || new Date(targetTask.start_date);
        let maxWorkEnd = parseWorkDateStr(targetTask.work_end_date) || new Date(targetTask.end_date);
        let maxDeadlineEnd = null;

        if (targetTask.has_deadline_delay && targetTask.deadline_end) {
            const tdl = parseWorkDateStr(targetTask.deadline_end);
            if (tdl) maxDeadlineEnd = tdl;
        }

        // Encompass all descendants if targetTask is a project, milestone, or parent task
        const encompassDescendants = (parentId) => {
            const children = (typeof g.getChildren === "function" ? g.getChildren(parentId) : []) || [];
            for (const childId of children) {
                const child = g.getTask(childId);
                if (child) {
                    const cs = parseWorkDateStr(child.work_start_date) || (child.start_date ? new Date(child.start_date) : null);
                    const ce = parseWorkDateStr(child.work_end_date) || (child.end_date ? new Date(child.end_date) : null);
                    if (cs && (!minWorkStart || cs < minWorkStart)) minWorkStart = cs;
                    if (ce && (!maxWorkEnd || ce > maxWorkEnd)) maxWorkEnd = ce;
                    if (child.has_deadline_delay && child.deadline_end) {
                        const cdl = parseWorkDateStr(child.deadline_end);
                        if (cdl && (!maxDeadlineEnd || cdl > maxDeadlineEnd)) maxDeadlineEnd = cdl;
                    }
                    encompassDescendants(childId);
                }
            }
        };
        encompassDescendants(targetTask.id);

        if (!minWorkStart || !maxWorkEnd || isNaN(minWorkStart.getTime()) || isNaN(maxWorkEnd.getTime())) {
            return;
        }

        // Find the highest zoom level from ZOOM_STEPS where the item's visual bar fits within the visible viewport width
        const visibleWidth = this.getTimelineVisibleWidth();
        const targetMaxPx = Math.max(150, Math.min(visibleWidth - 100, Math.floor(visibleWidth * 0.88)));
        const candidateZooms = [...ZOOM_STEPS].reverse();
        let bestZoom = ZOOM_STEPS[0];

        for (const z of candidateZooms) {
            const { gridStart, gridEnd } = workDatesToVisualGrid(minWorkStart, maxWorkEnd, z);
            const effEnd = (maxDeadlineEnd && maxDeadlineEnd > gridEnd) ? maxDeadlineEnd : gridEnd;
            const spanDays = Math.max(0.01, (effEnd.getTime() - gridStart.getTime()) / 86400000.0);
            const pxPerDay = getZoomPxPerDay(z, visibleWidth);
            const estimatedPx = spanDays * pxPerDay;
            if (estimatedPx <= targetMaxPx) {
                bestZoom = z;
                break;
            }
        }

        const fittedGrid = workDatesToVisualGrid(minWorkStart, maxWorkEnd, bestZoom);
        const minStart = fittedGrid.gridStart;
        const maxEnd = (maxDeadlineEnd && maxDeadlineEnd > fittedGrid.gridEnd) ? maxDeadlineEnd : fittedGrid.gridEnd;

        let targetY = null;
        if (g.selectTask) g.selectTask(targetTask.id);
        const taskPos = (typeof g.getTaskPosition === "function") ? g.getTaskPosition(targetTask) : null;
        if (taskPos && taskPos.top !== undefined) {
            targetY = Math.max(0, taskPos.top - 80);
        }

        this._zoomAnchorDate = null;
        this._zoomAnchorOffset = null;
        if (this._zoomResetTimer) {
            clearTimeout(this._zoomResetTimer);
            this._zoomResetTimer = null;
        }
        this.setZoom(bestZoom, null, targetY, { minStart, maxEnd, targetId: targetTask.id });
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
            link.download = `GanntLT_${new Date().toISOString().slice(0, 10)}.png`;
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
        window.XLSX.utils.book_append_sheet(wb, ws, "GanntLT");
        window.XLSX.writeFile(wb, `GanntLT_${new Date().toISOString().slice(0, 10)}.xlsx`);
        this.notification.add(_t("Excel failas atsisiųstas"), { type: "success" });
    }
}

// Backward-compatibility alias
export const AllInOneTimelineAction = GanntLTAction;

// Register Client Action (both modern GanntLT tag and legacy alias)
registry.category("actions").add("gannt_lt.action", GanntLTAction);
registry.category("actions").add("all_in_one_timeline.action", GanntLTAction);

// Register Timeline View with GanntLT
export const GanntLTTimelineView = {
    type: "timeline",
    display_name: _t("GanntLT"),
    icon: "fa fa-tasks",
    multiRecord: true,
    Controller: GanntLTAction,
    props: (genericProps) => {
        return {
            ...genericProps,
        };
    },
};

export const AllInOneTimelineView = GanntLTTimelineView;

const viewsRegistry = registry.category("views");
const origViewsAdd = viewsRegistry.add.bind(viewsRegistry);

viewsRegistry.add = function (key, value, options = {}) {
    if (key === "timeline") {
        if (value === GanntLTTimelineView || value === AllInOneTimelineView) {
            return origViewsAdd(key, value, { ...options, force: true });
        }
        // Intercept any third-party timeline registration and ensure GanntLT remains active
        return this;
    }
    return origViewsAdd(key, value, options);
};

// Register GanntLT as the timeline view
viewsRegistry.add("timeline", GanntLTTimelineView, { force: true });
