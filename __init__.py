# -*- coding: utf-8 -*-
from . import models
from . import controllers
import logging

_logger = logging.getLogger(__name__)


def uninstall_hook(env):
    """Cleanly removes 'timeline' from view_mode of standard Odoo project window actions

    so that views continue to function seamlessly after GanntLT is uninstalled.
    """
    actions_to_clean = [
        "project.action_view_task",
        "project.project_task_action_from_partner",
        "project.act_project_project_2_project_task_all",
        "project.action_view_all_task",
        "project.open_view_project_all",
        "project.open_view_project_all_group_stage",
    ]
    for xml_id in actions_to_clean:
        action = env.ref(xml_id, raise_if_not_found=False)
        if action and action.view_mode:
            modes = [m.strip() for m in action.view_mode.split(",") if m.strip() and m.strip() != "timeline"]
            action.write({"view_mode": ",".join(modes)})
            _logger.info("GanntLT uninstall_hook: Removed 'timeline' from %s (new view_mode: %s)", xml_id, action.view_mode)
