# -*- coding: utf-8 -*-
from odoo.addons.base.models.ir_actions import VIEW_TYPES
from .ir_ui_view import TIMELINE_VIEW

if TIMELINE_VIEW not in VIEW_TYPES:
    VIEW_TYPES.append(TIMELINE_VIEW)
