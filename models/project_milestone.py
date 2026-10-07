# -*- coding: utf-8 -*-
from odoo import fields, models


class ProjectMilestone(models.Model):
    _inherit = "project.milestone"

    date_start = fields.Date("Pradžios data / Start Date")
