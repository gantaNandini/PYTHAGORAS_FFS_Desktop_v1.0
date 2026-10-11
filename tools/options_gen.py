#!/usr/bin/env python3
"""Every drop-down option of every input sheet, solved by the ORIGINAL ATLAS Python engine.
For each (field, option) the option is applied on top of a context in which it is meaningful (e.g. a Master Curve option on a
ferritic steel with the Master Curve route) and solved in SI and FPS.  All attempts are recorded, so the JavaScript port must
reproduce the successes AND the error messages.  Writes tests/options_oracle.json and OPTIONS_COVERAGE.csv/.md.
Usage: python tools/options_gen.py <ATLAS_API579_PART9_KPTC>"""
import sys, json, csv, copy, importlib.util
from pathlib import Path
pkg = sys.argv[1]
sys.argv = ['oracle_gen.py', pkg]
spec = importlib.util.spec_from_file_location('og', str(Path(__file__).with_name('oracle_gen.py')))
og = importlib.util.module_from_spec(spec); spec.loader.exec_module(og)
from atlas_part9.schema import FIELDS, LISTS, DEFAULT_HISTORY
from atlas_part9.database import growth_model_ids, materials

MAT = materials()
GIDS = ['FROM_MATERIAL_DB'] + [g for g in growth_model_ids() if g != 'FROM_MATERIAL_DB']
JR_IDS = [r['jr_id'] for r in __import__('csv').DictReader(open(Path(pkg) / 'ENGINE/data/api579_table9F3_jr_curves.csv', encoding='utf-8'))]
DYN = {'MATERIAL_IDS': list(MAT), 'GROWTH_IDS': GIDS, 'JR_IDS': JR_IDS,
       'SPEC_TEXT': sorted({r['specification'] for r in MAT.values() if r['specification'] and r['specification'] != 'REFERENCE'})}
def options(f):
    if f.lst in DYN: return DYN[f.lst]
    if f.lst == 'XI_CAP': return None
    return LISTS.get(f.lst, [])

def E_of(mid): return float(MAT[mid]['E_MPa'])
COMMON = dict(data_status='APPROVED', E_ambient=200000.0, E_temp=190000.0, h2s_ppm=10.0, jr_C=140.0, jr_n=0.3, C_user=3e-9, n_user=3.2, dKth_user=3.0)
CS = dict(COMMON, material_id='SA-516-70', method='9F42_ASME_XI_LOWER', tref_mode='EQ_9F29', T_assess=20.0, E=E_of('SA-516-70'), syA=260.0)
MC = dict(CS, method='9F43_MASTER_CURVE', t0_mode='DIRECT', t0=-40.0, curve_mode='B', T_assess=0.0)
AUS = dict(COMMON, material_id='SA-240-304', method='9F412_AUSTENITIC_JC', T_assess=20.0, E=E_of('SA-240-304'))
CRMO = dict(COMMON, material_id='SA-387-22-CL2', method='9F47_CRMO_AGING', curve_mode='B', t0_mode='DIRECT', t0=-60.0, T_assess=0.0, syA=300.0, E=E_of('SA-387-22-CL2'))
REF = dict(COMMON)
CONTEXTS = {'REF': REF, 'CS': CS, 'MC': MC, 'AUS': AUS, 'CRMO': CRMO}
# the route a toughness sub-option belongs to, and the contexts to try first
ROUTE = {'ss_condition': ('9F412_AUSTENITIC_JC', 'AUS'), 'ss_basis': ('9F412_AUSTENITIC_JC', 'AUS'),
         'tref_mode': ('9F42_ASME_XI_LOWER', 'CS'), 'curve_mode': ('9F42_ASME_XI_LOWER', 'CS'), 'xi_curve': ('9F42_ASME_XI_LOWER', 'CS'),
         't0_mode': ('9F43_MASTER_CURVE', 'MC'), 'sulfur': ('9F43_MASTER_CURVE', 'MC'), 'mc_L_mode': ('9F43_MASTER_CURVE', 'MC'),
         'mc_us_limit': ('9F43_MASTER_CURVE', 'MC'), 'h2_shift': ('9F43_MASTER_CURVE', 'MC'),
         'us_option': ('9F44_UPPER_SHELF', 'CS'), 'us_basis': ('9F44_UPPER_SHELF', 'CS'),
         'crmo_route': ('9F47_CRMO_AGING', 'CRMO'), 'crmo_vintage': ('9F47_CRMO_AGING', 'CRMO')}
METHOD_CTX = {'PROJECT_KMAT': 'REF', 'PROJECT_TEST_SET': 'CS', '9F412_AUSTENITIC_JC': 'AUS', '9F42_ASME_XI_LOWER': 'CS', '9F43_MASTER_CURVE': 'MC',
              '9F44_UPPER_SHELF': 'CS', '9F45_DYNAMIC': 'MC', '9F45_ARREST': 'MC', '9F47_CRMO_AGING': 'CRMO'}
VARIABLE_SHEETS = {'4_Crack_Growth', '5_Loads', '6_Residual_Stress', '2_Material'}
L3_SHEETS = {'9_Level3'}
TESTS = [90.0, 100.0, 110.0]

