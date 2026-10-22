# -*- coding: utf-8 -*-
import io
import json
import re
from datetime import datetime, date, timedelta, time
import xlsxwriter

from odoo import http, fields, _
from odoo.http import request, content_disposition
from odoo.addons.GanntLT.models.project_task import (
    get_lithuanian_holidays,
    calculate_lithuanian_working_hours,
)

LITHUANIAN_MONTHS = {
    1: "Sausis", 2: "Vasaris", 3: "Kovas", 4: "Balandis",
    5: "Gegužė", 6: "Birželis", 7: "Liepa", 8: "Rugpjūtis",
    9: "Rugsėjis", 10: "Spalis", 11: "Lapkritis", 12: "Gruodis",
}

LITHUANIAN_WEEKDAYS_SHORT = {
    0: "Pr", 1: "An", 2: "Tr", 3: "Kt", 4: "Pn", 5: "Št", 6: "Sk"
}


def parse_date_str(val):
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, date):
        return datetime.combine(val, time.min)
    val_str = str(val).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(val_str[:19], fmt)
        except (ValueError, TypeError):
            pass
    return None


def sanitize_sheet_name(name, existing_names):
    clean = re.sub(r'[\\/*?:\[\]]', '_', name or 'Projektas')[:31].strip()
    clean = clean.strip("'").strip()
    if not clean:
        clean = "Projektas"
    candidate = clean
    counter = 1
    while candidate.lower() in existing_names:
        suffix = f"_{counter}"
        candidate = clean[:31 - len(suffix)] + suffix
        counter += 1
    existing_names.add(candidate.lower())
    return candidate


def count_working_days(dt_start, dt_end, holidays_cache):
    if not dt_start or not dt_end:
        return 1
    d_s = dt_start.date() if isinstance(dt_start, datetime) else dt_start
    d_e = dt_end.date() if isinstance(dt_end, datetime) else dt_end
    if d_e < d_s:
        return 1
    curr = d_s
    work_days = 0
    while curr <= d_e:
        if curr.weekday() < 5 and curr not in holidays_cache.get(curr.year, set()):
            work_days += 1
        curr += timedelta(days=1)
    return max(1, work_days)


def get_task_depth(item, task_by_id):
    if item.get("is_project"):
        return 0
    p_key = item.get("parent")
    depth = 1
    visited = set()
    while p_key and p_key in task_by_id and p_key not in visited:
        visited.add(p_key)
        parent_item = task_by_id[p_key]
        if parent_item.get("is_project"):
            break
        depth += 1
        p_key = parent_item.get("parent")
    return min(depth, 7)


