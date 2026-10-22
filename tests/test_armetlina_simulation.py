# -*- coding: utf-8 -*-
"""
UAB „Armetlina“ Gamybos ir Projektų Valdymo Modeliavimo ir Streso Testavimo Sistema
==================================================================================

Vieningas, pakartotinai paleidžiamas testavimo skriptas:
- Sukuria 5 skyrių struktūrą, 12 darbuotojų/vartotojų (+ Eleną), visi slaptažodžiai: 'demo123'.
- Sukuria 5 realius gamybos projektus (2026-2027) su 4 lygių gylio WBS hierarchija
  (Projektas -> Užduotis -> Subtask -> Sub-subtask -> Sub-sub-subtask).
- Patikrina visus 10 Worklock logikos ribinių atvejų (E1 - E10).
- Užfiksuoja gyvas gamybos būsenas (Karolio bėgantis laikmatis, Elenos pauzė su priežastimi,
  žalios/raudonos uodegėlės, vėluojančio projekto 🔥 liepsnelė).
- Patikrina saugų modulio išdiegimą (uninstall_hook).
- Gali būti vykdomas kaip Odoo TransactionCase testas arba tiesiogiai per 'odoo shell'.
"""

import logging
from datetime import datetime, date, timedelta
from odoo import fields
from odoo.tests.common import TransactionCase
from odoo.exceptions import UserError, ValidationError, AccessError
from odoo.addons.GanntLT.models.project_task import (
    calculate_lithuanian_working_hours,
    get_lithuanian_holidays,
)
from odoo.addons.GanntLT import uninstall_hook

_logger = logging.getLogger(__name__)


# -------------------------------------------------------------------------
# UAB „Armetlina“ Vartotojų ir Skyrių Konfigūracija
# -------------------------------------------------------------------------
ARMETLINA_DEPARTMENTS = [
    "Projektų valdymo skyrius",
    "Pardavimų skyrius",
    "Projektavimo skyrius",
    "Pirkimų skyrius",
    "Gamybos skyrius",
]

ARMETLINA_USERS = [
    {
        "login": "bjasiulis@gmail.com",
        "name": "Benas Jasiulis",
        "email": "bjasiulis@gmail.com",
        "department": "Projektų valdymo skyrius",
        "job_title": "Projektų vadovas (PM)",
        "role": "pm",
        "groups": ["project.group_project_manager", "project.group_project_milestone", "GanntLT.group_gannt_lt_manager", "base.group_system"],
    },
    {
        "login": "head_sales",
        "name": "Saulius Vaitkevičius",
        "email": "head_sales@armetlina.lt",
        "department": "Pardavimų skyrius",
        "job_title": "Pardavimų skyriaus vadovas",
        "role": "head",
        "groups": ["project.group_project_user", "GanntLT.group_gannt_lt_manager"],
    },
    {
        "login": "sales_rep",
        "name": "Tomas Giedraitis",
        "email": "sales_rep@armetlina.lt",
        "department": "Pardavimų skyrius",
        "job_title": "Pardavimų vadybininkas",
        "role": "worker",
        "groups": ["project.group_project_user", "GanntLT.group_gannt_lt_user"],
    },
    {
        "login": "head_design",
        "name": "Nerijus Kazlauskas",
        "email": "head_design@armetlina.lt",
        "department": "Projektavimo skyrius",
        "job_title": "Projektavimo skyriaus vadovas",
        "role": "head",
        "groups": ["project.group_project_user", "GanntLT.group_gannt_lt_manager"],
    },
    {
        "login": "eng_electrical",
        "name": "Vytautas Jonaitis",
        "email": "eng_electrical@armetlina.lt",
        "department": "Projektavimo skyrius",
        "job_title": "Elektros inžinierius-projektuotojas",
        "role": "worker",
        "groups": ["project.group_project_user", "GanntLT.group_gannt_lt_user"],
    },
    {
        "login": "eng_structural",
        "name": "Arūnas Petrauskas",
        "email": "eng_structural@armetlina.lt",
        "department": "Projektavimo skyrius",
        "job_title": "Konstruktorius-inžinierius (3D)",
        "role": "worker",
        "groups": ["project.group_project_user", "GanntLT.group_gannt_lt_user"],
    },
    {
        "login": "head_procurement",
        "name": "Laura Mažeikytė",
        "email": "head_procurement@armetlina.lt",
        "department": "Pirkimų skyrius",
        "job_title": "Pirkimų skyriaus vadovė",
        "role": "head",
        "groups": ["project.group_project_user", "GanntLT.group_gannt_lt_manager"],
    },
    {
        "login": "procurement_specialist",
        "name": "Rokas Balčiūnas",
        "email": "procurement_specialist@armetlina.lt",
        "department": "Pirkimų skyrius",
        "job_title": "Pirkimų vadybininkas",
        "role": "worker",
        "groups": ["project.group_project_user", "GanntLT.group_gannt_lt_user"],
    },
    {
        "login": "head_production",
        "name": "Artūras Jankauskas",
        "email": "head_production@armetlina.lt",
        "department": "Gamybos skyrius",
        "job_title": "Gamybos skyriaus vadovas",
        "role": "head",
        "groups": ["project.group_project_user", "GanntLT.group_gannt_lt_manager"],
    },
    {
        "login": "worker_laser",
        "name": "Mantas Vaitkus",
        "email": "worker_laser@armetlina.lt",
        "department": "Gamybos skyrius",
        "job_title": "CNC lazerio operatorius",
        "role": "worker",
        "groups": ["project.group_project_user", "GanntLT.group_gannt_lt_user"],
    },
    {
        "login": "worker_assembly",
        "name": "Karolis Šimkus",
        "email": "worker_assembly@armetlina.lt",
        "department": "Gamybos skyrius",
        "job_title": "Elektromonteris / Šynyno meistras",
        "role": "worker",
        "groups": ["project.group_project_user", "GanntLT.group_gannt_lt_user"],
    },
    {
        "login": "qa_tester",
        "name": "Greta Norkutė",
        "email": "qa_tester@armetlina.lt",
        "department": "Gamybos skyrius",
        "job_title": "Laboratorijos bandytoja (QA)",
        "role": "worker",
        "groups": ["project.group_project_user", "GanntLT.group_gannt_lt_user"],
    },
    {
        "login": "elena_p",
        "name": "Elena Petrauskienė",
        "email": "elena_p@armetlina.lt",
        "department": "Gamybos skyrius",
        "job_title": "Elektromontuotoja",
        "role": "worker",
        "groups": ["project.group_project_user", "GanntLT.group_gannt_lt_user"],
    },
]


def cleanup_old_test_projects(env):
    """
    Step 1: Clean up old test projects (ID 99, 114, 162-165, or names with 'TEST',
    'Circular', 'Del Proj', 'Empty Proj', 'Proj AC', and prior Armetlina projects).
    """
    _logger.info("--- Step 1: Valomi seni testiniai ir bandomieji projektai ---")
    project_obj = env["project.project"].sudo()
    task_obj = env["project.task"].sudo()

    old_ids = [99, 114, 162, 163, 164, 165]
    name_patterns = [
        "%TEST%", "%Circular%", "%Del Proj%", "%Empty Proj%", "%Proj AC%",
        "PRJ-%", "%MKT-1000%", "%Armetlina%", "%E-House%", "%telemetrija%"
    ]

    domain = ["|"] * (len(name_patterns) + (1 if old_ids else 0) - 1)
    if old_ids:
        domain.append(("id", "in", old_ids))
    for pat in name_patterns:
        domain.append(("name", "=ilike", pat))

    old_projects = project_obj.search(domain)
    _logger.info("Rasta senų projektų trynimui: %s", len(old_projects))
    for p in old_projects:
        try:
            # Delete associated timesheets first to avoid unlink restriction
            if "account.analytic.line" in env:
                env["account.analytic.line"].sudo().search([("project_id", "=", p.id)]).unlink()
            # Delete associated milestones
            if "project.milestone" in env:
                env["project.milestone"].sudo().search([("project_id", "=", p.id)]).unlink()
            tasks = task_obj.search([("project_id", "=", p.id)])
            tasks.unlink()
            p.unlink()
        except Exception as e:
            _logger.warning("Klaida trinant seną projektą %s: %s", p.name, e)


def setup_armetlina_company_and_users(env):
    """
    Step 2: Create all 12 users/employees (+ Elena) with password 'demo123',
    departments, job titles, and appropriate Odoo / GanntLT security groups.
    """
    _logger.info("--- Step 2: Kuriama UAB „Armetlina“ 5 skyrių ir darbuotojų struktūra ---")
    res_users = env["res.users"].sudo()
    hr_dept = env["hr.department"].sudo() if "hr.department" in env else None
    hr_emp = env["hr.employee"].sudo() if "hr.employee" in env else None
    base_group_user = env.ref("base.group_user")

    # 1. Create or get departments
    dept_map = {}
    if hr_dept:
        for d_name in ARMETLINA_DEPARTMENTS:
            dept = hr_dept.search([("name", "=", d_name)], limit=1)
            if not dept:
                dept = hr_dept.create({"name": d_name})
            dept_map[d_name] = dept

    # 2. Create or update users
    user_map = {}
    for u_conf in ARMETLINA_USERS:
        login = u_conf["login"]
        user = res_users.search([("login", "=", login)], limit=1)

        # Resolve security groups
        grp_ids = [base_group_user.id]
        for g_xml in u_conf["groups"]:
            grp = env.ref(g_xml, raise_if_not_found=False)
            if grp and grp.id not in grp_ids:
                grp_ids.append(grp.id)

        user_vals = {
            "name": u_conf["name"],
            "login": login,
            "email": u_conf["email"],
            "password": "demo123",
            "tz": "Europe/Vilnius",
            "notification_type": "email",
        }

        if not user:
            user_vals["group_ids"] = [(6, 0, grp_ids)]
            user = res_users.create(user_vals)
            _logger.info("Sukurtas vartotojas: %s (%s)", user.name, user.login)
        else:
            user_vals["group_ids"] = [(4, gid) for gid in grp_ids]
            user.write(user_vals)
            _logger.info("Atnaujintas vartotojas: %s (%s)", user.name, user.login)

        user_map[login] = user

        # 3. Create or link hr.employee
        if hr_emp:
            emp = hr_emp.search([("user_id", "=", user.id)], limit=1)
            emp_vals = {
                "name": user.name,
                "user_id": user.id,
                "work_email": user.email,
                "job_title": u_conf["job_title"],
            }
            if hr_dept and u_conf["department"] in dept_map:
                emp_vals["department_id"] = dept_map[u_conf["department"]].id

            if not emp:
                emp = hr_emp.create(emp_vals)
            else:
                emp.write(emp_vals)

    return user_map, dept_map


