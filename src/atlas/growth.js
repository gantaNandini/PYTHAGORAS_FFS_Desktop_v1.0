/** Annex 9F.5 fatigue crack growth models — port of growth.py (SI engine units: mm/cycle, MPa√m). */
import D from './data.generated.js';
import { num, up, truthy, isNone } from './util.js';
import { parisCusToSI, KSIRIN_TO_MPARM } from './units.js';

function thr(expr, R) {
  const s = String(expr).trim();
  const v = num(s);
  if (v !== null) return v;
  const t = s.replace(/ /g, '');
  for (const a of ['7.0', '6.37']) if (t === `${a}*(1-0.85*R)`) return Number(a) * (1.0 - 0.85 * R);
  throw new Error(`Unsupported threshold expression '${expr}'`);
}

export function growthModelRows(id) {
  const rows = D.growth.filter(r => r.model_id === id);
  if (!rows.length) throw new Error(`Crack growth model '${id}' not found in growth_models.csv`);
  return rows;
}

export class GrowthModel {
  constructor(modelId, system, mat, gin) {
    this.id = modelId; this.system = system;
    const rows = growthModelRows(modelId);
    this.equation = rows[0].equation; this.table = rows[0].api_table;
    this.description = rows[0].description; this.applicability = rows[0].applicability;
    this.rBasis = up(gin.r_basis, 'INCLUDE_RESIDUAL');
    this.dkthOverride = num(gin.dkth_override);
    const reMode = up(gin.re_mode, 'AUTO');
    this.RE = 1.0;
    if (reMode === 'APPLY' || (reMode === 'AUTO' && this.equation === 'PARIS_TEMP_9F137')) {
      const Ey = num(gin.E_ambient), EyT = num(gin.E_temp);
      if (!truthy(Ey) || !truthy(EyT)) throw new Error('Temperature-adjusted growth (Eq. 9F.139) requires E at ambient and at temperature');
      this.RE = Math.max(Ey / EyT, 1.0);
    }
    this.reMode = reMode;
    this.rateFactor = 1.0; this.thFactor = 1.0;
    if (this.equation === 'WELD_9F140' && up(gin.weld_eq, '9F140') === 'PARIS') {
      this.equation = 'PARIS_9F135'; this.note = 'Weld data used with plain Paris per 9F.5.3.6 text (user option)';
    } else this.note = '';
    this.sets = {};
    if (modelId === 'PROJECT_MATERIAL_DATA') {
      const C = mat.C_db, n = mat.n_db, th = mat.dKth_db;
      if (!truthy(C) || !truthy(n)) throw new Error('PROJECT_MATERIAL_DATA requires C and n in the selected material record');
      this.sets.ALL = { C1: C, n1: n, dKth: truthy(th) ? th : 0.0 };
      this.source = 'materials_db.csv record';
    } else if (modelId === 'PROJECT_USER_PARIS') {
      const C = num(gin.C_user), n = num(gin.n_user), th = num(gin.dKth_user, 0.0);
      if (!truthy(C) || !truthy(n) || String(gin.data_status || '').toUpperCase() !== 'APPROVED') {
        throw new Error('PROJECT_USER_PARIS requires C, n and Project data status = APPROVED');
      }
      this.sets.ALL = { C1: C, n1: n, dKth: th };
      this.source = 'project-approved Paris constants';
    } else if (this.equation === 'PIPELINE_9F156') {
      const h2s = num(gin.h2s_ppm, 0.0);
      let C1, n1, C2, n2;
      if (modelId.includes('SOUR')) { C1 = 7.12e-16 * h2s + 3.40e-13; n1 = 6.40; C2 = 2.50e-11 * h2s + 1.48e-7; n2 = 2.72; }
      else { C1 = 1.48e-11; n1 = 4.80; C2 = 4.00e-7; n2 = 1.90; }
      this.sets.ALL = { C1, n1, C2, n2, dKtran: Math.pow(C1 / C2, 1 / (n2 - n1)), dKth: Number(rows[0].dKth_SI), H2S_ppm: h2s };
      this.source = 'API 579 9F.5.3.9 (SI equations)';
    } else {
      for (const r of rows) {
        const n1 = num(r.n1), n2 = num(r.n2);
        let C1, C2, tr, thrExpr, scale;
        if (system === 'FPS' && r.C1_US_in_cycle) {
          C1 = parisCusToSI(Number(r.C1_US_in_cycle), n1);
          C2 = r.C2_US_in_cycle ? parisCusToSI(Number(r.C2_US_in_cycle), n2) : null;
          tr = num(r.dKtran_US); tr = tr !== null ? tr * KSIRIN_TO_MPARM : null;
          thrExpr = r.dKth_US; scale = KSIRIN_TO_MPARM;
        } else {
          C1 = Number(r.C1_SI_mm_cycle); C2 = num(r.C2_SI_mm_cycle); tr = num(r.dKtran_SI); thrExpr = r.dKth_SI; scale = 1.0;
        }
        this.sets[r.R_range] = { C1, n1, C2, n2, dKtran: tr, dKth_expr: thrExpr, thr_scale: scale };
      }
      this.source = `API 579 Table ${this.table}${system === 'FPS' ? '' : 'M'} (${system === 'FPS' ? 'US Customary' : 'SI'} constants)`;
    }
  }

  params(R) {
    if ('ALL' in this.sets) return this.sets.ALL;
    return R >= 0.5 ? this.sets['R>=0.5'] : this.sets['R<0.5'];
  }
  threshold(R) {
    if (!isNone(this.dkthOverride)) return this.dkthOverride;
    const p = this.params(R);
    if ('dKth' in p) return p.dKth;
    return thr(p.dKth_expr, R) * p.thr_scale;
  }
  effectiveR(kmin, kmax, kres) {
    let R;
    if (this.rBasis === 'APPLIED_ONLY') R = kmax <= 0 ? 0.0 : kmin / kmax;
    else { const tmax = kmax + kres; R = tmax <= 0 ? 0.0 : (kmin + kres) / tmax; }
    if (this.rBasis === 'FORCE_R_GE_0_5') R = Math.max(R, 0.5);
    return R;
  }
  rate(dK, R) { const [r, th] = this._rate(dK, R); return [r * this.rateFactor, th]; }
  _rate(dK, R) {
    const th = this.threshold(R) * this.thFactor;
    if (dK <= th) return [0.0, th];
    const p = this.params(R), eq = this.equation;
    if (eq === 'PARIS_9F135' || eq === 'PARIS_TEMP_9F137') return [p.C1 * Math.pow(this.RE * dK, p.n1), th];
    if (eq === 'WELD_9F140') return [p.C1 * (Math.pow(this.RE * dK, p.n1) - Math.pow(th, p.n1)), th];
    if (eq === 'BILINEAR_9F149') {
      const x = this.RE * dK;
      return x < p.dKtran ? [p.C1 * Math.pow(x, p.n1), th] : [p.C2 * Math.pow(x, p.n2), th];
    }
    if (eq === 'PIPELINE_9F156') {
      const x = dK + 4.0 * R;
      return x < p.dKtran ? [p.C1 * Math.pow(x, p.n1), th] : [p.C2 * Math.pow(x, p.n2), th];
    }
    throw new Error(eq);
  }
  summary() {
    const ps = {};
    Object.entries(this.sets).forEach(([k, v]) => { ps[k] = { ...v }; });
    return { model_id: this.id, equation: this.equation, api_table: this.table, description: this.description,
      applicability: this.applicability, R_basis: this.rBasis, R_E: this.RE, re_mode: this.reMode,
      source: this.source, note: this.note, parameter_sets: ps };
  }
}
