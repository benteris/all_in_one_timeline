# -*- coding: utf-8 -*-
from datetime import datetime, timedelta
from odoo import api, fields, models


class ProjectMilestone(models.Model):
    _inherit = "project.milestone"

    date_start = fields.Date(string="Start Date", copy=False)
    planned_date_end = fields.Date(string="Planned End Date", copy=False)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if "deadline" in vals and not vals.get("planned_date_end"):
                vals["planned_date_end"] = vals["deadline"]
            if vals.get("planned_date_end") and not vals.get("date_start"):
                p_end = fields.Date.to_date(vals["planned_date_end"])
                if p_end:
                    vals["date_start"] = p_end - timedelta(days=7)
            elif vals.get("date_start") and not vals.get("planned_date_end"):
                p_start = fields.Date.to_date(vals["date_start"])
                if p_start:
                    vals["planned_date_end"] = p_start + timedelta(days=7)
        return super().create(vals_list)

    def write(self, vals):
        if "planned_date_end" in vals and "deadline" not in vals:
            p_end = fields.Date.to_date(vals.get("planned_date_end"))
            if p_end:
                for ms in self:
                    task_deadlines = [
                        t.date_deadline.date() if isinstance(t.date_deadline, datetime) else t.date_deadline
                        for t in ms.task_ids if t.date_deadline
                    ]
                    if task_deadlines and max(task_deadlines) > p_end:
                        vals["deadline"] = max(task_deadlines)
                    elif not ms.deadline or ms.deadline < p_end:
                        vals["deadline"] = p_end
        elif "deadline" in vals and "planned_date_end" not in vals:
            for ms in self:
                if not ms.planned_date_end:
                    vals["planned_date_end"] = vals["deadline"]
        return super().write(vals)

    @api.onchange("planned_date_end")
    def _onchange_planned_date_end(self):
        for ms in self:
            if ms.planned_date_end and not ms.date_start:
                ms.date_start = ms.planned_date_end - timedelta(days=7)
            if ms.planned_date_end:
                task_deadlines = [t.date_deadline for t in ms.task_ids if t.date_deadline]
                if task_deadlines and max(task_deadlines) > ms.planned_date_end:
                    ms.deadline = max(task_deadlines)
                elif not ms.deadline or ms.deadline < ms.planned_date_end:
                    ms.deadline = ms.planned_date_end

    @api.onchange("deadline")
    def _onchange_deadline(self):
        for ms in self:
            if ms.deadline and not ms.planned_date_end:
                ms.planned_date_end = ms.deadline
            if ms.planned_date_end and not ms.date_start:
                ms.date_start = ms.planned_date_end - timedelta(days=7)

    @api.onchange("task_ids")
    def _onchange_task_deadlines(self):
        """When tasks have deadlines that exceed the milestone planned date or deadline,
        automatically extend the milestone deadline."""
        for ms in self:
            deadlines = [t.date_deadline for t in ms.task_ids if t.date_deadline]
            base_date = ms.planned_date_end or ms.deadline
            if deadlines and base_date:
                max_dl = max(deadlines)
                if max_dl > base_date and (not ms.deadline or max_dl > ms.deadline):
                    ms.deadline = max_dl
