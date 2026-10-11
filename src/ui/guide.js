/**
 * guide.js — the plain-language introduction shown at the top of every input step.
 * Wording follows the ATLAS KPTC/RPTC Help & User Tutorial (sections 1, 4, 5, 6, 9, 10, 11).
 * `name` is the friendly page name used on the step banner and in the Back / Next buttons.
 */
export const GUIDE = {
  '1_Geometry_Flaw': {
    name: 'Plate and crack size',
    what: 'Describe the plate and the crack that was found. The program assesses a flat plate with a central through-wall crack of total length 2c.',
    todo: ['Enter the plate thickness t and the half-width W (from the centreline to the plate edge).',
      'Enter the measured crack half-length cm — half of the total crack length 2c.',
      'Leave the flaw option on OPTION_1 (use the measured length directly). Choose OPTION_2 only if the crack is inclined to the principal stresses; the angle, the two principal stresses and the projection plane are then asked for.'],
    tip: 'The green rows below show the assessment crack size c0 and whether the geometry is inside the range of the KPTC solution (0 < c/W < 1).',
  },
  '2_Material': {
    name: 'Material',
    what: 'Pick the material. The program reads the yield strength Sy, tensile strength Su, elastic modulus E and the FAD cut-off Lr(max) from the material database (37 materials).',
    todo: ['Use the class filter to shorten the list, then choose the Material ID.',
      'Keep the strength source on DATABASE_SPEC_MIN, unless you have approved project strengths at temperature: then choose PROJECT_AT_TEMPERATURE and type Sy and Su.',
      'Enter the assessment temperature.'],
    tip: 'The grey/green rows confirm what the database holds for your choice. Check them against the material specification.',
  },
  '3_Toughness': {
    name: 'Fracture toughness',
    what: 'Choose how the fracture toughness Kmat is obtained. It is the “resistance” side of the failure assessment: the crack-driving force is compared with it.',
    todo: ['Select the toughness method. Only the inputs of the method you select are shown.',
      'Fill in the yellow fields that appear. With PROJECT_KMAT you simply type the toughness value.',
      'Check the resulting Kmat in the green rows and read the applicability notes.'],
    tip: 'The Material & Toughness result page records which route and source were actually used — check it before relying on the result.',
  },
  '4_Crack_Growth': {
    name: 'Fatigue crack growth',
    what: 'Choose the fatigue crack-growth law that turns each load cycle into crack extension: dc/dN = C (ΔK)ⁿ, with a threshold ΔKth below which the crack does not grow.',
    todo: ['Select the growth model. FROM_MATERIAL_DB uses the default model of the material chosen on step 2.',
      'Verify C, n and the threshold in the green rows (or type project values if you chose a project model).',
      'Choose how the stress ratio R is treated; INCLUDE_RESIDUAL includes the residual stress in R.'],
    tip: 'If the crack does not grow at all, ΔK is below the threshold — check loads, load scale and units.',
  },
  '5_Loads': {
    name: 'Applied stresses',
    what: 'Enter the stresses acting normal to the crack plane (uncracked component), at full load (load scale = 1.0).',
    todo: ['Primary stresses (Pm membrane, Pb bending, pc crack-face pressure) hold the load up: they drive both fracture and plastic collapse.',
      'Secondary stresses (Sm, Sb) and residual stresses (Rm, Rb) only add to the crack-driving force.',
      'For constant-amplitude loading also set the minimum and maximum load scale of the cycle (for example 0 to 1).'],
    tip: 'Instead of membrane + bending you may enter a through-wall polynomial; the program converts it to Pm and Pb.',
  },
  '6_Residual_Stress': {
    name: 'Residual stress',
    what: 'Define the residual (for example welding) stress. It stays in the plate while the applied load cycles: it is held constant and is not scaled by the load.',
    todo: ['Choose the method. USER_DEFINED uses the residual membrane and bending values you typed; the Annex 9D routes (PWHT uniform, as-welded envelope, uniform yield) give them from the standard.',
      'Review the residual stress that results in the green rows.'],
    tip: 'Pressure-test residual-stress credit is only allowed when it can be quantified for the specific case.',
  },
  '7_Load_History': {
    name: 'Load spectrum',
    what: 'Variable-amplitude loading is described as blocks. Each block applies a minimum and maximum load scale for a number of cycles.',
    todo: ['Add one row per block: minimum scale, maximum scale and number of cycles. Use Paste to bring blocks from Excel.',
      'A scale of 1.0 means the full stresses of step 5. The block with the highest maximum scale controls the FAD check.'],
    tip: 'Method used: Equivalent Spectrum / cycle-weighted growth — the crack is advanced with the cycle-weighted equivalent growth rate of the whole spectrum, not block by block.',
  },
  '8_Controls': {
    name: 'Life criteria',
    what: 'Set the numerical controls and the remaining-life criteria. Calculated life, allowable service life and inspection interval are three different things.',
    todo: ['Enter the required remaining life and the life margin factor. Minimum calculated life = required life × margin.',
      'Enter the inspection fraction: inspection interval = fraction × allowable service life (calculated life ÷ margin).',
      'Leave the numerical step controls at their defaults unless you have a reason to change them.'],
    tip: 'The life margin and inspection fraction are project / engineering choices, not API 579 constants.',
  },
  '9_Level3': {
    name: 'Level 3 checks (optional)',
    what: 'Optional extra studies. Switch them on only when the supporting data are appropriate for the actual material, thickness and temperature.',
    todo: ['Method A sensitivity re-runs the whole assessment with the uncertain inputs varied up and down.',
      'Partial safety factors apply project-defined factors to stress, toughness and flaw size.',
      'Method D (ductile tearing) uses a J-R resistance curve instead of a single toughness value.'],
    tip: 'If a sensitivity case fails, investigate the uncertainty — do not rely only on the base-case PASS.',
  },
};