def create_workbook_formats(wb):
    return {
        "title": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 12,
            "font_color": "#0F172A",
            "bg_color": "#F8FAFC",
            "align": "left",
            "valign": "vcenter",
            "bottom": 2,
            "bottom_color": "#CBD5E1",
        }),
        "export_info": wb.add_format({
            "italic": True,
            "font_name": "Segoe UI",
            "font_size": 9,
            "font_color": "#64748B",
            "bg_color": "#F8FAFC",
            "align": "right",
            "valign": "vcenter",
            "bottom": 2,
            "bottom_color": "#CBD5E1",
        }),
        "sec_title": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 9.5,
            "font_color": "#334155",
            "bg_color": "#E2E8F0",
            "align": "left",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#CBD5E1",
        }),
        "month": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 9.5,
            "font_color": "#1E293B",
            "bg_color": "#E2E8F0",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#CBD5E1",
        }),
        "th": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 9.5,
            "font_color": "#FFFFFF",
            "bg_color": "#334155",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#1E293B",
        }),
        "day_w": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#1E293B",
            "bg_color": "#F1F5F9",
            "align": "center",
            "valign": "vcenter",
            "text_wrap": True,
            "border": 1,
            "border_color": "#CBD5E1",
        }),
        "day_nw": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#64748B",
            "bg_color": "#E2E8F0",
            "align": "center",
            "valign": "vcenter",
            "text_wrap": True,
            "border": 1,
            "border_color": "#CBD5E1",
        }),
        # Left Zone Data Formats
        "tree_project": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 10.5,
            "font_color": "#0F172A",
            "bg_color": "#F8FAFC",
            "align": "left",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#E2E8F0",
        }),
        "tree_milestone": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 10,
            "font_color": "#1E3A8A",
            "bg_color": "#EFF6FF",
            "align": "left",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#E2E8F0",
        }),
        "tree_task": wb.add_format({
            "bold": False,
            "font_name": "Segoe UI",
            "font_size": 9.5,
            "font_color": "#0F172A",
            "align": "left",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#E2E8F0",
        }),
        "tree_subtask": wb.add_format({
            "bold": False,
            "font_name": "Segoe UI",
            "font_size": 9,
            "font_color": "#334155",
            "align": "left",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#E2E8F0",
        }),
        "cell_text": wb.add_format({
            "font_name": "Segoe UI",
            "font_size": 9,
            "font_color": "#334155",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#E2E8F0",
        }),
        "cell_center": wb.add_format({
            "font_name": "Segoe UI",
            "font_size": 9,
            "font_color": "#334155",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#E2E8F0",
        }),
        # Status Badges
        "status_done": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#15803D",
            "bg_color": "#DCFCE7",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#86EFAC",
        }),
        "status_approved": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#065F46",
            "bg_color": "#D1FAE5",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#6EE7B7",
        }),
        "status_changes": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#92400E",
            "bg_color": "#FEF3C7",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#FCD34D",
        }),
        "status_canceled": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#991B1B",
            "bg_color": "#FEE2E2",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#FCA5A5",
        }),
        "status_locked": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#475569",
            "bg_color": "#E2E8F0",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#CBD5E1",
        }),
        "status_progress": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#5B21B6",
            "bg_color": "#EDE9FE",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#C4B5FD",
        }),
        # Deviation Badges
        "dev_delay": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#991B1B",
            "bg_color": "#FEE2E2",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#FCA5A5",
        }),
        "dev_early": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#15803D",
            "bg_color": "#DCFCE7",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#86EFAC",
        }),
        "dev_on_time": wb.add_format({
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#16A34A",
            "bg_color": "#F0FDF4",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#E2E8F0",
        }),
        # Right Zone Calendar Gantt Bar Formats
        "bar_project": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#FFFFFF",
            "bg_color": "#5F5285",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#473C65",
        }),
        "bar_milestone": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#FFFFFF",
            "bg_color": "#2563EB",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#1D4ED8",
        }),
        "bar_done": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#FFFFFF",
            "bg_color": "#16A34A",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#15803D",
        }),
        "bar_approved": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#FFFFFF",
            "bg_color": "#10B981",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#059669",
        }),
        "bar_changes": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#FFFFFF",
            "bg_color": "#F59E0B",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#D97706",
        }),
        "bar_canceled": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#FFFFFF",
            "bg_color": "#EF4444",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#DC2626",
        }),
        "bar_locked": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#FFFFFF",
            "bg_color": "#475569",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#334155",
        }),
        "bar_progress": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8.5,
            "font_color": "#FFFFFF",
            "bg_color": "#71639E",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#5F5285",
        }),
        "tail_delay": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8,
            "font_color": "#B91C1C",
            "bg_color": "#FEE2E2",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#EF4444",
        }),
        "tail_early": wb.add_format({
            "bold": True,
            "font_name": "Segoe UI",
            "font_size": 8,
            "font_color": "#15803D",
            "bg_color": "#DCFCE7",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#22C55E",
        }),
        "cell_w": wb.add_format({
            "bg_color": "#FFFFFF",
            "border": 1,
            "border_color": "#F1F5F9",
        }),
        "cell_nw": wb.add_format({
            "bg_color": "#F8FAFC",
            "border": 1,
            "border_color": "#E2E8F0",
        }),
    }


