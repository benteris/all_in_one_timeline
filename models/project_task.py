from datetime import datetime, timedelta, time, date
from odoo import api, fields, models
import logging

_logger = logging.getLogger(__name__)


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
    Calculates actual working hours (8 hours per work day, 8:00 - 17:00)
    excluding weekends (Saturday, Sunday) and Lithuanian national public holidays.
    If end_dt is midnight (00:00:00) and represents a Gantt boundary ending the previous day,
    the active work day is shifted to end_dt - 1 day.
    """
    if not start_dt or not end_dt:
        return 0.0
    s_date = start_dt.date() if isinstance(start_dt, datetime) else start_dt
    if isinstance(end_dt, datetime):
        e_date = end_dt.date()
        if end_dt.hour == 0 and end_dt.minute == 0 and end_dt.second == 0 and e_date > s_date:
            e_date = e_date - timedelta(days=1)
    else:
        e_date = end_dt
    if e_date < s_date:
        return 0.0

    holidays = get_lithuanian_holidays(s_date.year)
    if e_date.year != s_date.year:
        holidays.update(get_lithuanian_holidays(e_date.year))

    work_days = 0
    curr = s_date
    while curr <= e_date:
        if curr.weekday() < 5 and curr not in holidays:
            work_days += 1
        curr += timedelta(days=1)

    return float(work_days * 8)


class ProjectTask(models.Model):
    _inherit = "project.task"

    def _cascade_clear_downstream_progress(self):
        """
        When a task or parent task is not finished (reopened, waiting, in progress, etc.),
        all dependent downstream tasks (dependent_ids) and child subtasks (child_ids)
        must have their completion percentage cleared (progress = 0.0) and status
        reset to waiting/locked (state = '04_waiting_normal').
        Recursively cascades throughout the entire downstream dependency chain.
        """
        for task in self:
            for dep in task.dependent_ids:
                if dep.state == "1_done" or (dep.progress and dep.progress > 0):
                    dep.sudo().write({"progress": 0.0, "state": "04_waiting_normal"})
                    dep._cascade_clear_downstream_progress()
            for child in task.child_ids:
                if child.state == "1_done" or (child.progress and child.progress > 0):
                    child.sudo().write({"progress": 0.0, "state": "04_waiting_normal"})
                    child._cascade_clear_downstream_progress()

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if "stage_id" in vals and "state" not in vals:
                try:
                    stage = self.env["project.task.type"].browse(vals["stage_id"])
                    stage_name = (stage.name or "").lower()
                    if "lauk" in stage_name or "wait" in stage_name:
                        vals["state"] = "04_waiting_normal"
                except Exception:
                    pass

            # Auto-fill allocated_hours from actual working hours (darbo valandos)
            if "allocated_hours" not in vals:
                s = vals.get("planned_date_start")
                e = vals.get("planned_date_end") or vals.get("date_deadline")
                if s and e:
                    try:
                        s_dt = fields.Datetime.to_datetime(s) if isinstance(s, str) else s
                        e_dt = fields.Datetime.to_datetime(e) if isinstance(e, str) else e
                        w_h = calculate_lithuanian_working_hours(s_dt, e_dt)
                        if w_h > 0:
                            vals["allocated_hours"] = w_h
                    except Exception:
                        pass

        records = super().create(vals_list)
        for rec in records:
            if rec.milestone_id and rec.date_deadline:
                ms = rec.milestone_id
                base = ms.planned_date_end or ms.deadline
                rec_dl = rec.date_deadline.date() if isinstance(rec.date_deadline, datetime) else rec.date_deadline
                if base and rec_dl > base and (not ms.deadline or rec_dl > ms.deadline):
                    try:
                        ms.sudo().write({"deadline": rec_dl})
                    except Exception:
                        pass
        return records

    def write(self, vals):
        if "stage_id" in vals and "state" not in vals:
            try:
                stage = self.env["project.task.type"].browse(vals["stage_id"])
                stage_name = (stage.name or "").lower()
                if "lauk" in stage_name or "wait" in stage_name:
                    vals["state"] = "04_waiting_normal"
                elif "vykd" in stage_name or "progress" in stage_name:
                    vals["state"] = "01_in_progress"
            except Exception:
                pass

        # Auto-update allocated_hours from working hours (darbo valandos) if dates are modified
        if ("planned_date_start" in vals or "planned_date_end" in vals or "date_deadline" in vals) and "allocated_hours" not in vals:
            for rec in self:
                s_val = vals.get("planned_date_start") if "planned_date_start" in vals else rec.planned_date_start
                e_val = vals.get("planned_date_end") if "planned_date_end" in vals else (rec.planned_date_end or (vals.get("date_deadline") if "date_deadline" in vals else rec.date_deadline))
                if not s_val and not e_val:
                    vals["allocated_hours"] = 0.0
                elif s_val and e_val:
                    try:
                        s_dt = fields.Datetime.to_datetime(s_val) if isinstance(s_val, str) else s_val
                        e_dt = fields.Datetime.to_datetime(e_val) if isinstance(e_val, str) else e_val
                        w_h = calculate_lithuanian_working_hours(s_dt, e_dt)
                        if w_h > 0:
                            vals["allocated_hours"] = w_h
                    except Exception:
                        pass
                break

        res = super().write(vals)

        # Parent task and Milestone deadline propagation
        if "date_deadline" in vals or "planned_date_end" in vals or "parent_id" in vals or "milestone_id" in vals:
            for rec in self:
                child_target = rec.date_deadline or rec.planned_date_end
                if not child_target:
                    continue
                child_dt = child_target if isinstance(child_target, datetime) else datetime.combine(child_target, time(17, 0, 0))
                child_date = child_dt.date()

                # 1. Propagate up the parent task hierarchy
                curr_parent = rec.parent_id
                while curr_parent:
                    p_dl = curr_parent.date_deadline
                    p_end = curr_parent.planned_date_end
                    need_update = False
                    if not p_dl or (isinstance(p_dl, datetime) and child_dt > p_dl) or (not isinstance(p_dl, datetime) and child_date > p_dl):
                        need_update = True
                    elif p_end and ((isinstance(p_end, datetime) and child_dt > p_end) or (not isinstance(p_end, datetime) and child_date > p_end)):
                        need_update = True

                    if need_update:
                        try:
                            curr_parent.sudo().write({"date_deadline": child_dt})
                        except Exception:
                            pass
                    curr_parent = curr_parent.parent_id

                # 2. Propagate to milestone
                if rec.milestone_id:
                    ms = rec.milestone_id
                    ms_dl = ms.deadline
                    ms_end = getattr(ms, "planned_date_end", False) or ms.deadline
                    if (not ms_dl or child_date > ms_dl) or (ms_end and child_date > ms_end):
                        try:
                            ms.sudo().write({"deadline": child_date})
                        except Exception:
                            pass

        # If task state/progress changed to not done, clear downstream dependent tasks
        for rec in self:
            is_not_done = (
                (rec.state and rec.state != "1_done")
                or (rec.progress is not None and rec.progress < 100.0)
                or (rec.stage_id and not getattr(rec.stage_id, "is_closed", False) and "done" not in (rec.stage_id.name or "").lower())
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

        if domain:
            if is_project_model:
                try:
                    projects = project_model.search(proj_domain + domain)
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
                    tasks = task_model.search(task_domain + domain, order="project_id, sequence, id")
                except Exception as e:
                    _logger.warning("Domain %s failed on task search: %s. Trying project search fallback.", domain, e)
                    try:
                        projects = project_model.search(proj_domain + domain)
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
        dt_format = "%Y-%m-%d %H:%M:%S"

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

        def get_task_dates(t):
            if t.id in task_dates_cache:
                return task_dates_cache[t.id]

            # User-assigned or default start
            if t.planned_date_start:
                t_s = t.planned_date_start
                if t_s.hour == 0 and t_s.minute == 0:
                    t_s = t_s.replace(hour=8, minute=0, second=0)
            else:
                base_dt = t.date_assign or t.create_date or now
                t_s = datetime.combine(base_dt.date(), time(8, 0, 0))

            # User-assigned or default end
            if t.planned_date_end:
                t_e = t.planned_date_end
                if (t_e.hour == 0 and t_e.minute == 0) or (t_e.hour == 12 and t_e.minute == 0):
                    t_e = t_e.replace(hour=17, minute=0, second=0)
            elif t.date_deadline:
                t_e = t.date_deadline
                if (t_e.hour == 0 and t_e.minute == 0) or (t_e.hour == 12 and t_e.minute == 0):
                    t_e = t_e.replace(hour=17, minute=0, second=0)
            else:
                # If task has NO end date and NO deadline:
                # Takes span of exactly one day on the timeline (same day 17:00)
                t_e = datetime.combine(t_s.date(), time(17, 0, 0))

            # Encompass subtasks: parent task can NEVER be smaller than subtasks inside it!
            subtasks = tasks.filtered(lambda s: s.parent_id.id == t.id)
            if subtasks:
                for sub in subtasks:
                    sub_s, sub_e = get_task_dates(sub)
                    if sub_s < t_s:
                        t_s = sub_s
                    if not t.planned_date_end and sub_e > t_e:
                        t_e = sub_e

            if t_e < t_s:
                t_e = datetime.combine(t_s.date(), time(17, 0, 0))
                if t_e <= t_s:
                    t_e = datetime.combine(t_s.date() + timedelta(days=1), time(17, 0, 0))

            task_dates_cache[t.id] = (t_s, t_e)
            return t_s, t_e

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
                avg_sub_prog = sum(sr["progress"] for sr in sub_results) / len(sub_results)

                if all_subs_done and len(subtasks) > 0:
                    res = {"is_done": True, "progress": 1.0}
                else:
                    # Not all bottom tasks are finished: cannot be 100% or done!
                    res = {"is_done": False, "progress": min(0.99, round(avg_sub_prog, 2))}
            else:
                # Leaf task (no subtasks): its own completion state in Odoo
                stage_name = (t.stage_id.name or "").lower() if t.stage_id else ""
                is_done = bool(
                    t.state == "1_done"
                    or getattr(t.stage_id, "is_closed", False)
                    or "done" in stage_name
                    or "completed" in stage_name
                    or "closed" in stage_name
                    or (t.progress and t.progress >= 99.9)
                )
                if is_done:
                    res = {"is_done": True, "progress": 1.0}
                else:
                    p = (t.progress / 100.0) if t.progress else 0.0
                    if p == 0.0 and t.allocated_hours and t.effective_hours:
                        p = min(0.99, t.effective_hours / t.allocated_hours)
                    res = {"is_done": False, "progress": min(0.99, max(0.0, p))}

            task_metrics_cache[t.id] = res
            return res

        def get_all_descendant_deadlines(task_obj):
            dls = []
            child_tasks = tasks.filtered(lambda c: c.parent_id.id == task_obj.id)
            for child in child_tasks:
                if child.date_deadline:
                    dls.append(child.date_deadline if isinstance(child.date_deadline, datetime) else datetime.combine(child.date_deadline, time(17, 0, 0)))
                if child.planned_date_end:
                    child_pe = child.planned_date_end if isinstance(child.planned_date_end, datetime) else datetime.combine(child.planned_date_end, time(17, 0, 0))
                    if not task_obj.planned_date_end or child_pe > task_obj.planned_date_end:
                        dls.append(child_pe)
                dls.extend(get_all_descendant_deadlines(child))
            return dls

        def build_task_dict(t, parent_key):
            metrics = get_task_metrics(t)
            t_is_done = metrics["is_done"]
            prog = metrics["progress"]

            t_start, t_end = get_task_dates(t)
            has_dates = bool(t.planned_date_start or t.planned_date_end or t.date_deadline)

            # Auto-fill task allocated_hours directly from darbo valandos (working hours) if unset or 0.0
            # If task has NO planned dates and NO deadline: it shouldn't show hours!
            if not has_dates:
                if t.allocated_hours:
                    try:
                        t.sudo().write({"allocated_hours": 0.0})
                    except Exception:
                        pass
                t_alloc = 0.0
                allocated_str = ""
            else:
                t_alloc = t.allocated_hours
                if not t_alloc:
                    w_h = calculate_lithuanian_working_hours(t_start, t_end)
                    if w_h > 0:
                        t_alloc = w_h
                        try:
                            t.sudo().write({"allocated_hours": w_h})
                        except Exception:
                            pass
                allocated_str = f"{round(t_alloc, 1)}h" if t_alloc else ""

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
            # If parents or predecessor status changed, progress must clear and reflect 0%
            if is_locked:
                prog = 0.0
                t_is_done = False
                color = "#1e293b"  # Dark Charcoal Steel for locked tasks
                t_state = "locked"
                if (t.progress and t.progress > 0) or t.state == "1_done":
                    try:
                        t.sudo().write({"progress": 0.0, "state": "04_waiting_normal"})
                    except Exception:
                        pass
            elif t_state == "1_canceled":
                color = "#dc3545"  # Cancelled: red
            elif t_state == "1_done" or t_is_done:
                color = "#16a34a"  # Done / Atlikta: green with white border & checkmark
                t_state = "1_done"
                t_is_done = True
                prog = 1.0
            elif t_state == "03_approved":
                color = "#10b981"  # Approved: just green
            elif t_state == "02_changes_requested":
                color = "#f59e0b"  # Changes Requested: orange
            elif t_state == "04_waiting_normal" or "lauk" in stage_name or "wait" in stage_name:
                # Non-locked Laukiam: standard grey like in Odoo task statuses
                color = "#64748b"
                t_state = "04_waiting_normal"
            elif t_state == "01_in_progress":
                color = "#71639e"  # In Progress: Purple
            else:
                color = "#71639e"
                t_state = "01_in_progress"

            allocated_str = f"{round(t_alloc, 1)}h" if t_alloc else ""

            # Deadline and Delay Calculation (encompassing all descendant subtask deadlines)
            deadline_str = False
            deadline_end_str = False
            has_deadline = False
            has_deadline_delay = False
            delay_days = 0

            child_dls = get_all_descendant_deadlines(t)
            candidate_dls = []
            if t.date_deadline:
                candidate_dls.append(t.date_deadline if isinstance(t.date_deadline, datetime) else datetime.combine(t.date_deadline, time(17, 0, 0)))
            if child_dls:
                candidate_dls.append(max(child_dls))

            if candidate_dls:
                effective_dl = max(candidate_dls)
                has_deadline = True
                dl_dt = effective_dl
                deadline_str = dl_dt.strftime(dt_format)

                # Keep database record in sync if child tasks pushed deadline further
                if not t.date_deadline or (isinstance(t.date_deadline, datetime) and t.date_deadline < effective_dl) or (not isinstance(t.date_deadline, datetime) and t.date_deadline < effective_dl.date()):
                    try:
                        t.sudo().write({"date_deadline": effective_dl})
                    except Exception:
                        pass

                # Midnight boundary for visual end of deadline on Gantt grid
                if dl_dt.time() > time.min:
                    gantt_dl_end = datetime.combine(dl_dt.date() + timedelta(days=1), time.min)
                else:
                    gantt_dl_end = datetime.combine(dl_dt.date(), time.min)

                deadline_end_str = gantt_dl_end.strftime(dt_format)

                # Delay occurs if deadline extends past the planned work end date
                if dl_dt.date() > t_end.date():
                    has_deadline_delay = True
                    delay_days = (dl_dt.date() - t_end.date()).days
                elif dl_dt.date() < t_end.date():
                    delay_days = -(t_end.date() - dl_dt.date()).days

            res = {
                "id": f"task_{t.id}",
                "odoo_id": t.id,
                "text": t.name or "Untitled Task",
                "type": "task",
                "open": True,
                "parent": parent_key,
                "start_date": t_start_str,
                "end_date": t_end_str,
                "work_start_date": work_start_str,
                "work_end_date": work_end_str,
                "planned_date_start": t.planned_date_start.strftime(dt_format) if t.planned_date_start else False,
                "planned_date_end": t.planned_date_end.strftime(dt_format) if t.planned_date_end else False,
                "date_deadline": deadline_str,
                "deadline_end": deadline_end_str,
                "has_deadline": has_deadline,
                "has_deadline_delay": has_deadline_delay,
                "delay_days": delay_days,
                "has_dates": has_dates,
                "progress": 0.0 if is_locked else round(prog, 2),
                "progress_percent": 0 if is_locked else round(prog * 100, 1),
                "allocated_hours": allocated_str,
                "allocated_hours_raw": t_alloc or 0.0,
                "effective_hours": f"{round(t.effective_hours, 1)}h" if t.effective_hours else "",
                "assignees": assignee_names,
                "assignee_avatars": avatars,
                "stage_name": t.stage_id.name if t.stage_id else "",
                "stage_id": t.stage_id.id if t.stage_id else False,
                "project_name": t.project_id.name if t.project_id else "",
                "project_id": t.project_id.id if t.project_id else False,
                "milestone_id": t.milestone_id.id if t.milestone_id else False,
                "milestone_name": t.milestone_id.name if t.milestone_id else "",
                "color": color,
                "state": t_state,
                "is_locked": is_locked,
                "blocking_tasks": ", ".join(blocking_tasks),
                "is_project": False,
                "is_milestone": False,
                "is_done": False if is_locked else bool(t_is_done),
                "readonly": False,
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

        # 1. Add project groups, milestones, and nested tasks
        for p in projects:
            p_key = f"proj_{p.id}"
            seen_project_keys.add(p_key)

            p_tasks = tasks.filtered(lambda t: t.project_id.id == p.id)
            p_milestones = milestones.filtered(lambda m: m.project_id.id == p.id)

            # Project Base Dates
            if p.date_start:
                p_start = datetime.combine(p.date_start, datetime.min.time()) if not isinstance(p.date_start, datetime) else p.date_start
            else:
                p_start = datetime.combine(p.create_date.date(), datetime.min.time()) if p.create_date else now

            if p_start.hour == 0 and p_start.minute == 0:
                p_start = p_start.replace(hour=8, minute=0, second=0)

            if p.date:
                p_end = datetime.combine(p.date, datetime.max.time().replace(microsecond=0)) if not isinstance(p.date, datetime) else p.date
            else:
                p_end = p_start + timedelta(days=30)

            if (p_end.hour == 0 and p_end.minute == 0) or (p_end.hour == 12 and p_end.minute == 0):
                p_end = p_end.replace(hour=17, minute=0, second=0)

            # A PROJECT CANNOT BE SMALLER THAN ANY TASK OR MILESTONE INSIDE IT!
            for t in p_tasks:
                t_s, t_e = get_task_dates(t)
                if t_s < p_start:
                    p_start = t_s
                if t_e > p_end:
                    p_end = t_e

            for m in p_milestones:
                if m.deadline:
                    m_dl = datetime.combine(m.deadline, time(17, 0, 0)) if not isinstance(m.deadline, datetime) else m.deadline
                    if m_dl > p_end:
                        p_end = m_dl

            if p_end <= p_start:
                p_end = p_start + timedelta(days=1)

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

            # Auto-fill project allocated_hours from darbo valandos if unset or 0.0
            p_alloc = p.allocated_hours
            if not p_alloc:
                p_work_hours = calculate_lithuanian_working_hours(p_start, p_end)
                if p_work_hours > 0:
                    p_alloc = p_work_hours
                    try:
                        p.sudo().write({"allocated_hours": p_work_hours})
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

            p_date_deadline = getattr(p, "date_deadline", False)
            candidate_p_deadlines = []
            if p_date_deadline:
                candidate_p_deadlines.append(p_date_deadline if not isinstance(p_date_deadline, datetime) else p_date_deadline.date())
            for t in p_tasks:
                if t.date_deadline:
                    candidate_p_deadlines.append(t.date_deadline.date() if isinstance(t.date_deadline, datetime) else t.date_deadline)
            for m in p_milestones:
                if m.deadline:
                    candidate_p_deadlines.append(m.deadline if not isinstance(m.deadline, datetime) else m.deadline.date())

            if candidate_p_deadlines:
                p_has_deadline = True
                p_effective_dl = max(candidate_p_deadlines)
                p_dl_dt = datetime.combine(p_effective_dl, time(17, 0, 0))
                p_deadline_str = p_dl_dt.strftime(dt_format)

                # Midnight boundary for visual end of deadline on Gantt grid
                gantt_p_dl_end = datetime.combine(p_effective_dl + timedelta(days=1), time.min)
                p_deadline_end_str = gantt_p_dl_end.strftime(dt_format)

                if p_effective_dl > p_end.date():
                    p_has_deadline_delay = True
                    p_delay_days = (p_effective_dl - p_end.date()).days
                elif p_effective_dl < p_end.date():
                    p_delay_days = -(p_end.date() - p_effective_dl).days

            gantt_tasks.append({
                "id": p_key,
                "odoo_id": p.id,
                "text": p.name or "Untitled Project",
                "open": True,
                "start_date": p_start_str,
                "end_date": p_end_str,
                "work_start_date": p_work_start_str,
                "work_end_date": p_work_end_str,
                "date_deadline": p_deadline_str,
                "deadline_end": p_deadline_end_str,
                "has_deadline": p_has_deadline,
                "has_deadline_delay": p_has_deadline_delay,
                "delay_days": p_delay_days,
                "progress": round(p_prog, 2),
                "progress_percent": round(p_prog * 100, 1),
                "allocated_hours": f"{round(display_proj_alloc, 1)}h" if display_proj_alloc else "",
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
                "readonly": False,
            })

            # Add Milestones for this project
            for m in p_milestones:
                m_key = f"milestone_{m.id}"
                seen_milestone_keys.add(m_key)
                m_tasks = p_tasks.filtered(lambda t: t.milestone_id.id == m.id)

                # Milestone Base Start Date
                m_date_start = getattr(m, "date_start", False)
                if m_date_start:
                    m_start = datetime.combine(m.date_start, time(8, 0, 0)) if not isinstance(m.date_start, datetime) else m.date_start
                elif m.deadline:
                    m_dl = datetime.combine(m.deadline, time(17, 0, 0)) if not isinstance(m.deadline, datetime) else m.deadline
                    m_start = m_dl - timedelta(days=3)
                else:
                    m_start = p_start

                if m_start.hour == 0 and m_start.minute == 0:
                    m_start = m_start.replace(hour=8, minute=0, second=0)

                # Milestone Base End Date
                m_planned_date_end = getattr(m, "planned_date_end", False)
                if m_planned_date_end:
                    m_end = datetime.combine(m.planned_date_end, time(17, 0, 0)) if not isinstance(m.planned_date_end, datetime) else m.planned_date_end
                elif m.deadline:
                    m_end = datetime.combine(m.deadline, time(17, 0, 0)) if not isinstance(m.deadline, datetime) else m.deadline
                else:
                    m_end = m_start + timedelta(days=7)

                if (m_end.hour == 0 and m_end.minute == 0) or (m_end.hour == 12 and m_end.minute == 0):
                    m_end = m_end.replace(hour=17, minute=0, second=0)

                # MILESTONE CAN NEVER BE SMALLER THAN ANY TASK INSIDE IT!
                if m_tasks:
                    for t in m_tasks:
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

                # Milestone Deadline and Automatic Delay Extension from Contained Tasks
                m_deadline_str = False
                m_deadline_end_str = False
                m_has_deadline = False
                m_has_deadline_delay = False
                m_delay_days = 0

                task_deadlines = []
                for t in m_tasks:
                    if t.date_deadline:
                        t_dl = t.date_deadline.date() if isinstance(t.date_deadline, datetime) else t.date_deadline
                        task_deadlines.append(t_dl)

                m_dl_base = m.deadline if m.deadline else False
                candidate_ms_deadlines = list(task_deadlines)
                if m_dl_base:
                    candidate_ms_deadlines.append(m_dl_base)

                if candidate_ms_deadlines:
                    m_has_deadline = True
                    m_effective_dl = max(candidate_ms_deadlines)

                    # Keep milestone database record in sync if tasks pushed deadline further
                    if not m.deadline or m.deadline < m_effective_dl:
                        try:
                            m.sudo().write({"deadline": m_effective_dl})
                        except Exception:
                            pass

                    m_dl_dt = datetime.combine(m_effective_dl, time(17, 0, 0))
                    m_deadline_str = m_dl_dt.strftime(dt_format)

                    # Midnight boundary for visual end of deadline on Gantt grid
                    gantt_m_dl_end = datetime.combine(m_effective_dl + timedelta(days=1), time.min)
                    m_deadline_end_str = gantt_m_dl_end.strftime(dt_format)

                    if m_effective_dl > m_end.date():
                        m_has_deadline_delay = True
                        m_delay_days = (m_effective_dl - m_end.date()).days
                    elif m_effective_dl < m_end.date():
                        m_delay_days = -(m_end.date() - m_effective_dl).days

                gantt_tasks.append({
                    "id": m_key,
                    "odoo_id": m.id,
                    "text": m.name or "Gairė",
                    "type": "task",
                    "open": True,
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
                    "delay_days": m_delay_days,
                    "progress": round(m_prog, 2),
                    "progress_percent": round(m_prog * 100, 1),
                    "allocated_hours": f"{round(m_allocated, 1)}h" if m_allocated else "",
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
                    "readonly": False,
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
        }

    @api.model
    def save_timeline_batch_schedule(self, updates):
        """
        Saves schedule changes (dates, progress) for a batch of projects, milestones, and tasks.
        Enables cascading drag-and-drop where moving a parent (project, milestone, parent task)
        moves all its child items together in a single transaction.
        """
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
                            if hasattr(proj, "date_deadline") and (not proj.date_deadline or (proj.date and proj.date_deadline == proj.date)):
                                vals["date_deadline"] = d_end
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
                            task_deadlines = [
                                t.date_deadline.date() if isinstance(t.date_deadline, datetime) else t.date_deadline
                                for t in milestone.task_ids if t.date_deadline
                            ]
                            if task_deadlines and max(task_deadlines) > d_end:
                                vals["deadline"] = max(task_deadlines)
                            else:
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
                    dt_start = fields.Datetime.to_datetime(start_date) if start_date else task.planned_date_start
                    dt_end = fields.Datetime.to_datetime(end_date) if end_date else (task.planned_date_end or task.date_deadline)
                    if start_date:
                        vals["planned_date_start"] = dt_start
                    if end_date:
                        vals["planned_date_end"] = dt_end
                        # Only update date_deadline if it was unset or if it was synchronized with planned_date_end
                        if not task.date_deadline or (task.planned_date_end and task.date_deadline.date() == task.planned_date_end.date()):
                            vals["date_deadline"] = dt_end

                    if dt_start and dt_end:
                        t_w_hours = calculate_lithuanian_working_hours(dt_start, dt_end)
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
                        if p_float < 100.0:
                            task._cascade_clear_downstream_progress()

                    if vals:
                        task.write(vals)
            except Exception as e:
                _logger.warning("Error saving task %s schedule: %s", str_id, e)

        return True

    @api.model
    def save_task_schedule(self, task_id, start_date, end_date, progress=None):
        """Single item wrapper for backward compatibility."""
        return self.save_timeline_batch_schedule([{
            "id": task_id,
            "start_date": start_date,
            "end_date": end_date,
            "progress": progress,
        }])


    @api.model
    def delete_timeline_task(self, task_id):
        """Deletes a task from the timeline."""
        if isinstance(task_id, str) and task_id.startswith("task_"):
            task_id = int(task_id.replace("task_", ""))
        task = self.browse(int(task_id))
        if task.exists():
            return task.unlink()
        return False

    @api.model
    def delete_timeline_milestone(self, milestone_id):
        """Deletes a milestone from the timeline."""
        if isinstance(milestone_id, str) and milestone_id.startswith("milestone_"):
            milestone_id = int(milestone_id.replace("milestone_", ""))
        milestone = self.env["project.milestone"].browse(int(milestone_id))
        if milestone.exists():
            return milestone.unlink()
        return False

    @api.model
    def add_timeline_dependency(self, source_id, target_id):
        """Adds finish-to-start dependency."""
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
        if isinstance(source_id, str) and source_id.startswith("task_"):
            source_id = int(source_id.replace("task_", ""))
        if isinstance(target_id, str) and target_id.startswith("task_"):
            target_id = int(target_id.replace("task_", ""))

        target_task = self.browse(int(target_id))
        if target_task.exists():
            target_task.write({"depend_on_ids": [(3, int(source_id))]})
            return True
        return False
