# -*- coding: utf-8 -*-
from datetime import timedelta
from odoo import api, fields, models


class ProjectMilestone(models.Model):
    _inherit = "project.milestone"

    date_start = fields.Date(string="Start Date", copy=False)
    planned_date_end = fields.Date(string="Planned End Date", copy=False)

    # NOTE: the milestone `deadline` is user data. It is NEVER derived from the planned end date or
    # from task deadlines (that used to create phantom deadlines and fake delays). Delays are computed
    # on the fly by the timeline from planned_date_end vs deadline.

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("deadline") and not vals.get("planned_date_end"):
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

    @api.onchange("planned_date_end")
    def _onchange_planned_date_end(self):
        for ms in self:
            if ms.planned_date_end and not ms.date_start:
                ms.date_start = ms.planned_date_end - timedelta(days=7)

    @api.onchange("deadline")
    def _onchange_deadline(self):
        for ms in self:
            if ms.deadline and not ms.planned_date_end:
                ms.planned_date_end = ms.deadline
            if ms.planned_date_end and not ms.date_start:
                ms.date_start = ms.planned_date_end - timedelta(days=7)