def render_project_sheet(wb, sheet_title, project_title, sheet_tasks, formats, holidays_cache):
    ws = wb.add_worksheet(sheet_title)
    ws.outline_settings(visible=True, symbols_below=False, symbols_right=False, auto_style=False)
    ws.freeze_panes(3, 10)

    # Set column widths for Left Zone (Columns A - J)
    ws.set_column(0, 0, 42)  # A: Užduotis / Medis
    ws.set_column(1, 1, 18)  # B: Atsakingas
    ws.set_column(2, 2, 14)  # C: Būsena
    ws.set_column(3, 3, 13)  # D: Pradžios data
    ws.set_column(4, 4, 13)  # E: Pabaigos data
    ws.set_column(5, 5, 11)  # F: Trukmė (d.)
    ws.set_column(6, 6, 13)  # G: Planuotos val.
    ws.set_column(7, 7, 13)  # H: Faktinės val.
    ws.set_column(8, 8, 12)  # I: Progresas
    ws.set_column(9, 9, 20)  # J: Nuokrypis / Terminas

    # Calculate calendar date bounds across all tasks
    all_dates = []
    for item in sheet_tasks:
        for k in ("work_start_date", "start_date", "work_end_date", "end_date", "date_deadline", "actual_finish_date"):
            d_val = parse_date_str(item.get(k))
            if d_val:
                all_dates.append(d_val.date())

    if all_dates:
        min_date = min(all_dates) - timedelta(days=2)
        max_date = max(all_dates) + timedelta(days=5)
    else:
        min_date = date.today() - timedelta(days=3)
        max_date = date.today() + timedelta(days=21)

    if (max_date - min_date).days < 14:
        max_date = min_date + timedelta(days=14)
    if (max_date - min_date).days > 1000:
        max_date = min_date + timedelta(days=1000)

    cal_days = []
    curr = min_date
    while curr <= max_date:
        cal_days.append(curr)
        curr += timedelta(days=1)

    last_col = 10 + len(cal_days) - 1
    ws.set_column(10, last_col, 3.8)

    # Pre-cache Lithuanian holidays for years in range
    for yr in range(min_date.year, max_date.year + 1):
        if yr not in holidays_cache:
            holidays_cache[yr] = get_lithuanian_holidays(yr)

    def is_nw(d):
        return d.weekday() >= 5 or (d in holidays_cache.get(d.year, set()))

    day_to_col = {d: 10 + idx for idx, d in enumerate(cal_days)}

    # Row heights
    ws.set_row(0, 24)
    ws.set_row(1, 20)
    ws.set_row(2, 26)

    # Row 0: Title and Export Timestamp
    ws.merge_range(0, 0, 0, 9, f"📁 PROJEKTAS: {project_title}", formats["title"])
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    export_label = f"Eksportuota: {now_str} | GanntLT 2.2"
    if 10 < last_col:
        ws.merge_range(0, 10, 0, last_col, export_label, formats["export_info"])
    else:
        ws.write(0, 10, export_label, formats["export_info"])

    # Row 1: Section Title & Merged Month Headers
    ws.merge_range(1, 0, 1, 9, "Hierarchinis projekto darbų medis", formats["sec_title"])
    curr_month = None
    m_start_col = 10
    for idx, d in enumerate(cal_days):
        col = 10 + idx
        m_key = (d.year, d.month)
        if curr_month is None:
            curr_month = m_key
            m_start_col = col
        elif curr_month != m_key:
            m_text = f"{curr_month[0]} m. {LITHUANIAN_MONTHS.get(curr_month[1], '')}"
            if m_start_col < col - 1:
                ws.merge_range(1, m_start_col, 1, col - 1, m_text, formats["month"])
            else:
                ws.write(1, m_start_col, m_text, formats["month"])
            curr_month = m_key
            m_start_col = col
    if curr_month is not None:
        m_text = f"{curr_month[0]} m. {LITHUANIAN_MONTHS.get(curr_month[1], '')}"
        if m_start_col < last_col:
            ws.merge_range(1, m_start_col, 1, last_col, m_text, formats["month"])
        else:
            ws.write(1, m_start_col, m_text, formats["month"])

    # Row 2: Table Column Headers & Day Columns
    headers = [
        "Užduotis / Medis",
        "Atsakingas",
        "Būsena",
        "Pradžios data",
        "Pabaigos data",
        "Trukmė (d.)",
        "Planuotos val.",
        "Faktinės val.",
        "Progresas",
        "Nuokrypis / Terminas",
    ]
    for c, h in enumerate(headers):
        ws.write(2, c, h, formats["th"])

    for idx, d in enumerate(cal_days):
        col = 10 + idx
        d_str = f"{d.day:02d}\n{LITHUANIAN_WEEKDAYS_SHORT[d.weekday()]}"
        ws.write(2, col, d_str, formats["day_nw"] if is_nw(d) else formats["day_w"])

    # Row 3 onwards: Data Rows
    task_by_id = {t["id"]: t for t in sheet_tasks}

    for i, item in enumerate(sheet_tasks):
        row_idx = 3 + i
        depth = get_task_depth(item, task_by_id)
        ws.set_row(row_idx, 20, None, {"level": depth})

        # 1. Left Zone Content
        text = item.get("text") or "Užduotis"
        p_key = item.get("parent")
        parent_item = task_by_id.get(p_key) if p_key else None
        is_subtask_of_task = bool(parent_item and not parent_item.get("is_project") and not parent_item.get("is_milestone"))

        if item.get("is_project"):
            tree_text = f"📁 {text}"
            tree_fmt = formats["tree_project"]
        elif item.get("is_milestone"):
            tree_text = f"    🚩 {text}"
            tree_fmt = formats["tree_milestone"]
        else:
            if not is_subtask_of_task:
                # Top-level task under project or milestone
                indent = "    " * max(1, depth)
                tree_text = f"{indent}{text}"
                tree_fmt = formats["tree_task"]
            else:
                # Subtask under another task
                indent = "    " * max(2, depth)
                tree_text = f"{indent}↳ {text}"
                tree_fmt = formats["tree_subtask"]

        ws.write(row_idx, 0, tree_text, tree_fmt)
        ws.write(row_idx, 1, item.get("assignees") or "", formats["cell_text"])

        # Status badge
        state = item.get("state", "")
        is_done = bool(item.get("is_done"))
        stage_name = item.get("stage_name") or ""
        if is_done or state == "1_done":
            ws.write(row_idx, 2, "Atlikta", formats["status_done"])
        elif state == "03_approved":
            ws.write(row_idx, 2, "Patvirtinta", formats["status_approved"])
        elif state == "02_changes_requested":
            ws.write(row_idx, 2, "Koreguoti", formats["status_changes"])
        elif state == "1_canceled":
            ws.write(row_idx, 2, "Atšaukta", formats["status_canceled"])
        elif state == "locked":
            ws.write(row_idx, 2, "Blokuota", formats["status_locked"])
        else:
            ws.write(row_idx, 2, stage_name or "Vykdoma", formats["status_progress"])

        # Planned dates
        dt_s = parse_date_str(item.get("work_start_date") or item.get("start_date"))
        dt_e = parse_date_str(item.get("work_end_date") or item.get("end_date"))
        ws.write(row_idx, 3, dt_s.strftime("%Y-%m-%d") if dt_s else "", formats["cell_center"])
        ws.write(row_idx, 4, dt_e.strftime("%Y-%m-%d") if dt_e else "", formats["cell_center"])

        # Duration days (working days)
        duration = item.get("duration")
        if duration is not None and duration > 0 and not (dt_s and dt_e):
            dur_days = int(duration)
        elif dt_s and dt_e:
            dur_days = count_working_days(dt_s, dt_e, holidays_cache)
        else:
            dur_days = 1
        ws.write(row_idx, 5, dur_days, formats["cell_center"])

        # Hours
        alloc_h = item.get("allocated_hours")
        if not alloc_h and dt_s and dt_e:
            w_h = calculate_lithuanian_working_hours(dt_s, dt_e)
            if w_h > 0:
                alloc_h = f"{round(w_h, 1)}h"
        ws.write(row_idx, 6, alloc_h or "", formats["cell_center"])
        ws.write(row_idx, 7, item.get("effective_hours") or "", formats["cell_center"])

        # Progress
        prog_pct = item.get("progress_percent")
        if prog_pct is None:
            prog_val = item.get("progress") or 0.0
            prog_pct = round(prog_val * 100)
        else:
            prog_pct = round(float(prog_pct))
        ws.write(row_idx, 8, f"{int(prog_pct)}%", formats["cell_center"])

        # Delay / Early Deviation
        has_delay = bool(item.get("has_deadline_delay"))
        delay_days = int(item.get("delay_days") or 0)
        delay_hours = float(item.get("delay_hours") or 0.0)

        has_early = bool(item.get("has_early_finish"))
        early_days = int(item.get("early_days") or 0)
        early_hours = float(item.get("early_hours") or 0.0)

        if has_delay:
            dev_str = f"+{delay_days} d. Vėlavimas" if delay_days > 0 else (f"+{delay_hours}h Vėlavimas" if delay_hours > 0 else "Vėlavimas")
            ws.write(row_idx, 9, dev_str, formats["dev_delay"])
        elif has_early:
            dev_str = f"-{early_days} d. Anksčiau" if early_days > 0 else (f"-{early_hours}h Anksčiau" if early_hours > 0 else "Anksčiau")
            ws.write(row_idx, 9, dev_str, formats["dev_early"])
        elif is_done:
            ws.write(row_idx, 9, "Laiku", formats["dev_on_time"])
        else:
            ws.write(row_idx, 9, "", formats["cell_center"])

        # 2. Right Zone: Gantt Bar and Tails
        bar_start_d = dt_s.date() if dt_s else None
        bar_end_d = dt_e.date() if dt_e else None
        if bar_start_d and bar_end_d and bar_end_d < bar_start_d:
            bar_end_d = bar_start_d

        early_tail_s = None
        early_tail_e = None
        if has_early and bar_start_d and bar_end_d:
            act_f = parse_date_str(item.get("actual_finish_date"))
            if act_f and act_f.date() <= bar_end_d:
                if act_f.date() < bar_start_d:
                    bar_start_d = act_f.date()
                early_tail_s = max(act_f.date() + timedelta(days=1), min_date)
                early_tail_e = min(bar_end_d, max_date)
                bar_end_d = act_f.date()

        delay_tail_s = None
        delay_tail_e = None
        if has_delay and bar_end_d:
            dl = parse_date_str(item.get("date_deadline"))
            if dl and dl.date() > bar_end_d:
                delay_tail_s = max(bar_end_d + timedelta(days=1), min_date)
                delay_tail_e = min(dl.date(), max_date)

        bar_cols = set()
        if bar_start_d and bar_end_d:
            eff_s = max(bar_start_d, min_date)
            eff_e = min(bar_end_d, max_date)
            if eff_s <= eff_e:
                c1 = day_to_col[eff_s]
                c2 = day_to_col[eff_e]
                bar_cols = set(range(c1, c2 + 1))

        early_cols = set()
        if early_tail_s and early_tail_e and early_tail_s <= early_tail_e:
            c1 = day_to_col.get(early_tail_s)
            c2 = day_to_col.get(early_tail_e)
            if c1 is not None and c2 is not None and c1 <= c2:
                early_cols = set(range(c1, c2 + 1))

        delay_cols = set()
        if delay_tail_s and delay_tail_e and delay_tail_s <= delay_tail_e:
            c1 = day_to_col.get(delay_tail_s)
            c2 = day_to_col.get(delay_tail_e)
            if c1 is not None and c2 is not None and c1 <= c2:
                delay_cols = set(range(c1, c2 + 1))

        occupied = bar_cols | early_cols | delay_cols

        # Non-bar cells: weekend/holiday or working day grid
        for d in cal_days:
            col = day_to_col[d]
            if col not in occupied:
                ws.write_blank(row_idx, col, formats["cell_nw"] if is_nw(d) else formats["cell_w"])

        # Main Task Bar
        if bar_cols:
            b_start = min(bar_cols)
            b_end = max(bar_cols)
            if item.get("is_project"):
                b_fmt = formats["bar_project"]
            elif item.get("is_milestone"):
                b_fmt = formats["bar_milestone"]
            elif is_done or state == "1_done":
                b_fmt = formats["bar_done"]
            elif state == "03_approved":
                b_fmt = formats["bar_approved"]
            elif state == "02_changes_requested":
                b_fmt = formats["bar_changes"]
            elif state == "1_canceled":
                b_fmt = formats["bar_canceled"]
            elif state == "locked":
                b_fmt = formats["bar_locked"]
            else:
                b_fmt = formats["bar_progress"]

            bar_label = f"{int(prog_pct)}%" if prog_pct > 0 else ""
            if b_start < b_end:
                ws.merge_range(row_idx, b_start, row_idx, b_end, bar_label, b_fmt)
            else:
                ws.write(row_idx, b_start, bar_label, b_fmt)

        # Early Finish Tail
        if early_cols:
            et_start = min(early_cols)
            et_end = max(early_cols)
            et_label = f"-{early_days} d." if early_days > 0 else "- Anksčiau"
            if et_start < et_end:
                ws.merge_range(row_idx, et_start, row_idx, et_end, et_label, formats["tail_early"])
            else:
                ws.write(row_idx, et_start, et_label, formats["tail_early"])

        # Delay Tail
        if delay_cols:
            dt_start = min(delay_cols)
            dt_end = max(delay_cols)
            dt_label = f"+{delay_days} d." if delay_days > 0 else "+ Vėlavimas"
            if dt_start < dt_end:
                ws.merge_range(row_idx, dt_start, row_idx, dt_end, dt_label, formats["tail_delay"])
            else:
                ws.write(row_idx, dt_start, dt_label, formats["tail_delay"])


