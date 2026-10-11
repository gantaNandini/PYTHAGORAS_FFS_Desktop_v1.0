#!/usr/bin/env python3
"""Generate tests/oracle.json: many varied input sets solved by the ORIGINAL ATLAS Python engine.
The JavaScript port must reproduce every result (and every error message).
Usage: python tools/oracle_gen.py <path to ATLAS_API579_PART9_KPTC> [--out tests/oracle.json]"""
import json, math, sys, copy
from pathlib import Path
pkg = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(pkg / 'ENGINE'))
from atlas_part9.schema import FIELDS, N_TESTS, DEFAULT_HISTORY, N_PROF, fields_for, DEFAULT_PROFILE
from atlas_part9.units import to_si, from_si, paris_C_us_to_si, jr_C_us_to_si
from atlas_part9.inputs import plausibility
from atlas_part9.database import num, material
from atlas_part9.solver import run
from atlas_part9.level3 import assess

NOCONV = ('none', 'raw', 'rate_C', 'jrC')

def default_raw(system, geo='KPTC'):
    raw = {}
    for f in fields_for(geo):
        if system == 'SI': v = f.si
        elif f.fps is not None: v = f.fps
        elif f.si is None or isinstance(f.si, str) or f.kind in NOCONV: v = f.si
        else: v = float(f'{from_si(f.si, f.kind, "FPS"):.15g}')
        raw[f.name] = v
    return raw

KIND = {f.name: f.kind for f in FIELDS}
for _f in FIELDS: KIND.setdefault(_f.name, _f.kind)
def ov(system, **kw):
    """Overrides written in SI numbers; converted to the display system by field kind."""
    out = {}
    for k, v in kw.items():
        if system == 'FPS' and isinstance(v, (int, float)) and not isinstance(v, bool) and KIND[k] not in NOCONV:
            v = float(f'{from_si(v, KIND[k], "FPS"):.15g}')
        out[k] = v
    return out

def build_case(system, load_type, raw, history, tests, geo='KPTC', profile=None):
    si = {}
    for f in fields_for(geo):
        v = raw.get(f.name)
        if isinstance(v, str) and v.strip() == '': v = None
        raw[f.name] = v
        si[f.name] = v if f.kind in NOCONV else (to_si(num(v), f.kind, system) if num(v) is not None else None)
    si['C_user'] = paris_C_us_to_si(num(raw['C_user']), num(raw['n_user'])) if system == 'FPS' and num(raw.get('C_user')) is not None and num(raw.get('n_user')) is not None else num(raw.get('C_user'))
    si['jr_C'] = jr_C_us_to_si(num(raw['jr_C']), num(raw['jr_n'])) if system == 'FPS' and num(raw.get('jr_C')) is not None and num(raw.get('jr_n')) is not None else num(raw.get('jr_C'))
    si['xi_cap_native'] = num(raw.get('xi_cap')); si['us_fixed_native'] = num(raw.get('us_fixed'))
    si['tests'] = [to_si(num(v), 'K', system) for v in tests if num(v) is not None][:N_TESTS]
    hist = []
    if load_type == 'VARIABLE':
        hist = [[str(h['name']), float(h['lo']), float(h['hi']), float(h['cycles'])] for h in history if num(h['cycles']) is not None]
        if not hist: raise ValueError('Variable load case has no load blocks (sheet 7_Load_History)')
    prof = []
    if geo == 'KPSCL':
        for r in (profile or [])[:N_PROF]:
            if num(r[0]) is None: continue
            prof.append([to_si(num(r[0]), 'length', system)] + [to_si(num(v), 'stress', system) if num(v) is not None else None for v in r[1:4]])
        prof.sort(key=lambda r: r[0])
    return {'system': system, 'load_type': load_type, 'geometry': geo, 'raw': raw, 'si': si, 'history': hist, 'profile': prof, 'project': {}, 'unit_warnings': plausibility(raw, system, fields_for(geo))}

def clean(o):
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    if isinstance(o, dict): return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [clean(v) for v in o]
    if isinstance(o, (str, int, bool)) or o is None: return o
    return str(o)

HK = ['cycles', 'c', 'Kmin', 'Kmax', 'dK', 'R', 'dKth', 'rate', 'KIP', 'KISR', 'Lr', 'Kr', 'allow', 'margin', 'status']
def pick(d, keys): return {k: d.get(k) for k in keys}