def instantiate_armetlina_projects(env, user_map):
    """
    Step 3: Instantiate 5 realistic 1-year projects (2026-2027) with Milestones,
    Tasks, Subtasks, Sub-subtasks, and Sub-sub-subtasks (4 levels deep WBS).
    """
    _logger.info("--- Step 3: Kuriami 5 realūs gamybos projektai su 4 lygių WBS ---")
    project_obj = env["project.project"].sudo()
    milestone_obj = env["project.milestone"].sudo()
    task_obj = env["project.task"].sudo()

    pm_user = user_map["bjasiulis@gmail.com"]

    def create_project(name, date_start, date_end):
        p_vals = {
            "name": name,
            "user_id": pm_user.id,
            "date_start": date_start,
            "date": date_end,
            "privacy_visibility": "employees",
            "allow_task_dependencies": True,
        }
        if "billing_type" in project_obj._fields:
            p_vals["billing_type"] = "not_billable"
        return project_obj.create(p_vals)

    # =========================================================================
    # PRJ-01: Modulinė transformatorinė MKT-1000/10/0,4 (1 metų pagrindinis)
    # =========================================================================
    p1 = create_project(
        "PRJ-01: Modulinė transformatorinė MKT-1000/10/0,4 (Lietuvos elektros tinklams)",
        date(2026, 1, 5),
        date(2026, 12, 18),
    )

    # 4 Milestones
    m1_1 = milestone_obj.create({
        "name": "M1: Techninis suderinimas ir projektavimas patvirtintas",
        "project_id": p1.id,
        "deadline": date(2026, 4, 10),
    })
    m1_2 = milestone_obj.create({
        "name": "M2: Medžiagos ir komponentai sandėlyje",
        "project_id": p1.id,
        "deadline": date(2026, 6, 30),
    })
    m1_3 = milestone_obj.create({
        "name": "M3: Gamyba ir elektromontažas baigtas",
        "project_id": p1.id,
        "deadline": date(2026, 10, 30),
    })
    m1_4 = milestone_obj.create({
        "name": "M4: Bandymai atlikti ir gaminys priduotas ESO",
        "project_id": p1.id,
        "deadline": date(2026, 12, 18),
    })

    # Department 1: Pardavimų skyrius (4-level deep WBS)
    t1_sales = task_obj.create({
        "name": "1. Pardavimų etapas: Užsakymo derinimas su ESO",
        "project_id": p1.id,
        "user_ids": [(6, 0, [user_map["head_sales"].id])],
        "planned_date_start": datetime(2026, 1, 5, 8, 0, 0),
        "planned_date_end": datetime(2026, 2, 13, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
        "milestone_id": m1_1.id,
    })
    t1_sales_sub = task_obj.create({
        "name": "1.1 Techninių reikalavimų suderinimas su ESO",
        "project_id": p1.id,
        "parent_id": t1_sales.id,
        "user_ids": [(6, 0, [user_map["sales_rep"].id])],
        "planned_date_start": datetime(2026, 1, 5, 8, 0, 0),
        "planned_date_end": datetime(2026, 1, 23, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
    })
    t1_sales_sub_sub = task_obj.create({
        "name": "1.1.1 ESO prijungimo sąlygų analizė ir specifikacija",
        "project_id": p1.id,
        "parent_id": t1_sales_sub.id,
        "user_ids": [(6, 0, [user_map["sales_rep"].id])],
        "planned_date_start": datetime(2026, 1, 5, 8, 0, 0),
        "planned_date_end": datetime(2026, 1, 16, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
    })
    t1_sales_sub_sub_sub = task_obj.create({
        "name": "1.1.1.1 Pasirašyta galutinė sutartis su klientu",
        "project_id": p1.id,
        "parent_id": t1_sales_sub_sub.id,
        "user_ids": [(6, 0, [user_map["sales_rep"].id])],
        "planned_date_start": datetime(2026, 1, 12, 8, 0, 0),
        "planned_date_end": datetime(2026, 1, 16, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
        "actual_finish_date": datetime(2026, 1, 16, 16, 0, 0),
        "date_end": datetime(2026, 1, 16, 16, 0, 0),
    })

    # Department 2: Projektavimo skyrius (4-level deep WBS)
    t1_design = task_obj.create({
        "name": "2. Projektavimo etapas: Elektros ir konstrukcinė dalis",
        "project_id": p1.id,
        "user_ids": [(6, 0, [user_map["head_design"].id])],
        "planned_date_start": datetime(2026, 1, 19, 8, 0, 0),
        "planned_date_end": datetime(2026, 4, 10, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
        "milestone_id": m1_1.id,
    })
    # 2.1 Elektros dalis
    t1_design_elec = task_obj.create({
        "name": "2.1 Elektros dalies projektavimas (EPLAN)",
        "project_id": p1.id,
        "parent_id": t1_design.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 1, 19, 8, 0, 0),
        "planned_date_end": datetime(2026, 3, 6, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
    })
    t1_design_elec_sub = task_obj.create({
        "name": "2.1.1 10kV ir 0.4kV komutacinių aparatų principinės schemos",
        "project_id": p1.id,
        "parent_id": t1_design_elec.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 1, 19, 8, 0, 0),
        "planned_date_end": datetime(2026, 2, 13, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
    })
    t1_design_elec_sub_sub = task_obj.create({
        "name": "2.1.1.1 Relinės apsaugos (RPA) nustatymų suderinimas",
        "project_id": p1.id,
        "parent_id": t1_design_elec_sub.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 2, 2, 8, 0, 0),
        "planned_date_end": datetime(2026, 2, 13, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
    })
    t1_design_elec_sub_sub_sub = task_obj.create({
        "name": "2.1.1.1.1 RPA apsaugų schemos suderinimas su ESO relininkais",
        "project_id": p1.id,
        "parent_id": t1_design_elec_sub_sub.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 2, 9, 8, 0, 0),
        "planned_date_end": datetime(2026, 2, 13, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
    })

    # 2.2 Konstrukcinė dalis (Anti-cheating approved task)
    t1_design_struct = task_obj.create({
        "name": "2.2 Konstrukcinės dalies 3D modeliavimas (SolidWorks)",
        "project_id": p1.id,
        "parent_id": t1_design.id,
        "user_ids": [(6, 0, [user_map["eng_structural"].id])],
        "planned_date_start": datetime(2026, 2, 16, 8, 0, 0),
        "planned_date_end": datetime(2026, 4, 10, 17, 0, 0),
        "plan_is_auto": False,
        "state": "03_approved",
    })
    t1_design_struct_sub = task_obj.create({
        "name": "2.2.1 Transformatorinės karkaso 3D modelis ir surinkimo brėžiniai",
        "project_id": p1.id,
        "parent_id": t1_design_struct.id,
        "user_ids": [(6, 0, [user_map["eng_structural"].id])],
        "planned_date_start": datetime(2026, 2, 16, 8, 0, 0),
        "planned_date_end": datetime(2026, 3, 20, 17, 0, 0),
        "plan_is_auto": False,
        "state": "03_approved",
    })
    t1_design_struct_sub_sub = task_obj.create({
        "name": "2.2.1.1 Metalo lakštų išklotinių paruošimas CNC lazeriui",
        "project_id": p1.id,
        "parent_id": t1_design_struct_sub.id,
        "user_ids": [(6, 0, [user_map["eng_structural"].id])],
        "planned_date_start": datetime(2026, 3, 9, 8, 0, 0),
        "planned_date_end": datetime(2026, 3, 20, 17, 0, 0),
        "allocated_hours": 16.0,
        "plan_is_auto": False,
        "state": "03_approved",
        "has_been_approved": True,
        "approved_planned_date_start": datetime(2026, 3, 9, 8, 0, 0),
        "approved_planned_date_end": datetime(2026, 3, 20, 17, 0, 0),
        "approved_baseline_duration": 16.0,
    })
    t1_design_struct_sub_sub_sub = task_obj.create({
        "name": "2.2.1.1.1 CNC pjovimo DXF failų ir lakštų išdėstymo paruošimas",
        "project_id": p1.id,
        "parent_id": t1_design_struct_sub_sub.id,
        "user_ids": [(6, 0, [user_map["eng_structural"].id])],
        "planned_date_start": datetime(2026, 3, 16, 8, 0, 0),
        "planned_date_end": datetime(2026, 3, 20, 17, 0, 0),
        "plan_is_auto": False,
        "state": "03_approved",
    })

    # Department 3: Pirkimų skyrius (4-level deep WBS)
    t1_proc = task_obj.create({
        "name": "3. Pirkimų etapas: Įrangos ir medžiagų tiekimas",
        "project_id": p1.id,
        "user_ids": [(6, 0, [user_map["head_procurement"].id])],
        "planned_date_start": datetime(2026, 3, 23, 8, 0, 0),
        "planned_date_end": datetime(2026, 6, 30, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
        "milestone_id": m1_2.id,
    })
    t1_proc_sub = task_obj.create({
        "name": "3.1 Pagrindinės galios įrangos ir vario užsakymas",
        "project_id": p1.id,
        "parent_id": t1_proc.id,
        "user_ids": [(6, 0, [user_map["procurement_specialist"].id])],
        "planned_date_start": datetime(2026, 3, 23, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 15, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
    })
    t1_proc_sub_sub = task_obj.create({
        "name": "3.1.1 1000kVA sauso transformatoriaus ir ABB jungiklių tiekimas",
        "project_id": p1.id,
        "parent_id": t1_proc_sub.id,
        "user_ids": [(6, 0, [user_map["procurement_specialist"].id])],
        "planned_date_start": datetime(2026, 3, 23, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 8, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
    })
    t1_proc_sub_sub_sub = task_obj.create({
        "name": "3.1.1.1 Vario šynyno Cu 80x10 pristatymas į sandėlį",
        "project_id": p1.id,
        "parent_id": t1_proc_sub_sub.id,
        "user_ids": [(6, 0, [user_map["procurement_specialist"].id])],
        "planned_date_start": datetime(2026, 4, 13, 8, 0, 0),
        "planned_date_end": datetime(2026, 4, 30, 17, 0, 0),
        "plan_is_auto": False,
        "state": "1_done",
    })

    # Department 4: Gamybos skyrius (4-level deep WBS)
    t1_prod = task_obj.create({
        "name": "4. Gamybos etapas: Karkaso gamyba, elektromontažas ir bandymai",
        "project_id": p1.id,
        "user_ids": [(6, 0, [user_map["head_production"].id])],
        "planned_date_start": datetime(2026, 5, 4, 8, 0, 0),
        "planned_date_end": datetime(2026, 11, 20, 17, 0, 0),
        "plan_is_auto": False,
        "state": "01_in_progress",
        "milestone_id": m1_3.id,
    })
    # 4.1 Metalo apdirbimas (Parent container for E8 conflict resolution: Early vs Delay)
    t1_prod_metal = task_obj.create({
        "name": "4.1 Metalo apdirbimas ir karkaso gamyba",
        "project_id": p1.id,
        "parent_id": t1_prod.id,
        "user_ids": [(6, 0, [user_map["worker_laser"].id])],
        "planned_date_start": datetime(2026, 5, 4, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 22, 17, 0, 0),
        "plan_is_auto": False,
        "state": "01_in_progress",
    })
    # Finished early (13h earlier -> GREEN TAIL)
    t1_prod_metal_laser = task_obj.create({
        "name": "4.1.1 Lakštinio plieno pjovimas CNC lazeriu",
        "project_id": p1.id,
        "parent_id": t1_prod_metal.id,
        "user_ids": [(6, 0, [user_map["worker_laser"].id])],
        "planned_date_start": datetime(2026, 5, 4, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 22, 17, 0, 0),
        "plan_is_auto": False,
        "state": "03_approved",
        "actual_finish_date": datetime(2026, 5, 20, 14, 0, 0),
        "date_end": datetime(2026, 5, 20, 14, 0, 0),
        "allocated_hours": 96.0,
    })
    # Sibling child delayed by 5 days -> RED TAIL
    t1_prod_metal_weld = task_obj.create({
        "name": "4.1.2 Karkaso detalių lankstymas CNC presu ir suvirinimas",
        "project_id": p1.id,
        "parent_id": t1_prod_metal.id,
        "user_ids": [(6, 0, [user_map["worker_laser"].id])],
        "planned_date_start": datetime(2026, 5, 11, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 22, 17, 0, 0),
        "date_deadline": datetime(2026, 5, 27, 17, 0, 0),
        "deadline_is_auto": True,
        "plan_is_auto": False,
        "state": "01_in_progress",
    })
    t1_prod_metal_weld_sub = task_obj.create({
        "name": "4.1.2.1 Kampinių profilių suvirinimas MIG pusautomačiu",
        "project_id": p1.id,
        "parent_id": t1_prod_metal_weld.id,
        "user_ids": [(6, 0, [user_map["worker_laser"].id])],
        "planned_date_start": datetime(2026, 5, 18, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 22, 17, 0, 0),
        "date_deadline": datetime(2026, 5, 27, 17, 0, 0),
        "deadline_is_auto": False,
        "plan_is_auto": False,
        "state": "01_in_progress",
    })

    # 4.2 Elektromontažas (KAROLIS ACTIVE RUNNING TIMER)
    t1_prod_assembly = task_obj.create({
        "name": "4.2 Elektromontažas ir šynyno formavimas",
        "project_id": p1.id,
        "parent_id": t1_prod.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 6, 29, 8, 0, 0),
        "planned_date_end": datetime(2026, 10, 16, 17, 0, 0),
        "plan_is_auto": False,
        "state": "01_in_progress",
    })
    now_dt = fields.Datetime.now()
    t1_prod_assembly_busbar = task_obj.create({
        "name": "4.2.1 Vario šynų 80x10 formavimas ir montavimas",
        "project_id": p1.id,
        "parent_id": t1_prod_assembly.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 6, 29, 8, 0, 0),
        "planned_date_end": datetime(2026, 8, 28, 17, 0, 0),
        "plan_is_auto": False,
        "state": "01_in_progress",
        "is_timer_running": True,
        "timer_start": now_dt - timedelta(minutes=45),
        "first_timer_start": now_dt - timedelta(minutes=45),
        "active_user_id": user_map["worker_assembly"].id,
        "timer_total_seconds": 2700,
    })
    t1_prod_assembly_busbar_sub = task_obj.create({
        "name": "4.2.1.1 Šynų kontaktinių paviršių padengimas ir dinamometrinis veržimas",
        "project_id": p1.id,
        "parent_id": t1_prod_assembly_busbar.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 8, 10, 8, 0, 0),
        "planned_date_end": datetime(2026, 8, 28, 17, 0, 0),
        "plan_is_auto": False,
        "state": "01_in_progress",
    })

    # 4.3 Laboratoriniai bandymai (QA Rejection test)
    t1_prod_qa = task_obj.create({
        "name": "4.3 Laboratoriniai bandymai ir kokybės kontrolė (QA)",
        "project_id": p1.id,
        "parent_id": t1_prod.id,
        "user_ids": [(6, 0, [user_map["qa_tester"].id])],
        "planned_date_start": datetime(2026, 10, 19, 8, 0, 0),
        "planned_date_end": datetime(2026, 11, 20, 17, 0, 0),
        "plan_is_auto": False,
        "state": "02_changes_requested",
        "milestone_id": m1_4.id,
    })
    t1_prod_qa_sub = task_obj.create({
        "name": "4.3.1 Aukštos įtampos (10kV) izoliacijos bandymai laboratorijoje",
        "project_id": p1.id,
        "parent_id": t1_prod_qa.id,
        "user_ids": [(6, 0, [user_map["qa_tester"].id])],
        "planned_date_start": datetime(2026, 10, 19, 8, 0, 0),
        "planned_date_end": datetime(2026, 11, 6, 17, 0, 0),
        "plan_is_auto": False,
        "state": "02_changes_requested",
    })
    t1_prod_qa_sub_sub = task_obj.create({
        "name": "4.3.1.1 Izoliacijos varžos protokolavimas ir defektų fiksavimas",
        "project_id": p1.id,
        "parent_id": t1_prod_qa_sub.id,
        "user_ids": [(6, 0, [user_map["qa_tester"].id])],
        "planned_date_start": datetime(2026, 11, 2, 8, 0, 0),
        "planned_date_end": datetime(2026, 11, 6, 17, 0, 0),
        "plan_is_auto": False,
        "state": "02_changes_requested",
    })

    # Department 5: Projektų valdymas ir pridavimas (4-level deep WBS)
    t1_pm_closing = task_obj.create({
        "name": "5. Projektų valdymo etapas: Galutinė patikra ir pridavimas ESO",
        "project_id": p1.id,
        "user_ids": [(6, 0, [pm_user.id])],
        "planned_date_start": datetime(2026, 11, 23, 8, 0, 0),
        "planned_date_end": datetime(2026, 12, 18, 17, 0, 0),
        "plan_is_auto": False,
        "state": "04_waiting_normal",
        "milestone_id": m1_4.id,
        "depend_on_ids": [(4, t1_prod_qa.id)],
    })
    t1_pm_closing_sub = task_obj.create({
        "name": "5.1 Valstybinės energetikos inspekcijos (VEI) aktas ir ESO priėmimas",
        "project_id": p1.id,
        "parent_id": t1_pm_closing.id,
        "user_ids": [(6, 0, [pm_user.id])],
        "planned_date_start": datetime(2026, 11, 23, 8, 0, 0),
        "planned_date_end": datetime(2026, 12, 18, 17, 0, 0),
        "plan_is_auto": False,
        "state": "04_waiting_normal",
        "depend_on_ids": [(4, t1_prod_qa_sub.id)],
    })
    t1_pm_closing_sub_sub = task_obj.create({
        "name": "5.1.1 Objekto perdavimo-priėmimo akto pasirašymas su klientu",
        "project_id": p1.id,
        "parent_id": t1_pm_closing_sub.id,
        "user_ids": [(6, 0, [pm_user.id])],
        "planned_date_start": datetime(2026, 12, 14, 8, 0, 0),
        "planned_date_end": datetime(2026, 12, 18, 17, 0, 0),
        "plan_is_auto": False,
        "state": "04_waiting_normal",
        "depend_on_ids": [(4, t1_prod_qa_sub_sub.id)],
    })

    # Recompute containers to propagate conflict resolution and dates
    t1_prod_metal_weld._recompute_container()
    t1_prod_metal._recompute_container()
    t1_prod._recompute_container()

    # =========================================================================
    # PRJ-02: Pramoninių automatikos ir valdymo spintų (AVS) partija (Klaipėdos uostui)
    # (4-Level Deep WBS Hierarchy)
    # =========================================================================
    p2 = create_project(
        "PRJ-02: Pramoninių automatikos ir valdymo spintų (AVS) partija (Klaipėdos uostui)",
        date(2026, 4, 6),
        date(2026, 11, 27),
    )
    milestone_obj.create({
        "name": "M1: Uosto valdymo schemų suderinimas",
        "project_id": p2.id,
        "deadline": date(2026, 5, 29),
    })
    milestone_obj.create({
        "name": "M2: Gamykliniai FAT bandymai",
        "project_id": p2.id,
        "deadline": date(2026, 11, 13),
    })
    # Level 2 Task 1
    t2_spec = task_obj.create({
        "name": "1. Techninis reglamentas ir uosto specifikacijos",
        "project_id": p2.id,
        "user_ids": [(6, 0, [user_map["sales_rep"].id])],
        "planned_date_start": datetime(2026, 4, 6, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 8, 17, 0, 0),
        "state": "1_done",
    })
    t2_spec_sub = task_obj.create({
        "name": "1.1 Uosto krantinių kranų telemetrijos reikalavimai",
        "project_id": p2.id,
        "parent_id": t2_spec.id,
        "user_ids": [(6, 0, [user_map["sales_rep"].id])],
        "planned_date_start": datetime(2026, 4, 6, 8, 0, 0),
        "planned_date_end": datetime(2026, 4, 24, 17, 0, 0),
        "state": "1_done",
    })
    t2_spec_sub_sub = task_obj.create({
        "name": "1.1.1 Signalo perdavimo protokolų specifikacija",
        "project_id": p2.id,
        "parent_id": t2_spec_sub.id,
        "user_ids": [(6, 0, [user_map["sales_rep"].id])],
        "planned_date_start": datetime(2026, 4, 6, 8, 0, 0),
        "planned_date_end": datetime(2026, 4, 17, 17, 0, 0),
        "state": "1_done",
    })
    t2_spec_sub_sub_sub = task_obj.create({
        "name": "1.1.1.1 Profinet ir Modbus TCP sąsajų suderinimas su uosto IT",
        "project_id": p2.id,
        "parent_id": t2_spec_sub_sub.id,
        "user_ids": [(6, 0, [user_map["sales_rep"].id])],
        "planned_date_start": datetime(2026, 4, 13, 8, 0, 0),
        "planned_date_end": datetime(2026, 4, 17, 17, 0, 0),
        "state": "1_done",
    })

    # Level 2 Task 2
    t2_design = task_obj.create({
        "name": "2. PLC valdiklių ir SCADA sistemos projektavimas",
        "project_id": p2.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 5, 11, 8, 0, 0),
        "planned_date_end": datetime(2026, 6, 26, 17, 0, 0),
        "state": "1_done",
    })
    t2_design_sub = task_obj.create({
        "name": "2.1 Valdymo algoritmų ir schemų rengimas",
        "project_id": p2.id,
        "parent_id": t2_design.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 5, 11, 8, 0, 0),
        "planned_date_end": datetime(2026, 6, 12, 17, 0, 0),
        "state": "1_done",
    })
    t2_design_sub_sub = task_obj.create({
        "name": "2.1.1 Siemens S7-1500 PLC programinio kodo struktūra",
        "project_id": p2.id,
        "parent_id": t2_design_sub.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 5, 11, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 29, 17, 0, 0),
        "state": "1_done",
    })
    t2_design_sub_sub_sub = task_obj.create({
        "name": "2.1.1.1 Avarinio stabdymo (Safety integrated) grandinių projektavimas",
        "project_id": p2.id,
        "parent_id": t2_design_sub_sub.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 5, 25, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 29, 17, 0, 0),
        "state": "1_done",
    })

    # Level 2 Task 3: LIVE STATE: Elena Petrauskienė has PAUSED task with reason
    t2_assembly = task_obj.create({
        "name": "3. Spintų surinkimas ir komponentų montavimas",
        "project_id": p2.id,
        "user_ids": [(6, 0, [user_map["elena_p"].id])],
        "planned_date_start": datetime(2026, 6, 29, 8, 0, 0),
        "planned_date_end": datetime(2026, 9, 25, 17, 0, 0),
        "state": "01_in_progress",
    })
    t2_assembly_sub = task_obj.create({
        "name": "3.1 Montažinių panelių ir bėgelių paruošimas",
        "project_id": p2.id,
        "parent_id": t2_assembly.id,
        "user_ids": [(6, 0, [user_map["elena_p"].id])],
        "planned_date_start": datetime(2026, 6, 29, 8, 0, 0),
        "planned_date_end": datetime(2026, 8, 14, 17, 0, 0),
        "state": "01_in_progress",
    })
    t2_assembly_sub_sub = task_obj.create({
        "name": "3.1.1 Rittal spintų karkaso mechaninis surinkimas",
        "project_id": p2.id,
        "parent_id": t2_assembly_sub.id,
        "user_ids": [(6, 0, [user_map["elena_p"].id])],
        "planned_date_start": datetime(2026, 6, 29, 8, 0, 0),
        "planned_date_end": datetime(2026, 7, 24, 17, 0, 0),
        "state": "01_in_progress",
    })
    t2_assembly_sub_sub_sub = task_obj.create({
        "name": "3.1.1.1 Siemens PLC modulių ir dažnio keitiklių montavimas",
        "project_id": p2.id,
        "parent_id": t2_assembly_sub_sub.id,
        "user_ids": [(6, 0, [user_map["elena_p"].id])],
        "planned_date_start": datetime(2026, 7, 27, 8, 0, 0),
        "planned_date_end": datetime(2026, 8, 14, 17, 0, 0),
        "state": "01_in_progress",
        "is_timer_running": False,
        "is_paused": True,
        "last_pause_reason": "Laukiama Siemens PLC modulių pristatymo iš tiekėjo",
        "active_user_id": user_map["elena_p"].id,
        "timer_total_seconds": 3600,
    })

    # Level 2 Task 4
    t2_fat = task_obj.create({
        "name": "4. Gamykliniai bandymai su uosto atstovais (FAT)",
        "project_id": p2.id,
        "user_ids": [(6, 0, [user_map["qa_tester"].id])],
        "planned_date_start": datetime(2026, 9, 28, 8, 0, 0),
        "planned_date_end": datetime(2026, 11, 27, 17, 0, 0),
        "state": "01_in_progress",
    })
    t2_fat_sub = task_obj.create({
        "name": "4.1 Automatikos testavimas imitaciniame stende",
        "project_id": p2.id,
        "parent_id": t2_fat.id,
        "user_ids": [(6, 0, [user_map["qa_tester"].id])],
        "planned_date_start": datetime(2026, 9, 28, 8, 0, 0),
        "planned_date_end": datetime(2026, 10, 30, 17, 0, 0),
        "state": "01_in_progress",
    })
    t2_fat_sub_sub = task_obj.create({
        "name": "4.1.1 Įėjimų/išėjimų (I/O) signalų simuliacija",
        "project_id": p2.id,
        "parent_id": t2_fat_sub.id,
        "user_ids": [(6, 0, [user_map["qa_tester"].id])],
        "planned_date_start": datetime(2026, 9, 28, 8, 0, 0),
        "planned_date_end": datetime(2026, 10, 16, 17, 0, 0),
        "state": "01_in_progress",
    })
    t2_fat_sub_sub_sub = task_obj.create({
        "name": "4.1.1.1 Avarinių signalizacijų ir pranešimų patikra",
        "project_id": p2.id,
        "parent_id": t2_fat_sub_sub.id,
        "user_ids": [(6, 0, [user_map["qa_tester"].id])],
        "planned_date_start": datetime(2026, 10, 12, 8, 0, 0),
        "planned_date_end": datetime(2026, 10, 16, 17, 0, 0),
        "state": "01_in_progress",
    })

    # =========================================================================
    # PRJ-03: Įvadinių apskaitos spintų (ĮAS) skubus užsakymas (OVERDUE past project - 🔥)
    # (4-Level Deep WBS Hierarchy)
    # =========================================================================
    p3 = create_project(
        "PRJ-03: Įvadinių apskaitos spintų (ĮAS) skubus užsakymas",
        date(2026, 1, 5),
        date(2026, 6, 19),
    )
    milestone_obj.create({
        "name": "M1: Skubus gamybos etapas",
        "project_id": p3.id,
        "deadline": date(2026, 5, 15),
    })
    # Level 2 Task 1 (Done)
    t3_metal = task_obj.create({
        "name": "1. Apskaitos spintų metalo paruošimas",
        "project_id": p3.id,
        "user_ids": [(6, 0, [user_map["worker_laser"].id])],
        "planned_date_start": datetime(2026, 1, 5, 8, 0, 0),
        "planned_date_end": datetime(2026, 2, 27, 17, 0, 0),
        "state": "1_done",
    })
    t3_metal_sub = task_obj.create({
        "name": "1.1 Lakštinio plieno perforavimas ir lankstymas",
        "project_id": p3.id,
        "parent_id": t3_metal.id,
        "user_ids": [(6, 0, [user_map["worker_laser"].id])],
        "planned_date_start": datetime(2026, 1, 5, 8, 0, 0),
        "planned_date_end": datetime(2026, 2, 13, 17, 0, 0),
        "state": "1_done",
    })
    t3_metal_sub_sub = task_obj.create({
        "name": "1.1.1 Apskaitos spintų korpusų CNC perforavimas",
        "project_id": p3.id,
        "parent_id": t3_metal_sub.id,
        "user_ids": [(6, 0, [user_map["worker_laser"].id])],
        "planned_date_start": datetime(2026, 1, 5, 8, 0, 0),
        "planned_date_end": datetime(2026, 1, 23, 17, 0, 0),
        "state": "1_done",
    })
    t3_metal_sub_sub_sub = task_obj.create({
        "name": "1.1.1.1 Spintų durelių ir lankstų surinkimas",
        "project_id": p3.id,
        "parent_id": t3_metal_sub_sub.id,
        "user_ids": [(6, 0, [user_map["worker_laser"].id])],
        "planned_date_start": datetime(2026, 1, 19, 8, 0, 0),
        "planned_date_end": datetime(2026, 1, 23, 17, 0, 0),
        "state": "1_done",
    })

    # Level 2 Task 2: Overdue incomplete task in the past -> triggers 🔥 Fire badge
    t3_overdue = task_obj.create({
        "name": "2. Įvadinių kirtiklių ir skaitiklių montavimas",
        "project_id": p3.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 3, 2, 8, 0, 0),
        "planned_date_end": datetime(2026, 6, 19, 17, 0, 0),
        "state": "01_in_progress",
        "plan_is_auto": False,
    })
    t3_overdue_sub = task_obj.create({
        "name": "2.1 0.4kV komutacinės įrangos montavimas",
        "project_id": p3.id,
        "parent_id": t3_overdue.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 3, 2, 8, 0, 0),
        "planned_date_end": datetime(2026, 6, 19, 17, 0, 0),
        "state": "01_in_progress",
        "plan_is_auto": False,
    })
    t3_overdue_sub_sub = task_obj.create({
        "name": "2.1.1 Skaitiklių pajungimo gnybtynų formavimas",
        "project_id": p3.id,
        "parent_id": t3_overdue_sub.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 3, 2, 8, 0, 0),
        "planned_date_end": datetime(2026, 6, 19, 17, 0, 0),
        "state": "01_in_progress",
        "plan_is_auto": False,
    })
    t3_overdue_sub_sub_sub = task_obj.create({
        "name": "2.1.1.1 Srovės transformatorių ir kirtiklių sujungimas",
        "project_id": p3.id,
        "parent_id": t3_overdue_sub_sub.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 3, 2, 8, 0, 0),
        "planned_date_end": datetime(2026, 6, 19, 17, 0, 0),
        "state": "01_in_progress",
        "plan_is_auto": False,
    })

    # =========================================================================
    # PRJ-04: Modulinio konteinerio E-House 35/10kV konstrukcija (Vėjo parkui)
    # (4-Level Deep WBS Hierarchy)
    # =========================================================================
    p4 = create_project(
        "PRJ-04: Modulinio konteinerio E-House 35/10kV konstrukcija (Vėjo jėgainių parkui)",
        date(2026, 4, 13),
        date(2026, 8, 28),
    )
    milestone_obj.create({
        "name": "M1: Konteinerio karkasas suvirintas",
        "project_id": p4.id,
        "deadline": date(2026, 6, 12),
    })
    milestone_obj.create({
        "name": "M2: 35kV gardžių montavimas baigtas",
        "project_id": p4.id,
        "deadline": date(2026, 8, 14),
    })
    # Level 2 Task 1
    t4_fem = task_obj.create({
        "name": "1. Konteinerio statinių apkrovų FEM skaičiavimas",
        "project_id": p4.id,
        "user_ids": [(6, 0, [user_map["eng_structural"].id])],
        "planned_date_start": datetime(2026, 4, 13, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 15, 17, 0, 0),
        "state": "1_done",
    })
    t4_fem_sub = task_obj.create({
        "name": "1.1 Vėjo ir seisminių apkrovų modeliavimas",
        "project_id": p4.id,
        "parent_id": t4_fem.id,
        "user_ids": [(6, 0, [user_map["eng_structural"].id])],
        "planned_date_start": datetime(2026, 4, 13, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 1, 17, 0, 0),
        "state": "1_done",
    })
    t4_fem_sub_sub = task_obj.create({
        "name": "1.1.1 Karkaso atsparumo deformacijoms analizė SolidWorks Simulation",
        "project_id": p4.id,
        "parent_id": t4_fem_sub.id,
        "user_ids": [(6, 0, [user_map["eng_structural"].id])],
        "planned_date_start": datetime(2026, 4, 13, 8, 0, 0),
        "planned_date_end": datetime(2026, 4, 24, 17, 0, 0),
        "state": "1_done",
    })
    t4_fem_sub_sub_sub = task_obj.create({
        "name": "1.1.1.1 Tvirtinimo mazgų stiprumo skaičiavimo ataskaitos rengimas",
        "project_id": p4.id,
        "parent_id": t4_fem_sub_sub.id,
        "user_ids": [(6, 0, [user_map["eng_structural"].id])],
        "planned_date_start": datetime(2026, 4, 20, 8, 0, 0),
        "planned_date_end": datetime(2026, 4, 24, 17, 0, 0),
        "state": "1_done",
    })

    # Level 2 Task 2
    t4_metal = task_obj.create({
        "name": "2. Karštai cinkuoto karkaso gamyba ir dažymas",
        "project_id": p4.id,
        "user_ids": [(6, 0, [user_map["head_production"].id])],
        "planned_date_start": datetime(2026, 5, 18, 8, 0, 0),
        "planned_date_end": datetime(2026, 6, 26, 17, 0, 0),
        "state": "1_done",
    })
    t4_metal_sub = task_obj.create({
        "name": "2.1 Plieninių sijų HEB200 pjaustymas ir gręžimas",
        "project_id": p4.id,
        "parent_id": t4_metal.id,
        "user_ids": [(6, 0, [user_map["head_production"].id])],
        "planned_date_start": datetime(2026, 5, 18, 8, 0, 0),
        "planned_date_end": datetime(2026, 6, 5, 17, 0, 0),
        "state": "1_done",
    })
    t4_metal_sub_sub = task_obj.create({
        "name": "2.1.1 Sijų mazgų suvirinimas pagal EN 1090 standartą",
        "project_id": p4.id,
        "parent_id": t4_metal_sub.id,
        "user_ids": [(6, 0, [user_map["head_production"].id])],
        "planned_date_start": datetime(2026, 5, 18, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 29, 17, 0, 0),
        "state": "1_done",
    })
    t4_metal_sub_sub_sub = task_obj.create({
        "name": "2.1.1.1 Cinkavimo vonių patikra ir antikorozinis padengimas",
        "project_id": p4.id,
        "parent_id": t4_metal_sub_sub.id,
        "user_ids": [(6, 0, [user_map["head_production"].id])],
        "planned_date_start": datetime(2026, 5, 25, 8, 0, 0),
        "planned_date_end": datetime(2026, 5, 29, 17, 0, 0),
        "state": "1_done",
    })

    # Level 2 Task 3
    t4_install = task_obj.create({
        "name": "3. 35kV skirstyklos montavimas konteineryje",
        "project_id": p4.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 6, 29, 8, 0, 0),
        "planned_date_end": datetime(2026, 8, 28, 17, 0, 0),
        "state": "01_in_progress",
    })
    t4_install_sub = task_obj.create({
        "name": "3.1 35kV kabelinių įvadų ir gardžių išdėstymas",
        "project_id": p4.id,
        "parent_id": t4_install.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 6, 29, 8, 0, 0),
        "planned_date_end": datetime(2026, 7, 31, 17, 0, 0),
        "state": "01_in_progress",
    })
    t4_install_sub_sub = task_obj.create({
        "name": "3.1.1 Vakuuminių jungiklių gardžių montavimas",
        "project_id": p4.id,
        "parent_id": t4_install_sub.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 6, 29, 8, 0, 0),
        "planned_date_end": datetime(2026, 7, 17, 17, 0, 0),
        "state": "01_in_progress",
    })
    t4_install_sub_sub_sub = task_obj.create({
        "name": "3.1.1.1 Pagalbinių valdymo grandinių paklojimas",
        "project_id": p4.id,
        "parent_id": t4_install_sub_sub.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 7, 13, 8, 0, 0),
        "planned_date_end": datetime(2026, 7, 17, 17, 0, 0),
        "state": "01_in_progress",
    })

    # =========================================================================
    # PRJ-05: Išmaniųjų elektros skirstymo skydų su telemetrija serija (2026-2027)
    # (4-Level Deep WBS Hierarchy)
    # =========================================================================
    p5 = create_project(
        "PRJ-05: Išmaniųjų elektros skirstymo skydų su telemetrija serija (2026-2027)",
        date(2026, 7, 6),
        date(2027, 1, 29),
    )
    milestone_obj.create({
        "name": "M1: Telemetrijos prototipo bandymai",
        "project_id": p5.id,
        "deadline": date(2026, 10, 30),
    })
    milestone_obj.create({
        "name": "M2: Serijinės partijos pridavimas",
        "project_id": p5.id,
        "deadline": date(2027, 1, 29),
    })
    # Level 2 Task 1
    t5_iot = task_obj.create({
        "name": "1. IoT telemetrijos valdiklių parinkimas ir integracija",
        "project_id": p5.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 7, 6, 8, 0, 0),
        "planned_date_end": datetime(2026, 9, 18, 17, 0, 0),
        "state": "1_done",
    })
    t5_iot_sub = task_obj.create({
        "name": "1.1 Ryšio modulių ir antenų parinkimas",
        "project_id": p5.id,
        "parent_id": t5_iot.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 7, 6, 8, 0, 0),
        "planned_date_end": datetime(2026, 8, 7, 17, 0, 0),
        "state": "1_done",
    })
    t5_iot_sub_sub = task_obj.create({
        "name": "1.1.1 Modbus RTU / TCP keitiklių derinimas",
        "project_id": p5.id,
        "parent_id": t5_iot_sub.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 7, 6, 8, 0, 0),
        "planned_date_end": datetime(2026, 7, 24, 17, 0, 0),
        "state": "1_done",
    })
    t5_iot_sub_sub_sub = task_obj.create({
        "name": "1.1.1.1 GSM/4G duomenų perdavimo protokolo testavimas",
        "project_id": p5.id,
        "parent_id": t5_iot_sub_sub.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 7, 20, 8, 0, 0),
        "planned_date_end": datetime(2026, 7, 24, 17, 0, 0),
        "state": "1_done",
    })

    # Level 2 Task 2
    t5_proto = task_obj.create({
        "name": "2. Modbus/TCP komunikacijos programavimas ir derinimas",
        "project_id": p5.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 9, 21, 8, 0, 0),
        "planned_date_end": datetime(2026, 11, 27, 17, 0, 0),
        "state": "01_in_progress",
    })
    t5_proto_sub = task_obj.create({
        "name": "2.1 Debesų serverio MQTT brokerio integracija",
        "project_id": p5.id,
        "parent_id": t5_proto.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 9, 21, 8, 0, 0),
        "planned_date_end": datetime(2026, 10, 23, 17, 0, 0),
        "state": "01_in_progress",
    })
    t5_proto_sub_sub = task_obj.create({
        "name": "2.1.1 Elektros energijos kokybės parametrų perdavimas",
        "project_id": p5.id,
        "parent_id": t5_proto_sub.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 9, 21, 8, 0, 0),
        "planned_date_end": datetime(2026, 10, 9, 17, 0, 0),
        "state": "01_in_progress",
    })
    t5_proto_sub_sub_sub = task_obj.create({
        "name": "2.1.1.1 Avarinių signalų siuntimo SMS/El. paštu logika",
        "project_id": p5.id,
        "parent_id": t5_proto_sub_sub.id,
        "user_ids": [(6, 0, [user_map["eng_electrical"].id])],
        "planned_date_start": datetime(2026, 10, 5, 8, 0, 0),
        "planned_date_end": datetime(2026, 10, 9, 17, 0, 0),
        "state": "01_in_progress",
    })

    # Level 2 Task 3
    t5_prod = task_obj.create({
        "name": "3. Serijinis skydų surinkimas ir telemetrijos testavimas",
        "project_id": p5.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 11, 30, 8, 0, 0),
        "planned_date_end": datetime(2027, 1, 29, 17, 0, 0),
        "state": "04_waiting_normal",
    })
    t5_prod_sub = task_obj.create({
        "name": "3.1 Tipinių skydų karkasų serijinė gamyba",
        "project_id": p5.id,
        "parent_id": t5_prod.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 11, 30, 8, 0, 0),
        "planned_date_end": datetime(2026, 12, 23, 17, 0, 0),
        "state": "04_waiting_normal",
    })
    t5_prod_sub_sub = task_obj.create({
        "name": "3.1.1 Valdymo aparatūros ir saugiklių montavimas",
        "project_id": p5.id,
        "parent_id": t5_prod_sub.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 11, 30, 8, 0, 0),
        "planned_date_end": datetime(2026, 12, 11, 17, 0, 0),
        "state": "04_waiting_normal",
    })
    t5_prod_sub_sub_sub = task_obj.create({
        "name": "3.1.1.1 Galutinis skydų laidavimo ir ryšio testavimas prieš pakuojant",
        "project_id": p5.id,
        "parent_id": t5_prod_sub_sub.id,
        "user_ids": [(6, 0, [user_map["worker_assembly"].id])],
        "planned_date_start": datetime(2026, 12, 7, 8, 0, 0),
        "planned_date_end": datetime(2026, 12, 11, 17, 0, 0),
        "state": "04_waiting_normal",
    })

    _logger.info("Visi 5 gamybos projektai su 4 lygių gylio WBS sėkmingai sukurti.")
    return {
        "p1": p1, "p2": p2, "p3": p3, "p4": p4, "p5": p5,
        "t1_prod_assembly_busbar": t1_prod_assembly_busbar,
        "t1_design": t1_design,
        "t1_design_struct": t1_design_struct,
        "t1_design_struct_sub": t1_design_struct_sub,
        "t1_design_struct_sub_sub": t1_design_struct_sub_sub,
        "t1_design_struct_sub_sub_sub": t1_design_struct_sub_sub_sub,
        "t1_prod": t1_prod,
        "t1_prod_metal": t1_prod_metal,
        "t1_prod_metal_laser": t1_prod_metal_laser,
        "t1_prod_metal_weld": t1_prod_metal_weld,
        "t1_prod_qa": t1_prod_qa,
        "t1_prod_qa_sub": t1_prod_qa_sub,
        "t1_pm_closing": t1_pm_closing,
        "t1_pm_closing_sub": t1_pm_closing_sub,
        "t2_assembly_sub_sub_sub": t2_assembly_sub_sub_sub,
        "t3_overdue": t3_overdue,
    }


