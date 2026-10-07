# -*- coding: utf-8 -*-
from odoo import api, fields, models


class ProjectProject(models.Model):
    _inherit = "project.project"

    def action_open_all_in_one_timeline(self):
        """Opens All In One Timeline filtered for this project as standard viewable window action."""
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": f"{self.name} - Timeline",
            "res_model": "project.task",
            "view_mode": "timeline,kanban,list,form",
            "views": [(False, "timeline"), (False, "kanban"), (False, "list"), (False, "form")],
            "domain": [("project_id", "=", self.id)],
            "context": {
                "default_project_id": self.id,
                "active_id": self.id,
            },
        }
