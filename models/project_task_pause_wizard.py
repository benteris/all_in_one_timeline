from odoo import models, fields, api, _
from odoo.tools.misc import format_datetime
from markupsafe import Markup
import logging

_logger = logging.getLogger(__name__)


class ProjectTaskPauseWizard(models.TransientModel):
    _name = "project.task.pause.wizard"
    _description = "Pristabdyti užduotį / Pause Task Wizard"

    task_id = fields.Many2one(
        "project.task",
        string="Užduotis / Task",
        required=True,
        readonly=True,
    )
    timer_start = fields.Datetime(
        string="Laikmačio pradžia / Timer Start",
        readonly=True,
    )
    duration_display = fields.Char(
        string="Užfiksuota trukmė / Elapsed Duration",
        compute="_compute_duration",
    )
    reason = fields.Text(
        string="Priežastis kodėl stabdoma / Pause Reason",
        required=True,
    )

    @api.depends("timer_start", "task_id")
    def _compute_duration(self):
        now = fields.Datetime.now()
        for rec in self:
            t_start = rec.timer_start or (rec.task_id and rec.task_id.timer_start)
            if t_start:
                diff_sec = max(0, int((now - t_start).total_seconds()))
                mins = diff_sec // 60
                hrs = mins // 60
                rem_mins = mins % 60
                rem_sec = diff_sec % 60
                if hrs > 0:
                    dur_str = f"{hrs} val. {rem_mins} min."
                elif mins > 0:
                    dur_str = f"{mins} min. {rem_sec} sek."
                else:
                    dur_str = f"{diff_sec} sek."
                h_float = round(max(0.01, diff_sec / 3600.0), 2)
                rec.duration_display = f"{dur_str} ({h_float} val.)"
            else:
                rec.duration_display = "0 sek."

    def action_confirm_pause(self):
        self.ensure_one()
        task = self.task_id
        if not task:
            return {"type": "ir.actions.act_window_close"}

        now = fields.Datetime.now()
        t_start = task.timer_start or self.timer_start or now
        diff_sec = max(0, int((now - t_start).total_seconds()))
        eff_sec = int(round((task.effective_hours or 0.0) * 3600))
        cur_total_sec = max(task.timer_total_seconds or 0, eff_sec)
        new_total_sec = cur_total_sec + diff_sec

        elapsed_hours = max(0.01, round(diff_sec / 3600.0, 2)) if diff_sec > 0 else 0.0
        mins = diff_sec // 60
        rem_sec = diff_sec % 60
        dur_str = f"{mins} min. {rem_sec} sek." if mins > 0 else f"{diff_sec} sek."

        # 1. Register in Timesheets (account.analytic.line)
        emp = self.env.user.employee_id
        if not emp and "hr.employee" in self.env:
            emp = self.env["hr.employee"].search([("user_id", "=", self.env.uid)], limit=1)
        if not emp and "hr.employee" in self.env:
            emp = self.env["hr.employee"].search([], limit=1)

        company = task.company_id or (emp and emp.company_id) or self.env.company
        if task.project_id and "account.analytic.line" in self.env and elapsed_hours > 0:
            try:
                self.env["account.analytic.line"].create({
                    "name": self.reason or "Pristabdyta (Paused)",
                    "task_id": task.id,
                    "project_id": task.project_id.id,
                    "employee_id": emp.id if emp else False,
                    "user_id": emp.user_id.id if emp and emp.user_id else self.env.uid,
                    "company_id": company.id if company else False,
                    "date": fields.Date.today(),
                    "unit_amount": elapsed_hours,
                })
            except Exception as e:
                _logger.warning("Could not create timesheet line on pause: %s", e)

        # 2. Post to Chatter with reason and duration
        user_name = self.env.user.name
        tz = self.env.user.tz or self.env.context.get("tz") or "Europe/Vilnius"
        try:
            pause_time_str = format_datetime(self.env, now, tz=tz, dt_format="yyyy-MM-dd HH:mm:ss")
        except Exception:
            pause_time_str = now.strftime("%Y-%m-%d %H:%M:%S")

        chatter_body = (
            f"⏸️ <b>Darbai pristabdyti (Task Paused):</b> {user_name} pristabdė darbą [{pause_time_str}].<br/>"
            f"• <b>Užregistruota darbo žiniaraštyje (Timesheets):</b> {elapsed_hours} val. ({dur_str})<br/>"
            f"• <b>Priežastis:</b> {self.reason}"
        )
        task.message_post(body=Markup(chatter_body), subtype_xmlid="mail.mt_note")

        # 3. Update task timer state and accumulated seconds
        task.write({
            "is_timer_running": False,
            "timer_start": False,
            "timer_total_seconds": new_total_sec,
        })

        return {"type": "ir.actions.act_window_close"}
