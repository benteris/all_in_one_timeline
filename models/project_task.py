from datetime import datetime, timedelta, time, date
from odoo import api, fields, models, _
from odoo.exceptions import ValidationError, AccessError
from odoo.tools.sql import column_exists, create_column
from odoo.tools.misc import format_datetime
from markupsafe import Markup
import logging
import math
import pytz

_logger = logging.getLogger(__name__)


def floor_minute(dt):
    """Drops seconds/microseconds (15:00:43 -> 15:00:00)."""
    return dt.replace(second=0, microsecond=0) if isinstance(dt, datetime) else dt


def ceil_minutes_between(start, end):
    """
    Whole minutes between two datetimes, always rounded UP and never less than 1:
    15 min 43 s -> 16 min, 15 s -> 1 min.
    """
    seconds = max(0.0, (end - start).total_seconds())
    return max(1, int(math.ceil(seconds / 60.0 - 1e-9)))


def format_duration_minutes(total_min):
    """Human duration from minutes: '16 min', '1 val. 5 min', '2 d. 3 val.'"""
    total_min = int(max(0, round(total_min)))
    if total_min < 60:
        return f"{total_min} min"
    days, rem = divmod(total_min, 1440)
    hours, mins = divmod(rem, 60)
    parts = []
    if days:
        parts.append(f"{days} d.")
    if hours:
        parts.append(f"{hours} val.")
    if mins and not days:
        parts.append(f"{mins} min")
    return " ".join(parts) or "0 min"


def format_hours_label(hours):
    """Compact label for allocated hours: '16 min', '8h', '1h 30min' (instead of '0.1h')."""
    if not hours or hours <= 0:
        return ""
    total_min = max(1, int(round(hours * 60)))
    if total_min < 60:
        return f"{total_min} min"
    h, m = divmod(total_min, 60)
    return f"{h}h" if m == 0 else f"{h}h {m}min"


def get_user_tz(env):
    """Returns the user's active pytz timezone (defaults to Europe/Vilnius)."""
    tz_name = env.user.tz or env.context.get("tz") or "Europe/Vilnius"
    try:
        return pytz.timezone(tz_name)
    except Exception:
        return pytz.timezone("Europe/Vilnius")


def utc_to_local_dt(env, dt):
    """
    Converts a naive UTC datetime (stored in Odoo PostgreSQL) into a naive datetime
    in the user's active timezone (e.g. Europe/Vilnius), so dates match the Odoo Form View 100%.
    """
    if not dt:
        return dt
    if not isinstance(dt, datetime):
        return dt
    user_tz = get_user_tz(env)
    utc_dt = pytz.utc.localize(dt) if dt.tzinfo is None else dt.astimezone(pytz.utc)
    return utc_dt.astimezone(user_tz).replace(tzinfo=None)


def local_to_utc_dt(env, dt):
    """
    Converts a naive datetime in the user's local timezone (from Timeline UI)
    to a naive UTC datetime for Odoo PostgreSQL storage, so the Odoo Form View displays the exact same date & time.
    """
    if not dt:
        return dt
    if not isinstance(dt, datetime):
        return dt
    user_tz = get_user_tz(env)
    local_dt = user_tz.localize(dt, is_dst=None) if dt.tzinfo is None else dt.astimezone(user_tz)
    return local_dt.astimezone(pytz.utc).replace(tzinfo=None)


def format_user_datetime(env, dt, dt_format="yyyy-MM-dd HH:mm:ss"):
    """
    Formats a UTC datetime into a localized string matching the user's active timezone.
    Falls back to 'Europe/Vilnius' or UTC if no user timezone is set.
    """
    if not dt:
        return ""
    tz = env.user.tz or env.context.get("tz") or "Europe/Vilnius"
    try:
        return format_datetime(env, dt, tz=tz, dt_format=dt_format)
    except Exception:
        return dt.strftime("%Y-%m-%d %H:%M:%S")


def get_lithuanian_holidays(year):
    """
    Returns a set of date objects representing Lithuanian national public holidays for the given year.
    Covers all fixed annual holidays plus movable Easter Sunday and Easter Monday.
    """
    fixed = {
        (1, 1),    # Naujieji metai
        (2, 16),   # Lietuvos valstybės atkūrimo diena
        (3, 11),   # Lietuvos nepriklausomybės atkūrimo diena
        (5, 1),    # Tarptautinė darbo diena
        (6, 24),   # Rasos ir Joninių diena
        (7, 6),    # Valstybės diena
        (8, 15),   # Žolinė
        (11, 1),   # Visų Šventųjų diena
        (11, 2),   # Vėlinių diena
        (12, 24),  # Kūčių diena
        (12, 25),  # Kalėdų pirmoji diena
        (12, 26),  # Kalėdų antroji diena
    }
    # Movable Easter (Gregorian Computus)
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    easter_month = (h + l - 7 * m + 114) // 31
    easter_day = ((h + l - 7 * m + 114) % 31) + 1
    easter_sunday = date(year, easter_month, easter_day)
    easter_monday = easter_sunday + timedelta(days=1)

    holidays = {date(year, mo, d) for (mo, d) in fixed}
    holidays.add(easter_sunday)
    holidays.add(easter_monday)
    return holidays


def calculate_lithuanian_working_hours(start_dt, end_dt):
    """
    Calculates actual working hours excluding weekends (Saturday, Sunday)
    and Lithuanian national public holidays.
    - If dates represent standard full work days (08:00 - 17:00 or date-only boundaries),
      counts 8 hours per full working day.
    - If dates have specific intra-day hours (e.g. 10:00 - 14:00),
      calculates the actual working hours within business working window (08:00 - 17:00).
    """
    if not start_dt or not end_dt:
        return 0.0

    s_dt = start_dt if isinstance(start_dt, datetime) else datetime.combine(start_dt, time(8, 0, 0))
    if isinstance(end_dt, datetime):
        if (end_dt.hour == 0 and end_dt.minute == 0 and end_dt.second == 0) or (end_dt.hour == 23 and end_dt.minute == 59):
            e_dt = datetime.combine(end_dt.date(), time(17, 0, 0))
        else:
            e_dt = end_dt
    else:
        e_dt = datetime.combine(end_dt, time(17, 0, 0))

    if e_dt < s_dt:
        return 0.0

    holidays = get_lithuanian_holidays(s_dt.year)
    if e_dt.year != s_dt.year:
        holidays.update(get_lithuanian_holidays(e_dt.year))

    total_hours = 0.0
    curr_date = s_dt.date()
    is_single_day = (s_dt.date() == e_dt.date())
    is_full_day_std = (s_dt.hour == 8 and s_dt.minute == 0 and e_dt.hour == 17 and e_dt.minute == 0) or (s_dt.hour == 0 and e_dt.hour == 0)

    while curr_date <= e_dt.date():
        if curr_date.weekday() < 5 and curr_date not in holidays:
            day_work_start = datetime.combine(curr_date, time(8, 0, 0))
            day_work_end = datetime.combine(curr_date, time(17, 0, 0))

            if is_single_day:
                if is_full_day_std or (s_dt <= day_work_start and e_dt >= day_work_end):
                    total_hours += 8.0
                else:
                    act_start = max(s_dt, day_work_start)
                    act_end = min(e_dt, day_work_end)
                    if act_end > act_start:
                        h = (act_end - act_start).total_seconds() / 3600.0
                        total_hours += (8.0 if h >= 8.9 else round(h, 2))
            elif curr_date == s_dt.date():
                if s_dt <= day_work_start:
                    total_hours += 8.0
                else:
                    act_start = max(s_dt, day_work_start)
                    if day_work_end > act_start:
                        h = (day_work_end - act_start).total_seconds() / 3600.0
                        total_hours += round(min(8.0, h), 2)
            elif curr_date == e_dt.date():
                if e_dt >= day_work_end:
                    total_hours += 8.0
                else:
                    act_end = min(e_dt, day_work_end)
                    if act_end > day_work_start:
                        h = (act_end - day_work_start).total_seconds() / 3600.0
                        total_hours += round(min(8.0, h), 2)
            else:
                total_hours += 8.0

        curr_date += timedelta(days=1)

    return float(total_hours)