def partition_tasks_by_project(tasks):
    if not tasks:
        return [("Tvarkarastis", "Tvarkarastis", [])]

    project_keys = [t["id"] for t in tasks if t.get("is_project")]
    if len(project_keys) <= 1:
        proj_name = ""
        for t in tasks:
            if t.get("is_project") and t.get("text"):
                proj_name = t["text"]
                break
            if t.get("project_name"):
                proj_name = t["project_name"]
                break
        if not proj_name:
            proj_name = "Projektas"
        return [(proj_name, proj_name, tasks)]

    task_by_id = {t["id"]: t for t in tasks}

    def get_root_proj_id(t):
        curr = t
        visited = set()
        while curr and curr["id"] not in visited:
            visited.add(curr["id"])
            if curr.get("is_project"):
                return curr["id"]
            p_key = curr.get("parent")
            curr = task_by_id.get(p_key)
        return None

    groups = {}
    other_tasks = []
    for t in tasks:
        r_id = get_root_proj_id(t)
        if r_id:
            groups.setdefault(r_id, []).append(t)
        else:
            other_tasks.append(t)

    result = []
    for p_id in project_keys:
        p_tasks = groups.get(p_id, [])
        p_row = task_by_id.get(p_id, {})
        p_name = p_row.get("text") or "Projektas"
        result.append((p_name, p_name, p_tasks))

    if other_tasks:
        result.append(("Kiti darbai", "Kiti darbai", other_tasks))

    return result


