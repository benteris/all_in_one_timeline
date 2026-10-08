# -*- coding: utf-8 -*-
from odoo import api, fields, models
from .project_task import calculate_lithuanian_working_hours


class ProjectProject(models.Model):
    _inherit = "project.project"

    date_deadline = fields.Date(
        string="Deadline",
        copy=False,
        tracking=True,
        help="Final deadline for the project. If later than the planned date, indicates delay.",
    )

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if "allocated_hours" not in vals:
                s = vals.get("date_start")
                e = vals.get("date") or vals.get("date_deadline")
                if s and e:
                    try:
                        s_dt = fields.Date.to_date(s) if isinstance(s, str) else s
                        e_dt = fields.Date.to_date(e) if isinstance(e, str) else e
                        w_h = calculate_lithuanian_working_hours(s_dt, e_dt)
                        if w_h > 0:
                            vals["allocated_hours"] = w_h
                    except Exception:
                        pass
        return super().create(vals_list)

    def write(self, vals):
        if ("date_start" in vals or "date" in vals or "date_deadline" in vals) and "allocated_hours" not in vals:
            for rec in self:
                s_val = vals.get("date_start") or rec.date_start
                e_val = vals.get("date") or rec.date or vals.get("date_deadline") or rec.date_deadline
                if s_val and e_val:
                    try:
                        s_dt = fields.Date.to_date(s_val) if isinstance(s_val, str) else s_val
                        e_dt = fields.Date.to_date(e_val) if isinstance(e_val, str) else e_val
                        w_h = calculate_lithuanian_working_hours(s_dt, e_dt)
                        if w_h > 0:
                            vals["allocated_hours"] = w_h
                    except Exception:
                        pass
                break
        return super().write(vals)

    def action_open_all_in_one_timeline(self):
        """Opens All In One Timeline filtered for this project."""
        self.ensure_one()
        return {
            "type": "ir.actions.client",
            "name": f"{self.name} - Timeline",
            "tag": "all_in_one_timeline.action",
            "context": {
                "default_project_id": self.id,
                "active_id": self.id,
            },
        }