def attempts_for(f, opt):
    """Ordered list of (context name, overrides, tests)."""
    out = []
    order = ['REF', 'CS', 'MC', 'AUS', 'CRMO']
    if f.name == 'method':
        first = METHOD_CTX.get(opt); order = [first] + [c for c in order if c != first]
        for c in order:
            ov = dict(CONTEXTS[c]); ov['method'] = opt
            if opt in ('9F45_DYNAMIC', '9F45_ARREST'): ov.update(t0_mode='DIRECT', t0=-50.0)
            out.append((c, ov, TESTS if opt == 'PROJECT_TEST_SET' else []))
        return out
    if f.name in ROUTE:
        m, c0 = ROUTE[f.name]; order = [c0] + [c for c in order if c != c0]
        for c in order:
            ov = dict(CONTEXTS[c]); ov[f.name] = opt
            if c == c0: ov['method'] = m
            if f.name == 'curve_mode' and c == 'CS': ov['tref_mode'] = 'EQ_9F29'
            out.append((c, ov, [])); 
        return out
    if f.name == 'material_id':
        ov = dict(COMMON, material_id=opt, E=E_of(opt), method=MAT[opt]['default_toughness_method'], T_assess=20.0, syA=float(MAT[opt]['SMYS_MPa']))
        if ov['method'] == 'PROJECT_KMAT' and not MAT[opt]['Kmat_MPa_sqrt_m']: ov['kmat_project'] = 95.0
        if ov['method'] == '9F43_MASTER_CURVE': ov.update(t0_mode='DIRECT', t0=-40.0, curve_mode='B')
        return [('DB', ov, [])]
    for c in order:
        ov = dict(CONTEXTS[c]); ov[f.name] = opt
        if f.name == 'rs_method' and opt == 'ANNEX_9D': ov['weld_condition'] = 'PWHT_UNIFORM'
        if f.name == 'weld_condition' or f.name in ('direction', 'ys_basis', 'profile_id', 'weld_type', 'joint', 'pt_credit', 'material_spec'):
            ov['rs_method'] = 'ANNEX_9D'
        if f.name == 'weld_condition' and opt == 'AS_WELDED': ov['rs_method'] = 'ANNEX_9D'
        if f.name == 'profile_id': ov['weld_condition'] = 'AS_WELDED'
        if f.name == 'stress_mode' and opt == 'POLYNOMIAL_4TH': ov.update(P0=100.0, P1=-20.0, Q0=10.0)
        if f.name == 'plane': ov.update(flaw_option='OPTION_2', alpha=20.0, sigma1=100.0, sigma2=40.0)
        if f.name == 'flaw_option' and opt == 'OPTION_2': ov.update(alpha=20.0, sigma1=100.0, sigma2=40.0)
        if f.name == 'growth_model' and opt == 'PROJECT_MATERIAL_DATA': ov['material_id'] = 'REFERENCE_CS_350'
        if f.name == 'jr_source': pass
        if f.name == 'growth_model' and opt.startswith('9F5'): pass
        if f.name == 'lrmax_mode': ov.update(Pm=180.0, Pb=40.0)
        out.append((c, ov, []))
    return out

def run_attempt(system, lt, ov, tests, want_l3):
    raw = og.default_raw(system)
    raw.update(og.ov(system, **ov))
    hist = [dict(name=n, lo=a, hi=b, cycles=c) for n, a, b, c in DEFAULT_HISTORY]
    rec = {'system': system, 'load_type': lt, 'raw': copy.deepcopy(raw), 'history': hist, 'tests': tests, 'l3': want_l3}
    try:
        case = og.build_case(system, lt, copy.deepcopy(raw), hist, tests)
        res = og.run(case)
        rec['expect'] = og.expect_of(case, res)
        if want_l3: rec['expect_l3'] = og.l3_expect(og.assess(case, res))
        rec['life'] = res['summary']['life']; rec['life_status'] = res['summary']['life_status']; rec['initial'] = res['initial']['status']
    except Exception as e:
        rec['expect_error'] = str(e)
    return rec

def main():
    sweep = []
    for f in FIELDS:
        if not f.lst: continue
        opts = options(f)
        if opts is None: opts = None
        for system in ('SI', 'FPS'):
            o_list = opts if opts is not None else (['110', '220'] if system == 'SI' else ['100', '200'])
            for opt in o_list:
                opt_v = float(opt) if (f.lst in ('XI_CAP', 'PF', 'LIFE_MARGIN', 'INSP_FRACTION', 'CW_STOP')) else opt
                lts = ['CONSTANT', 'VARIABLE'] if f.sheet in VARIABLE_SHEETS else ['CONSTANT']
                for lt in lts:
                    want_l3 = f.sheet in L3_SHEETS
                    results = []
                    for ctx, ov, tests in attempts_for(f, opt_v):
                        if f.name != 'data_status' and 'data_status' not in ov: ov['data_status'] = 'APPROVED'
                        a = run_attempt(system, lt, ov, tests, want_l3)
                        a['context'] = ctx; results.append(a)
                        if 'expect' in a: break
                    sweep.append({'sheet': f.sheet, 'field': f.name, 'label': f.label, 'list': f.lst, 'option': opt_v if isinstance(opt_v, str) else opt,
                                  'system': system, 'load_type': lt, 'attempts': og.clean(results)})
    Path('tests').mkdir(exist_ok=True)
    Path('tests/options_oracle.json').write_text(json.dumps(sweep, separators=(',', ':')))
    solved = sum(1 for s in sweep if any('expect' in a for a in s['attempts']))
    print(f'{len(sweep)} option runs ({solved} solved in at least one context) -> tests/options_oracle.json')

main()
