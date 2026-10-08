from odoo import api, fields, models


class ProjectMilestone(models.Model):
    _inherit = "project.milestone"

    date_start = fields.Date(string="Start Date", copy=False)
    planned_date_end = fields.Date(string="Planned End Date", copy=False)

    @api.onchange("task_ids", "planned_date_end")
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