def execute_all_worklock_tests(env, user_map, project_data):
    """
    Step 4: Comprehensive Edge Cases & Worklock Logic Tests (E1 - E10).
    Verifies that all constraints, locks, and calculations behave strictly as specified.
    """
    _logger.info("--- Step 4: Vykdomi 10 Worklock logikos ir ribinių atvejų testai ---")
    pm_user = user_map["bjasiulis@gmail.com"]
    mantas = user_map["worker_laser"]
    karolis = user_map["worker_assembly"]
    head_prod = user_map["head_production"]
    running_task = project_data["t1_prod_assembly_busbar"]

    # =========================================================================
    # Worklock E1: Worker A (Karolis) has running timer -> Worker B (Mantas)
    # attempts to move or resize task via write or batch_schedule -> UserError!
    # =========================================================================
    _logger.info("Tikrinamas E1: Užduoties perkėlimas / keitimas bėgant kito vartotojo laikmačiui")
    orig_start = running_task.planned_date_start
    orig_end = running_task.planned_date_end

    # E1a: Attempt to write new planned dates as Mantas (Worker B)
    e1_write_blocked = False
    try:
        running_task.with_user(mantas).write({"planned_date_end": datetime(2026, 9, 11, 17, 0, 0)})
    except UserError as ue:
        e1_write_blocked = True
        _logger.info("E1a patvirtinta (write blokuotas): %s", ue)
    assert e1_write_blocked, "E1 KLAIDA: Mantas sugebėjo pakeisti Karolio vykdomos užduoties datas per write()!"

    # E1b: Attempt via save_timeline_batch_schedule as Mantas (Worker B, GanntLT Can View)
    e1_batch_view_blocked = False
    try:
        env["project.task"].with_user(mantas).save_timeline_batch_schedule([{
            "id": f"task_{running_task.id}",
            "end_date": "2026-09-11 17:00:00",
        }])
    except (UserError, AccessError) as ue:
        e1_batch_view_blocked = True
        _logger.info("E1b patvirtinta (Can View batch blokuotas): %s", ue)
    assert e1_batch_view_blocked, "E1 KLAIDA: Mantas sugebėjo perkelti užduotį per save_timeline_batch_schedule()!"

    # E1c: Attempt via save_timeline_batch_schedule as Department Head Artūras (GanntLT Can Edit, but not PM)
    e1_head_blocked = False
    try:
        env["project.task"].with_user(head_prod).save_timeline_batch_schedule([{
            "id": f"task_{running_task.id}",
            "end_date": "2026-09-11 17:00:00",
        }])
    except UserError as ue:
        e1_head_blocked = True
        _logger.info("E1c patvirtinta (Skyriaus vadovas su Can Edit blokuotas dėl worklock): %s", ue)
    assert e1_head_blocked, "E1 KLAIDA: Gamybos vadovas Artūras sugebėjo perkelti Karolio vykdomą užduotį per batch_schedule()!"

    running_task.invalidate_recordset()
    assert running_task.planned_date_start == orig_start, "E1 KLAIDA: Pradžios data neturėjo pasikeisti!"
    assert running_task.planned_date_end == orig_end, "E1 KLAIDA: Pabaigos data neturėjo pasikeisti!"

    # =========================================================================
    # Worklock E2: Worker B (Mantas) attempts timer actions on Karolis's task -> UserError!
    # =========================================================================
    _logger.info("Tikrinamas E2: Kito vartotojo laikmačio valdymo perėmimas")
    e2_start_blocked = False
    try:
        running_task.with_user(mantas).action_timer_start()
    except UserError:
        e2_start_blocked = True
    assert e2_start_blocked, "E2 KLAIDA: Mantas sugebėjo paleisti Karolio užduoties laikmatį!"

    e2_pause_blocked = False
    try:
        running_task.with_user(mantas).action_timer_pause()
    except UserError:
        e2_pause_blocked = True
    assert e2_pause_blocked, "E2 KLAIDA: Mantas sugebėjo pristabdyti Karolio užduoties laikmatį!"

    e2_finish_blocked = False
    try:
        running_task.with_user(mantas).action_timer_finish()
    except UserError:
        e2_finish_blocked = True
    assert e2_finish_blocked, "E2 KLAIDA: Mantas sugebėjo baigti Karolio užduoties laikmatį!"

    # =========================================================================
    # Worklock E3: PM (Benas Jasiulis) overrides lock and can modify / reschedule -> Permitted!
    # =========================================================================
    _logger.info("Tikrinamas E3: Projektų vadovo viršenybė (PM Override)")
    new_pm_end = running_task.planned_date_end + timedelta(days=7)
    pm_reschedule_allowed = False
    try:
        running_task.with_user(pm_user).write({"planned_date_end": new_pm_end})
        pm_reschedule_allowed = True
    except UserError as ue:
        _logger.error("E3 KLAIDA: PM buvo užblokuotas keičiant datas: %s", ue)
    assert pm_reschedule_allowed, "E3 KLAIDA: Projektų vadovui Benui Jasiuliui nebuvo leista perplanuoti užduoties pabaigos datos!"

    # PM can open pause wizard on Karolis's running task
    pm_pause_allowed = False
    try:
        res = running_task.with_user(pm_user).action_timer_pause()
        pm_pause_allowed = bool(res and res.get("res_model") == "project.task.pause.wizard")
    except UserError as ue:
        _logger.error("E3 KLAIDA: PM buvo užblokuotas atveriant pauzės vedlį: %s", ue)
    assert pm_pause_allowed, "E3 KLAIDA: Projektų vadovui Benui Jasiuliui nebuvo leista atverti pauzės vedlio!"

    # Revert date back and restore running state for Karolis (live demo DB state)
    running_task.with_user(pm_user).write({
        "planned_date_end": orig_end,
        "is_timer_running": True,
        "active_user_id": karolis.id,
    })

    # =========================================================================
    # Worklock E4: Subtask container boundaries & clamping
    # =========================================================================
    _logger.info("Tikrinamas E4: Konteinerio ribų apsauga ir magnetinis ribojimas (Clamping)")
    # 1. Test auto-planned container clamping: child bounds automatically expand parent bounds
    task_obj = env["project.task"].sudo()
    test_parent = task_obj.create({
        "name": "TEST Auto Parent Container",
        "project_id": project_data["p1"].id,
        "plan_is_auto": True,
        "planned_date_start": datetime(2026, 7, 6, 8, 0, 0),
        "planned_date_end": datetime(2026, 7, 17, 17, 0, 0),
        "state": "01_in_progress",
    })
    test_child = task_obj.create({
        "name": "TEST Auto Child Subtask",
        "project_id": project_data["p1"].id,
        "parent_id": test_parent.id,
        "planned_date_start": datetime(2026, 7, 6, 8, 0, 0),
        "planned_date_end": datetime(2026, 7, 17, 17, 0, 0),
        "state": "01_in_progress",
    })
    test_parent._recompute_container()
    test_parent.invalidate_recordset()

    # Move child earlier: parent container automatically clamps/expands to encompass child start
    earlier_child_s = datetime(2026, 7, 1, 8, 0, 0)
    test_child.write({"planned_date_start": earlier_child_s})
    test_parent._recompute_container()
    test_parent.invalidate_recordset()
    assert test_parent.planned_date_start <= earlier_child_s, (
        f"E4 KLAIDA: Tėvo pradžia ({test_parent.planned_date_start}) neapgaubė anksčiau prasidedančio vaiko ({earlier_child_s})!"
    )

    # Clean up temporary test container
    test_child.unlink()
    test_parent.unlink()

    # 2. Manual parent container boundary coverage check: parent effective boundary encompasses child
    parent_container = project_data["t1_prod"]
    p_eff_end = parent_container.date_deadline or parent_container.planned_date_end
    c_eff_end = running_task.date_deadline or running_task.planned_date_end
    assert p_eff_end >= c_eff_end, "E4 KLAIDA: Tėvo pabaigos riba mažesnė už vidinės užduoties ribą!"

    # =========================================================================
    # Worklock E5 - E7: Post-approval Anti-Cheating Protection
    # =========================================================================
    _logger.info("Tikrinamas E5 - E7: Anti-cheating apsauga po patvirtinimo")
    approved_task = project_data["t1_design_struct_sub_sub"]
    assert approved_task.has_been_approved, "Anti-cheating užduotis turi būti patvirtinta!"
    base_hours = approved_task.approved_baseline_duration
    assert base_hours > 0, "Bazinis patvirtintas laikas turi būti teigiamas!"

    # E5: Cannot move start date
    e5_blocked = False
    try:
        new_start = approved_task.planned_date_start + timedelta(days=2)
        approved_task.with_user(mantas).write({"planned_date_start": new_start})
    except ValidationError:
        e5_blocked = True
    assert e5_blocked, "E5 KLAIDA: Leista perkelti patvirtintos užduoties pradžios datą!"

    # E6: Cannot shrink duration (move end earlier)
    e6_blocked = False
    try:
        new_end = approved_task.planned_date_start + timedelta(hours=4)
        approved_task.with_user(mantas).write({"planned_date_end": new_end})
    except ValidationError:
        e6_blocked = True
    assert e6_blocked, "E6 KLAIDA: Leista sutrumpinti patvirtintos užduoties pabaigos datą!"

    # E7: Cannot reduce allocated_hours below baseline
    e7_blocked = False
    try:
        approved_task.with_user(mantas).write({"allocated_hours": 4.0})
    except ValidationError:
        e7_blocked = True
    assert e7_blocked, "E7 KLAIDA: Leista sumažinti patvirtintos užduoties planuotas valandas žemiau bazinio plano!"

    # Extension into the future IS naturally allowed for worker without admin override
    extended_end = approved_task.planned_date_end + timedelta(days=5)
    approved_task.with_user(mantas).write({"planned_date_end": extended_end})
    approved_task.invalidate_recordset()
    assert approved_task.planned_date_end == extended_end, "E7 KLAIDA: Pratęsti termino į ateitį nepavyko!"

    # =========================================================================
    # Worklock E8: Conflict resolution (Green early tail vs Red delay tail)
    # Lateness strictly dominates over early finish in parent container!
    # =========================================================================
    _logger.info("Tikrinamas E8: Prieštaravimų sprendimas (Vėlavimo dominavimas prieš ankstyvumą)")
    laser_task = project_data["t1_prod_metal_laser"]
    weld_task = project_data["t1_prod_metal_weld"]
    parent_metal = project_data["t1_prod_metal"]
    parent_metal._recompute_container()
    parent_metal.invalidate_recordset()

    # Laser task finished early -> has actual_finish_date < planned_date_end (Green tail)
    assert laser_task.actual_finish_date and laser_task.actual_finish_date < laser_task.planned_date_end, (
        "E8: Lazerinis pjovimas turi turėti ankstyvą pabaigą!"
    )
    # Weld task delays by 5 days -> date_deadline > planned_date_end (Red tail)
    assert weld_task.date_deadline and weld_task.date_deadline > weld_task.planned_date_end, (
        "E8: Suvirinimas turi turėti vėlavimą!"
    )
    # Parent container reflects lateness (red tail date_deadline >= child date_deadline), NOT early finish!
    assert parent_metal.date_deadline and parent_metal.date_deadline >= weld_task.date_deadline, (
        f"E8 KLAIDA: Tėviniame konteineryje vėlavimas nedominuoja! date_deadline={parent_metal.date_deadline}"
    )
    assert not parent_metal.actual_finish_date, "E8 KLAIDA: Tėvinis konteineris klaidingai rodo ankstyvą pabaigą esant vėluojančiam vaikui!"

    # =========================================================================
    # Worklock E9: QA Rejection Cascade
    # =========================================================================
    _logger.info("Tikrinamas E9: QA atmetimas ir grandininis priklausomų darbų atstatymas")
    qa_task = project_data["t1_prod_qa_sub"]
    qa_leaf = qa_task.child_ids
    vei_closing = project_data["t1_pm_closing_sub"]
    vei_leaf = vei_closing.child_ids

    # 1. Pradžioje imituojame, kad QA ir priklausomas VEI pridavimas buvo atlikti
    if qa_leaf:
        qa_leaf.write({"state": "1_done"})
    qa_task.write({"state": "1_done"})
    if vei_leaf:
        vei_leaf.write({"state": "1_done"})
    vei_closing.write({"state": "1_done"})
    vei_closing.invalidate_recordset()
    assert vei_closing.state == "1_done", f"VEI pridavimas turi būti 1_done prieš atmetimą (yra: {vei_closing.state})!"

    # 2. QA bandytoja Greta atmeta užduotį dėl defekto: 02_changes_requested
    if qa_leaf:
        qa_leaf.write({"state": "02_changes_requested"})
    qa_task.write({"state": "02_changes_requested"})

    # 3. Priklausoma transformatorinės pridavimo užduotis automatiškai atstatoma į 04_waiting_normal
    vei_closing.invalidate_recordset()
    if vei_leaf:
        vei_leaf.invalidate_recordset()
        assert vei_leaf.state == "04_waiting_normal", (
            f"E9 KLAIDA: Atmetus QA užduotį, priklausoma lapinė užduotis turi būti '04_waiting_normal', bet yra '{vei_leaf.state}'!"
        )
    assert vei_closing.state == "04_waiting_normal", (
        f"E9 KLAIDA: Atmetus QA užduotį, priklausoma užduotis turi būti '04_waiting_normal', bet yra '{vei_closing.state}'!"
    )

    # =========================================================================
    # Worklock E10: Lithuanian Working Hours & Public Holidays Calculation
    # =========================================================================
    _logger.info("Tikrinamas E10: Lietuvos darbo kalendorius (08:00-17:00, 1h pietūs 12:45-13:45)")
    # Standard working day: 08:00 - 17:00 (9h gross - 1h lunch = exactly 8.0h)
    std_s = datetime(2026, 10, 19, 8, 0, 0)
    std_e = datetime(2026, 10, 19, 17, 0, 0)
    w_hours = calculate_lithuanian_working_hours(std_s, std_e)
    assert w_hours == 8.0, f"E10 KLAIDA: Standartinė diena turi būti 8.0h, gauta: {w_hours}"

    # Lithuanian national holiday: Feb 16, 2026 (Valstybės atkūrimo diena) -> 0.0h
    h_s = datetime(2026, 2, 16, 8, 0, 0)
    h_e = datetime(2026, 2, 16, 17, 0, 0)
    h_hours = calculate_lithuanian_working_hours(h_s, h_e)
    assert h_hours == 0.0, f"E10 KLAIDA: Šventinė vasario 16 d. turi būti 0.0h, gauta: {h_hours}"

    # Multi-year holidays check (Easter & fixed holidays in 2026 and 2027)
    holidays_2026 = get_lithuanian_holidays(2026)
    holidays_2027 = get_lithuanian_holidays(2027)
    assert date(2026, 2, 16) in holidays_2026
    assert date(2026, 3, 11) in holidays_2026
    assert date(2026, 7, 6) in holidays_2026
    assert date(2027, 2, 16) in holidays_2027
    assert date(2027, 3, 11) in holidays_2027

    # =========================================================================
    # Worklock E11: Approved ('03_approved') vs Done ('1_done') Hierarchy Logic
    # 1. Worker presses 'Baigti' (action_timer_finish) -> status becomes '03_approved' (NOT '1_done').
    # 2. Parent task CANNOT be marked '1_done' while any task below it is '03_approved' or in progress.
    # 3. Reviewer requests changes ('02_changes_requested') -> all parent containers revert to '01_in_progress'.
    # 4. Worker fixes and presses 'Baigti' -> leaf & parents become '03_approved' (still NOT '1_done').
    # 5. Reviewer confirms '1_done' on bottom tasks -> parent becomes '1_done' ONLY when all tasks below are '1_done'.
    # =========================================================================
    _logger.info("Tikrinamas E11: Patvirtinta (03_approved) ir Atlikta (1_done) hierarchinė logika bei laikmačio 'Baigti' veiksmas")
    arunas = user_map["eng_structural"]
    nerijus = user_map["head_design"]
    t_parent = project_data["t1_design"]
    t_l2 = project_data["t1_design_struct"]
    t_l3 = project_data["t1_design_struct_sub"]
    t_l4 = project_data["t1_design_struct_sub_sub"]
    t_leaf = project_data["t1_design_struct_sub_sub_sub"]

    # Step 11.1: Worker starts and presses 'Baigti' (action_timer_finish) on leaf task
    t_leaf.write({"state": "01_in_progress"})
    t_leaf.with_user(arunas).action_timer_start()
    assert t_leaf.is_timer_running, "E11.1: Laikmatis turi bėgti!"
    t_leaf.with_user(arunas).action_timer_finish()
    t_leaf.invalidate_recordset()
    t_l4.invalidate_recordset()
    t_l3.invalidate_recordset()
    t_l2.invalidate_recordset()
    t_parent.invalidate_recordset()

    # Worker pressing 'Baigti' MUST set leaf to '03_approved', NOT '1_done'!
    assert t_leaf.state == "03_approved", f"E11.1 KLAIDA: Paspaudus 'Baigti', būsena turi būti '03_approved', gauta: {t_leaf.state}"
    # Parents MUST be '03_approved' (because 2.1 is '1_done' and 2.2 is '03_approved'), NEVER '1_done'!
    assert t_l4.state == "03_approved", f"E11.1 KLAIDA: t_l4 turi būti '03_approved', gauta: {t_l4.state}"
    assert t_l3.state == "03_approved", f"E11.1 KLAIDA: t_l3 turi būti '03_approved', gauta: {t_l3.state}"
    assert t_l2.state == "03_approved", f"E11.1 KLAIDA: t_l2 turi būti '03_approved', gauta: {t_l2.state}"
    assert t_parent.state == "03_approved", f"E11.1 KLAIDA: Tėvinis etapas turi būti '03_approved' (ne '1_done'!), gauta: {t_parent.state}"

    # Step 11.2: Attempting to mark parent task '1_done' while child is '03_approved' MUST be blocked!
    e11_parent_done_blocked = False
    try:
        t_parent.with_user(nerijus).write({"state": "1_done"})
    except ValidationError:
        e11_parent_done_blocked = True
    assert e11_parent_done_blocked, "E11.2 KLAIDA: Leista pažymėti tėvinę užduotį '1_done', kai jos po-užduotis dar tik '03_approved'!"

    # Step 11.3: Reviewer checks task and asks for changes ('02_changes_requested')
    t_leaf.with_user(nerijus).write({"state": "02_changes_requested"})
    for rec_item in (t_leaf, t_l4, t_l3, t_l2, t_parent):
        rec_item.invalidate_recordset()
    assert t_leaf.state == "02_changes_requested"
    # All parent containers MUST automatically drop back to '01_in_progress'!
    assert t_l4.state == "01_in_progress", f"E11.3 KLAIDA: t_l4 turi grįžti į '01_in_progress', gauta: {t_l4.state}"
    assert t_l3.state == "01_in_progress", f"E11.3 KLAIDA: t_l3 turi grįžti į '01_in_progress', gauta: {t_l3.state}"
    assert t_l2.state == "01_in_progress", f"E11.3 KLAIDA: t_l2 turi grįžti į '01_in_progress', gauta: {t_l2.state}"
    assert t_parent.state == "01_in_progress", f"E11.3 KLAIDA: t_parent turi grįžti į '01_in_progress', gauta: {t_parent.state}"

    # Attempting to finish parent via action_timer_finish while child is in '02_changes_requested' MUST be blocked!
    e11_parent_finish_blocked = False
    try:
        t_parent.with_user(nerijus).action_timer_finish()
    except ValidationError:
        e11_parent_finish_blocked = True
    assert e11_parent_finish_blocked, "E11.3 KLAIDA: Leista užbaigti tėvinę užduotį per 'Baigti', kai po-užduotis atmesta!"

    # Step 11.4: Worker re-works task and presses 'Baigti' (action_timer_finish) -> '03_approved'
    t_leaf.with_user(arunas).action_timer_start()
    t_leaf.with_user(arunas).action_timer_finish()
    for rec_item in (t_leaf, t_l4, t_l3, t_l2, t_parent):
        rec_item.invalidate_recordset()
    assert t_leaf.state == "03_approved"
    assert t_parent.state == "03_approved"

    # Step 11.5: Reviewer checks task and confirms '1_done' -> all ancestors become '1_done'!
    t_leaf.with_user(nerijus).write({"state": "1_done"})
    for rec_item in (t_leaf, t_l4, t_l3, t_l2, t_parent):
        rec_item.invalidate_recordset()
    assert t_leaf.state == "1_done", "E11.5 KLAIDA: Lapinė užduotis turi būti '1_done'!"
    assert t_l4.state == "1_done", f"E11.5 KLAIDA: t_l4 turi tapti '1_done', gauta: {t_l4.state}"
    assert t_l3.state == "1_done", f"E11.5 KLAIDA: t_l3 turi tapti '1_done', gauta: {t_l3.state}"
    assert t_l2.state == "1_done", f"E11.5 KLAIDA: t_l2 turi tapti '1_done', gauta: {t_l2.state}"
    assert t_parent.state == "1_done", f"E11.5 KLAIDA: Kai visos po-užduotys '1_done', tėvinis etapas privalo tapti '1_done', gauta: {t_parent.state}"

    # Verify timeline payload also reflects '1_done' on t_parent when all children are '1_done'
    tl_check_done = env["project.task"].get_all_in_one_timeline_data(project_id=project_data["p1"].id)
    tl_map_done = {t["id"]: t for t in tl_check_done["tasks"]}
    assert tl_map_done[f"task_{t_parent.id}"]["state"] == "1_done"
    assert tl_map_done[f"task_{t_parent.id}"]["is_done"] is True

    # Restore leaf to '03_approved' for live simulation state (waiting for final approval on 2.2)
    t_leaf.with_user(nerijus).write({"state": "03_approved"})
    for rec_item in (t_leaf, t_l4, t_l3, t_l2, t_parent):
        rec_item.invalidate_recordset()
    assert t_parent.state == "03_approved", "Grąžinus lapą į '03_approved', tėvas privalo vėl tapti '03_approved'!"

    # =========================================================================
    # Option A & Overdue Verification:
    # PRJ-01 ends in Dec 2026 -> is_overdue_past is False (NO fire icon on project row)
    # Milestone M1 in PRJ-01 ended in April 2026 -> is_overdue_past is True (shows fire icon)
    # PRJ-03 ended in June 2026 -> is_overdue_past is True (shows fire icon on project row)
    # only_overdue=True filter contains PRJ-03, does NOT contain PRJ-01
    # =========================================================================
    _logger.info("Tikrinama Vėlavimo logika (Variantas A: Liepsnelė 🔥 TIK ant vėluojančio etapo, bet ne ant projekto)")
    p1 = project_data["p1"]
    p3 = project_data["p3"]
    data_p1 = env["project.task"].get_all_in_one_timeline_data(project_id=p1.id)
    p1_tasks = {t["id"]: t for t in data_p1["tasks"]}

    # Verify DB state and Timeline state of 2. Projektavimo etapas match 100% ('03_approved')
    assert p1_tasks[f"task_{t_parent.id}"]["state"] == "03_approved"
    assert t_parent.state == "03_approved"

    # Project PRJ-01 itself must NOT be overdue past (ends in Dec 2026)
    assert not p1_tasks[f"proj_{p1.id}"]["is_overdue_past"], (
        "KLAIDA: PRJ-01 baigiasi gruodį, todėl is_overdue_past turi būti False (be liepsnelės)!"
    )
    # But it correctly tracks that it has overdue subtasks
    assert p1_tasks[f"proj_{p1.id}"]["has_overdue_tasks"], (
        "PRJ-01 turi žinoti, kad turi vėluojančių užduočių (has_overdue_tasks=True)!"
    )

    # Milestone M1 in PRJ-01 is past-due (ended in April 2026, progress < 1.0) -> MUST have is_overdue_past=True
    m1 = env["project.milestone"].search([("project_id", "=", p1.id), ("name", "like", "M1%")], limit=1)
    assert m1 and f"milestone_{m1.id}" in p1_tasks, "Milestone M1 nerasta PRJ-01 užduotyse!"
    assert p1_tasks[f"milestone_{m1.id}"]["is_overdue_past"], (
        "Milestone M1 baigėsi balandžio mėnesį, todėl privalo turėti is_overdue_past=True (liepsnelę)!"
    )

    # PRJ-03 ended in June 2026 -> MUST have is_overdue_past=True
    data_p3 = env["project.task"].get_all_in_one_timeline_data(project_id=p3.id)
    p3_tasks = {t["id"]: t for t in data_p3["tasks"]}
    assert p3_tasks[f"proj_{p3.id}"]["is_overdue_past"], (
        "PRJ-03 baigėsi 2026-06-19, todėl privalo turėti is_overdue_past=True (liepsnelę)!"
    )

    # Dropdown filter "only_overdue=True"
    data_overdue = env["project.task"].get_all_in_one_timeline_data(only_overdue=True)
    overdue_keys = {t["id"] for t in data_overdue["tasks"]}
    assert f"proj_{p1.id}" not in overdue_keys, "PRJ-01 neturi būti rodomas 'Vėluojantys projektai' filtre!"
    assert f"proj_{p3.id}" in overdue_keys, "PRJ-03 privalo būti rodomas 'Vėluojantys projektai' filtre!"

    # =========================================================================
    # E12: Parent Task Resizing (Expanding & Shrinking with plan_is_auto)
    # =========================================================================
    _logger.info("Tikrinamas E12: Tėvinės užduoties tempimas (Expanding & Shrinking, Bug #1 fix)")
    from odoo.addons.GanntLT.models.project_task import local_to_utc_dt, utc_to_local_dt
    lt_dt = lambda y, m, d, hh=8, mm=0: local_to_utc_dt(env, datetime(y, m, d, hh, mm, 0))
    tomas = user_map["sales_rep"]
    e12_parent = env["project.task"].with_user(nerijus).create({
        "name": "E12 Tėvinė užduotis",
        "project_id": p1.id,
        "planned_date_start": lt_dt(2026, 5, 4, 8, 0),
        "planned_date_end": lt_dt(2026, 5, 7, 17, 0),
        "plan_is_auto": True,
    })
    e12_c1 = env["project.task"].with_user(nerijus).create({
        "name": "E12 Subtask 1",
        "project_id": p1.id,
        "parent_id": e12_parent.id,
        "planned_date_start": lt_dt(2026, 5, 4, 8, 0),
        "planned_date_end": lt_dt(2026, 5, 5, 17, 0),
    })
    e12_c2 = env["project.task"].with_user(nerijus).create({
        "name": "E12 Subtask 2",
        "project_id": p1.id,
        "parent_id": e12_parent.id,
        "planned_date_start": lt_dt(2026, 5, 6, 8, 0),
        "planned_date_end": lt_dt(2026, 5, 7, 17, 0),
    })
    e12_parent.write({"plan_is_auto": True})
    assert e12_parent.plan_is_auto is True

    # Expand parent task right edge via save_timeline_batch_schedule (from 05-07 to 05-12)
    env["project.task"].with_user(nerijus).save_timeline_batch_schedule([{
        "id": f"task_{e12_parent.id}",
        "start_date": "2026-05-04 08:00:00",
        "end_date": "2026-05-12 17:00:00",
    }])
    e12_parent.invalidate_recordset()
    assert e12_parent.plan_is_auto is False, "E12 KLAIDA: Išplėtus tėvinę užduotį, plan_is_auto turi tapti False!"
    assert e12_parent.planned_date_end == lt_dt(2026, 5, 12, 17, 0), (
        f"E12 KLAIDA: Tėvinės užduoties pabaiga neturi grįžti į vaikų max! Gauta: {e12_parent.planned_date_end}"
    )

    # Shrink parent task together with clamped children in batch
    env["project.task"].with_user(nerijus).save_timeline_batch_schedule([
        {
            "id": f"task_{e12_parent.id}",
            "start_date": "2026-05-04 08:00:00",
            "end_date": "2026-05-06 17:00:00",
            "plan_is_auto": False,
        },
        {
            "id": f"task_{e12_c2.id}",
            "start_date": "2026-05-05 08:00:00",
            "end_date": "2026-05-06 17:00:00",
            "plan_is_auto": False,
        },
    ])
    e12_parent.invalidate_recordset()
    e12_c2.invalidate_recordset()
    assert e12_parent.planned_date_end == lt_dt(2026, 5, 6, 17, 0), "E12 KLAIDA: Tėvinės užduoties susiaurinimas neišsisaugojo!"
    assert e12_c2.planned_date_end == lt_dt(2026, 5, 6, 17, 0), "E12 KLAIDA: Po-užduoties susiaurinimas neišsisaugojo!"
    (e12_c1 | e12_c2 | e12_parent).sudo().unlink()

    # =========================================================================
    # E13: Milestone Moving & Shrinking with >= 2 Tasks (Bug #2 fix)
    # =========================================================================
    _logger.info("Tikrinamas E13: Gairės (Milestone) su >=2 užduotimis perkėlimas ir susiaurinimas (Bug #2 fix)")
    e13_ms = env["project.milestone"].sudo().create({
        "name": "E13 Gairė",
        "project_id": p1.id,
        "date_start": date(2026, 5, 4),
        "planned_date_end": date(2026, 5, 15),
        "deadline": date(2026, 5, 15),
    })
    e13_t1 = env["project.task"].with_user(nerijus).create({
        "name": "E13 Užduotis 1",
        "project_id": p1.id,
        "milestone_id": e13_ms.id,
        "planned_date_start": lt_dt(2026, 5, 4, 8, 0),
        "planned_date_end": lt_dt(2026, 5, 8, 17, 0),
    })
    e13_t2 = env["project.task"].with_user(nerijus).create({
        "name": "E13 Užduotis 2",
        "project_id": p1.id,
        "milestone_id": e13_ms.id,
        "planned_date_start": lt_dt(2026, 5, 11, 8, 0),
        "planned_date_end": lt_dt(2026, 5, 15, 17, 0),
    })
    # Shrink milestone right edge to 2026-05-12 with milestone first in batch list
    env["project.task"].with_user(nerijus).save_timeline_batch_schedule([
        {
            "id": f"milestone_{e13_ms.id}",
            "start_date": "2026-05-04 08:00:00",
            "end_date": "2026-05-12 17:00:00",
        },
        {
            "id": f"task_{e13_t1.id}",
            "start_date": "2026-05-04 08:00:00",
            "end_date": "2026-05-08 17:00:00",
        },
        {
            "id": f"task_{e13_t2.id}",
            "start_date": "2026-05-11 08:00:00",
            "end_date": "2026-05-12 17:00:00",
        },
    ])
    e13_ms.invalidate_recordset()
    assert e13_ms.date_start == date(2026, 5, 4), f"E13 KLAIDA: Gairės date_start sugadinta: {e13_ms.date_start}"
    assert e13_ms.planned_date_end == date(2026, 5, 12), f"E13 KLAIDA: Gairės planned_date_end nebuvo susiaurinta: {e13_ms.planned_date_end}"
    assert e13_ms.deadline == date(2026, 5, 12), f"E13 KLAIDA: Gairės deadline turi būti 2026-05-12: {e13_ms.deadline}"
    tl_e13 = {t["id"]: t for t in env["project.task"].get_all_in_one_timeline_data(project_id=p1.id)["tasks"]}
    assert tl_e13[f"milestone_{e13_ms.id}"]["has_deadline_delay"] is False, (
        "E13 KLAIDA: Susiaurinus gairę atsirado netikra raudona vėlavimo uodegėlė!"
    )

    # Move milestone + both tasks forward by +1 week
    env["project.task"].with_user(nerijus).save_timeline_batch_schedule([
        {
            "id": f"milestone_{e13_ms.id}",
            "start_date": "2026-05-11 08:00:00",
            "end_date": "2026-05-19 17:00:00",
        },
        {
            "id": f"task_{e13_t1.id}",
            "start_date": "2026-05-11 08:00:00",
            "end_date": "2026-05-15 17:00:00",
        },
        {
            "id": f"task_{e13_t2.id}",
            "start_date": "2026-05-18 08:00:00",
            "end_date": "2026-05-19 17:00:00",
        },
    ])
    e13_ms.invalidate_recordset()
    assert e13_ms.date_start == date(2026, 5, 11), f"E13 KLAIDA: Perkeltos gairės date_start turi būti 2026-05-11, gauta: {e13_ms.date_start}"
    assert e13_ms.planned_date_end == date(2026, 5, 19), f"E13 KLAIDA: Perkeltos gairės planned_date_end turi būti 2026-05-19, gauta: {e13_ms.planned_date_end}"
    (e13_t1 | e13_t2).sudo().unlink()
    e13_ms.sudo().unlink()

    # =========================================================================
    # E14: Resizing/Moving Task with '03_approved' Predecessor (Bug #3 fix)
    # =========================================================================
    _logger.info("Tikrinamas E14: Užduoties su '03_approved' pirmtaku tempimas laiko juostoje (Bug #3 fix)")
    e14_pred = env["project.task"].with_user(nerijus).create({
        "name": "E14 Patvirtintas pirmtakas",
        "project_id": p1.id,
        "planned_date_start": lt_dt(2026, 5, 4, 8, 0),
        "planned_date_end": lt_dt(2026, 5, 5, 17, 0),
        "state": "03_approved",
        "progress": 0.0,
    })
    e14_succ = env["project.task"].with_user(nerijus).create({
        "name": "E14 Priklausoma užduotis",
        "project_id": p1.id,
        "planned_date_start": lt_dt(2026, 5, 6, 8, 0),
        "planned_date_end": lt_dt(2026, 5, 7, 17, 0),
        "state": "01_in_progress",
        "depend_on_ids": [(4, e14_pred.id)],
    })
    env["project.task"].with_user(nerijus).save_timeline_batch_schedule([{
        "id": f"task_{e14_succ.id}",
        "start_date": "2026-05-06 08:00:00",
        "end_date": "2026-05-08 17:00:00",
    }])
    e14_succ.invalidate_recordset()
    assert e14_succ.state == "01_in_progress", (
        f"E14 KLAIDA: Užduotis su '03_approved' pirmtaku neturi tapti '04_waiting_normal'! Gauta: {e14_succ.state}"
    )
    (e14_succ | e14_pred).sudo().unlink()

    # =========================================================================
    # E15: Dependency Link Creation, Removal, Circular Block & State Rules (Bug #4 fix)
    # =========================================================================
    _logger.info("Tikrinamas E15: Priklausomybių kūrimas, šalinimas, ciklų blokavimas ir būsenų taisyklės (Bug #4 fix)")
    e15_a = env["project.task"].with_user(nerijus).create({
        "name": "E15 Užduotis A",
        "project_id": p1.id,
        "planned_date_start": lt_dt(2026, 5, 4, 8, 0),
        "planned_date_end": lt_dt(2026, 5, 5, 17, 0),
        "state": "01_in_progress",
    })
    e15_b = env["project.task"].with_user(nerijus).create({
        "name": "E15 Užduotis B",
        "project_id": p1.id,
        "planned_date_start": lt_dt(2026, 5, 6, 8, 0),
        "planned_date_end": lt_dt(2026, 5, 7, 17, 0),
        "state": "01_in_progress",
    })
    e15_done = env["project.task"].with_user(nerijus).create({
        "name": "E15 Jau atlikta užduotis",
        "project_id": p1.id,
        "planned_date_start": lt_dt(2026, 5, 6, 8, 0),
        "planned_date_end": lt_dt(2026, 5, 7, 17, 0),
        "state": "1_done",
        "progress": 100.0,
    })
    env["project.task"].with_user(nerijus).add_timeline_dependency(f"task_{e15_a.id}", f"task_{e15_b.id}")
    e15_b.invalidate_recordset()
    assert e15_a in e15_b.depend_on_ids
    assert e15_b.state == "04_waiting_normal", "E15 KLAIDA: Pridėjus nebaigtą pirmtaką, aktyvi užduotis turi tapti '04_waiting_normal'!"

    # Circular dependency B -> A must raise ValidationError
    e15_cycle_blocked = False
    try:
        env["project.task"].with_user(nerijus).add_timeline_dependency(f"task_{e15_b.id}", f"task_{e15_a.id}")
    except ValidationError:
        e15_cycle_blocked = True
    assert e15_cycle_blocked, "E15 KLAIDA: Ciklinė priklausomybė B -> A nebuvo užblokuota!"

    # Adding unfinished predecessor to an already completed ('1_done') task must NOT reset its state to '04_waiting_normal'
    env["project.task"].with_user(nerijus).add_timeline_dependency(f"task_{e15_a.id}", f"task_{e15_done.id}")
    e15_done.invalidate_recordset()
    assert e15_done.state == "1_done", f"E15 KLAIDA: Jau atliktos užduoties būsena neturi būti numušta į '04_waiting_normal'! Gauta: {e15_done.state}"

    # Remove dependencies
    env["project.task"].with_user(nerijus).remove_timeline_dependency(f"task_{e15_a.id}", f"task_{e15_b.id}")
    env["project.task"].with_user(nerijus).remove_timeline_dependency(f"task_{e15_a.id}", f"task_{e15_done.id}")
    e15_b.invalidate_recordset()
    assert not e15_b.depend_on_ids, "E15 KLAIDA: Priklausomybė nebuvo pašalinta!"
    (e15_a | e15_b | e15_done).sudo().unlink()

    # =========================================================================
    # E16: Left/Right Edge Resizing & Lithuanian Working Hours Recalculation
    # =========================================================================
    _logger.info("Tikrinamas E16: Kairiojo/dešiniojo krašto tempimas ir LT darbo valandų perskaičiavimas")
    e16_task = env["project.task"].with_user(nerijus).create({
        "name": "E16 Tempimo užduotis",
        "project_id": p1.id,
        "planned_date_start": lt_dt(2026, 5, 4, 8, 0),
        "planned_date_end": lt_dt(2026, 5, 5, 17, 0),
    })
    assert e16_task.allocated_hours == 16.0, f"E16 KLAIDA: Pradinės valandos turi būti 16.0, gauta: {e16_task.allocated_hours}"

    # Resize left edge earlier across May 1st public holiday (2026-04-30 Thu .. 2026-05-05 Tue = 3 working days = 24h)
    env["project.task"].with_user(nerijus).save_timeline_batch_schedule([{
        "id": f"task_{e16_task.id}",
        "start_date": "2026-04-30 08:00:00",
        "end_date": "2026-05-05 17:00:00",
    }])
    e16_task.invalidate_recordset()
    assert e16_task.allocated_hours == 24.0, (
        f"E16 KLAIDA: Kairiojo krašto tempimas per Gegužės 1-ąją turi duoti 24.0 darbo val., gauta: {e16_task.allocated_hours}"
    )

    # Resize right edge later to 2026-05-07 Thu (+2 working days = 40h)
    env["project.task"].with_user(nerijus).save_timeline_batch_schedule([{
        "id": f"task_{e16_task.id}",
        "start_date": "2026-04-30 08:00:00",
        "end_date": "2026-05-07 17:00:00",
    }])
    e16_task.invalidate_recordset()
    assert e16_task.allocated_hours == 40.0, (
        f"E16 KLAIDA: Dešiniojo krašto tempimas turi duoti 40.0 darbo val., gauta: {e16_task.allocated_hours}"
    )
    assert env["project.task"].with_user(nerijus).action_recompute_timeline_spans(project_id=p1.id) is True
    e16_task.sudo().unlink()

    # =========================================================================
    # E17: UI Toolbar Actions, RPC Methods, Permissions & Excel Export (.xlsx)
    # =========================================================================
    _logger.info("Tikrinamas E17: UI įrankių juostos RPC veiksmai, teisės ir Excel (.xlsx) eksportas")
    assert env["project.task"].with_user(nerijus).check_edit_rights() is True
    assert env["project.task"].with_user(tomas).check_edit_rights() is False

    # Test create_new_project_from_timeline, create_timeline_milestone, create_timeline_task & delete_timeline_item
    temp_proj_id = env["project.task"].with_user(nerijus).create_new_project_from_timeline(
        "E17 Laikinas Projektas", "2026-06-01", "2026-06-30"
    )
    assert temp_proj_id and env["project.project"].browse(temp_proj_id).exists()
    temp_ms_id = env["project.task"].with_user(nerijus).create_timeline_milestone(
        "E17 Laikina Gairė", temp_proj_id, "2026-06-01", "2026-06-15"
    )
    assert temp_ms_id and env["project.milestone"].browse(temp_ms_id).exists()
    temp_task_id = env["project.task"].with_user(nerijus).create_timeline_task(
        "E17 Laikina Užduotis", temp_proj_id, "2026-06-01 08:00:00", "2026-06-05 17:00:00", milestone_id=temp_ms_id
    )
    assert temp_task_id and env["project.task"].browse(temp_task_id).exists()
    assert env["project.task"].with_user(nerijus).delete_timeline_item(f"task_{temp_task_id}") is True
    assert env["project.task"].with_user(nerijus).delete_timeline_item(f"milestone_{temp_ms_id}") is True
    assert env["project.task"].with_user(nerijus).delete_timeline_item(f"proj_{temp_proj_id}") is True

    # Test Excel (.xlsx) workbook generation for all 5 Armetlina projects
    import io
    import xlsxwriter
    from odoo.addons.GanntLT.controllers.main import (
        create_workbook_formats,
        partition_tasks_by_project,
        render_project_sheet,
        sanitize_sheet_name,
    )
    all_tl = env["project.task"].with_user(nerijus).get_all_in_one_timeline_data()
    sheets_data = partition_tasks_by_project(all_tl["tasks"])
    assert len(sheets_data) >= 5, f"E17 KLAIDA: Excel eksportas turi turėti bent 5 projektų lapus, gauta: {len(sheets_data)}"
    xlsx_buf = io.BytesIO()
    wb = xlsxwriter.Workbook(xlsx_buf, {"in_memory": True})
    formats = create_workbook_formats(wb)
    holidays_cache = {}
    sheet_names = set()
    for p_title, s_title, p_tasks in sheets_data:
        s_name = sanitize_sheet_name(s_title, sheet_names)
        render_project_sheet(wb, s_name, p_title, p_tasks, formats, holidays_cache)
    wb.close()
    xlsx_bytes = xlsx_buf.getvalue()
    assert xlsx_bytes[:4] == b"PK\x03\x04" and len(xlsx_bytes) > 5000, "E17 KLAIDA: Sugeneruotas neteisingas .xlsx failas!"

    # =========================================================================
    # E18: Anti-Cheating E4 Frontend vs Backend Resize Enforcement
    # =========================================================================
    _logger.info("Tikrinamas E18: Patvirtintos užduoties (E4) kairiojo/dešiniojo krašto tempimo apsauga")
    app_start_local = utc_to_local_dt(env, approved_task.approved_planned_date_start or approved_task.planned_date_start)
    app_end_local = utc_to_local_dt(env, approved_task.approved_planned_date_end or approved_task.planned_date_end)
    orig_app_end = approved_task.planned_date_end
    orig_app_alloc = approved_task.allocated_hours

    # 1. Left-edge resize (changing planned_date_start) on approved task MUST be blocked
    e18_left_blocked = False
    try:
        env["project.task"].with_user(nerijus).save_timeline_batch_schedule([{
            "id": f"task_{approved_task.id}",
            "start_date": (app_start_local + timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S"),
            "end_date": app_end_local.strftime("%Y-%m-%d %H:%M:%S"),
        }])
    except ValidationError:
        e18_left_blocked = True
    assert e18_left_blocked, "E18 KLAIDA: Patvirtintos užduoties kairiojo krašto (pradžios) tempimas nebuvo užblokuotas!"

    # 2. Right-edge shrink (decreasing duration below baseline) on approved task MUST be blocked
    e18_shrink_blocked = False
    try:
        env["project.task"].with_user(nerijus).save_timeline_batch_schedule([{
            "id": f"task_{approved_task.id}",
            "start_date": app_start_local.strftime("%Y-%m-%d %H:%M:%S"),
            "end_date": (app_start_local + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S"),
        }])
    except ValidationError:
        e18_shrink_blocked = True
    assert e18_shrink_blocked, "E18 KLAIDA: Patvirtintos užduoties dešiniojo krašto susiaurinimas nebuvo užblokuotas!"

    # 3. Right-edge expansion (increasing duration above baseline) is permitted by backend
    expanded_local_end = app_end_local + timedelta(days=7)
    env["project.task"].with_user(nerijus).save_timeline_batch_schedule([{
        "id": f"task_{approved_task.id}",
        "start_date": app_start_local.strftime("%Y-%m-%d %H:%M:%S"),
        "end_date": expanded_local_end.strftime("%Y-%m-%d %H:%M:%S"),
    }])
    approved_task.invalidate_recordset()
    assert approved_task.planned_date_end == local_to_utc_dt(env, expanded_local_end), (
        "E18 KLAIDA: Patvirtintos užduoties išplėtimas į dešinę turėjo pavykti!"
    )
    # Restore approved_task to original end date for live DB state
    approved_task.with_context(gannt_admin_override=True, skip_hierarchy_propagation=True).sudo().write({
        "planned_date_end": orig_app_end,
        "allocated_hours": orig_app_alloc,
    })

    _logger.info("Visi 18 testų (E1 - E18) ir Vėlavimo logikos (Option A) SĖKMINGAI IŠLAIKYTI!")


def test_safe_uninstallation_hook(env):
    """
    Step 6: Safe Uninstallation Implementation verification.
    Tests uninstall_hook(env) and verifies standard Odoo views work without errors.
    """
    _logger.info("--- Step 6: Tikrinamas saugus modulio išdiegimas (uninstall_hook) ---")
    actions_to_check = [
        "project.action_view_task",
        "project.project_task_action_from_partner",
        "project.act_project_project_2_project_task_all",
        "project.action_view_all_task",
        "project.open_view_project_all",
        "project.open_view_project_all_group_stage",
    ]

    # Run uninstall hook
    uninstall_hook(env)

    # Verify 'timeline' is removed from view_mode of all 6 actions
    for xml_id in actions_to_check:
        action = env.ref(xml_id, raise_if_not_found=False)
        if action and action.view_mode:
            modes = [m.strip() for m in action.view_mode.split(",")]
            assert "timeline" not in modes, f"KLAIDA: 'timeline' vis dar yra veiksme {xml_id}: {action.view_mode}"

    # Verify standard Odoo get_views executes without error
    task_views = env["project.task"].get_views([(False, "kanban"), (False, "list"), (False, "form")])
    assert "views" in task_views, "KLAIDA: Nepavyko užkrauti standartinių Odoo užduočių vaizdų po išdiegimo!"
    _logger.info("Saugaus išdiegimo patikra (uninstall_hook) SĖKMINGA.")

    # Restore 'timeline' back to actions for the live system
    for xml_id in actions_to_check:
        action = env.ref(xml_id, raise_if_not_found=False)
        if action and action.view_mode:
            modes = [m.strip() for m in action.view_mode.split(",") if m.strip()]
            if "timeline" not in modes:
                modes.append("timeline")
                action.write({"view_mode": ",".join(modes)})


def run_armetlina_simulation(env, commit=False):
    """
    Pagrindinė UAB „Armetlina“ modeliavimo paleidimo funkcija.
    Gali būti kviečiama tiek iš Odoo shell, tiek iš unit testų.
    """
    _logger.info("=========================================================================")
    _logger.info("PRADEDAMAS UAB „ARMETLINA“ MODELIAVIMAS IR STRESO TESTAS")
    _logger.info("=========================================================================")

    # Step 1: Cleanup old test projects
    cleanup_old_test_projects(env)

    # Step 2: Setup departments and users
    user_map, dept_map = setup_armetlina_company_and_users(env)

    # Step 3: Instantiate 5 projects with 4-level deep WBS
    project_data = instantiate_armetlina_projects(env, user_map)

    # Step 4: Execute all 10 worklock tests
    execute_all_worklock_tests(env, user_map, project_data)

    # Step 6: Verify safe uninstallation hook
    test_safe_uninstallation_hook(env)

    # Step 5: Persist live project states in DB
    if commit:
        _logger.info("--- Step 5: Įrašomos gyvos gamybos būsenos į duomenų bazę (commit) ---")
        env.cr.commit()
        _logger.info("Duomenų bazė 'testas' sėkmingai atnaujinta. Galite atidaryti naršyklę.")

    _logger.info("=========================================================================")
    _logger.info("UAB „ARMETLINA“ TESTAVIMAS IR MODELIAVIMAS SĖKMINGAI BAIGTAS (100% PASS)")
    _logger.info("=========================================================================")
    return project_data


# -------------------------------------------------------------------------
# Odoo Unit Test Runner Integracija (TransactionCase)
# -------------------------------------------------------------------------
class TestArmetlinaSimulation(TransactionCase):
    """Odoo Unit Test Runner klasė, automatizuojanti visus patikrinimus."""

    def test_armetlina_full_simulation(self):
        """Paleidžia pilną UAB „Armetlina“ modeliavimą ir visus 10 ribinių atvejų testus."""
        run_armetlina_simulation(self.env, commit=False)


# Jei skriptas paleidžiamas tiesiogiai per 'odoo shell < test_armetlina_simulation.py':
if "env" in globals() or "env" in locals():
    try:
        run_armetlina_simulation(env, commit=True)
    except Exception as e:
        _logger.exception("Klaida vykdant Armetlina simuliaciją per shell: %s", e)
        raise
