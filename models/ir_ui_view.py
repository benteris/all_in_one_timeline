# -*- coding: utf-8 -*-
from odoo import fields, models

TIMELINE_VIEW = ("timeline", "Timeline")


class IrUIView(models.Model):
    _inherit = "ir.ui.view"

    type = fields.Selection(selection_add=[TIMELINE_VIEW])

    def _is_qweb_based_view(self, view_type):
        return view_type == TIMELINE_VIEW[0] or super()._is_qweb_based_view(view_type)

    def _get_view_info(self):
        return {"timeline": {"icon": "fa fa-tasks"}} | super()._get_view_info()