class GanntLTExportController(http.Controller):

    @http.route("/gannt_lt/export_excel", type="http", auth="user", methods=["POST"], csrf=False)
    def export_excel(self, **post):
        raw_data = post.get("data")
        params = {}
        if raw_data:
            try:
                params = json.loads(raw_data)
            except Exception:
                params = {}
        if not params:
            params = post

        raw_proj_id = params.get("project_id")
        only_overdue = bool(params.get("only_overdue") or raw_proj_id == "overdue")
        project_id = 0
        if raw_proj_id and raw_proj_id != "overdue":
            try:
                project_id = int(raw_proj_id)
            except (ValueError, TypeError):
                project_id = 0

        domain = params.get("domain", [])
        if isinstance(domain, str):
            try:
                domain = json.loads(domain)
            except Exception:
                domain = []
        if not isinstance(domain, list):
            domain = []

        timeline_data = request.env["project.task"].get_all_in_one_timeline_data(
            project_id=project_id if project_id > 0 else None,
            only_overdue=only_overdue,
            domain=domain,
        )
        tasks = timeline_data.get("tasks", [])

        # Determine primary project name for filename
        project_name = ""
        if only_overdue:
            project_name = "Veluojantys_projektai"
        elif project_id > 0:
            proj_rec = request.env["project.project"].browse(project_id).exists()
            if proj_rec:
                project_name = proj_rec.name
        if not project_name and tasks:
            for t in tasks:
                if t.get("is_project") and t.get("text"):
                    project_name = t["text"]
                    break
                if t.get("project_name"):
                    project_name = t["project_name"]
                    break
        if not project_name:
            project_name = "Projektu_tvarkarastis"

        # Generate Excel in-memory
        output = io.BytesIO()
        wb = xlsxwriter.Workbook(output, {"in_memory": True})
        formats = create_workbook_formats(wb)
        holidays_cache = {}
        existing_sheet_names = set()

        sheets_data = partition_tasks_by_project(tasks)
        for p_title, s_title, p_tasks in sheets_data:
            sheet_name = sanitize_sheet_name(s_title, existing_sheet_names)
            render_project_sheet(wb, sheet_name, p_title, p_tasks, formats, holidays_cache)

        wb.close()
        xlsx_data = output.getvalue()

        safe_proj_name = re.sub(r'[\\/*?:"<>| ]+', "_", project_name).strip("_")
        today_str = fields.Date.today().strftime("%Y-%m-%d")
        filename = f"{safe_proj_name}_Tvarkarastis_{today_str}.xlsx"

        return request.make_response(
            xlsx_data,
            headers=[
                ("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                ("Content-Disposition", content_disposition(filename)),
            ],
        )