def expect_of(case, res):
    s = res['summary']; h = res['history']; sif = res['sif']
    mid = len(h) // 2
    return clean({
        'summary': s, 'initial': {k: v for k, v in res['initial'].items()},
        'n_history': len(h), 'hist': {'first': pick(h[0], HK), 'mid': pick(h[mid], HK), 'last': pick(h[-1], HK)},
        'n_sif': len(sif), 'sif_mid': sif[len(sif) // 2],
        'material': {k: res['material'][k] for k in ('Sy', 'Su', 'lrmax', 'lrmax_category', 'constraint', 'Kmat')},
        'toughness_method': res['toughness'].get('method_id'), 'toughness': {k: v for k, v in res['toughness'].items() if not isinstance(v, dict)},
        'growth': {k: v for k, v in res['growth'].items()}, 'residual': {k: v for k, v in res['residual'].items() if k != 'profile'},
        'loads': {k: v for k, v in res['loads'].items() if not hasattr(v, 'kind')}, 'geometry': res['geometry'],
        'flaw': res['flaw'], 'warnings': res['warnings'],
        'trace': [[t[0], t[1], t[2], t[3], t[4]] for t in res['trace']],
    })

def l3_expect(l3):
    S, M = l3['sensitivity'], l3['method_d']
    def mm(m): return None if not m else pick(m, ['initial_status', 'initial_margin', 'initial_Lr', 'initial_Kr', 'critical_c', 'life', 'life_status', 'stop'])
    rows = []
    for r in S['rows']:
        rows.append({'key': r['key'], 'adverse': r.get('adverse'),
                     **{side: {'factor': r[side]['factor'], 'metrics': mm(r[side].get('metrics')), 'error': r[side].get('error')} for side in ('lo', 'hi') if side in r}})
    out = {'sens': {'base': mm(S['base']), 'rows': rows, 'n_cases': S['n_cases'], 'n_unacceptable': S['n_unacceptable'], 'verdict': S['verdict'],
                    'combined': None if not S['combined'] else {'factors': S['combined']['factors'], 'metrics': mm(S['combined']['metrics']), 'error': S['combined']['error']},
                    'psf': None if not S['psf'] else {'factors': S['psf']['factors'], 'metrics': mm(S['psf']['metrics']), 'error': S['psf']['error']}}}
    if M:
        pts = M['points']
        out['md'] = {'outcome': M['outcome'], 'F_instability': M['F_instability'], 'F_capped': M['F_capped'], 'da_at_instability': M['da_at_instability'],
                     'F_level2': M['F_level2_single_Kmat'], 'n_points': len(pts), 'p0': pts[0], 'pmid': pts[len(pts) // 2], 'plast': pts[-1],
                     'jr': {k: v for k, v in M['jr'].items()}, 'warnings': M['warnings'], 'da_max': M['da_max']}
    else: out['md'] = None
    return clean(out)

MATDB = {r['material_id']: r for r in __import__('csv').DictReader(open(pkg / 'ENGINE/data/materials_db.csv', encoding='utf-8-sig'))}
SC = []   # scenarios
def add(name, system='SI', lt='CONSTANT', history=None, tests=None, l3=False, geo='KPTC', profile=None, **kw):
    SC.append(dict(name=name, system=system, lt=lt, history=history, tests=tests or [], l3=l3, ov=kw, geo=geo, profile=profile))

REF = dict(strength_source='DATABASE_SPEC_MIN')
# ---------------------------------------------------------------- base cases
for sysm in ('SI', 'FPS'):
    for lt in ('CONSTANT', 'VARIABLE'):
        add(f'base {sysm} {lt}', sysm, lt, l3=(sysm == 'SI' or lt == 'CONSTANT'))
# ---------------------------------------------------------------- flaw characterisation
add('flaw option2 sigma2<=0', flaw_option='OPTION_2', alpha=30.0, sigma1=100.0, sigma2=0.0)
add('flaw option2 sigma1 plane', flaw_option='OPTION_2', alpha=25.0, sigma1=100.0, sigma2=40.0, plane='SIGMA1')
add('flaw option2 sigma2 plane', flaw_option='OPTION_2', alpha=25.0, sigma1=100.0, sigma2=40.0, plane='SIGMA2')
add('flaw option2 sigma1<=0 error', flaw_option='OPTION_2', alpha=25.0, sigma1=0.0, sigma2=-5.0)
add('flaw option2 sigma2>sigma1 error', flaw_option='OPTION_2', alpha=25.0, sigma1=50.0, sigma2=80.0)
add('flaw cm<=0 error', cm=0.0)
add('flaw c/W>=1 error', cm=500.0)
add('flaw option2 FPS', 'FPS', flaw_option='OPTION_2', **ov('FPS', alpha=20.0, sigma1=100.0, sigma2=30.0))
# ---------------------------------------------------------------- every material with its default routes
for m in __import__('csv').DictReader(open(pkg / 'ENGINE/data/materials_db.csv', encoding='utf-8-sig')):
    kw = dict(material_id=m['material_id'], method=m['default_toughness_method'], T_assess=20.0, E=float(m['E_MPa']),
              syA=float(m['SMYS_MPa']), cm=8.0, W=300.0, t=25.0)
    if m['default_toughness_method'] == 'PROJECT_KMAT' and not m['Kmat_MPa_sqrt_m']:
        kw.update(kmat_project=95.0, data_status='APPROVED')
    if m['default_growth_model'] == 'PROJECT_MATERIAL_DATA' and not m['paris_C_mm_cycle']:
        kw.update(growth_model='9F4M_FERRITIC_PEARLITE_AIR')
    add(f"material {m['material_id']}", **kw)
add('material SA-516-70 FPS', 'FPS', material_id='SA-516-70', method='9F42_ASME_XI_LOWER', T_assess=68.0, E=29000.0)
add('material SA-240-304 FPS', 'FPS', material_id='SA-240-304', method='9F412_AUSTENITIC_JC', T_assess=68.0, E=28000.0)
# ---------------------------------------------------------------- strength source, Lr(max), constraint
add('strength project approved', material_id='SA-516-70', method='9F42_ASME_XI_LOWER', strength_source='PROJECT_AT_TEMPERATURE', sy_project=300.0, su_project=480.0, data_status='APPROVED')
add('strength project not approved error', material_id='SA-516-70', method='9F42_ASME_XI_LOWER', strength_source='PROJECT_AT_TEMPERATURE', sy_project=300.0, su_project=480.0)
add('strength warn elevated T', material_id='SA-516-70', method='9F42_ASME_XI_LOWER', T_assess=150.0)
add('Su<=Sy warn', strength_source='PROJECT_AT_TEMPERATURE', sy_project=400.0, su_project=380.0, data_status='APPROVED')
for mode in ('YIELD_PLATEAU', 'ASTM_A508', 'C_MN_STEEL', 'AUSTENITIC_SS', 'FLOW_STRESS', 'UNKNOWN'):
    add(f'lrmax {mode}', lrmax_mode=mode, Pm=200.0, Pb=60.0)
add('constraint plane_stress', constraint='plane_stress', Sm=60.0, Sb=30.0)
# ---------------------------------------------------------------- toughness routes
add('tough test set 3', method='PROJECT_TEST_SET', material_id='SA-516-70', tests=[90.0, 100.0, 110.0], curve_mode='FROM_DATABASE')
SC[-1]['tests'] = [90.0, 100.0, 110.0]
for n in (6, 11, 30):
    add(f'tough test set {n}', method='PROJECT_TEST_SET', material_id='SA-516-70'); SC[-1]['tests'] = [80.0 + 3.1 * i for i in range(n)]
add('tough test set scatter error', method='PROJECT_TEST_SET', material_id='SA-516-70'); SC[-1]['tests'] = [50.0, 100.0, 140.0]
add('tough test set <3 error', method='PROJECT_TEST_SET', material_id='SA-516-70'); SC[-1]['tests'] = [80.0, 90.0]
add('tough test set FPS', 'FPS', method='PROJECT_TEST_SET', material_id='SA-516-70'); SC[-1]['tests'] = [80.0, 90.0, 95.0, 100.0]
add('kmat project missing error', method='PROJECT_KMAT', material_id='SA-516-70')
add('kmat project ok', method='PROJECT_KMAT', material_id='SA-516-70', kmat_project=130.0, data_status='APPROVED')
for cond in ('WROUGHT', 'GTA_WELD', 'SA_WELD'):
    for basis in ('LOWER', 'MEAN'):
        for T in (20.0, 200.0, 450.0):
            add(f'austenitic {cond} {basis} T{int(T)}', material_id='SA-240-304', method='9F412_AUSTENITIC_JC', ss_condition=cond, ss_basis=basis, T_assess=T)
add('austenitic T out of range error', material_id='SA-240-304', method='9F412_AUSTENITIC_JC', T_assess=700.0)
add('austenitic FPS interp', 'FPS', material_id='SA-240-316', method='9F412_AUSTENITIC_JC', ss_condition='GTA_WELD', T_assess=212.0)
for mode in ('DIRECT', 'EQ_9F29', 'TABLE_9_2', 'TABLE_9_2_CONSERVATIVE'):
    for curve in ('FROM_DATABASE', 'A', 'D'):
        for xi in ('KIC', 'KIR'):
            add(f'xi {mode} {curve} {xi}', material_id='SA-516-70', method='9F42_ASME_XI_LOWER', tref_mode=mode, curve_mode=curve, xi_curve=xi, tref=-10.0, T_assess=30.0)
add('xi cap 220', material_id='SA-516-70', method='9F42_ASME_XI_LOWER', xi_cap=220.0, T_assess=150.0, tref=-20.0, tref_mode='DIRECT')
add('xi cap invalid error', material_id='SA-516-70', method='9F42_ASME_XI_LOWER', xi_cap=150.0)
add('xi table92 inexact error', material_id='SA-537-CL1', method='9F42_ASME_XI_LOWER', tref_mode='TABLE_9_2')
add('xi table92 conservative FPS', 'FPS', material_id='SA-516-70', method='9F42_ASME_XI_LOWER', tref_mode='TABLE_9_2_CONSERVATIVE')
add('xi eq9F29 FPS', 'FPS', material_id='SA-516-70', method='9F42_ASME_XI_LOWER', tref_mode='EQ_9F29', xi_cap=100.0)
add('xi eq9F29 austenitic error', material_id='SA-240-304', method='9F42_ASME_XI_LOWER', tref_mode='EQ_9F29')
for t0m in ('DIRECT', 'OPTION_A_EXEMPTION', 'OPTION_D_J_TEST'):
    for sulf in ('LOW', 'HIGH'):
        for lm in ('AUTO_KPTC_2T', 'USER'):
            add(f'master {t0m} {sulf} {lm}', material_id='SA-516-70', method='9F43_MASTER_CURVE', t0_mode=t0m, sulfur=sulf, mc_L_mode=lm, t0=-30.0, curve_mode='B', T_assess=0.0)
add('master us limit', material_id='SA-516-70', method='9F43_MASTER_CURVE', t0_mode='DIRECT', t0=-80.0, T_assess=20.0, mc_us_limit='9F44', us_option='A', us_cvn=60.0, curve_mode='B')
add('master us limit B', material_id='SA-516-70', method='9F43_MASTER_CURVE', t0_mode='DIRECT', t0=-80.0, T_assess=20.0, mc_us_limit='9F44', us_option='B', curve_mode='B')
for h2 in ('NONE', 'H2_225CR1MO', 'H2_225CR1MOV', 'USER'):
    add(f'master h2 {h2}', material_id='SA-387-22-CL2', method='9F43_MASTER_CURVE', h2_shift=h2, h2_shift_user=25.0, curve_mode='B', t0_mode='DIRECT', t0=-40.0)
add('master pf 0.5', material_id='SA-516-70', method='9F43_MASTER_CURVE', mc_pf=0.5, t0_mode='DIRECT', t0=-40.0, T_assess=0.0)
add('master optionD bad error', material_id='SA-516-70', method='9F43_MASTER_CURVE', t0_mode='OPTION_D_J_TEST', mc_test_J=0.01)
add('master FPS A', 'FPS', material_id='SA-516-70', method='9F43_MASTER_CURVE', t0_mode='OPTION_A_EXEMPTION', curve_mode='B')
for opt, basis in (('A', 'LOWER'), ('A', 'MEDIAN'), ('B', 'LOWER')):
    for cap in (110.0, 220.0):
        add(f'upper shelf {opt} {basis} {cap:g}', material_id='SA-516-70', method='9F44_UPPER_SHELF', us_option=opt, us_basis=basis, us_fixed=cap, us_cvn=80.0)
add('upper shelf FPS', 'FPS', material_id='SA-516-70', method='9F44_UPPER_SHELF', us_option='B', us_fixed=200.0)
add('upper shelf cvn missing error', material_id='SA-516-70', method='9F44_UPPER_SHELF', us_option='A', us_cvn=None)
add('dynamic', material_id='SA-516-70', method='9F45_DYNAMIC', t0_mode='DIRECT', t0=-50.0, curve_mode='B', T_assess=-20.0, syA=260.0)
add('dynamic OptionA', material_id='SA-516-70', method='9F45_DYNAMIC', t0_mode='OPTION_A_EXEMPTION', curve_mode='B', T_assess=-20.0, syA=260.0, krate_dyn=1e4)
add('dynamic bad error', material_id='SA-516-70', method='9F45_DYNAMIC', t0_mode='DIRECT', t0=-50.0, syA=260.0, krate_dyn=1e30)
add('arrest', material_id='SA-516-70', method='9F45_ARREST', t0_mode='DIRECT', t0=-50.0, T_assess=0.0, syA=260.0)
add('arrest Ni>1', material_id='SA-516-70', method='9F45_ARREST', t0_mode='DIRECT', t0=-50.0, T_assess=0.0, syA=260.0, ni_pct=3.5)
for route in ('CR125_XBAR', 'CR225_J_BASE', 'CR225_XBAR_WELD'):
    for chem in (False, True):
        kw = dict(material_id='SA-387-22-CL2', method='9F47_CRMO_AGING', crmo_route=route, curve_mode='B', t0_mode='DIRECT', t0=-60.0, T_assess=0.0, syA=300.0)
        if chem: kw.update(chem_P=0.01, chem_Sb=0.002, chem_Sn=0.01, chem_As=0.01, chem_Mn=0.5, chem_Si=0.3)
        add(f'crmo {route} chem={chem}', **kw)
for v in ('POST_1990', '1975_1990', 'PRE_1975'):
    add(f'crmo vintage {v}', material_id='SA-387-22-CL2', method='9F47_CRMO_AGING', crmo_route='CR225_J_BASE', crmo_vintage=v, curve_mode='B', t0_mode='DIRECT', t0=-60.0, T_assess=0.0, syA=300.0)
add('toughness gated unknown error', method='9F46_DEGRADATION_OTHER')
# ---------------------------------------------------------------- crack growth models and options
import csv
gids = []
for r in csv.DictReader(open(pkg / 'ENGINE/data/growth_models.csv', encoding='utf-8-sig')):
    if r['model_id'] not in gids: gids.append(r['model_id'])
for g in gids:
    add(f'growth {g}', growth_model=g, data_status='APPROVED', E_ambient=200000.0, E_temp=190000.0, h2s_ppm=30.0)
for g in ('9F4M_FERRITIC_PEARLITE_AIR', '9F5M_WELD_UPPER', '9F6M_AIR_100_600C', '9F7M_AIR_UPPER', '9F9M_X65_SOUR_CRUDE', '9F9M_X65_AIR'):
    add(f'growth FPS {g}', 'FPS', growth_model=g, E_ambient=29000.0, E_temp=27500.0, h2s_ppm=10.0)
for rb in ('INCLUDE_RESIDUAL', 'APPLIED_ONLY', 'FORCE_R_GE_0_5'):
    for g in ('9F4M_FERRITIC_PEARLITE_AIR', '9F7M_AIR_UPPER', '9F5M_WELD_MEAN'):
        add(f'R basis {rb} {g}', growth_model=g, r_basis=rb, min_scale=0.2)
for we in ('9F140', 'PARIS'):
    add(f'weld eq {we}', growth_model='9F5M_WELD_UPPER', weld_eq=we)
for rm in ('AUTO', 'APPLY', 'NONE'):
    add(f'RE mode {rm}', growth_model='9F6M_AIR_100_600C', re_mode=rm, E_ambient=200000.0, E_temp=170000.0)
add('RE apply missing E error', growth_model='9F4M_FERRITIC_PEARLITE_AIR', re_mode='APPLY', E_ambient=None)
add('dkth override', dkth_override=12.0)
add('dkth override high -> no growth', dkth_override=60.0)
add('user paris approved', growth_model='PROJECT_USER_PARIS', C_user=3e-9, n_user=3.2, dKth_user=3.0, data_status='APPROVED')
add('user paris FPS', 'FPS', growth_model='PROJECT_USER_PARIS', C_user=2.0e-10, n_user=3.0, dKth_user=2.0, data_status='APPROVED')
add('user paris not approved error', growth_model='PROJECT_USER_PARIS', C_user=3e-9, n_user=3.2)
add('growth unknown model error', growth_model='NOT_A_MODEL')
add('growth project data missing error', material_id='SA-516-70', growth_model='PROJECT_MATERIAL_DATA')
# ---------------------------------------------------------------- loads
add('polynomial stresses', stress_mode='POLYNOMIAL_4TH', P0=80.0, P1=-40.0, P2=30.0, P3=5.0, P4=-2.0, Q0=10.0, Q1=-8.0, Q2=4.0, Q3=1.0, Q4=0.5)
add('polynomial FPS', 'FPS', stress_mode='POLYNOMIAL_4TH', **ov('FPS', P0=80.0, P1=-40.0, Q0=10.0, Q1=-8.0))
add('crack face pressure', pc=15.0)
add('pc not in ref', pc=15.0, include_pc_ref='NO')
add('scales min>0', min_scale=0.3, max_scale=1.2)
add('scales min>max error', min_scale=1.5, max_scale=1.0)
add('negative secondary', Sm=-30.0, Sb=-60.0)
add('high load fails FAD', Pm=330.0, Pb=60.0)
add('zero primary', Pm=0.0, Pb=0.0, pc=0.0)
add('bending only', Pm=0.0, Pb=150.0)
# ---------------------------------------------------------------- residual stress
add('residual none', rs_method='NONE')
for cond in ('PWHT_UNIFORM', 'UNIFORM_YIELD'):
    for d in ('PERPENDICULAR', 'PARALLEL'):
        for ysb in ('ESTIMATED_FROM_SMYS', 'ACTUAL'):
            add(f'annex9d {cond} {d} {ysb}', rs_method='ANNEX_9D', weld_condition=cond, direction=d, ys_basis=ysb, material_id='SA-516-70', actual_ys=430.0)
add('annex9d FPS pwht', 'FPS', rs_method='ANNEX_9D', weld_condition='PWHT_UNIFORM', material_id='SA-516-70', smys_9d=None)
add('annex9d smys override', rs_method='ANNEX_9D', weld_condition='PWHT_UNIFORM', smys_9d=300.0, material_id='SA-516-70')
for prof in ('LONGITUDINAL_SEAM_PERPENDICULAR', 'TEE_MAIN_PLATE_PERPENDICULAR'):
    for y, w in ((0.0, 20.0), (30.0, 20.0), (50.0, 20.0)):
        for tt in (5.0, 15.0, 40.0):
            add(f'as-welded {prof[:4]} y{y:g} t{tt:g}', rs_method='ANNEX_9D', weld_condition='AS_WELDED', profile_id=prof, weld_y=y, weld_w=w, t=tt, material_id='SA-516-70', cm=3.0, points=51)
add('as-welded FPS', 'FPS', rs_method='ANNEX_9D', weld_condition='AS_WELDED', material_id='SA-516-70', **ov('FPS', weld_w=20.0, weld_y=10.0))
add('annex9d missing spec error', rs_method='ANNEX_9D', material_spec=None)
add('annex9d bad weld type error', rs_method='ANNEX_9D', weld_type='')
add('residual user FPS', 'FPS', **ov('FPS', Rm=40.0, Rb=-15.0))
# ---------------------------------------------------------------- controls / acceptance
add('controls step 0.05', max_dc=0.05)
add('controls step 0.005', max_dc=0.005)
add('controls cw 0.9', cw_stop=0.9, dkth_override=0.0, Pm=20.0, Pb=0.0, Sm=0.0, Sb=0.0, Rm=0.0, Rb=0.0, cm=2.0)
add('controls cycle guard', max_cycles=100000.0)
add('controls cycle guard high req', max_cycles=100000.0, required_life=1e6)
add('controls cpy+cap', cycles_per_year=2000.0, insp_cap=50000.0)
add('controls margin 4 not acceptable', life_margin=4.0, required_life=200000.0)
add('controls margin <1 warn', life_margin=0.8)
add('controls insp fraction bad error', insp_fraction=1.5)
add('controls bisection 20', bisection=20, sif_points=40)
add('controls cw bad error', cw_stop=1.2)
add('no growth below threshold', dkth_override=100.0)
add('initial flaw fails FAD', cm=150.0, W=300.0)
add('thin thick plate', t=60.0, W=1000.0, cm=40.0)
add('c/W high', W=60.0, cm=50.0)
add('missing material error', material_id='NOPE')
# ---------------------------------------------------------------- variable load
H = lambda *rows: [dict(name=n, lo=a, hi=b, cycles=c) for n, a, b, c in rows]
add('var 1 block', lt='VARIABLE', history=H(('A', 0.0, 1.0, 1000)))
add('var many blocks', lt='VARIABLE', history=H(*[(f'B{i}', 0.02 * i, 0.5 + 0.05 * i, 100 + 40 * i) for i in range(12)]))
add('var R>=0.5 blocks', lt='VARIABLE', history=H(('A', 0.5, 1.0, 400), ('B', 0.6, 0.9, 300)), growth_model='9F7M_AIR_UPPER')
add('var bilinear', lt='VARIABLE', history=H(('A', 0.0, 1.0, 500), ('B', 0.4, 0.7, 500)), growth_model='9F7M_AIR_UPPER', min_scale=0.0)
add('var pipeline', lt='VARIABLE', history=H(('A', 0.0, 1.0, 500), ('B', 0.1, 0.5, 700)), growth_model='9F9M_X65_AIR')
add('var weld', lt='VARIABLE', history=H(('A', 0.0, 1.0, 500), ('B', 0.1, 0.5, 700)), growth_model='9F5M_WELD_UPPER')
add('var max<min error', lt='VARIABLE', history=H(('A', 0.8, 0.5, 100)))
add('var empty error', lt='VARIABLE', history=[])
add('var zero range block', lt='VARIABLE', history=H(('A', 0.5, 0.5, 100), ('B', 0.0, 1.0, 100)))
add('var high peak fails', lt='VARIABLE', history=H(('A', 0.0, 3.0, 100)))
add('var FPS 40 blocks', 'FPS', 'VARIABLE', history=H(*[(f'K{i}', 0.0, 0.3 + 0.017 * i, 50) for i in range(40)]))
add('var polynomial + residual', lt='VARIABLE', stress_mode='POLYNOMIAL_4TH', P0=100.0, P1=-30.0, Q0=15.0, rs_method='ANNEX_9D', weld_condition='PWHT_UNIFORM', material_id='SA-516-70')
# ---------------------------------------------------------------- Level 3
add('L3 base const', l3=True)
add('L3 base var', lt='VARIABLE', l3=True)
add('L3 psf on', l3=True, psf_on='YES', psf_stress=1.3, psf_kmat=1.5, psf_flaw=1.2)
add('L3 sens subset', l3=True, s_primary_on='NO', s_residual_on='NO', s_c0_on='NO', s_kmat_lo=-40.0, s_kmat_hi=10.0)
add('L3 sens off + MD', l3=True, l3_sens='NO')
add('L3 MD CVN', l3=True, jr_source='CVN_9F130', jr_cvn=120.0, jr_basis='MEDIAN', md_points=25, md_da_max=2.0)
add('L3 MD project', l3=True, jr_source='PROJECT', jr_C=140.0, jr_n=0.3, data_status='APPROVED', md_fmax=3.0)
add('L3 MD project not approved error', l3=True, jr_source='PROJECT', jr_C=140.0, jr_n=0.3)
add('L3 MD records', l3=True, jr_record='T_304_SS', material_id='SA-240-304', method='9F412_AUSTENITIC_JC')
add('L3 MD FPS table', 'FPS', l3=True, jr_record='A508_CL3', md_da_max=3.0)
add('L3 MD FPS project', 'FPS', l3=True, jr_source='PROJECT', jr_C=700.0, jr_n=0.3, data_status='APPROVED')
add('L3 MD off', l3=True, md_on='NO', l3_sens='NO')
add('L3 MD high load', l3=True, Pm=300.0, Pb=50.0, md_on='YES', l3_sens='NO')
add('L3 MD cw trunc', l3=True, W=15.0, cm=5.0, md_da_max=9.0, l3_sens='NO')
add('L3 FPS base', 'FPS', l3=True)
add('L3 sens kmat strength FPS var', 'FPS', 'VARIABLE', l3=True)

# ================================================================ surface crack (infinite length) KPSCL1 / KPSCL2
D1 = 'Through-Wall Fourth Order Polynomial Stress Distribution - KPSCL1 (9B.3.2) / RPSCL (9C.3.2)'
D2 = 'Through-Wall Arbitrary Stress Distribution - KPSCL2 (9B.3.3) / RPSCL (9C.3.3)'
IN_MB, IN_POLY, IN_PROF = 'Membrane + Bending (Pm, Pb, Sm, Sb)', 'Polynomial coefficients (sigma0 to sigma4)', 'Point-by-point profile (sheet 5B_Stress_Profile)'
def sc(name, system='SI', lt='CONSTANT', **kw): add('SC ' + name, system, lt, geo='KPSCL', **kw)
PROF = [list(r) for r in DEFAULT_PROFILE]
PROF_NL = [[x, 140 * math.cos(math.pi * x / 40) + 30, 30 - 20 * x / 20, 20 - 10 * x / 20] for x in [2.0 * i for i in range(11)]]
for sysm in ('SI', 'FPS'):
    for lt in ('CONSTANT', 'VARIABLE'):
        sc(f'base {sysm} {lt}', sysm, lt, l3=(sysm == 'SI' or lt == 'CONSTANT'))
sc('KPSCL2 polynomial', l3=True, stress_dist=D2)
sc('KPSCL1 membrane+bending', stress_input=IN_MB, Pm=100.0, Pb=40.0, Sm=20.0, Sb=10.0)
sc('KPSCL2 membrane+bending', stress_dist=D2, stress_input=IN_MB, Pm=100.0, Pb=40.0, Sm=20.0, Sb=10.0)
sc('KPSCL2 profile', l3=True, stress_dist=D2, stress_input=IN_PROF, profile=PROF)
sc('KPSCL2 profile nonlinear', stress_dist=D2, stress_input=IN_PROF, profile=PROF_NL)
sc('KPSCL2 profile FPS', 'FPS', stress_dist=D2, stress_input=IN_PROF, profile=PROF)
sc('KPSCL2 profile variable', lt='VARIABLE', stress_dist=D2, stress_input=IN_PROF, profile=PROF)
sc('KPSCL1 profile error', stress_input=IN_PROF, profile=PROF)
sc('KPSCL2 profile one row error', stress_dist=D2, stress_input=IN_PROF, profile=PROF[:1])
sc('KPSCL2 profile short error', stress_dist=D2, stress_input=IN_PROF, profile=[r for r in PROF if r[0] <= 10])
sc('KPSCL2 profile unsorted', stress_dist=D2, stress_input=IN_PROF, profile=PROF[::-1])
sc('KPSCL2 poly nonlinear', stress_dist=D2, P0=120.0, P1=-200.0, P2=300.0, P3=-150.0, P4=20.0)
sc('KPSCL1 poly nonlinear', P0=120.0, P1=-200.0, P2=300.0, P3=-150.0, P4=20.0)
sc('bad input format error', stress_input='')
sc('a<=0 error', a_m=0.0)
sc('a/t>0.8 error', a_m=17.0)
sc('a/t=0.8', a_m=16.0)
sc('shallow', a_m=0.5)
sc('crack face pressure', pc=15.0)
sc('crack face pressure no ref', pc=15.0, include_pc_ref='NO')
sc('negative bending', Pm=50.0, Pb=-80.0)
sc('high load fail', P0=420.0, P1=-100.0)
sc('thin plate', t=6.0, a_m=1.5)
sc('thick plate', t=60.0, a_m=8.0, P0=100.0, P1=-40.0)
sc('residual none', rs_method='NONE')
sc('residual user', Rm=40.0, Rb=-15.0)
sc('residual user FPS', 'FPS', **ov('FPS', Rm=40.0, Rb=-15.0))
sc('residual 9D pwht', rs_method='ANNEX_9D', weld_condition='PWHT_UNIFORM', material_id='SA-516-70')
for cond in ('AS_WELDED',):
    for prof_id in ('FIG_9D3', 'FIG_9D4', 'FIG_9D5'):
        pass
sc('residual 9D as-welded KPSCL1', rs_method='ANNEX_9D', weld_condition='AS_WELDED', material_id='SA-516-70', points=51)
sc('residual 9D as-welded KPSCL2', stress_dist=D2, rs_method='ANNEX_9D', weld_condition='AS_WELDED', material_id='SA-516-70', points=51)
sc('residual user profile KPSCL2', stress_dist=D2, stress_input=IN_PROF, profile=PROF, rs_method='USER_PROFILE')
sc('residual user profile KPSCL1 poly', profile=PROF, rs_method='USER_PROFILE')
sc('residual user profile missing error', rs_method='USER_PROFILE')
sc('master curve auto L', material_id='SA-516-70', method='9F43_MASTER_CURVE', t0_mode='DIRECT', t0=-60.0, curve_mode='B', T_assess=0.0)
sc('master curve user L', material_id='SA-516-70', method='9F43_MASTER_CURVE', t0_mode='DIRECT', t0=-60.0, curve_mode='B', T_assess=0.0, mc_L_mode='USER', mc_L=60.0)
sc('L3 MD KPSCL2', l3=True, stress_dist=D2, md_on='YES', l3_sens='NO', P0=300.0, P1=-60.0)
sc('L3 MD KPSCL1 trunc', l3=True, a_m=14.0, md_da_max=9.0, l3_sens='NO')
sc('L3 sens variable', lt='VARIABLE', l3=True, stress_dist=D2, stress_input=IN_PROF, profile=PROF)
sc('growth low dK no growth', P0=3.0, P1=-1.0, Q0=1.0, Q1=-0.5)
sc('required life fail', required_life=1e12)
sc('materials A', material_id='SA-240-304', method='9F412_AUSTENITIC_JC', T_assess=20.0, E=195000.0)

def main():
    out_path = Path('tests/oracle.json')
    if '--out' in sys.argv: out_path = Path(sys.argv[sys.argv.index('--out') + 1])
    cases = []
    for s in SC:
        system, lt = s['system'], s['lt']
        geo = s['geo']
        raw = default_raw(system, geo)
        o = dict(s['ov'])
        if 'material_id' in o and 'method' not in o and o['material_id'] != 'REFERENCE_CS_350' and o['material_id'] in MATDB:
            rec_ = MATDB[o['material_id']]
            o['method'] = rec_['default_toughness_method']          # a scenario that changes material uses that material's own route
            if o['method'] == 'PROJECT_KMAT' and not rec_['Kmat_MPa_sqrt_m']:
                o.update(kmat_project=95.0, data_status='APPROVED')
        raw.update(ov(system, **o))
        prof_in = None
        if s['profile'] is not None:
            prof_in = [[float(f'{from_si(r[0], "length", "FPS"):.15g}') if system == 'FPS' else r[0]] + [(float(f'{from_si(v, "stress", "FPS"):.15g}') if system == 'FPS' else v) for v in r[1:]] for r in s['profile']]
        elif geo == 'KPSCL':
            prof_in = [[float(f'{from_si(r[0], "length", "FPS"):.15g}') if system == 'FPS' else r[0]] + [(float(f'{from_si(v, "stress", "FPS"):.15g}') if system == 'FPS' else v) for v in r[1:]] for r in DEFAULT_PROFILE]
        history = s['history'] if s['history'] is not None else [dict(name=n, lo=a, hi=b, cycles=c) for n, a, b, c in DEFAULT_HISTORY]
        rec = {'name': s['name'], 'system': system, 'load_type': lt, 'geometry': geo, 'profile': prof_in, 'raw': copy.deepcopy(raw), 'history': history, 'tests': s['tests'], 'l3': s['l3']}
        try:
            case = build_case(system, lt, copy.deepcopy(raw), history, s['tests'], geo, prof_in)
            res = run(case)
            rec['expect'] = expect_of(case, res)
            if s['l3']:
                rec['expect_l3'] = l3_expect(assess(case, res))
        except Exception as e:                                   # noqa: BLE001 - parity of error messages is part of the test
            rec['expect_error'] = str(e)
        cases.append(rec)
    defaults = {'SI': default_raw('SI'), 'FPS': default_raw('FPS'), 'SI_KPSCL': default_raw('SI', 'KPSCL'), 'FPS_KPSCL': default_raw('FPS', 'KPSCL')}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({'cases': clean(cases), 'defaults': clean(defaults)}, separators=(',', ':')))
    ok = sum(1 for c in cases if 'expect' in c); err = len(cases) - ok
    print(f'{len(cases)} scenarios: {ok} solved, {err} expected errors, {sum(1 for c in cases if "expect_l3" in c)} with Level 3 -> {out_path}')

if __name__ == "__main__":
    main()
