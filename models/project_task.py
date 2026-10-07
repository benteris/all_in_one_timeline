from datetime import datetime, timedelta, time
from odoo import api, fields, models
import logging

_logger = logging.getLogger(__name__)


class ProjectTask(models.Model):
    _inherit = "project.task"

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
            else:
                t_s = t.date_assign or t.create_date or now

            # If start time is 00:00 (midnight / unassigned time), set standard work start 08:00
            if t_s.hour == 0 and t_s.minute == 0:
                t_s = t_s.replace(hour=8, minute=0, second=0)

            # User-assigned or default end
            if t.planned_date_end:
                t_e = t.planned_date_end
            elif t.date_deadline:
                t_e = t.date_deadline
            else:
                t_e = t_s + timedelta(days=3)

            # If end time is 00:00 or 12:00 (Odoo default noon UTC), set standard work end 17:00
            if (t_e.hour == 0 and t_e.minute == 0) or (t_e.hour == 12 and t_e.minute == 0):
                t_e = t_e.replace(hour=17, minute=0, second=0)

            # Encompass subtasks: parent task can NEVER be smaller than subtasks inside it!
            subtasks = tasks.filtered(lambda s: s.parent_id.id == t.id)
            if subtasks:
                for sub in subtasks:
                    sub_s, sub_e = get_task_dates(sub)
                    if sub_s < t_s:
                        t_s = sub_s
                    if sub_e > t_e:
                        t_e = sub_e

            if t_e <= t_s:
                t_e = t_s.replace(hour=17, minute=0, second=0)
                if t_e <= t_s:
                    t_e = (t_s + timedelta(days=1)).replace(hour=17, minute=0, second=0)

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



        def build_task_dict(t, parent_key):
            metrics = get_task_metrics(t)
            t_is_done = metrics["is_done"]
            prog = metrics["progress"]

            t_start, t_end = get_task_dates(t)

            # Grid alignment for DHTMLX Gantt visual coordinates (midnight boundaries)
            gantt_start = datetime.combine(t_start.date(), time.min)
            if t_end.time() > time.min:
                gantt_end = datetime.combine(t_end.date() + timedelta(days=1), time.min)
            else:
                gantt_end = datetime.combine(t_end.date(), time.min)

            if gantt_end <= gantt_start:
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

            # Task color: Green for done, Red for canceled, Grey for folded, Purple for in progress
            if t_is_done:
                color = "#28a745"  # Green for done
            elif t.state == "1_canceled":
                color = "#dc3545"  # Red for canceled
            elif t.stage_id and t.stage_id.fold:
                color = "#6c757d"  # Grey
            else:
                color = "#71639e"  # Standard Odoo Community purple

            allocated_str = f"{round(t.allocated_hours, 1)}h" if t.allocated_hours else ""

            return {
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
                "progress": round(prog, 2),
                "progress_percent": round(prog * 100, 1),
                "allocated_hours": allocated_str,
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
                "is_project": False,
                "is_milestone": False,
                "is_done": bool(t_is_done),
                "readonly": False,
            }

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

            project_color = "#28a745" if p_is_done else "#5f5285"

            gantt_tasks.append({
                "id": p_key,
                "odoo_id": p.id,
                "text": p.name or "Untitled Project",
                "open": True,
                "start_date": p_start_str,
                "end_date": p_end_str,
                "work_start_date": p_work_start_str,
                "work_end_date": p_work_end_str,
                "progress": round(p_prog, 2),
                "progress_percent": round(p_prog * 100, 1),
                "allocated_hours": f"{round(total_allocated, 1)}h" if total_allocated else "",
                "assignees": p.user_id.name or "",
                "assignee_avatars": [
                    {
                        "id": p.user_id.id,
                        "name": p.user_id.name,
                        "avatar": f"/web/image/res.users/{p.user_id.id}/avatar_128",
                    }
                ] if p.user_id else [],
                "color": project_color,
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
                if m.deadline:
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

                milestone_color = "#28a745" if m_is_done else "#f59e0b"

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
                        if start_date:
                            vals["date_start"] = fields.Date.to_date(start_date)
                        if end_date:
                            vals["date"] = fields.Date.to_date(end_date)
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
                        if start_date and hasattr(milestone, "date_start"):
                            vals["date_start"] = fields.Date.to_date(start_date)
                        if end_date:
                            vals["deadline"] = fields.Date.to_date(end_date)
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
                    if start_date:
                        vals["planned_date_start"] = fields.Datetime.to_datetime(start_date)
                    if end_date:
                        dt_end = fields.Datetime.to_datetime(end_date)
                        vals["planned_date_end"] = dt_end
                        vals["date_deadline"] = dt_end
                    if progress is not None:
                        vals["progress"] = min(100.0, max(0.0, float(progress) * 100.0))
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