/** Wording that differs for the infinite-length surface crack (KPSCL1 / KPSCL2) */
export const GUIDE_SC = {
  '1_Geometry_Flaw': {
    name: 'Plate and crack size',
    what: 'Describe the plate and the surface crack that was found. The program assesses a flat plate with a long crack that starts at one surface and has depth a (infinite length is assumed, which is a conservative bound for a long flaw).',
    todo: ['Enter the plate thickness t.',
      'Enter the measured crack depth a, measured from the cracked surface.',
      'The measured length 2c is for your information only — the solution assumes infinite length.'],
    tip: 'The green rows show a/t and whether the solution is valid (0 < a/t ≤ 0.8), with the influence coefficients G0 and G1 at that depth.',
  },
  '5_Loads': {
    name: 'Applied stresses',
    what: 'Enter the stresses acting normal to the crack plane in the uncracked plate, at full load (load scale = 1.0). First choose how the stress varies through the wall — this also chooses the solution (KPSCL1 or KPSCL2).',
    todo: ['Through-wall stress distribution: Fourth Order Polynomial = KPSCL1 (9B.3.2); Arbitrary = KPSCL2 (9B.3.3, weight function).',
      'Stress input format: Membrane + Bending, Polynomial coefficients, or (for the arbitrary distribution) a point-by-point profile.',
      'Primary stresses (and crack-face pressure pc) hold the load up; secondary and residual stresses only add to the crack-driving force.',
      'For constant-amplitude loading also set the minimum and maximum load scale of the cycle (for example 0 to 1).'],
    tip: 'A point-by-point profile needs the arbitrary distribution (KPSCL2). A fourth-order polynomial is the right choice when the stress is well described by it.',
  },
  '6_Residual_Stress': {
    name: 'Residual stress',
    what: 'Define the residual (for example welding) stress. It stays in the plate while the applied load cycles: it is held constant and is not scaled by the load.',
    todo: ['USER_DEFINED uses Rm and Rb. USER_PROFILE uses the residual column of the stress profile table.',
      'ANNEX_9D routes (PWHT uniform, as-welded) give the stress from the standard; an as-welded profile is applied as the actual through-wall distribution.'],
    tip: 'Pressure-test residual-stress credit is only allowed when it can be quantified for the specific case.',
  },
};

/** Plot interpretation, from the manual (section 12.2) */
export const PLOT_HELP = {
  1: 'Growth history and acceleration toward the limiting flaw.',
  2: 'Evolution of the crack-driving force.',
  3: 'Growth-law response and threshold behaviour.',
  4: 'How the stress intensity factor increases with crack size.',
  5: 'How the assessment point moves toward the failure boundary.',
  6: 'Separate evolution of the collapse ratio (Lr) and the fracture ratio (Kr).',
  7: 'Remaining assessment margin as the crack grows.',
  8: 'Calculated life, allowable life and the inspection basis.',
  9: 'Constant load range or the variable spectrum.',
  10: 'How the residual stress is represented through the thickness.',
  11: 'The inputs that most affect the life.',
  12: 'Effect of the uncertainty on the assessment points.',
  13: 'The stable tearing path on the FAD.',
  14: 'The resistance curve and the toughness evolution.',
};
