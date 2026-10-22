# -*- coding: utf-8 -*-
"""
UAB „Armetlina“ Standalone Shell Paleidimo Skriptas
===================================================

Vykdymo komanda iš WSL:
wsl -e bash -lc "odoo shell -c /etc/odoo/odoo.conf -d testas < custom_addons/GanntLT/tests/simulate_armetlina_company.py"
"""

from odoo.addons.GanntLT.tests.test_armetlina_simulation import run_armetlina_simulation

if "env" in globals() or "env" in locals():
    run_armetlina_simulation(env, commit=True)
