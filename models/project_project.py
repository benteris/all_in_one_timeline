# -*- coding: utf-8 -*-
from odoo import api, fields, models


class ProjectProject(models.Model):
    _inherit = "project.project"

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
