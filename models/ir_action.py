# -*- coding: utf-8 -*-
from odoo import fields, models
from .ir_ui_view import TIMELINE_VIEW


class ActWindowView(models.Model):
    _inherit = "ir.actions.act_window.view"

    view_mode = fields.Selection(
        selection_add=[TIMELINE_VIEW], ondelete={"timeline": "cascade"}
    )