class ProjectTask(models.Model):
    _inherit = "project.task"

    planned_date_start = fields.Datetime(
        string="Planuota pradžia / Planned Start Date",
        compute="_compute_planned_date_start",
        store=True,
        readonly=False,
        precompute=True,
        recursive=True,
        copy=False,
    )
    planned_date_end = fields.Datetime(
        string="Planuota pabaiga / Planned End Date",
        compute="_compute_planned_date_end",
        store=True,
        readonly=False,
        precompute=True,
        recursive=True,
        copy=False,
    )
    plan_is_auto = fields.Boolean(
        string="Automatinis planas / Auto plan",
        copy=False,
        default=False,
        help="Planned dates were derived by the system (timer actual work, or the span of subtasks) "
             "instead of being typed by a user. Such a plan follows the real work and never shows a red tail.",
    )
    deadline_is_auto = fields.Boolean(
        string="Automatinis terminas / Auto deadline",
        copy=False,
        default=False,
        help="The deadline was written by the system because work went past the planned end. "
             "The system may update or clear it; a user typed deadline is never erased.",
    )

    @api.depends("parent_id", "parent_id.planned_date_start")
    def _compute_planned_date_start(self):
        """Default planned_date_start to parent task if not already set."""
        for record in self.filtered(lambda x: not x.planned_date_start):
            if record.parent_id and record.parent_id.planned_date_start:
                record.planned_date_start = record.parent_id.planned_date_start

    @api.depends("parent_id", "parent_id.planned_date_end")
    def _compute_planned_date_end(self):
        """Default planned_date_end to parent task if not already set."""
        for record in self.filtered(lambda x: not x.planned_date_end):
            if record.parent_id and record.parent_id.planned_date_end:
                record.planned_date_end = record.parent_id.planned_date_end

    @api.constrains("planned_date_start", "planned_date_end")
    def _check_planned_dates(self):
        for task in self:
            if task.planned_date_start and task.planned_date_end:
                if task.planned_date_end < task.planned_date_start:
                    raise ValidationError(
                        self.env._("Pabaigos data negali būti ankstesnė už pradžios datą. (The end date must be after the start date.)")
                    )

    def _check_gannt_lt_edit_access(self):
        """
        Verifies that the current user has 'GanntLT: Can Edit' (group_gannt_lt_manager) or System Admin rights.
        Users with 'Can View' (group_gannt_lt_user) can view the timeline but cannot modify it.
        """
        if self.env.is_superuser() or self.env.user.has_group("base.group_system") or self.env.user.has_group("GanntLT.group_gannt_lt_manager"):
            return True
        raise AccessError(
            _("Jūs turite tik „GanntLT: Can View“ (peržiūros) teises. Laiko juostos redagavimas leidžiamas tik vartotojams, turintiems „Can Edit“ teises.")
        )

    def _auto_init(self):
        cr = self.env.cr
        first_install = not column_exists(cr, "project_task", "planned_date_end")
        if not column_exists(cr, "project_task", "planned_date_start"):
            create_column(cr, "project_task", "planned_date_start", "timestamp")
            cr.execute("""
                UPDATE project_task
                SET planned_date_start = COALESCE(date_assign, create_date)
                WHERE planned_date_start IS NULL
            """)
        if not column_exists(cr, "project_task", "planned_date_end"):
            create_column(cr, "project_task", "planned_date_end", "timestamp")
            cr.execute("""
                UPDATE project_task
                SET planned_date_end = COALESCE(date_end, date_deadline)
                WHERE planned_date_end IS NULL
                AND COALESCE(planned_date_start, date_end, date_deadline) <= COALESCE(date_end, date_deadline)
            """)
        if first_install:
            # One-time initial sync of parent task spans to their subtasks. Must NOT run on every
            # upgrade, otherwise it would overwrite parent dates that users set deliberately.
            cr.execute("""
                UPDATE project_task p
                SET planned_date_end = sub.max_end,
                    planned_date_start = sub.min_start
                FROM (
                    SELECT parent_id,
                           MIN(planned_date_start) AS min_start,
                           MAX(planned_date_end) AS max_end
                    FROM project_task
                    WHERE parent_id IS NOT NULL AND active = TRUE
                      AND planned_date_start IS NOT NULL AND planned_date_end IS NOT NULL
                    GROUP BY parent_id
                ) sub
                WHERE p.id = sub.parent_id
                  AND (p.planned_date_end IS DISTINCT FROM sub.max_end OR p.planned_date_start IS DISTINCT FROM sub.min_start)
            """)
        # NOTE: date_deadline is user data and must never be wiped automatically.
        flags_new = not column_exists(cr, "project_task", "plan_is_auto")
        res = super()._auto_init()
        if flags_new:
            # One-time: parents that were previously synced to the exact span of their subtasks are 'auto plan'.
            cr.execute("""
                UPDATE project_task p
                SET plan_is_auto = TRUE
                FROM (
                    SELECT parent_id, MIN(planned_date_start) AS min_start, MAX(planned_date_end) AS max_end
                    FROM project_task
                    WHERE parent_id IS NOT NULL AND active = TRUE
                      AND planned_date_start IS NOT NULL AND planned_date_end IS NOT NULL
                    GROUP BY parent_id
                ) sub
                WHERE p.id = sub.parent_id
                  AND p.planned_date_start = sub.min_start
                  AND p.planned_date_end = sub.max_end
            """)
        # Ensure any subtasks in DB without planned dates inherit from their parent task
        cr.execute("""
            UPDATE project_task c
            SET planned_date_start = p.planned_date_start,
                planned_date_end = p.planned_date_end,
                plan_is_auto = FALSE
            FROM project_task p
            WHERE c.parent_id = p.id
              AND c.active = TRUE
              AND c.planned_date_start IS NULL
              AND c.planned_date_end IS NULL
              AND p.planned_date_start IS NOT NULL
              AND p.planned_date_end IS NOT NULL;
        """)

        # Clean up stale auto-deadlines where no children overflow planned_date_end, no timer ran, and task is not finished
        cr.execute("""
            UPDATE project_task
            SET date_deadline = NULL,
                deadline_is_auto = FALSE
            WHERE deadline_is_auto = TRUE
              AND (first_timer_start IS NULL)
              AND (state IS NULL OR state NOT IN ('03_approved', '1_done', '02_changes_requested'))
              AND planned_date_end IS NOT NULL
              AND (
                NOT EXISTS (
                  SELECT 1 FROM project_task child
                  WHERE child.parent_id = project_task.id
                    AND child.active = TRUE
                    AND COALESCE(child.date_deadline, child.planned_date_end) > project_task.planned_date_end
                )
              );
        """)
        return res

    timer_start = fields.Datetime("Laikmačio pradžia / Timer Start", readonly=True, copy=False)
    first_timer_start = fields.Datetime("Pirmo starto laikas / First Timer Start", readonly=True, copy=False)
    is_timer_running = fields.Boolean("Laikmatis veikia / Timer Running", default=False, readonly=True, copy=False)
    timer_total_seconds = fields.Integer("Laikmačio sekundės / Timer Total Seconds", default=0, readonly=True, copy=False)
    timer_display_seconds = fields.Integer("Rodyti sekundes / Display Seconds", compute="_compute_timer_display_seconds")

    @api.depends("timer_start", "is_timer_running", "timer_total_seconds", "effective_hours")
    def _compute_timer_display_seconds(self):
        now = fields.Datetime.now()
        for task in self:
            eff_sec = int(round((task.effective_hours or 0.0) * 3600))
            base_sec = max(task.timer_total_seconds or 0, eff_sec)
            if task.is_timer_running and task.timer_start:
                diff_sec = max(0, int((now - task.timer_start).total_seconds()))
                task.timer_display_seconds = base_sec + diff_sec
            else:
                task.timer_display_seconds = base_sec

    def _ensure_inherited_plan(self):
        """
        Ensures any subtask/sub-subtask without its own planned dates inherits from its nearest
        scheduled ancestor with plan_is_auto=False so work timer / completion compares against
        the inherited schedule and creates a red tail on overrun.
        """
        for rec in self:
            if not rec.parent_id:
                continue
            if not rec.planned_date_start or not rec.planned_date_end:
                anc = rec.parent_id
                while anc:
                    if anc.planned_date_start and anc.planned_date_end:
                        rec.with_context(skip_hierarchy_propagation=True, gannt_auto_plan=True, mail_notrack=True).sudo().write({
                            "planned_date_start": anc.planned_date_start,
                            "planned_date_end": anc.planned_date_end,
                            "plan_is_auto": False,
                        })
                        break
                    anc = anc.parent_id

    def action_timer_start(self):
        self.ensure_one()
        if self.is_timer_running or self.state in ("03_approved", "1_done", "1_canceled"):
            return False
        self._ensure_inherited_plan()
        now = fields.Datetime.now()
        eff_sec = int(round((self.effective_hours or 0.0) * 3600))
        vals = {
            "timer_start": now,
            "is_timer_running": True,
        }
        # Record first start time of work if not already recorded
        if not self.first_timer_start:
            vals["first_timer_start"] = now

        # Keep timer_total_seconds synced with timesheets if uninitialized
        if (not self.timer_total_seconds or self.timer_total_seconds < eff_sec) and eff_sec > 0:
            vals["timer_total_seconds"] = eff_sec

        # R1: no established plan -> the plan is derived from the real work (start = first timer start).
        # An established plan (typed by a user or inherited from a scheduled parent) is NEVER moved by the timer.
        has_established_plan = bool(self.planned_date_start and self.planned_date_end) and (
            not self.plan_is_auto or bool(self.child_ids)
        )
        if not has_established_plan:
            start_f = floor_minute(vals.get("first_timer_start") or self.first_timer_start or now)
            vals["planned_date_start"] = start_f
            vals["plan_is_auto"] = True
            if self.planned_date_end and self.planned_date_end < start_f:
                vals["planned_date_end"] = False  # stale end of an old auto plan; rewritten on Pause/Finish

        if self.state in ("02_changes_requested", "04_waiting_normal", "draft"):
            vals["state"] = "01_in_progress"
        self.with_context(gannt_auto_plan=True, mail_notrack=True).write(vals)
        self.with_context(mail_notrack=True)._propagate_deadline_upward()

        user_name = self.env.user.name
        time_str = format_user_datetime(self.env, now, "yyyy.MM.dd -HH:mm")
        self.message_post(
            body=Markup(f"{user_name} Pradėta {time_str}"),
            subtype_xmlid="mail.mt_note",
        )
        return True

    def action_timer_pause(self):
        self.ensure_one()
        return {
            "name": _("Pristabdyti užduotį / Pause Task"),
            "type": "ir.actions.act_window",
            "res_model": "project.task.pause.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {
                "default_task_id": self.id,
                "default_timer_start": self.timer_start or fields.Datetime.now(),
            },
        }

    def action_timer_finish(self, force_now=None):
        self.ensure_one()
        if self.state in ("03_approved", "1_done") and not self.is_timer_running:
            return True
        now = force_now or fields.Datetime.now()
        user_name = self.env.user.name

        eff_sec = int(round((self.effective_hours or 0.0) * 3600))
        cur_total_sec = max(self.timer_total_seconds or 0, eff_sec)

        # 1. If timer was running, register the elapsed time to Timesheets and accumulate seconds
        if self.is_timer_running and self.timer_start:
            diff_sec = max(0, int((now - self.timer_start).total_seconds()))
            cur_total_sec += diff_sec
            elapsed_min = max(1, int(math.ceil(diff_sec / 60.0 - 1e-9)))
            elapsed_hours = elapsed_min / 60.0
            emp = self.env.user.employee_id
            if not emp and "hr.employee" in self.env:
                emp = self.env["hr.employee"].search([("user_id", "=", self.env.uid)], limit=1)
            if not emp and "hr.employee" in self.env:
                emp = self.env["hr.employee"].search([], limit=1)

            company = self.company_id or (emp and emp.company_id) or self.env.company
            if self.project_id and "account.analytic.line" in self.env and elapsed_hours > 0:
                try:
                    self.env["account.analytic.line"].with_context(mail_notrack=True).create({
                        "name": _("Darbas baigtas (Finish)"),
                        "task_id": self.id,
                        "project_id": self.project_id.id,
                        "employee_id": emp.id if emp else False,
                        "user_id": emp.user_id.id if emp and emp.user_id else self.env.uid,
                        "company_id": company.id if company else False,
                        "date": fields.Date.today(),
                        "unit_amount": elapsed_hours,
                    })
                except Exception as e:
                    _logger.warning("Could not create timesheet on finish: %s", e)

        vals = {
            "is_timer_running": False,
            "timer_start": False,
            "timer_total_seconds": cur_total_sec,
            "state": "03_approved",
        }

        # 2. Plan / deadline logic (R1 / R2), see _work_stop_vals
        stop_vals, _info = self._work_stop_vals(now, cur_total_sec, finished=True)
        vals.update(stop_vals)

        self.with_context(gannt_auto_plan=True, from_timer_finish=True, mail_notrack=True).write(vals)
        self.with_context(mail_notrack=True)._propagate_deadline_upward()

        # 3. Post single clean finish note to Chatter
        time_str = format_user_datetime(self.env, now, "yyyy.MM.dd -HH:mm")
        self.message_post(
            body=Markup(f"{user_name} Baigta (Laukia patvirtinimo) {time_str}"),
            subtype_xmlid="mail.mt_note",
        )
        return True

    def _work_stop_vals(self, now, total_sec, finished):
        """
        Single place that decides how the plan / deadline change when work stops (Pause, Finish, or Status -> Approved/Done).

        R1  no ESTABLISHED plan -> the plan is derived automatically:
            start = first timer start (or task creation time create_date if timer was not used),
            end = start + whole minutes up to now (always rounded UP, min 1 min). Never a red tail.
            If reopened via Changes Requested and finished again later, end updates to the new current time.
        R2  established plan (manual or inherited from a scheduled parent) -> the plan is untouched.
            If completed past the planned end, deadline = planned end + overrun minutes (rounded UP, min 1 min)
            flagged auto; the timeline draws the red tail planned end -> deadline.

        Returns (vals, info).
        """
        self.ensure_one()
        self._ensure_inherited_plan()
        vals = {}
        info = {"mode": "auto", "late_min": 0, "plan_minutes": 0, "planned_end": self.planned_date_end,
                "extended_manual": False, "old_deadline": self.date_deadline}
        has_established_plan = bool(self.planned_date_start and self.planned_date_end) and (
            not self.plan_is_auto or bool(self.child_ids)
        )

        if not has_established_plan:
            start = self.first_timer_start or self.create_date or now
            if start > now:
                start = now
            start_f = floor_minute(start)
            minutes = ceil_minutes_between(start, now)
            vals["planned_date_start"] = start_f
            vals["planned_date_end"] = start_f + timedelta(minutes=minutes)
            vals["plan_is_auto"] = True
            info["plan_minutes"] = minutes
            if finished:
                if total_sec and total_sec > 0:
                    vals["allocated_hours"] = max(1, int(math.ceil(total_sec / 60.0 - 1e-9))) / 60.0
                else:
                    w_h = calculate_lithuanian_working_hours(
                        utc_to_local_dt(self.env, start_f),
                        utc_to_local_dt(self.env, vals["planned_date_end"]),
                    )
                    vals["allocated_hours"] = w_h if w_h > 0 else round(minutes / 60.0, 2)
            if self.deadline_is_auto and self.date_deadline:
                vals["date_deadline"] = False
                vals["deadline_is_auto"] = False
            return vals, info

        info["mode"] = "planned"
        p_end = self.planned_date_end
        if now > p_end:
            over = ceil_minutes_between(p_end, now)
            new_dl = p_end + timedelta(minutes=over)
            cur_dl = self.date_deadline
            info["late_min"] = over
            if not cur_dl or self.deadline_is_auto or cur_dl < new_dl:
                vals["date_deadline"] = new_dl
                vals["deadline_is_auto"] = True
                info["extended_manual"] = bool(cur_dl and not self.deadline_is_auto and cur_dl < new_dl)
        elif self.deadline_is_auto and self.date_deadline and not self.child_ids:
            # Finished inside the plan: an earlier auto-written deadline is no longer true.
            vals["date_deadline"] = False
            vals["deadline_is_auto"] = False
        return vals, info

    def action_timer_reopen(self):
        self.ensure_one()
        now = fields.Datetime.now()
        eff_sec = int(round((self.effective_hours or 0.0) * 3600))
        cur_total_sec = max(self.timer_total_seconds or 0, eff_sec)
        self.with_context(mail_notrack=True).write({
            "state": "01_in_progress",
            "is_timer_running": False,
            "timer_start": False,
            "timer_total_seconds": cur_total_sec,
        })
        self._cascade_clear_downstream_progress()
        time_str = format_user_datetime(self.env, now, "yyyy.MM.dd -HH:mm")
        self.message_post(
            body=Markup(f"{self.env.user.name} Atnaujinta {time_str}"),
            subtype_xmlid="mail.mt_note",
        )
        return True

    def _cascade_clear_downstream_progress(self):
        """
        When a prerequisite task is reopened / no longer finished,
        any downstream dependent tasks (dependent_ids via finish-to-start links)
        that were completed should be reset to waiting (state = '04_waiting_normal').
        Never resets child subtasks (child_ids) of a parent container.
        """
        for task in self:
            for dep in task.dependent_ids:
                if dep.state in ("1_done", "03_approved"):
                    dep.with_context(mail_notrack=True).sudo().write({"state": "04_waiting_normal"})
                    dep._cascade_clear_downstream_progress()

    def _recompute_container(self):
        """
        R3. Keeps one parent task consistent with its direct subtasks:
          * parent with an AUTO plan (or no plan): plan = span of the subtasks (never a red tail by itself);
          * parent with a MANUAL plan: the plan is never touched. If a subtask needs more time than the parent,
            the parent gets an auto deadline = latest subtask end (planned end or deadline) -> red tail.
        """
        self.ensure_one()
        children = self.child_ids.filtered(lambda c: c.active)
        if not children:
            return
        starts, ends, eff_ends = [], [], []
        for c in children:
            c_s = c.planned_date_start
            c_e = c.planned_date_end
            if not c_s and not c_e and self.planned_date_start and self.planned_date_end:
                c_s = self.planned_date_start
                c_e = self.planned_date_end
            if c_s and c_e:
                starts.append(c_s)
                ends.append(c_e)
                if c.state != "1_canceled":
                    eff = c_e
                    if c.date_deadline and isinstance(c.date_deadline, datetime) and c.date_deadline > c_e:
                        eff = c.date_deadline
                    eff_ends.append(eff)
            elif c.state != "1_canceled" and c.date_deadline and isinstance(c.date_deadline, datetime):
                eff_ends.append(c.date_deadline)

        vals = {}
        manual_plan = bool(self.planned_date_start and self.planned_date_end) and not self.plan_is_auto
        if not manual_plan and starts and ends:
            min_s, max_e = min(starts), max(ends)
            if max_e < min_s:
                min_s = max_e
            if self.planned_date_start != min_s:
                vals["planned_date_start"] = min_s
            if self.planned_date_end != max_e:
                vals["planned_date_end"] = max_e
            if not self.plan_is_auto:
                vals["plan_is_auto"] = True
            eff_s = vals.get("planned_date_start", self.planned_date_start)
            eff_e = vals.get("planned_date_end", self.planned_date_end)
            if (
                ("planned_date_start" in vals or "planned_date_end" in vals)
                and eff_s and eff_e
            ):
                w_h = calculate_lithuanian_working_hours(utc_to_local_dt(self.env, eff_s), utc_to_local_dt(self.env, eff_e))
                if w_h > 0:
                    vals["allocated_hours"] = w_h

        p_end = vals.get("planned_date_end", self.planned_date_end)
        tail_end = max(eff_ends) if eff_ends else None
        if (
            self.first_timer_start
            and self.date_deadline
            and isinstance(self.date_deadline, datetime)
            and p_end
            and self.date_deadline > p_end
            and self.state != "1_canceled"
        ):
            tail_end = max(tail_end, self.date_deadline) if tail_end else self.date_deadline
        cur_dl = self.date_deadline
        if p_end and tail_end and tail_end > p_end:
            if not cur_dl or self.deadline_is_auto or cur_dl < tail_end:
                if cur_dl != tail_end or not self.deadline_is_auto:
                    vals["date_deadline"] = tail_end
                    vals["deadline_is_auto"] = True
        elif self.deadline_is_auto and cur_dl:
            # Subtasks no longer overflow the parent: the system-written tail goes away.
            vals["date_deadline"] = False
            vals["deadline_is_auto"] = False

        if vals:
            try:
                self.with_context(skip_hierarchy_propagation=True, gannt_auto_plan=True, mail_notrack=True).sudo().write(vals)
            except Exception as e:
                _logger.warning("Could not update container task %s: %s", self.id, e)

    def _propagate_deadline_upward(self):
        """
        Re-evaluates the task itself (if it has subtasks) and every ancestor (see _recompute_container),
        then the milestone span.
        """
        if self.env.context.get("skip_hierarchy_propagation"):
            return
        for rec in self:
            # 1. The task itself (when it is a container) and every ancestor, bottom-up
            if rec.child_ids:
                rec._recompute_container()
            curr_parent = rec.parent_id
            while curr_parent:
                curr_parent._recompute_container()
                curr_parent = curr_parent.parent_id

            # 2. Propagate to milestone
            if rec.milestone_id:
                ms = rec.milestone_id
                ms_tasks = self.env["project.task"].search([("milestone_id", "=", ms.id), ("active", "=", True)])
                ms_vals = {}
                ms_starts = [utc_to_local_dt(self.env, t.planned_date_start).date() for t in ms_tasks if t.planned_date_start]
                ms_ends = [utc_to_local_dt(self.env, t.planned_date_end).date() for t in ms_tasks if t.planned_date_end]
                if ms_starts and hasattr(ms, "date_start"):
                    min_ms_s = min(ms_starts)
                    if not ms.date_start or min_ms_s < ms.date_start:
                        ms_vals["date_start"] = min_ms_s
                if ms_ends and hasattr(ms, "planned_date_end"):
                    max_ms_e = max(ms_ends)
                    if not ms.planned_date_end or max_ms_e > ms.planned_date_end:
                        ms_vals["planned_date_end"] = max_ms_e
                if ms_vals:
                    try:
                        ms.with_context(mail_notrack=True).sudo().write(ms_vals)
                    except Exception:
                        pass

    def _normalize_form_datetime_vals(self, vals):
        """
        Normalizes midnight (00:00:00) and end-of-day (23:59:59) local timestamps sent by the Odoo Form
        datepicker into standard business working hours (08:00:00 start, 17:00:00 end/deadline) in the user's
        local timezone, preventing UTC midnight rollover (+1 day) mismatches between Form View and Timeline.
        """
        if self.env.context.get("from_timeline_batch") or self.env.context.get("skip_hierarchy_propagation"):
            return
        if vals.get("planned_date_start"):
            try:
                s_dt = fields.Datetime.to_datetime(vals["planned_date_start"]) if isinstance(vals["planned_date_start"], str) else vals["planned_date_start"]
                if isinstance(s_dt, datetime):
                    s_local = utc_to_local_dt(self.env, s_dt)
                    if s_local.hour == 0 and s_local.minute == 0:
                        s_local = s_local.replace(hour=8, minute=0, second=0)
                        vals["planned_date_start"] = local_to_utc_dt(self.env, s_local)
            except Exception:
                pass
        if vals.get("planned_date_end"):
            try:
                e_dt = fields.Datetime.to_datetime(vals["planned_date_end"]) if isinstance(vals["planned_date_end"], str) else vals["planned_date_end"]
                if isinstance(e_dt, datetime):
                    e_local = utc_to_local_dt(self.env, e_dt)
                    if (e_local.hour == 0 and e_local.minute == 0) or (e_local.hour == 23 and e_local.minute == 59):
                        e_local = e_local.replace(hour=17, minute=0, second=0)
                        vals["planned_date_end"] = local_to_utc_dt(self.env, e_local)
            except Exception:
                pass
        if vals.get("date_deadline"):
            try:
                dl_dt = fields.Datetime.to_datetime(vals["date_deadline"]) if isinstance(vals["date_deadline"], str) else vals["date_deadline"]
                if isinstance(dl_dt, datetime):
                    dl_local = utc_to_local_dt(self.env, dl_dt)
                    if (dl_local.hour == 0 and dl_local.minute == 0) or (dl_local.hour == 23 and dl_local.minute == 59):
                        dl_local = dl_local.replace(hour=17, minute=0, second=0)
                        vals["date_deadline"] = local_to_utc_dt(self.env, dl_local)
            except Exception:
                pass

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("parent_id") and not vals.get("planned_date_start") and not vals.get("planned_date_end"):
                try:
                    anc = self.browse(vals["parent_id"])
                    while anc.exists():
                        if anc.planned_date_start and anc.planned_date_end:
                            vals["planned_date_start"] = anc.planned_date_start
                            vals["planned_date_end"] = anc.planned_date_end
                            vals["plan_is_auto"] = False
                            break
                        anc = anc.parent_id
                except Exception:
                    pass

            self._normalize_form_datetime_vals(vals)
            # Auto-fill allocated_hours from actual working hours (darbo valandos)
            if "allocated_hours" not in vals:
                s = vals.get("planned_date_start")
                e = vals.get("planned_date_end") or vals.get("date_deadline")
                if s and e:
                    try:
                        s_dt = fields.Datetime.to_datetime(s) if isinstance(s, str) else s
                        e_dt = fields.Datetime.to_datetime(e) if isinstance(e, str) else e
                        w_h = calculate_lithuanian_working_hours(utc_to_local_dt(self.env, s_dt), utc_to_local_dt(self.env, e_dt))
                        if w_h > 0:
                            vals["allocated_hours"] = w_h
                    except Exception:
                        pass

        records = super().create(vals_list)
        records._propagate_deadline_upward()
        return records

    def _cascade_planned_dates_to_unscheduled_descendants(self, start_dt, end_dt):
        """
        When planned dates are set on a parent task, any active descendant (subtask / sub-subtask)
        that does not yet have planned dates inherits them with plan_is_auto=False.
        """
        for rec in self:
            for child in rec.child_ids.filtered(lambda c: c.active):
                if not child.planned_date_start and not child.planned_date_end:
                    child.with_context(skip_hierarchy_propagation=True, gannt_auto_plan=True, mail_notrack=True).sudo().write({
                        "planned_date_start": start_dt,
                        "planned_date_end": end_dt,
                        "plan_is_auto": False,
                    })
                child._cascade_planned_dates_to_unscheduled_descendants(
                    child.planned_date_start or start_dt,
                    child.planned_date_end or end_dt,
                )

    def write(self, vals):
        auto_ctx = bool(self.env.context.get("gannt_auto_plan"))
        if not auto_ctx:
            self._normalize_form_datetime_vals(vals)

        if "parent_id" in vals and vals.get("parent_id") and "planned_date_start" not in vals and "planned_date_end" not in vals:
            try:
                anc = self.browse(vals["parent_id"])
                while anc.exists():
                    if anc.planned_date_start and anc.planned_date_end:
                        for rec in self:
                            if not rec.planned_date_start and not rec.planned_date_end:
                                rec.with_context(skip_hierarchy_propagation=True, gannt_auto_plan=True, mail_notrack=True).write({
                                    "planned_date_start": anc.planned_date_start,
                                    "planned_date_end": anc.planned_date_end,
                                    "plan_is_auto": False,
                                })
                        break
                    anc = anc.parent_id
            except Exception:
                pass

        # A user (form, timeline drag) typing planned dates / a deadline makes them MANUAL.
        # Internal system writes pass context gannt_auto_plan and keep their own flags.
        if not auto_ctx:
            if ("planned_date_start" in vals or "planned_date_end" in vals) and "plan_is_auto" not in vals:
                vals["plan_is_auto"] = False
            if "date_deadline" in vals and "deadline_is_auto" not in vals:
                vals["deadline_is_auto"] = False

        # Auto-update allocated_hours from working hours (darbo valandos) if dates are modified
        if (
            ("planned_date_start" in vals or "planned_date_end" in vals or ("date_deadline" in vals and not auto_ctx))
            and "allocated_hours" not in vals
        ):
            for rec in self:
                s_val = vals.get("planned_date_start") if "planned_date_start" in vals else rec.planned_date_start
                e_val = vals.get("planned_date_end") if "planned_date_end" in vals else (rec.planned_date_end or (vals.get("date_deadline") if "date_deadline" in vals else rec.date_deadline))
                if not s_val and not e_val:
                    vals["allocated_hours"] = 0.0
                elif s_val and e_val:
                    try:
                        s_dt = fields.Datetime.to_datetime(s_val) if isinstance(s_val, str) else s_val
                        e_dt = fields.Datetime.to_datetime(e_val) if isinstance(e_val, str) else e_val
                        w_h = calculate_lithuanian_working_hours(utc_to_local_dt(self.env, s_dt), utc_to_local_dt(self.env, e_dt))
                        if w_h > 0:
                            vals["allocated_hours"] = w_h
                    except Exception:
                        pass
                break

        was_completed = {
            rec.id: (rec.state in ("03_approved", "1_done") and not rec.is_timer_running)
            for rec in self
        }

        res = super().write(vals)

        # An auto-written deadline is only true while the plan ends BEFORE it. When the plan end was moved
        # (form / timeline drag-resize) up to or past it, the system clears it. Typed deadlines are never touched.
        if not auto_ctx and ("planned_date_end" in vals or "planned_date_start" in vals):
            for rec in self:
                if (
                    rec.deadline_is_auto and rec.date_deadline and rec.planned_date_end
                    and rec.planned_date_end >= rec.date_deadline
                ):
                    rec.with_context(skip_hierarchy_propagation=True, gannt_auto_plan=True, mail_notrack=True).write(
                        {"date_deadline": False, "deadline_is_auto": False}
                    )
                if rec.planned_date_start and rec.planned_date_end and rec.child_ids:
                    rec._cascade_planned_dates_to_unscheduled_descendants(rec.planned_date_start, rec.planned_date_end)

        # When state is changed directly to Done ('1_done') or Approved ('03_approved') via Form/Kanban/Gantt
        # (with or without the work timer, and with or without planned dates):
        # evaluate _work_stop_vals(now, cur_total_sec, finished=True) ONLY when transitioning from a non-completed
        # state (or while timer is running). Confirming an already-Approved ('03_approved') task into Done ('1_done')
        # preserves the worker's original completion deadline.
        if (
            "state" in vals
            and not self.env.context.get("from_timer_finish")
            and not self.env.context.get("skip_hierarchy_propagation")
        ):
            new_state = vals.get("state")
            if new_state in ("03_approved", "1_done"):
                now = fields.Datetime.now()
                for rec in self:
                    if not was_completed.get(rec.id):
                        eff_sec = int(round((rec.effective_hours or 0.0) * 3600))
                        cur_total_sec = max(rec.timer_total_seconds or 0, eff_sec)
                        if rec.is_timer_running and rec.timer_start:
                            cur_total_sec += max(0, int((now - rec.timer_start).total_seconds()))
                        stop_vals, _ = rec._work_stop_vals(now, cur_total_sec, finished=True)
                        if rec.is_timer_running:
                            stop_vals.update({
                                "is_timer_running": False,
                                "timer_start": False,
                                "timer_total_seconds": cur_total_sec,
                            })
                        if stop_vals:
                            rec.with_context(
                                skip_hierarchy_propagation=True,
                                gannt_auto_plan=True,
                                from_timer_finish=True,
                                mail_notrack=True,
                            ).write(stop_vals)
                    rec.with_context(mail_notrack=True)._propagate_deadline_upward()
            elif new_state == "1_canceled":
                for rec in self:
                    cancel_vals = {}
                    if rec.is_timer_running or rec.timer_start:
                        cancel_vals["is_timer_running"] = False
                        cancel_vals["timer_start"] = False
                    if rec.deadline_is_auto and rec.date_deadline:
                        cancel_vals["date_deadline"] = False
                        cancel_vals["deadline_is_auto"] = False
                    if cancel_vals:
                        rec.with_context(
                            skip_hierarchy_propagation=True,
                            gannt_auto_plan=True,
                            mail_notrack=True,
                        ).write(cancel_vals)
                    anc = rec.parent_id
                    while anc:
                        if anc.state in ("03_approved", "1_done"):
                            anc.with_context(skip_hierarchy_propagation=True, gannt_auto_plan=True, mail_notrack=True).sudo().write({
                                "state": "01_in_progress",
                            })
                        anc = anc.parent_id
                    rec.with_context(mail_notrack=True)._propagate_deadline_upward()
            elif new_state in ("01_in_progress", "02_changes_requested", "04_waiting_normal"):
                for rec in self:
                    anc = rec.parent_id
                    while anc:
                        if anc.state in ("03_approved", "1_done"):
                            anc.with_context(skip_hierarchy_propagation=True, gannt_auto_plan=True, mail_notrack=True).sudo().write({
                                "state": "01_in_progress",
                            })
                        anc = anc.parent_id
                    rec.with_context(mail_notrack=True)._propagate_deadline_upward()

        # Parent task and Milestone hierarchy propagation
        if ("date_deadline" in vals or "planned_date_start" in vals or "planned_date_end" in vals or "parent_id" in vals or "milestone_id" in vals) and not self.env.context.get("skip_hierarchy_propagation"):
            self._propagate_deadline_upward()

        # If task state/progress changed to not done, clear downstream dependent tasks
        if ("state" in vals and vals["state"] not in ("03_approved", "1_done")) or ("progress" in vals and vals["progress"] < 100.0):
            for rec in self:
                is_not_done = (
                    (rec.state and rec.state not in ("03_approved", "1_done"))
                    or (rec.progress is not None and rec.progress < 100.0)
                )
                if is_not_done:
                    rec._cascade_clear_downstream_progress()

        return res

    @api.model
    def get_all_in_one_timeline_data(self, project_id=None, domain=None, date_start=None, date_end=None, user_id=None, model_name=None):
        """
        Fetches structured timeline data for DHTMLX Gantt chart:
        - Projects and Tasks hierarchy (Project -> Task -> Subtask)
        - Dependency links (depend_on_ids)
        - Available resources (res.users)
        - Available projects for filter dropdown
        Safely applies search domain whether the active view is on project.project or project.task.
        """
        project_model = self.env["project.project"]
        task_model = self.env["project.task"]

        explicit_proj_id = int(project_id) if project_id and int(project_id) > 0 else None
        is_project_model = (model_name == "project.project")

        proj_domain = []
        task_domain = [("active", "=", True)]

        if explicit_proj_id:
            proj_domain.append(("id", "=", explicit_proj_id))
            task_domain.append(("project_id", "=", explicit_proj_id))

        if user_id and int(user_id) > 0:
            task_domain.append(("user_ids", "in", [int(user_id)]))

        projects = project_model.browse([])
        tasks = task_model.browse([])

        # Clean domain for timeline: remove flat-view restrictions (display_in_project, parent_id=False)
        # so all subtasks and nested children to unlimited depth are loaded in the tree
        def _clean_timeline_domain(dom):
            if not dom:
                return []
            cleaned = []
            for leaf in dom:
                if isinstance(leaf, (list, tuple)) and len(leaf) == 3:
                    field_name = leaf[0]
                    if field_name == "display_in_project":
                        continue
                    if field_name == "parent_id" and leaf[1] in ("=", "==") and (leaf[2] is False or leaf[2] is None):
                        continue
                cleaned.append(leaf)
            return cleaned

        cleaned_domain = _clean_timeline_domain(domain)

        if cleaned_domain:
            if is_project_model:
                try:
                    projects = project_model.search(proj_domain + cleaned_domain)
                except Exception as e:
                    _logger.warning("Error searching projects with domain %s: %s", domain, e)
                    projects = project_model.search(proj_domain)

                if explicit_proj_id:
                    task_domain.append(("project_id", "=", explicit_proj_id))
                elif projects:
                    task_domain.append(("project_id", "in", projects.ids))

                tasks = task_model.search(task_domain, order="project_id, sequence, id")
            else:
                try:
                    tasks = task_model.search(task_domain + cleaned_domain, order="project_id, sequence, id")
                except Exception as e:
                    _logger.warning("Domain %s failed on task search: %s. Trying project search fallback.", domain, e)
                    try:
                        projects = project_model.search(proj_domain + cleaned_domain)
                        if projects:
                            task_domain.append(("project_id", "in", projects.ids))
                        tasks = task_model.search(task_domain, order="project_id, sequence, id")
                    except Exception as e2:
                        _logger.warning("Domain failed on both models: %s", e2)
                        tasks = task_model.search(task_domain, order="project_id, sequence, id")
        else:
            if is_project_model:
                projects = project_model.search(proj_domain)
                if explicit_proj_id:
                    task_domain.append(("project_id", "=", explicit_proj_id))
                elif projects:
                    task_domain.append(("project_id", "in", projects.ids))
                tasks = task_model.search(task_domain, order="project_id, sequence, id")
            else:
                tasks = task_model.search(task_domain, order="project_id, sequence, id")

        # Recursively ensure all child tasks, sub-subtasks, and deeper nested items are included
        if tasks:
            all_task_ids = set(tasks.ids)
            curr_parent_ids = list(all_task_ids)
            while curr_parent_ids:
                new_children = task_model.search([
                    ("parent_id", "in", curr_parent_ids),
                    ("id", "not in", list(all_task_ids)),
                    ("active", "=", True),
                ], order="project_id, sequence, id")
                if not new_children:
                    break
                tasks = tasks | new_children
                all_task_ids.update(new_children.ids)
                curr_parent_ids = new_children.ids

        # Gather relevant projects if not already gathered
        if not projects:
            if explicit_proj_id:
                projects = project_model.browse(explicit_proj_id)
            else:
                project_ids = tasks.mapped("project_id.id")
                if project_ids:
                    projects = project_model.browse(project_ids)
                else:
                    projects = project_model.search([], limit=20)

        # Build Gantt items list
        gantt_tasks = []
        links = []
        seen_project_keys = set()
        seen_milestone_keys = set()
        added_task_ids = set()
        user_task_counts = {}

        now = fields.Datetime.now()
        now_local = utc_to_local_dt(self.env, now)
        dt_format = "%Y-%m-%d %H:%M:%S"
        can_edit = bool(
            self.env.is_superuser()
            or self.env.user.has_group("base.group_system")
            or self.env.user.has_group("GanntLT.group_gannt_lt_manager")
        )

        # Query milestones for projects
        milestone_model = self.env["project.milestone"]
        milestones = milestone_model.browse([])
        if projects:
            try:
                milestones = milestone_model.search([("project_id", "in", projects.ids)], order="project_id, sequence, id")
            except Exception as e:
                _logger.warning("Error fetching milestones: %s", e)

        # Hierarchical task dates helper: container CANNOT be smaller than items inside it
        task_dates_cache = {}
        visiting_tasks = set()

        def get_task_base_dates(t):
            """Returns the task's own base dates without recursing into subtasks."""
            if t.planned_date_start:
                s = utc_to_local_dt(self.env, t.planned_date_start)
                if s.hour == 0 and s.minute == 0 and not t.plan_is_auto:
                    if not t.planned_date_end or utc_to_local_dt(self.env, t.planned_date_end) >= s.replace(hour=8, minute=0, second=0):
                        s = s.replace(hour=8, minute=0, second=0)
            else:
                base_dt = utc_to_local_dt(self.env, t.date_assign or t.create_date or now)
                s = datetime.combine(base_dt.date(), time(8, 0, 0))

            if t.planned_date_end:
                e = utc_to_local_dt(self.env, t.planned_date_end)
                if (e.hour == 0 and e.minute == 0) or (e.hour == 23 and e.minute == 59):
                    if not t.plan_is_auto:
                        e = e.replace(hour=17, minute=0, second=0)
            elif t.is_timer_running and t.planned_date_start:
                e = s + timedelta(minutes=ceil_minutes_between(s, now_local))
            elif t.date_deadline:
                e = utc_to_local_dt(self.env, t.date_deadline) if isinstance(t.date_deadline, datetime) else datetime.combine(t.date_deadline, time(17, 0, 0))
                if (e.hour == 0 and e.minute == 0) or (e.hour == 23 and e.minute == 59):
                    e = e.replace(hour=17, minute=0, second=0)
            else:
                e = datetime.combine(s.date(), time(17, 0, 0))

            if e < s:
                e = s + timedelta(minutes=1)
            return s, e

        def get_task_dates(t):
            if t.id in task_dates_cache:
                return task_dates_cache[t.id]
            if t.id in visiting_tasks:
                return get_task_base_dates(t)

            visiting_tasks.add(t.id)
            try:
                # If this is a subtask without explicit planned dates, inherit strictly from parent task
                if t.parent_id and not t.planned_date_start and not t.planned_date_end:
                    p_s, p_e = get_task_dates(t.parent_id)
                    t_s, t_e = p_s, p_e
                    task_dates_cache[t.id] = (t_s, t_e)
                    return t_s, t_e

                t_s, t_e = get_task_base_dates(t)

                if t.parent_id:
                    # If start or end is not set, inherit from parent
                    if not t.planned_date_start:
                        p_s, _ = get_task_dates(t.parent_id)
                        t_s = p_s
                    if not t.planned_date_end and not t.date_deadline:
                        _, p_e = get_task_dates(t.parent_id)
                        t_e = max(t_s, p_e)

                # Encompass subtasks ONLY for parents without a manual plan (auto plan / no plan).
                # A parent with a manual plan keeps its own span; subtasks beyond it make a red tail instead.
                subtasks = tasks.filtered(lambda s: s.parent_id.id == t.id)
                manual_parent_plan = bool(t.planned_date_start and t.planned_date_end) and not t.plan_is_auto
                if subtasks and not manual_parent_plan:
                    sub_pairs = [get_task_dates(sub) for sub in subtasks if sub.id not in visiting_tasks]
                    if sub_pairs:
                        t_s = min(t_s, min(p[0] for p in sub_pairs))
                        t_e = max(t_e, max(p[1] for p in sub_pairs))

                if t_e < t_s:
                    t_e = datetime.combine(t_s.date(), time(17, 0, 0))
                    if t_e <= t_s:
                        t_e = datetime.combine(t_s.date() + timedelta(days=1), time(17, 0, 0))

                task_dates_cache[t.id] = (t_s, t_e)
                return t_s, t_e
            finally:
                visiting_tasks.discard(t.id)

        # Hierarchical progress calculation helper
        task_metrics_cache = {}

        def get_task_metrics(t):
            if t.id in task_metrics_cache:
                return task_metrics_cache[t.id]

            subtasks = tasks.filtered(lambda s: s.parent_id.id == t.id)
            if subtasks:
                # Parent task with subtasks: progress strictly depends on bottom subtasks!
                # A parent CANNOT be 100% if bottom tasks are not finished!
                sub_results = [get_task_metrics(s) for s in subtasks]
                all_subs_done = all(sr["is_done"] for sr in sub_results)
                all_subs_approved_or_done = all(sr["is_done"] or sr.get("is_approved", False) for sr in sub_results)
                avg_sub_prog = sum(sr["progress"] for sr in sub_results) / len(sub_results)

                if all_subs_done and len(subtasks) > 0:
                    res = {"is_done": True, "is_approved": False, "progress": 1.0}
                elif all_subs_approved_or_done and len(subtasks) > 0:
                    res = {"is_done": False, "is_approved": True, "progress": 1.0}
                else:
                    # Not all bottom tasks are finished: cannot be 100% or done!
                    res = {"is_done": False, "is_approved": False, "progress": min(0.99, round(avg_sub_prog, 2))}
            else:
                # Leaf task (no subtasks): its own completion state in Odoo
                stage_name = (t.stage_id.name or "").lower() if t.stage_id else ""
                is_done = bool(
                    t.state == "1_done"
                    or getattr(t.stage_id, "is_closed", False)
                    or "done" in stage_name
                    or "completed" in stage_name
                    or "closed" in stage_name
                )
                is_approved = bool(t.state == "03_approved")
                if is_done:
                    res = {"is_done": True, "is_approved": False, "progress": 1.0}
                elif is_approved:
                    res = {"is_done": False, "is_approved": True, "progress": 1.0}
                else:
                    p = (t.progress / 100.0) if t.progress else 0.0
                    if p == 0.0 and t.allocated_hours and t.effective_hours:
                        p = min(0.99, t.effective_hours / t.allocated_hours)
                    res = {"is_done": False, "is_approved": False, "progress": min(0.99, max(0.0, p))}

            task_metrics_cache[t.id] = res
            return res

        def get_task_effective_deadline(task_obj):
            """Local datetime of the task's deadline (typed by a user or auto-written), or None."""
            if task_obj.date_deadline:
                dl_loc = utc_to_local_dt(self.env, task_obj.date_deadline) if isinstance(task_obj.date_deadline, datetime) else datetime.combine(task_obj.date_deadline, time(17, 0, 0))
                if not task_obj.deadline_is_auto and ((dl_loc.hour == 0 and dl_loc.minute == 0) or (dl_loc.hour == 23 and dl_loc.minute == 59)):
                    dl_loc = dl_loc.replace(hour=17, minute=0, second=0)
                return dl_loc
            return None

        def has_manual_plan(task_obj):
            return bool(task_obj.planned_date_start and task_obj.planned_date_end) and not task_obj.plan_is_auto

        delay_cache = {}

        def compute_task_delay(task_obj):
            """
            Red tail ("vėlavimas") = from the planned end up to the deadline (deadline LATER than the plan end).
            Returns dict(deadline, kind, seconds, days, end):
              kind "late"  -> a stored deadline (typed, or auto-written when work went past the plan) is after the plan end
              kind "timer" -> the running timer is already past the planned end (live, not saved yet)
              kind ""      -> no tail
              end          -> effective end incl. the tail and all descendants (used by parents)
            A leaf with an AUTO plan (plan = real work) never has a tail. A parent gets the tail of the
            descendant that ends last (R3).
            """
            if task_obj.id in delay_cache:
                return delay_cache[task_obj.id]
            _, t_e = get_task_dates(task_obj)
            own_dl = get_task_effective_deadline(task_obj)
            children = tasks.filtered(lambda c: c.parent_id.id == task_obj.id)
            manual = has_manual_plan(task_obj)
            eff_end = t_e
            kind = ""
            deadline_out = own_dl

            has_plan = manual or bool(task_obj.parent_id) or bool(children)
            if task_obj.state == "1_canceled":
                allow_own_dl = not task_obj.deadline_is_auto
            else:
                allow_own_dl = (not task_obj.deadline_is_auto) or bool(
                    task_obj.first_timer_start
                    or task_obj.timer_total_seconds
                    or task_obj.effective_hours
                    or task_obj.state in ("03_approved", "1_done", "02_changes_requested")
                )
            if own_dl and own_dl > eff_end and has_plan and allow_own_dl:
                eff_end = own_dl
                kind = "late"
            if task_obj.is_timer_running and task_obj.state != "1_canceled" and has_plan and now_local > eff_end:
                eff_end = floor_minute(now_local) + timedelta(minutes=1)
                kind = "timer"
            for child in children:
                if child.state == "1_canceled":
                    continue
                cres = compute_task_delay(child)
                if cres["end"] > eff_end:
                    eff_end = cres["end"]
                    kind = cres["kind"] or "late"

            seconds = 0.0
            days = 0
            if kind:
                deadline_out = eff_end
                seconds = float(ceil_minutes_between(t_e, eff_end) * 60)
                days = (eff_end.date() - t_e.date()).days if eff_end.date() > t_e.date() else 0
            res = {"deadline": deadline_out, "kind": kind, "seconds": seconds, "days": days, "end": eff_end}
            delay_cache[task_obj.id] = res
            return res

        def compute_container_delay(own_dl, c_end, c_is_done, child_tasks):
            """Tail for a project/milestone: its own deadline after its end, or the latest task tail."""
            eff_end = c_end
            kind = ""
            if own_dl and c_end and own_dl > c_end:
                eff_end = own_dl
                kind = "late"
            for ct in child_tasks:
                if ct.state == "1_canceled":
                    continue
                cres = compute_task_delay(ct)
                if c_end and cres["end"] > eff_end:
                    eff_end = cres["end"]
                    kind = cres["kind"] or "late"
            res = {"deadline": own_dl, "kind": kind, "seconds": 0.0, "days": 0}
            if kind:
                res["deadline"] = eff_end
                res["seconds"] = float(ceil_minutes_between(c_end, eff_end) * 60)
                res["days"] = (eff_end.date() - c_end.date()).days if eff_end.date() > c_end.date() else 0
            return res
        def build_task_dict(t, parent_key):
            metrics = get_task_metrics(t)
            t_is_done = metrics["is_done"]
            prog = metrics["progress"]

            t_start, t_end = get_task_dates(t)
            subtasks = tasks.filtered(lambda s: s.parent_id.id == t.id)
            has_dates = bool((t.planned_date_start and t.planned_date_end) or t.date_deadline or t.parent_id or subtasks)

            # Auto-fill task allocated_hours directly from darbo valandos (working hours) if unset or 0.0
            # If task has NO planned dates and NO deadline: it shouldn't show hours!
            if not has_dates:
                if t.allocated_hours:
                    try:
                        t.with_context(skip_hierarchy_propagation=True, mail_notrack=True).sudo().write({"allocated_hours": 0.0})
                    except Exception:
                        pass
                t_alloc = 0.0
                allocated_str = ""
            else:
                w_h = calculate_lithuanian_working_hours(t_start, t_end)
                t_alloc = t.allocated_hours
                if w_h > 0 and (not t_alloc or abs((t_alloc or 0.0) - w_h) > 0.1):
                    t_alloc = w_h
                    try:
                        t.with_context(skip_hierarchy_propagation=True, mail_notrack=True).sudo().write({"allocated_hours": w_h})
                    except Exception:
                        pass
                allocated_str = format_hours_label(t_alloc)

            # Grid alignment for DHTMLX Gantt visual coordinates (midnight boundaries)
            gantt_start = datetime.combine(t_start.date(), time.min)
            if t_end.date() > t_start.date():
                if t_end.time() > time.min:
                    gantt_end = datetime.combine(t_end.date() + timedelta(days=1), time.min)
                else:
                    gantt_end = datetime.combine(t_end.date(), time.min)
            else:
                # Exactly span of one day on Gantt grid (midnight to next midnight)
                gantt_end = gantt_start + timedelta(days=1)

            t_start_str = gantt_start.strftime(dt_format)
            t_end_str = gantt_end.strftime(dt_format)
            work_start_str = t_start.strftime(dt_format)
            work_end_str = t_end.strftime(dt_format)

            # Assignees info
            assignee_names = ", ".join(t.user_ids.mapped("name"))
            avatars = []
            for u in t.user_ids:
                avatars.append({
                    "id": u.id,
                    "name": u.name,
                    "avatar": f"/web/image/res.users/{u.id}/avatar_128",
                })
                user_task_counts[u.id] = user_task_counts.get(u.id, 0) + 1

            # Check for uncompleted dependencies (Locked / Blocked task)
            is_locked = False
            blocking_tasks = []
            if t.depend_on_ids:
                for dep in t.depend_on_ids:
                    dep_m = get_task_metrics(dep)
                    if not dep_m.get("is_done") and dep.state != "1_done":
                        is_locked = True
                        blocking_tasks.append(dep.name or f"Task #{dep.id}")
            elif getattr(t, "depend_on_count", 0) > getattr(t, "closed_depend_on_count", 0):
                is_locked = True

            # If parent task is locked or not finished and this is a subtask
            if not is_locked and t.parent_id:
                parent_m = get_task_metrics(t.parent_id)
                if not parent_m.get("is_done") and t.parent_id.state != "1_done":
                    if t.parent_id.depend_on_ids:
                        for pdep in t.parent_id.depend_on_ids:
                            pdep_m = get_task_metrics(pdep)
                            if not pdep_m.get("is_done") and pdep.state != "1_done":
                                is_locked = True
                                blocking_tasks.append(pdep.name or f"Task #{pdep.id}")

            stage_name = (t.stage_id.name or "").lower() if t.stage_id else ""
            t_state = t.state or "01_in_progress"

            # CRITICAL: A locked task CAN NEVER be 100% or done!
            if is_locked:
                prog = 0.0
                t_is_done = False
                color = "#1e293b"  # Dark Charcoal Steel for locked tasks
                t_state = "locked"
                if (t.progress and t.progress > 0) or t.state != "04_waiting_normal":
                    try:
                        t.with_context(skip_hierarchy_propagation=True, mail_notrack=True).sudo().write({"progress": 0.0, "state": "04_waiting_normal"})
                    except Exception:
                        pass
            else:
                if t_state == "04_waiting_normal":
                    t_state = "01_in_progress"
                    try:
                        t.with_context(skip_hierarchy_propagation=True, mail_notrack=True).sudo().write({"state": "01_in_progress"})
                    except Exception:
                        pass

                if subtasks and t_state in ("1_done", "03_approved") and not (t_is_done or metrics.get("is_approved")):
                    t_state = "01_in_progress"

                if t_state == "1_canceled":
                    color = "#dc3545"  # Cancelled: red
                elif t_is_done or (not subtasks and t_state == "1_done"):
                    color = "#16a34a"  # Done / Atlikta: green with white border & checkmark
                    t_state = "1_done"
                    t_is_done = True
                    prog = 1.0
                elif metrics.get("is_approved") or (not subtasks and t_state == "03_approved"):
                    color = "#10b981"  # Approved: just green (no checkmark, no white border)
                    t_state = "03_approved"
                    t_is_done = False
                    prog = 1.0
                elif t_state == "02_changes_requested":
                    color = "#f59e0b"  # Changes Requested: orange
                elif t_state == "01_in_progress":
                    color = "#71639e"  # In Progress: Purple
                else:
                    color = "#71639e"
                    t_state = "01_in_progress"

            allocated_str = format_hours_label(t_alloc)

            # Deadline and Delay Calculation (see compute_task_delay)
            delay_info = compute_task_delay(t)
            dl_dt = delay_info["deadline"]
            deadline_str = dl_dt.strftime(dt_format) if dl_dt else False
            deadline_end_str = deadline_str
            has_deadline = bool(dl_dt)
            has_deadline_delay = bool(delay_info["kind"])
            delay_kind = delay_info["kind"]
            delay_days = delay_info["days"]
            delay_hours = round(delay_info["seconds"] / 3600.0, 1)
            delay_minutes = int(round(delay_info["seconds"] / 60.0))

            p_start_loc = utc_to_local_dt(self.env, t.planned_date_start) if t.planned_date_start else False
            p_end_loc = utc_to_local_dt(self.env, t.planned_date_end) if t.planned_date_end else False

            res = {
                "id": f"task_{t.id}",
                "odoo_id": t.id,
                "text": t.name or "Untitled Task",
                "type": "task",
                "open": False,
                "parent": parent_key,
                "start_date": t_start_str,
                "end_date": t_end_str,
                "work_start_date": work_start_str,
                "work_end_date": work_end_str,
                "planned_date_start": p_start_loc.strftime(dt_format) if p_start_loc else False,
                "planned_date_end": p_end_loc.strftime(dt_format) if p_end_loc else False,
                "date_deadline": deadline_str,
                "deadline_end": deadline_end_str,
                "has_deadline": has_deadline,
                "has_deadline_delay": has_deadline_delay,
                "delay_kind": delay_kind,
                "has_own_deadline": bool(t.date_deadline),
                "delay_minutes": delay_minutes,
                "plan_is_manual": bool(t.planned_date_start and t.planned_date_end) and not t.plan_is_auto,
                "deadline_is_auto": bool(t.deadline_is_auto),
                "timer_total_seconds": int(t.timer_total_seconds or 0),
                "delay_days": delay_days,
                "delay_hours": delay_hours,
                "has_dates": has_dates,
                "is_hourly": bool(has_dates and t_start.date() == t_end.date() and (t_end - t_start).total_seconds() < 9 * 3600),
                "is_timer_running": bool(t.is_timer_running),
                "timer_start": utc_to_local_dt(self.env, t.timer_start).strftime(dt_format) if t.timer_start else False,
                "progress": 0.0 if is_locked else round(prog, 2),
                "progress_percent": 0 if is_locked else round(prog * 100, 1),
                "allocated_hours": allocated_str,
                "allocated_hours_raw": t_alloc or 0.0,
                "effective_hours": f"{round(t.effective_hours, 1)}h" if t.effective_hours else "",
                "assignees": assignee_names,
                "assignee_avatars": avatars,
                "stage_name": t.stage_id.name if t.stage_id else "",
                "stage_id": t.stage_id.id if t.stage_id else False,
                "project_name": (t.project_id.name if t.project_id else (t.parent_id.project_id.name if t.parent_id and t.parent_id.project_id else "")),
                "project_id": (t.project_id.id if t.project_id else (t.parent_id.project_id.id if t.parent_id and t.parent_id.project_id else False)),
                "milestone_id": (t.milestone_id.id if t.milestone_id else (t.parent_id.milestone_id.id if t.parent_id and t.parent_id.milestone_id else False)),
                "milestone_name": (t.milestone_id.name if t.milestone_id else (t.parent_id.milestone_id.name if t.parent_id and t.parent_id.milestone_id else "")),
                "color": color,
                "state": t_state,
                "is_locked": is_locked,
                "blocking_tasks": ", ".join(blocking_tasks),
                "is_project": False,
                "is_milestone": False,
                "is_done": False if is_locked else bool(t_is_done),
                "readonly": not can_edit,
            }
            if not has_dates:
                res["duration"] = 1
            return res

        def add_task_hierarchy(t, parent_key, proj_tasks):
            if t.id in added_task_ids:
                return
            gantt_tasks.append(build_task_dict(t, parent_key))
            added_task_ids.add(t.id)

            # Subtasks
            children = proj_tasks.filtered(lambda c: c.parent_id.id == t.id and c.id not in added_task_ids)
            for child in children:
                add_task_hierarchy(child, f"task_{t.id}", proj_tasks)

        # Helper to check if task belongs to this project directly or via any ancestor
        def task_belongs_to_proj(task, proj_id):
            curr = task
            while curr:
                if curr.project_id and curr.project_id.id == proj_id:
                    return True
                curr = curr.parent_id
            return False

        # 1. Add project groups, milestones, and nested tasks
        for p in projects:
            p_key = f"proj_{p.id}"
            seen_project_keys.add(p_key)

            p_tasks = tasks.filtered(lambda t: task_belongs_to_proj(t, p.id))
            p_milestones = milestones.filtered(lambda m: m.project_id.id == p.id)

            # Project Base Dates (use scheduled tasks so an unscheduled task with no dates doesn't stretch a short project to 17:00)
            scheduled_p_tasks = p_tasks.filtered(lambda t: t.planned_date_start or t.planned_date_end or t.date_deadline or t.parent_id)
            span_p_tasks = scheduled_p_tasks or p_tasks
            task_date_pairs = [get_task_dates(t) for t in span_p_tasks] if span_p_tasks else []
            if p.date_start:
                p_start = datetime.combine(p.date_start, datetime.min.time()) if not isinstance(p.date_start, datetime) else utc_to_local_dt(self.env, p.date_start)
            elif task_date_pairs:
                p_start = min(pair[0] for pair in task_date_pairs)
            else:
                p_start = datetime.combine(utc_to_local_dt(self.env, p.create_date).date(), datetime.min.time()) if p.create_date else now_local

            if p_start.hour == 0 and p_start.minute == 0:
                p_start = p_start.replace(hour=8, minute=0, second=0)

            if p.date:
                p_end = datetime.combine(p.date, datetime.max.time().replace(microsecond=0)) if not isinstance(p.date, datetime) else utc_to_local_dt(self.env, p.date)
            elif task_date_pairs:
                p_end = max(pair[1] for pair in task_date_pairs)
            else:
                p_end = p_start.replace(hour=17, minute=0, second=0)

            if (p_end.hour == 0 and p_end.minute == 0) or (p_end.hour == 12 and p_end.minute == 0) or (p_end.hour == 23 and p_end.minute == 59):
                p_end = p_end.replace(hour=17, minute=0, second=0)

            # A PROJECT CANNOT BE SMALLER THAN ANY SCHEDULED TASK OR MILESTONE INSIDE IT!
            for t_s, t_e in task_date_pairs:
                if t_s < p_start:
                    p_start = t_s
                if t_e > p_end:
                    p_end = t_e

            for m in p_milestones:
                m_start_val = getattr(m, "date_start", False)
                if m_start_val:
                    m_s = datetime.combine(m_start_val, time(8, 0, 0)) if not isinstance(m_start_val, datetime) else utc_to_local_dt(self.env, m_start_val)
                    if m_s < p_start:
                        p_start = m_s
                m_end_val = getattr(m, "planned_date_end", False) or m.deadline
                if m_end_val:
                    m_dl = datetime.combine(m_end_val, time(17, 0, 0)) if not isinstance(m_end_val, datetime) else utc_to_local_dt(self.env, m_end_val)
                    if m_dl > p_end:
                        p_end = m_dl

            if p_end <= p_start:
                p_end = datetime.combine(p_start.date(), time(17, 0, 0))
                if p_end <= p_start:
                    p_end = p_start + timedelta(hours=1)

            # Grid alignment for Project Gantt visual bar (midnight boundaries)
            gantt_p_start = datetime.combine(p_start.date(), time.min)
            if p_end.time() > time.min:
                gantt_p_end = datetime.combine(p_end.date() + timedelta(days=1), time.min)
            else:
                gantt_p_end = datetime.combine(p_end.date(), time.min)

            if gantt_p_end <= gantt_p_start:
                gantt_p_end = gantt_p_start + timedelta(days=1)

            p_start_str = gantt_p_start.strftime(dt_format)
            p_end_str = gantt_p_end.strftime(dt_format)
            p_work_start_str = p_start.strftime(dt_format)
            p_work_end_str = p_end.strftime(dt_format)

            # Project Progress & Completion:
            total_allocated = sum(p_tasks.mapped("allocated_hours") or [0.0])

            # Auto-fill project allocated_hours from darbo valandos
            p_work_hours = calculate_lithuanian_working_hours(p_start, p_end)
            p_alloc = p.allocated_hours
            if p_work_hours > 0 and (not p_alloc or abs((p_alloc or 0.0) - p_work_hours) > 0.1):
                p_alloc = p_work_hours
                try:
                    p.with_context(mail_notrack=True).sudo().write({"allocated_hours": p_work_hours})
                except Exception:
                    pass

            display_proj_alloc = p_alloc or total_allocated
            p_stage_name = (p.stage_id.name or "").lower() if hasattr(p, "stage_id") and p.stage_id else ""
            p_self_done = bool("done" in p_stage_name or "closed" in p_stage_name or "completed" in p_stage_name or (getattr(p.stage_id, "is_closed", False) if hasattr(p, "stage_id") and p.stage_id else False))

            if p_tasks:
                top_p_tasks = p_tasks.filtered(lambda t: not t.parent_id or t.parent_id.id not in p_tasks.ids)
                p_task_metrics = [get_task_metrics(t) for t in (top_p_tasks or p_tasks)]
                all_p_done = all(tm["is_done"] for tm in p_task_metrics)
                avg_progress_val = sum(tm["progress"] for tm in p_task_metrics) / len(p_task_metrics)
                if all_p_done and len(p_task_metrics) > 0:
                    p_is_done = True
                    p_prog = 1.0
                else:
                    p_is_done = False
                    p_prog = min(0.99, round(avg_progress_val, 2))
            elif p_self_done:
                p_is_done = True
                p_prog = 1.0
            else:
                p_is_done = False
                p_prog = 0.0

            p_stage_name = (p.stage_id.name or "").lower() if p.stage_id else ""
            p_update_status = p.last_update_status or ""

            # Check project status (last_update_status from Kanban / Project form)
            if p_update_status == "on_hold":
                p_state = "04_on_hold"
                project_color = "#00a09d"
            elif p_update_status == "on_track":
                p_state = "03_on_track"
                project_color = "#10b981"
            elif p_update_status == "at_risk":
                p_state = "02_at_risk"
                project_color = "#f59e0b"
            elif p_update_status == "off_track":
                p_state = "1_off_track"
                project_color = "#ef4444"
            elif p_update_status == "done" or p_is_done or "done" in p_stage_name or "completed" in p_stage_name:
                p_state = "1_done"
                project_color = "#16a34a"
                p_is_done = True
            elif "approved" in p_stage_name or "patvirtinta" in p_stage_name:
                p_state = "03_approved"
                project_color = "#10b981"
            elif "changes" in p_stage_name or "koreg" in p_stage_name:
                p_state = "02_changes_requested"
                project_color = "#f59e0b"
            elif "cancel" in p_stage_name or "atšauk" in p_stage_name:
                p_state = "1_canceled"
                project_color = "#dc3545"
            elif "hold" in p_stage_name or "lauk" in p_stage_name:
                p_state = "04_on_hold"
                project_color = "#00a09d"
            else:
                p_state = "01_in_progress"
                project_color = "#5f5285"

            # Project Deadline and Delay Calculation
            p_deadline_str = False
            p_deadline_end_str = False
            p_has_deadline = False
            p_has_deadline_delay = False
            p_delay_days = 0
            p_delay_hours = 0.0
            p_delay_minutes = 0

            p_date_deadline = getattr(p, "date_deadline", False)
            p_own_dl = None
            if p_date_deadline:
                p_own_dl = p_date_deadline if isinstance(p_date_deadline, datetime) else datetime.combine(p_date_deadline, time(17, 0, 0))
            p_delay = compute_container_delay(p_own_dl, p_end, p_is_done, p_tasks)
            p_delay_kind = p_delay["kind"]
            if p_delay["deadline"]:
                p_has_deadline = True
                p_deadline_str = p_delay["deadline"].strftime(dt_format)
                p_deadline_end_str = p_deadline_str
            if p_delay_kind:
                p_has_deadline_delay = True
                p_delay_days = p_delay["days"]
                p_delay_hours = round(p_delay["seconds"] / 3600.0, 1)
                p_delay_minutes = int(round(p_delay["seconds"] / 60.0))

            gantt_tasks.append({
                "id": p_key,
                "odoo_id": p.id,
                "text": p.name or "Untitled Project",
                "open": False,
                "start_date": p_start_str,
                "end_date": p_end_str,
                "work_start_date": p_work_start_str,
                "work_end_date": p_work_end_str,
                "date_deadline": p_deadline_str,
                "deadline_end": p_deadline_end_str,
                "has_deadline": p_has_deadline,
                "has_deadline_delay": p_has_deadline_delay,
                "delay_kind": p_delay_kind,
                "delay_days": p_delay_days,
                "delay_hours": p_delay_hours,
                "delay_minutes": p_delay_minutes,
                "progress": round(p_prog, 2),
                "progress_percent": round(p_prog * 100, 1),
                "allocated_hours": format_hours_label(display_proj_alloc),
                "allocated_hours_raw": p_alloc or 0.0,
                "assignees": p.user_id.name or "",
                "assignee_avatars": [
                    {
                        "id": p.user_id.id,
                        "name": p.user_id.name,
                        "avatar": f"/web/image/res.users/{p.user_id.id}/avatar_128",
                    }
                ] if p.user_id else [],
                "color": project_color,
                "state": p_state,
                "last_update_status": p_update_status,
                "stage_name": p.stage_id.name if hasattr(p, "stage_id") and p.stage_id else "",
                "is_project": True,
                "is_milestone": False,
                "is_done": bool(p_is_done),
                "readonly": not can_edit,
            })

            # Add Milestones for this project
            for m in p_milestones:
                m_key = f"milestone_{m.id}"
                seen_milestone_keys.add(m_key)
                m_tasks = p_tasks.filtered(lambda t: t.milestone_id.id == m.id)

                # Milestone Base Start Date
                m_date_start = getattr(m, "date_start", False)
                if m_date_start:
                    m_start = datetime.combine(m.date_start, time(8, 0, 0)) if not isinstance(m.date_start, datetime) else utc_to_local_dt(self.env, m.date_start)
                elif m.deadline:
                    m_dl = datetime.combine(m.deadline, time(17, 0, 0)) if not isinstance(m.deadline, datetime) else utc_to_local_dt(self.env, m.deadline)
                    m_start = m_dl - timedelta(days=3)
                else:
                    m_start = p_start

                if m_start.hour == 0 and m_start.minute == 0:
                    m_start = m_start.replace(hour=8, minute=0, second=0)

                # Milestone Base End Date
                m_planned_date_end = getattr(m, "planned_date_end", False)
                if m_planned_date_end:
                    m_end = datetime.combine(m.planned_date_end, time(17, 0, 0)) if not isinstance(m.planned_date_end, datetime) else utc_to_local_dt(self.env, m.planned_date_end)
                elif m.deadline:
                    m_end = datetime.combine(m.deadline, time(17, 0, 0)) if not isinstance(m.deadline, datetime) else utc_to_local_dt(self.env, m.deadline)
                else:
                    m_end = m_start + timedelta(days=7)

                if (m_end.hour == 0 and m_end.minute == 0) or (m_end.hour == 12 and m_end.minute == 0) or (m_end.hour == 23 and m_end.minute == 59):
                    m_end = m_end.replace(hour=17, minute=0, second=0)

                # MILESTONE CAN NEVER BE SMALLER THAN ANY SCHEDULED TASK INSIDE IT!
                if m_tasks:
                    scheduled_m_tasks = m_tasks.filtered(lambda t: t.planned_date_start or t.planned_date_end or t.date_deadline or t.parent_id)
                    for t in (scheduled_m_tasks or m_tasks):
                        t_s, t_e = get_task_dates(t)
                        if t_s < m_start:
                            m_start = t_s
                        if t_e > m_end:
                            m_end = t_e

                if m_end <= m_start:
                    m_end = m_start + timedelta(days=1)

                # Grid alignment for Milestone Gantt visual bar (midnight boundaries)
                gantt_m_start = datetime.combine(m_start.date(), time.min)
                if m_end.time() > time.min:
                    gantt_m_end = datetime.combine(m_end.date() + timedelta(days=1), time.min)
                else:
                    gantt_m_end = datetime.combine(m_end.date(), time.min)

                if gantt_m_end <= gantt_m_start:
                    gantt_m_end = gantt_m_start + timedelta(days=1)

                m_start_str = gantt_m_start.strftime(dt_format)
                m_end_str = gantt_m_end.strftime(dt_format)
                m_work_start_str = m_start.strftime(dt_format)
                m_work_end_str = m_end.strftime(dt_format)

                m_allocated = sum(m_tasks.mapped("allocated_hours") or [0.0])

                # Milestone progress & completion: depends strictly on bottom tasks!
                if m_tasks:
                    top_m_tasks = m_tasks.filtered(lambda t: not t.parent_id or t.parent_id.id not in m_tasks.ids)
                    m_task_metrics = [get_task_metrics(t) for t in (top_m_tasks or m_tasks)]
                    all_m_done = all(tm["is_done"] for tm in m_task_metrics)
                    avg_m_prog = sum(tm["progress"] for tm in m_task_metrics) / len(m_task_metrics)
                    if all_m_done and len(m_task_metrics) > 0:
                        m_is_done = True
                        m_prog = 1.0
                    else:
                        m_is_done = False
                        m_prog = min(0.99, round(avg_m_prog, 2))
                elif m.is_reached:
                    m_is_done = True
                    m_prog = 1.0
                else:
                    m_is_done = False
                    m_prog = 0.0

                if m_is_done:
                    m_state = "1_done"
                    milestone_color = "#16a34a"
                else:
                    m_state = "01_in_progress"
                    milestone_color = "#2563eb"

                # Milestone Deadline and Delay Extension (only from genuinely delayed tasks or explicit milestone deadline)
                m_deadline_str = False
                m_deadline_end_str = False
                m_has_deadline = False
                m_has_deadline_delay = False
                m_delay_days = 0
                m_delay_hours = 0.0
                m_delay_minutes = 0

                m_dl_base = m.deadline if m.deadline else False
                m_own_dl = None
                if m_dl_base:
                    m_own_dl = m_dl_base if isinstance(m_dl_base, datetime) else datetime.combine(m_dl_base, time(17, 0, 0))
                m_delay = compute_container_delay(m_own_dl, m_end, m_is_done, m_tasks)
                m_delay_kind = m_delay["kind"]
                if m_delay["deadline"]:
                    m_has_deadline = True
                    m_deadline_str = m_delay["deadline"].strftime(dt_format)
                    m_deadline_end_str = m_deadline_str
                if m_delay_kind:
                    m_has_deadline_delay = True
                    m_delay_days = m_delay["days"]
                    m_delay_hours = round(m_delay["seconds"] / 3600.0, 1)
                    m_delay_minutes = int(round(m_delay["seconds"] / 60.0))

                gantt_tasks.append({
                    "id": m_key,
                    "odoo_id": m.id,
                    "text": m.name or "Gairė",
                    "type": "task",
                    "open": False,
                    "parent": p_key,
                    "start_date": m_start_str,
                    "end_date": m_end_str,
                    "work_start_date": m_work_start_str,
                    "work_end_date": m_work_end_str,
                    "planned_date_start": m_date_start.strftime(dt_format) if m_date_start else False,
                    "planned_date_end": m_planned_date_end.strftime(dt_format) if m_planned_date_end else False,
                    "date_deadline": m_deadline_str,
                    "deadline_end": m_deadline_end_str,
                    "has_deadline": m_has_deadline,
                    "has_deadline_delay": m_has_deadline_delay,
                    "delay_kind": m_delay_kind,
                    "delay_days": m_delay_days,
                    "delay_hours": m_delay_hours,
                    "delay_minutes": m_delay_minutes,
                    "progress": round(m_prog, 2),
                    "progress_percent": round(m_prog * 100, 1),
                    "allocated_hours": format_hours_label(m_allocated),
                    "assignees": "",
                    "assignee_avatars": [],
                    "project_name": p.name or "",
                    "project_id": p.id,
                    "task_count": m.task_count,
                    "done_task_count": m.done_task_count,
                    "color": milestone_color,
                    "state": m_state,
                    "is_project": False,
                    "is_milestone": True,
                    "is_done": m_is_done,
                    "readonly": not can_edit,
                })

                # Add tasks assigned to this milestone (Top-level tasks under milestone)
                top_m_tasks = m_tasks.filtered(lambda t: not t.parent_id or t.parent_id.id not in p_tasks.ids)
                for t in top_m_tasks:
                    add_task_hierarchy(t, m_key, p_tasks)

            # Top-level tasks without milestone (parent is project)
            top_no_m_tasks = p_tasks.filtered(
                lambda t: (not t.milestone_id or f"milestone_{t.milestone_id.id}" not in seen_milestone_keys)
                and (not t.parent_id or t.parent_id.id not in p_tasks.ids)
            )
            for t in top_no_m_tasks:
                add_task_hierarchy(t, p_key, p_tasks)

            # Any remaining tasks in this project
            remaining_p_tasks = p_tasks.filtered(lambda t: t.id not in added_task_ids)
            for t in remaining_p_tasks:
                add_task_hierarchy(t, p_key, p_tasks)

        # 2. Any tasks without project
        other_tasks = tasks.filtered(lambda t: t.id not in added_task_ids)
        for t in other_tasks:
            parent_k = f"task_{t.parent_id.id}" if (t.parent_id and t.parent_id.id in added_task_ids) else None
            add_task_hierarchy(t, parent_k, tasks)

        # 3. Add dependencies
        for t in tasks:
            for dep in t.depend_on_ids:
                links.append({
                    "id": f"link_{dep.id}_{t.id}",
                    "source": f"task_{dep.id}",
                    "target": f"task_{t.id}",
                    "type": "0",  # finish_to_start
                    "source_id": dep.id,
                    "target_id": t.id,
                })

        # 4. All projects for filter dropdown
        all_projects = self.env["project.project"].search([], order="name")
        project_list = [{"id": p.id, "name": p.name} for p in all_projects]

        return {
            "tasks": gantt_tasks,
            "links": links,
            "projects": project_list,
            "can_edit": can_edit,
        }

    @api.model
    def save_timeline_batch_schedule(self, updates):
        """
        Saves schedule changes (dates, progress) for a batch of projects, milestones, and tasks.
        Enables cascading drag-and-drop where moving a parent (project, milestone, parent task)
        moves all its child items together in a single transaction.
        """
        self._check_gannt_lt_edit_access()
        if not updates or not isinstance(updates, list):
            return False

        project_model = self.env["project.project"]
        milestone_model = self.env["project.milestone"]

        for item in updates:
            raw_id = item.get("id")
            if not raw_id:
                continue
            str_id = str(raw_id)
            start_date = item.get("start_date")
            end_date = item.get("end_date")
            progress = item.get("progress")

            # 1. Project
            if str_id.startswith("proj_"):
                try:
                    p_id = int(str_id.replace("proj_", ""))
                    proj = project_model.browse(p_id)
                    if proj.exists():
                        vals = {}
                        d_start = fields.Date.to_date(start_date) if start_date else proj.date_start
                        d_end = fields.Date.to_date(end_date) if end_date else proj.date
                        if start_date:
                            vals["date_start"] = d_start
                        if end_date:
                            vals["date"] = d_end
                        if d_start and d_end:
                            p_w_hours = calculate_lithuanian_working_hours(d_start, d_end)
                            if p_w_hours > 0:
                                vals["allocated_hours"] = p_w_hours
                        if vals:
                            proj.write(vals)
                except Exception as e:
                    _logger.warning("Error saving project %s schedule: %s", str_id, e)
                continue

            # 2. Milestone
            if str_id.startswith("milestone_"):
                try:
                    m_id = int(str_id.replace("milestone_", ""))
                    milestone = milestone_model.browse(m_id)
                    if milestone.exists():
                        vals = {}
                        d_start = fields.Date.to_date(start_date) if start_date else False
                        d_end = fields.Date.to_date(end_date) if end_date else False
                        if d_start and hasattr(milestone, "date_start"):
                            vals["date_start"] = d_start
                        if d_end and hasattr(milestone, "planned_date_end"):
                            vals["planned_date_end"] = d_end
                        if d_end:
                            vals["deadline"] = d_end
                        if progress is not None:
                            p_val = float(progress)
                            if p_val >= 0.99:
                                vals["is_reached"] = True
                            elif p_val == 0.0:
                                vals["is_reached"] = False
                        if vals:
                            milestone.write(vals)
                except Exception as e:
                    _logger.warning("Error saving milestone %s schedule: %s", str_id, e)
                continue

            # 3. Task / Subtask
            if str_id.startswith("task_"):
                str_id = str_id.replace("task_", "")

            try:
                t_id = int(str_id)
                task = self.browse(t_id)
                if task.exists():
                    vals = {}
                    dt_start_local = fields.Datetime.to_datetime(start_date) if start_date else utc_to_local_dt(self.env, task.planned_date_start)
                    dt_end_local = fields.Datetime.to_datetime(end_date) if end_date else utc_to_local_dt(self.env, task.planned_date_end or task.date_deadline)
                    dt_start_utc = local_to_utc_dt(self.env, dt_start_local) if dt_start_local else False
                    dt_end_utc = local_to_utc_dt(self.env, dt_end_local) if dt_end_local else False

                    if start_date:
                        vals["planned_date_start"] = dt_start_utc
                    if end_date:
                        vals["planned_date_end"] = dt_end_utc

                    if dt_start_local and dt_end_local:
                        t_w_hours = calculate_lithuanian_working_hours(dt_start_local, dt_end_local)
                        if t_w_hours > 0:
                            vals["allocated_hours"] = t_w_hours

                    # Check if task is locked by uncompleted dependencies
                    is_locked = False
                    if task.depend_on_ids:
                        for dep in task.depend_on_ids:
                            if dep.state != "1_done" and (not dep.progress or dep.progress < 100.0):
                                is_locked = True
                                break

                    if is_locked:
                        vals["progress"] = 0.0
                        vals["state"] = "04_waiting_normal"
                    elif progress is not None:
                        p_float = min(100.0, max(0.0, float(progress) * 100.0))
                        vals["progress"] = p_float
                        if p_float >= 99.0:
                            if task.state == "03_approved":
                                vals["state"] = "03_approved"
                            else:
                                vals["state"] = "1_done"
                        elif p_float < 100.0:
                            if task.state in ("1_done", "04_waiting_normal"):
                                vals["state"] = "01_in_progress"
                            task._cascade_clear_downstream_progress()
                    elif not is_locked and task.state == "04_waiting_normal":
                        vals["state"] = "01_in_progress"

                    if vals:
                        save_ctx = {"from_timeline_batch": True}
                        if task.plan_is_auto and task.child_ids:
                            # span derived from the subtasks: keep it "auto" (recomputed by the backend)
                            save_ctx["gannt_auto_plan"] = True
                        task.with_context(**save_ctx).write(vals)
            except Exception as e:
                _logger.warning("Error saving task %s schedule: %s", str_id, e)

        return True

    @api.model
    def save_task_schedule(self, task_id, start_date, end_date, progress=None):
        """Single item wrapper for backward compatibility."""
        self._check_gannt_lt_edit_access()
        return self.save_timeline_batch_schedule([{
            "id": task_id,
            "start_date": start_date,
            "end_date": end_date,
            "progress": progress,
        }])

    @api.model
    def delete_timeline_task(self, task_id):
        """Deletes a task from the timeline."""
        self._check_gannt_lt_edit_access()
        if isinstance(task_id, str) and task_id.startswith("task_"):
            task_id = int(task_id.replace("task_", ""))
        task = self.browse(int(task_id))
        if task.exists():
            return task.unlink()
        return False

    @api.model
    def delete_timeline_milestone(self, milestone_id):
        """Deletes a milestone from the timeline."""
        self._check_gannt_lt_edit_access()
        if isinstance(milestone_id, str) and milestone_id.startswith("milestone_"):
            milestone_id = int(milestone_id.replace("milestone_", ""))
        milestone = self.env["project.milestone"].browse(int(milestone_id))
        if milestone.exists():
            return milestone.unlink()
        return False

    @api.model
    def add_timeline_dependency(self, source_id, target_id):
        """Adds finish-to-start dependency."""
        self._check_gannt_lt_edit_access()
        if isinstance(source_id, str) and source_id.startswith("task_"):
            source_id = int(source_id.replace("task_", ""))
        if isinstance(target_id, str) and target_id.startswith("task_"):
            target_id = int(target_id.replace("task_", ""))

        target_task = self.browse(int(target_id))
        if target_task.exists():
            target_task.write({"depend_on_ids": [(4, int(source_id))]})
            return True
        return False

    @api.model
    def remove_timeline_dependency(self, source_id, target_id):
        """Removes dependency."""
        self._check_gannt_lt_edit_access()
        if isinstance(source_id, str) and source_id.startswith("task_"):
            source_id = int(source_id.replace("task_", ""))
        if isinstance(target_id, str) and target_id.startswith("task_"):
            target_id = int(target_id.replace("task_", ""))

        target_task = self.browse(int(target_id))
        if target_task.exists():
            target_task.write({"depend_on_ids": [(3, int(source_id))]})
            return True
        return False

    # GanntLT Aliases for seamless RPC calls
    @api.model
    def get_gannt_lt_data(self, project_id=None, domain=None, date_start=None, date_end=None, user_id=None, model_name=None):
        return self.get_all_in_one_timeline_data(project_id, domain, date_start, date_end, user_id, model_name)

    @api.model
    def save_gannt_lt_task_dates(self, task_id, start_date=None, end_date=None, progress=None, state=None, cascade_shifts=None):
        return self.save_timeline_task_dates(task_id, start_date, end_date, progress, state, cascade_shifts)

    @api.model
    def delete_gannt_lt_task(self, task_id):
        return self.delete_timeline_task(task_id)

    @api.model
    def delete_gannt_lt_milestone(self, milestone_id):
        return self.delete_timeline_milestone(milestone_id)

    @api.model
    def add_gannt_lt_dependency(self, source_id, target_id):
        return self.add_timeline_dependency(source_id, target_id)

    @api.model
    def remove_gannt_lt_dependency(self, source_id, target_id):
        return self.remove_timeline_dependency(source_id, target_id)

