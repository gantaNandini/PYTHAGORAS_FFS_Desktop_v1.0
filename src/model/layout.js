/**
 * layout.js — the 9 input sheets of the ATLAS workbook as data. Same sheets, sections, rows, units and notes as the
 * Excel template; rows with `when` are only shown when the chosen options use them (a switch shows everything).
 *   'name'                         an input field (label/unit/list/note come from the ATLAS schema)
 *   { f:'name', when, note, ... }  an input field with a visibility rule / overrides
 *   { calc:'key', label, kind|unit, note }   a calculated (green) row, value from calc.js derive()
 *   { table:'tests'|'history'|'sens' }       special editors
 */
const eq = (k, ...v) => p => v.includes(p.raw[k]);
const M = p => p.raw.method;
const MC_METHODS = ['9F43_MASTER_CURVE', '9F45_DYNAMIC', '9F45_ARREST', '9F47_CRMO_AGING'];
const usesMC = p => MC_METHODS.includes(M(p));
const usesUS = p => M(p) === '9F44_UPPER_SHELF' || (usesMC(p) && p.raw.mc_us_limit === '9F44');
const growthEq = p => (p.derived && p.derived.g_eq) || '';

export const SHEETS = [
  { id: '1_Geometry_Flaw', tab: '1 Geometry & Flaw', title: 'GEOMETRY / FLAW', color: '#2E75B6',
    subtitle: 'Figure 9B.1: plate thickness t, half-width W, central through-wall crack of length 2c',
    sub_KPSCL: 'Figure 9B.2(b): plate thickness t, surface crack of depth a and infinite length',
    sections: [
      { title: 'PLATE GEOMETRY (Figure 9B.2(b))', geo: 'KPSCL', rows: ['t'] },
      { title: 'FLAW CHARACTERIZATION (paragraph 9.3.6.3)', geo: 'KPSCL', rows: ['a_m', 'len_2c'] },
      { title: 'RESULTING ASSESSMENT FLAW (calculated)', geo: 'KPSCL', rows: [
        { calc: 'sc_a0', label: 'Assessment depth a0', kind: 'length', note: 'Used as initial crack depth' },
        { calc: 'sc_at', label: 'a0/t', unit: '-', note: '9B.3.2.2(d): 0 < a/t <= 0.8' },
        { calc: 'sc_applic', label: 'KPSCL applicability', unit: '-' },
        { calc: 'sc_G0', label: 'Influence coefficient G0 at a0', unit: '-', note: 'Eq. 9B.13, Table 9B.2' },
        { calc: 'sc_G1', label: 'Influence coefficient G1 at a0', unit: '-', note: 'Eq. 9B.13, Table 9B.2' }] },
      { title: 'PLATE GEOMETRY (Figure 9B.1)', geo: 'KPTC', rows: ['t', 'W'] },
      { title: 'FLAW CHARACTERIZATION (paragraph 9.3.6.2)', geo: 'KPTC', rows: ['flaw_option', 'cm',
        { f: 'alpha', when: eq('flaw_option', 'OPTION_2'), unit: 'deg' }, { f: 'sigma1', when: eq('flaw_option', 'OPTION_2') },
        { f: 'sigma2', when: eq('flaw_option', 'OPTION_2') }, { f: 'plane', when: eq('flaw_option', 'OPTION_2') }] },
      { title: 'RESULTING ASSESSMENT FLAW (calculated)', geo: 'KPTC', rows: [
        { calc: 'flaw_B', label: 'Biaxiality ratio B', unit: '-', note: 'Eq. 9.3' },
        { calc: 'flaw_ratio', label: 'Equivalent length ratio c/cm', unit: '-', note: 'Eq. 9.1 (sigma1 plane) / 9.2 (sigma2 plane) / 9.4 (sigma2 <= 0)' },
        { calc: 'flaw_c0', label: 'Assessment half-length c0', kind: 'length', note: 'Used as initial crack' },
        { calc: 'flaw_2c0', label: 'Total flaw length 2c0', kind: 'length' },
        { calc: 'flaw_cw', label: 'c0/W', unit: '-', note: '9B.3.1.2(b): 0 < c/W < 1' },
        { calc: 'flaw_applic', label: 'KPTC applicability', unit: '-' }] },
    ] },
  { id: '2_Material', tab: '2 Material', title: 'MATERIAL', color: '#548235',
    subtitle: 'Paragraph 9.4.3.2 STEP 3 (strength) and Figure 9.19 (FAD cut-off). Database: 37 materials',
    sections: [
      { title: 'MATERIAL SELECTION', rows: ['material_filter', 'material_id',
        { calc: 'mat_in_class', label: 'Selected ID in filtered class?', unit: '-', note: 'Check only - the solver uses the Material ID' },
        { calc: 'mat_spec', label: 'Specification', unit: '-' }, { calc: 'mat_grade', label: 'Grade / class', unit: '-' },
        { calc: 'mat_form', label: 'Product form', unit: '-' }, { calc: 'mat_cond', label: 'Condition / heat treatment', unit: '-' },
        { calc: 'mat_class', label: 'Material class', unit: '-', note: 'Table 9.2 class / route checks' },
        { calc: 'mat_smys', label: 'SMYS (specified minimum)', kind: 'stress', note: 'Ambient, per material specification' },
        { calc: 'mat_smts', label: 'SMTS (specified minimum)', kind: 'stress', note: 'Ambient, per material specification' },
        { calc: 'mat_E', label: 'Typical E (ambient)', kind: 'stress', note: 'Typical - confirm with Annex 2E / ASME II-D' },
        { calc: 'mat_curve', label: 'ASME exemption curve', unit: '-', note: 'Part 3 Table 3.2' },
        { calc: 'mat_lrcat', label: 'Lr(max) category', unit: '-', note: 'Figure 9.19 Note 2' },
        { calc: 'mat_growth', label: 'Default growth model', unit: '-', note: 'Used when 4_Crack_Growth = FROM_MATERIAL_DB' },
        { calc: 'mat_tough', label: 'Suggested toughness method', unit: '-', note: 'Informative' },
        { calc: 'mat_note', label: 'Database note', unit: '-' }] },
      { title: 'STRENGTH AT ASSESSMENT CONDITION (STEP 3)', rows: ['strength_source',
        { f: 'sy_project', when: eq('strength_source', 'PROJECT_AT_TEMPERATURE') }, { f: 'su_project', when: eq('strength_source', 'PROJECT_AT_TEMPERATURE') },
        { f: 'data_status', when: p => p.raw.strength_source === 'PROJECT_AT_TEMPERATURE' || p.raw.growth_model === 'PROJECT_USER_PARIS' || p.raw.method === 'PROJECT_KMAT' || p.raw.jr_source === 'PROJECT' || true },
        { calc: 'sy_used', label: 'Yield strength used, Sy', kind: 'stress' }, { calc: 'su_used', label: 'Tensile strength used, Su', kind: 'stress' }] },
      { title: 'FAD CUT-OFF AND CONSTRAINT', rows: ['lrmax_mode', 'constraint',
        { calc: 'lr_cat_used', label: 'Lr(max) category used', unit: '-' },
        { calc: 'lr_max', label: 'Lr(max) cut-off', unit: '-', note: 'Flow stress (Sy+Su)/2 / Sy for FLOW_STRESS (Note 2(e))' }] },
      { title: 'TEMPERATURE AND ELASTIC PROPERTIES', rows: ['T_assess', 'E', 'nu'] },
    ] },
  { id: '3_Toughness', tab: '3 Toughness', title: 'TOUGHNESS', color: '#C55A11',
    subtitle: 'Paragraph 9.4.3.2 STEP 4 and Annex 9F.4. Only the inputs of the selected method are used',
    sections: [
      { title: 'METHOD SELECTION', rows: ['method',
        { calc: 't_clause', label: 'Clause', unit: '-' }, { calc: 't_summary', label: 'Method summary', unit: '-' }] },
      { title: 'PROJECT_KMAT  (9.3.5.2)', when: eq('method', 'PROJECT_KMAT'), rows: [{ f: 'kmat_project', note: 'PROJECT_KMAT when the material record has no Kmat (REFERENCE_CS_350 carries Kmat 100 MPa√m)' }] },
      { title: 'PROJECT_TEST_SET  (Table 9F.1)', when: eq('method', 'PROJECT_TEST_SET'), rows: [{ table: 'tests' },
        { calc: 't_n', label: 'Number of tests', unit: '-', note: '3 to 30 tests' },
        { calc: 't_equiv', label: 'Equivalent minimum-of-three', kind: 'K', note: 'Table 9F.1 rank: 3-5 lowest, 6-10 2nd lowest, ...' },
        { calc: 't_scatter', label: 'Scatter check (3 tests, Note 2)', unit: '-' }] },
      { title: '9F412_AUSTENITIC_JC  (9F.4.12, Table 9F.2)', when: eq('method', '9F412_AUSTENITIC_JC'), rows: ['ss_condition', 'ss_basis'] },
      { title: '9F42_ASME_XI_LOWER  (9F.4.2)', when: eq('method', '9F42_ASME_XI_LOWER'), rows: ['tref_mode',
        { f: 'tref', when: eq('tref_mode', 'DIRECT') }, 'curve_mode', 'xi_curve', 'xi_cap',
        { calc: 't_curve_used', label: 'Exemption curve used', unit: '-', note: 'Also used by Master Curve Option A' }] },
      { title: '9F43_MASTER_CURVE  (9F.4.3) - also base for 9F45 / 9F47', when: usesMC, rows: ['t0_mode',
        { f: 'curve_mode', when: eq('t0_mode', 'OPTION_A_EXEMPTION'), note: 'ASME exemption curve - used by Master Curve Option A' },
        { f: 't0', when: eq('t0_mode', 'DIRECT') },
        { f: 'syA', when: p => p.raw.t0_mode === 'OPTION_A_EXEMPTION' || ['9F45_DYNAMIC', '9F45_ARREST'].includes(M(p)) },
        { f: 'sulfur', when: eq('t0_mode', 'OPTION_A_EXEMPTION') },
        { f: 'mc_test_T', when: eq('t0_mode', 'OPTION_D_J_TEST') }, { f: 'mc_test_J', when: eq('t0_mode', 'OPTION_D_J_TEST') },
        { f: 'mc_test_E', when: eq('t0_mode', 'OPTION_D_J_TEST') }, { f: 'mc_test_nu', when: eq('t0_mode', 'OPTION_D_J_TEST') },
        { f: 'mc_test_B', when: eq('t0_mode', 'OPTION_D_J_TEST') },
        'mc_pf', 'mc_L_mode', { f: 'mc_L', when: eq('mc_L_mode', 'USER') }, 'mc_us_limit', 'h2_shift', { f: 'h2_shift_user', when: eq('h2_shift', 'USER') }] },
      { title: '9F44_UPPER_SHELF  (9F.4.4)', when: usesUS, rows: ['us_option',
        { f: 'us_cvn', when: eq('us_option', 'A') }, { f: 'us_basis', when: eq('us_option', 'A') }, { f: 'us_fixed', when: eq('us_option', 'B') }] },
      { title: '9F45_DYNAMIC / 9F45_ARREST  (9F.4.5)', when: p => ['9F45_DYNAMIC', '9F45_ARREST'].includes(M(p)),
        rows: [{ f: 'krate_dyn', when: eq('method', '9F45_DYNAMIC') }, { f: 'krate_static', when: eq('method', '9F45_DYNAMIC') }, { f: 'ni_pct', when: eq('method', '9F45_ARREST') }] },
      { title: '9F47_CRMO_AGING  (9F.4.7) - blank chemistry uses conservative defaults', when: eq('method', '9F47_CRMO_AGING'), rows: ['crmo_route',
        { f: 'crmo_vintage', when: eq('crmo_route', 'CR225_J_BASE') }, 'chem_P', 'chem_Sb', 'chem_Sn', 'chem_As',
        { f: 'chem_Mn', when: eq('crmo_route', 'CR225_J_BASE') }, { f: 'chem_Si', when: eq('crmo_route', 'CR225_J_BASE') }] },
    ] },
  { id: '4_Crack_Growth', tab: '4 Crack Growth', title: 'CRACK GROWTH', color: '#7030A0',
    subtitle: 'Paragraph 9.5.1 and Annex 9F.5. Database: Tables 9F.4-9F.9 and 9F.5.3.9 equations (35 models)',
    sections: [
      { title: 'MODEL SELECTION', rows: ['growth_model',
        { calc: 'g_used', label: 'Model used', unit: '-' }, { calc: 'g_table', label: 'API table', unit: '-' }, { calc: 'g_eq', label: 'Equation', unit: '-' },
        { calc: 'g_desc', label: 'Description', unit: '-' }, { calc: 'g_appl', label: 'Applicability', unit: '-' },
        { calc: 'g_C1', label: 'C1 (first / R<0.5 row)', kind: 'rate', note: 'da/dN with dK in the K unit of the selected system; for 9F.7 models a second R>=0.5 row exists' },
        { calc: 'g_n1', label: 'n1', unit: '-' }, { calc: 'g_C2', label: 'C2 (bilinear)', kind: 'rate' }, { calc: 'g_n2', label: 'n2', unit: '-' },
        { calc: 'g_trans', label: 'dK transition', kind: 'K' }, { calc: 'g_th', label: 'Threshold dKth', kind: 'K' }, { calc: 'g_second', label: 'Second parameter set', unit: '-' }] },
      { title: 'OPTIONS', rows: ['r_basis', { f: 'weld_eq', when: p => (p.derived || {}).g_eq === 'WELD_9F140' || p.raw.weld_eq !== '9F140' }, 're_mode',
        { f: 'E_ambient', when: p => p.raw.re_mode === 'APPLY' || ((p.derived || {}).g_eq === 'PARIS_TEMP_9F137' && p.raw.re_mode === 'AUTO') },
        { f: 'E_temp', when: p => p.raw.re_mode === 'APPLY' || ((p.derived || {}).g_eq === 'PARIS_TEMP_9F137' && p.raw.re_mode === 'AUTO') },
        { f: 'h2s_ppm', when: p => String(p.raw.growth_model).includes('SOUR') || String((p.derived || {}).g_used || '').includes('SOUR') },
        'dkth_override', { calc: 'g_RE', label: 'R_E = max(Ey/EyT, 1)', unit: '-', note: 'Eq. 9F.139' }] },
      { title: 'PROJECT_USER_PARIS  (requires 2_Material data status = APPROVED)', when: eq('growth_model', 'PROJECT_USER_PARIS'), rows: ['C_user', 'n_user', 'dKth_user'] },
    ] },
  { id: '5_Loads', tab: '5 Loads', title: 'LOADS', color: '#BF8F00',
    subtitle: 'STEP 1-2: stresses normal to the crack plane, uncracked component. Values at load scale = 1.0 (maxima of the cycle for constant amplitude)',
    sections: [
      { title: 'STRESS INPUT MODE', geo: 'KPTC', rows: ['stress_mode'] },
      { title: 'MEMBRANE + BENDING', geo: 'KPTC', when: eq('stress_mode', 'MEMBRANE_BENDING'), rows: ['Pm', 'Pb', 'pc', 'Sm', 'Sb'] },
      { title: 'FOURTH-ORDER POLYNOMIAL  P(x) = P0 + P1(x/t) + ... + P4(x/t)^4   (Eq. 9C.3)', geo: 'KPTC', when: eq('stress_mode', 'POLYNOMIAL_4TH'), rows: [
        'P0', 'P1', 'P2', 'P3', 'P4', 'Q0', 'Q1', 'Q2', 'Q3', 'Q4', { f: 'pc' },
        { calc: 'poly_Pm', label: 'Primary Pm from polynomial', kind: 'stress', note: 'Eq. 9C.4' }, { calc: 'poly_Pb', label: 'Primary Pb from polynomial', kind: 'stress', note: 'Eq. 9C.5' },
        { calc: 'poly_Sm', label: 'Secondary Sm from polynomial', kind: 'stress', note: 'Eq. 9C.4' }, { calc: 'poly_Sb', label: 'Secondary Sb from polynomial', kind: 'stress', note: 'Eq. 9C.5' }] },
      { title: 'STRESS DISTRIBUTION  (API 579 Annex 9B / 9C - plate, surface crack)', geo: 'KPSCL', rows: ['stress_dist', 'stress_input',
        { calc: 'sc_sol', label: 'Solution code', unit: '-' }, { calc: 'sc_sif', label: 'Stress intensity factor solution', unit: '-' },
        { calc: 'sc_ref', label: 'Reference stress solution', unit: '-' }, { calc: 'sc_enter', label: 'Enter the stresses in', unit: '-' },
        { calc: 'sc_check', label: 'Selection check', unit: '-' }] },
      { title: 'MEMBRANE + BENDING  (input format: Membrane + Bending)', geo: 'KPSCL', when: p => /MEMBRANE/i.test(p.raw.stress_input || ''), rows: ['Pm', 'Pb', 'Sm', 'Sb'] },
      { title: 'FOURTH-ORDER POLYNOMIAL  sigma(x) = s0 + s1(x/t) + ... + s4(x/t)^4   (Eq. 9B.3)', geo: 'KPSCL', when: p => /POLYNOMIAL/i.test(p.raw.stress_input || ''), rows: [
        'P0', 'P1', 'P2', 'P3', 'P4', 'Q0', 'Q1', 'Q2', 'Q3', 'Q4',
        { calc: 'poly_Pm', label: 'Primary Pm from polynomial', kind: 'stress', note: 'Eq. 9C.4' }, { calc: 'poly_Pb', label: 'Primary Pb from polynomial', kind: 'stress', note: 'Eq. 9C.5' },
        { calc: 'poly_Sm', label: 'Secondary Sm from polynomial', kind: 'stress', note: 'Eq. 9C.4' }, { calc: 'poly_Sb', label: 'Secondary Sb from polynomial', kind: 'stress', note: 'Eq. 9C.5' }] },
      { title: 'POINT-BY-POINT PROFILE  (KPSCL2)', geo: 'KPSCL', when: p => /PROFILE|POINT/i.test(p.raw.stress_input || ''), rows: [{ table: 'profile' }] },
      { title: 'CRACK-FACE PRESSURE', geo: 'KPSCL', rows: ['pc'] },
      { title: 'REFERENCE STRESS OPTION', rows: ['include_pc_ref'] },
      { title: 'CONSTANT-AMPLITUDE CYCLE (load scales)', when: eq('loadType', 'CONSTANT'), rows: ['min_scale', 'max_scale'] },
    ] },
  { id: '6_Residual_Stress', tab: '6 Residual Stress', title: 'RESIDUAL STRESS', color: '#C00000',
    subtitle: 'Annex 9D. Residual stress is held constant (not scaled) and enters KISR and the stress ratio R',
    sections: [
      { title: 'METHOD', rows: ['rs_method'] },
      { title: 'USER_DEFINED', when: eq('rs_method', 'USER_DEFINED'), rows: ['Rm', 'Rb'] },
      { title: 'USER_PROFILE  (residual column of the stress profile)', geo: 'KPSCL', when: eq('rs_method', 'USER_PROFILE'), rows: [{ table: 'profile', only: 'r' }] },
      { title: 'ANNEX_9D DATA (9D.3.1 required data)', when: eq('rs_method', 'ANNEX_9D'), rows: ['material_spec', 'smys_9d', 'ys_basis',
        { f: 'actual_ys', when: eq('ys_basis', 'ACTUAL') }, 'weld_type', 'joint', 'weld_condition', { f: 'direction', when: eq('weld_condition', 'PWHT_UNIFORM') }, 'pt_credit',
        { calc: 'rs_ys', label: 'Residual yield strength sigma_ys_r', kind: 'stress', note: 'Eq. 9D.1: SMYS + 69 MPa (SI) / + 10 ksi (FPS)' },
        { calc: 'rs_uniform', label: 'Uniform PWHT stress', kind: 'stress', note: 'Eq. 9D.3 (perpendicular) / 9D.4 (parallel)' }] },
      { title: 'AS_WELDED PROFILE (conservative uniform envelope for KPTC)', geo: 'KPTC', when: p => p.raw.rs_method === 'ANNEX_9D' && p.raw.weld_condition === 'AS_WELDED', rows: ['profile_id', 'weld_y', 'weld_w', 'points'] },
      { title: 'AS_WELDED PROFILE (applied as the actual through-wall profile)', geo: 'KPSCL', when: p => p.raw.rs_method === 'ANNEX_9D' && p.raw.weld_condition === 'AS_WELDED', rows: ['profile_id', 'weld_y', 'weld_w', 'points'] },
    ] },
  { id: '7_Load_History', tab: '7 Load History', title: 'LOAD HISTORY - VARIABLE AMPLITUDE BLOCKS', color: '#0E7C7B', onlyFor: 'VARIABLE',
    subtitle: 'Each block applies scale factors to the 5_Loads stresses (primary + secondary). Up to 40 blocks',
    sections: [{ title: 'LOAD BLOCKS', rows: [{ table: 'history' }] }] },
  { id: '8_Controls', tab: '8 Controls', title: 'CONTROLS', color: '#595959',
    subtitle: 'Numerical controls and remaining-life acceptance (paragraph 9.5.1.2 STEP 6)',
    sections: [
      { title: 'NUMERICAL CONTROLS', rows: ['max_cycles', 'max_dc', 'bisection', 'sif_points', 'cw_stop'] },
      { title: 'REMAINING LIFE ACCEPTANCE (9.5.1.2 STEP 6)', rows: ['flaw_basis', 'required_life', 'life_margin',
        { calc: 'min_life', label: 'Minimum calculated life for acceptance', unit: 'cycles', note: 'factor x required life' }] },
      { title: 'INSPECTION PLANNING (project basis - engineer approval required)', rows: ['insp_fraction', 'insp_cap', 'cycles_per_year'] },
    ] },
  { id: '9_Level3', tab: '9 Level 3', title: 'LEVEL 3', color: '#7030A0',
    subtitle: 'Paragraph 9.4.4: Method A with uncertainty evaluation (9.4.4.2) and Method D ductile tearing (9.4.4.1(d))',
    sections: [
      { title: 'METHOD A - SENSITIVITY ANALYSIS (9.4.4.2)', rows: ['l3_sens', { table: 'sens', when: eq('l3_sens', 'YES') }] },
      { title: 'PARTIAL SAFETY FACTOR CASE (project factors - 9.4.4.2)', rows: ['psf_on', { f: 'psf_stress', when: eq('psf_on', 'YES') }, { f: 'psf_kmat', when: eq('psf_on', 'YES') }, { f: 'psf_flaw', when: eq('psf_on', 'YES') }] },
      { title: 'METHOD D - DUCTILE TEARING (9.4.4.1(d), Annex 9F.4.13)', rows: ['md_on',
        { f: 'jr_source', when: eq('md_on', 'YES') }, { f: 'jr_record', when: p => p.raw.md_on === 'YES' && p.raw.jr_source === 'TABLE_9F3' },
        { f: 'jr_cvn', when: p => p.raw.md_on === 'YES' && p.raw.jr_source === 'CVN_9F130' }, { f: 'jr_basis', when: p => p.raw.md_on === 'YES' && p.raw.jr_source === 'CVN_9F130' },
        { f: 'jr_C', when: p => p.raw.md_on === 'YES' && p.raw.jr_source === 'PROJECT' }, { f: 'jr_n', when: p => p.raw.md_on === 'YES' && p.raw.jr_source === 'PROJECT' },
        { f: 'md_da_max', when: eq('md_on', 'YES') }, { f: 'md_points', when: eq('md_on', 'YES') }, { f: 'md_fmax', when: eq('md_on', 'YES') },
        { calc: 'jr_material', label: 'Table 9F.3 record - material', unit: '-', when: p => p.raw.md_on === 'YES' && p.raw.jr_source === 'TABLE_9F3' },
        { calc: 'jr_T', label: 'Record test temperature', kind: 'temp', when: p => p.raw.md_on === 'YES' && p.raw.jr_source === 'TABLE_9F3' },
        { calc: 'jr_t', label: 'Record thickness', kind: 'length', when: p => p.raw.md_on === 'YES' && p.raw.jr_source === 'TABLE_9F3' },
        { calc: 'jr_Ji', label: 'Initiation toughness Ji', kind: 'J', when: p => p.raw.md_on === 'YES' && p.raw.jr_source === 'TABLE_9F3' },
        { calc: 'jr_CR', label: 'Coefficient C_R', unit: 'jr', when: p => p.raw.md_on === 'YES' && p.raw.jr_source === 'TABLE_9F3' },
        { calc: 'jr_nR', label: 'Exponent nR', unit: '-', when: p => p.raw.md_on === 'YES' && p.raw.jr_source === 'TABLE_9F3' }] },
    ] },
];

/** The sheets of one crack case: sections tagged `geo` are kept only for that geometry, and the sheet's subtitle may differ. */
export function sheetsFor(geometry = 'KPTC') {
  return SHEETS.map(sh => ({ ...sh, subtitle: (geometry !== 'KPTC' && sh['sub_' + geometry]) || sh.subtitle,
    sections: sh.sections.filter(sec => !sec.geo || sec.geo === geometry) }));
}

/** Units shown for 'none'-kind inputs (the workbook's Unit column). */
export const UNIT_TEXT = {
  alpha: 'deg', ni_pct: 'wt %', chem_P: 'wt %', chem_Sb: 'wt %', chem_Sn: 'wt %', chem_As: 'wt %', chem_Mn: 'wt %', chem_Si: 'wt %',
  h2s_ppm: 'ppm', max_cycles: 'cycles', bisection: 'iterations', sif_points: 'points', points: 'points', required_life: 'cycles',
  insp_cap: 'cycles', cycles_per_year: 'cycles/yr', md_points: 'points', md_fmax: 'factor', psf_stress: 'factor', psf_kmat: 'factor', psf_flaw: 'factor',
  insp_fraction: 'fraction', life_margin: 'factor',
};
export { growthEq };
