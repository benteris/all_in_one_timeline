# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.tools.sql import column_exists
from .project_task import calculate_lithuanian_working_hours


class ProjectProject(models.Model):
    _inherit = "project.project"

    date_deadline = fields.Date(
        string="Deadline",
        copy=False,
        tracking=True,
        help="Final deadline for the project. If later than the planned date, indicates delay.",
    )

    def _auto_init(self):
        res = super()._auto_init()
        if column_exists(self.env.cr, "project_project", "billing_type"):
            self.env.cr.execute("""
                ALTER TABLE project_project ALTER COLUMN billing_type SET DEFAULT 'not_billable'
            """)
        return res

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        if "billing_type" in self._fields and not res.get("billing_type"):
            res["billing_type"] = "not_billable"
        return res

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if "billing_type" in self._fields and not vals.get("billing_type"):
                vals["billing_type"] = "not_billable"
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
            if len(self) == 1:
                rec = self[0]
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
        return super().write(vals)

    def action_open_gannt_lt(self):
        """Opens GanntLT filtered for this project."""
        self.ensure_one()
        return {
            "type": "ir.actions.client",
            "name": f"{self.name} - GanntLT",
            "tag": "gannt_lt.action",
            "context": {
                "default_project_id": self.id,
                "active_id": self.id,
            },
        }

    def action_open_all_in_one_timeline(self):
        """Alias for backward compatibility."""
        return self.action_open_gannt_lt()


