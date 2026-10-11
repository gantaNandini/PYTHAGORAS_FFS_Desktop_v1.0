/* Help topics added for the surface crack (KPSCL1 / KPSCL2) and the Remaining Life tab. Merged after the generated manual topics. */
export const EXTRA_TOPICS = [
 {
  "id": "s17",
  "num": 17,
  "title": "Surface crack: KPSCL1 / KPSCL2",
  "group": "Entering a case",
  "sections": [
   {
    "id": "s17",
    "title": "Overview",
    "html": "<p>This release adds the plate with an <b>infinite-length surface crack</b> (Figure 9B.2(b)) next to the through-wall crack KPTC. Two stress intensity solutions are available for it, <b>KPSCL1</b> (Annex 9B.3.2) and <b>KPSCL2</b> (Annex 9B.3.3), together with the reference stress solution <b>RPSCL</b> (Annex 9C.3.2 / 9C.3.3).</p><p>Choose the case in <b>File › New Analysis</b> (Crack Case Library: Plate › Surface Cracks). KPSCL1 and KPSCL2 are one geometry: the drop-down <b>Through-wall stress distribution</b> on the Loads page selects between them at any time.</p>",
    "text": "This release adds the plate with an infinite-length surface crack (Figure 9B.2(b)) next to the through-wall crack KPTC. Two stress intensity solutions are available for it, KPSCL1 (Annex 9B.3.2) and KPSCL2 (Annex 9B.3.3), together with the reference stress solution RPSCL (Annex 9C.3.2 / 9C.3.3). Choose the case in File › New Analysis (Crack Case Library: Plate › Surface Cracks). KPSCL1 and KPSCL2 are one geometry: the drop-down Through-wall stress distribution on the Loads page selects between them at any time."
   },
   {
    "id": "s17-1",
    "title": "Plate and crack size",
    "html": "<p>Enter the plate thickness <b>t</b> and the measured crack depth <b>a</b>, measured from the cracked surface (paragraph 9.3.6.3). The measured length 2c is information only: the solution assumes an infinite length, which is a conservative bound for a long surface flaw.</p><div class=\"h-callout\"><div class=\"h-callout-t\">Validity</div><div>0 &lt; a/t ≤ 0.8 (9B.3.2.2(d)). This is a limit of the solution, not a critical flaw size: when crack growth reaches a/t = 0.8 without the FAD being violated, the report says that the validity limit was reached.</div></div><p>The green rows show a/t and the influence coefficients G0 and G1 at that depth (Eq. 9B.13 with the constants of Table 9B.2).</p>",
    "text": "Enter the plate thickness t and the measured crack depth a , measured from the cracked surface (paragraph 9.3.6.3). The measured length 2c is information only: the solution assumes an infinite length, which is a conservative bound for a long surface flaw. Validity 0 &lt; a/t ≤ 0.8 (9B.3.2.2(d)). This is a limit of the solution, not a critical flaw size: when crack growth reaches a/t = 0.8 without the FAD being violated, the report says that the validity limit was reached. The green rows show a/t and the influence coefficients G0 and G1 at that depth (Eq. 9B.13 with the constants of Table 9B.2)."
   },
   {
    "id": "s17-2",
    "title": "Choosing KPSCL1 or KPSCL2 (Loads page)",
    "html": "<ul><li><b>Fourth Order Polynomial Stress Distribution — KPSCL1</b> (9B.3.2): the through-wall stress is σ(x) = σ0 + σ1(x/t) + … + σ4(x/t)⁴ (Eq. 9B.3). Stress intensity from Eq. 9B.12.</li><li><b>Arbitrary Stress Distribution — KPSCL2</b> (9B.3.3): any through-wall stress. The stress intensity is integrated with the weight function of Eqs. 9B.261/9B.262 (M1 to M3 from Eqs. 9B.267 to 9B.269).</li></ul><p>The <b>Stress input format</b> drop-down then offers: <b>Membrane + Bending</b> (Pm, Pb, Sm, Sb — available for both), <b>Polynomial coefficients</b> (σ0 to σ4 for the primary and the secondary stress), and, for KPSCL2 only, a <b>Point-by-point profile</b>.</p><p>A point-by-point profile combined with KPSCL1 is refused with a message: a profile is an arbitrary distribution, so select KPSCL2 or enter polynomial coefficients. If a residual-stress profile is given to KPSCL1, it is fitted to a fourth-order polynomial and the fit error is reported.</p>",
    "text": "Fourth Order Polynomial Stress Distribution — KPSCL1 (9B.3.2): the through-wall stress is σ(x) = σ0 + σ1(x/t) + … + σ4(x/t)⁴ (Eq. 9B.3). Stress intensity from Eq. 9B.12. Arbitrary Stress Distribution — KPSCL2 (9B.3.3): any through-wall stress. The stress intensity is integrated with the weight function of Eqs. 9B.261/9B.262 (M1 to M3 from Eqs. 9B.267 to 9B.269). The Stress input format drop-down then offers: Membrane + Bending (Pm, Pb, Sm, Sb — available for both), Polynomial coefficients (σ0 to σ4 for the primary and the secondary stress), and, for KPSCL2 only, a Point-by-point profile . A point-by-point profile combined with KPSCL1 is refused with a message: a profile is an arbitrary distribution, so select KPSCL2 or enter polynomial coefficients. If a residual-stress profile is given to KPSCL1, it is fitted to a fourth-order polynomial and the fit error is reported."
   },
   {
    "id": "s17-3",
    "title": "Point-by-point stress profile",
    "html": "<p>Enter one row per point: <b>x</b> (distance from the cracked surface), then the <b>primary</b>, <b>secondary</b> and <b>residual</b> stress at that x. Use <b>Paste / Import</b> to bring the table from Excel. Up to 50 points; linear variation is assumed between points.</p><p>The first point must be at x = 0 and the last at x = t. The primary and the secondary stress are scaled by the load; the residual stress is held constant.</p><p>The reference stress uses the equivalent membrane and bending stress of the primary distribution (Eqs. 9B.1/9B.2 for a profile, Eqs. 9B.4/9B.5 for a polynomial).</p>",
    "text": "Enter one row per point: x (distance from the cracked surface), then the primary , secondary and residual stress at that x. Use Paste / Import to bring the table from Excel. Up to 50 points; linear variation is assumed between points. The first point must be at x = 0 and the last at x = t. The primary and the secondary stress are scaled by the load; the residual stress is held constant. The reference stress uses the equivalent membrane and bending stress of the primary distribution (Eqs. 9B.1/9B.2 for a profile, Eqs. 9B.4/9B.5 for a polynomial)."
   },
   {
    "id": "s17-4",
    "title": "Residual stress",
    "html": "<p>The residual-stress methods are the same as for KPTC, plus <b>USER_PROFILE</b>, which uses the residual column of the stress profile table. For the surface crack an <b>as-welded Annex 9D profile</b> is applied as the actual through-wall distribution (KPSCL1: fourth-order fit; KPSCL2: weight function) instead of the uniform envelope used for the through-wall crack.</p>",
    "text": "The residual-stress methods are the same as for KPTC, plus USER_PROFILE , which uses the residual column of the stress profile table. For the surface crack an as-welded Annex 9D profile is applied as the actual through-wall distribution (KPSCL1: fourth-order fit; KPSCL2: weight function) instead of the uniform envelope used for the through-wall crack."
   },
   {
    "id": "s17-5",
    "title": "Results for a surface crack",
    "html": "<p>Dashboard, tables and plots use the crack <b>depth a</b> and <b>a/t</b> instead of c, 2c and c/W; the table columns G0 and G1 replace Mb and fw. Level 3 sensitivity and Method D work as for KPTC (tearing is added to the depth a). The Master Curve crack-front length L is 100 mm for the infinite-length crack (Eq. 9H.15).</p>",
    "text": "Dashboard, tables and plots use the crack depth a and a/t instead of c, 2c and c/W; the table columns G0 and G1 replace Mb and fw. Level 3 sensitivity and Method D work as for KPTC (tearing is added to the depth a). The Master Curve crack-front length L is 100 mm for the infinite-length crack (Eq. 9H.15)."
   }
  ]
 },
 {
  "id": "s18",
  "num": 18,
  "title": "Remaining Life tab",
  "group": "Results",
  "sections": [
   {
    "id": "s18",
    "title": "Overview",
    "html": "<p>The <b>Remaining Life</b> tab (next to Plots) turns the crack-growth result into the decision of paragraph 9.5.1.2 STEP 6: <b>calculated life ≥ required life × margin factor</b>. It works for every crack case.</p><p>The inputs on this page are the same inputs as step 8 (Life criteria): current flaw basis, required remaining life, life margin factor, inspection fraction, inspection interval cap and operating cycles per year. Change them here or there — they are one set of numbers.</p>",
    "text": "The Remaining Life tab (next to Plots) turns the crack-growth result into the decision of paragraph 9.5.1.2 STEP 6: calculated life ≥ required life × margin factor . It works for every crack case. The inputs on this page are the same inputs as step 8 (Life criteria): current flaw basis, required remaining life, life margin factor, inspection fraction, inspection interval cap and operating cycles per year. Change them here or there — they are one set of numbers."
   },
   {
    "id": "s18-1",
    "title": "What the page shows",
    "html": "<ul><li><b>Calculated remaining life</b>: cycles (and years when the cycles per year are entered) for the crack to grow from its present size to the limiting size.</li><li><b>Required life × margin</b> and the <b>ratio</b> calculated ÷ required: the check is met when the ratio is at least 1.</li><li><b>Allowable service life</b> = calculated life ÷ margin factor.</li><li><b>Inspection interval</b> = inspection fraction × allowable life (limited by the cap, if one is entered), and the number of inspections that fall inside the required life.</li><li>A square plot of crack size against cycles with the four limits marked.</li></ul><p>If the crack does not grow (ΔK at or below the threshold) the life is unlimited and the result says so; if the present crack already fails the FAD the verdict is <b>NOT ACCEPTABLE NOW</b> whatever the life.</p><div class=\"h-callout\"><div class=\"h-callout-t\">Engineering choices</div><div>The margin factor and the inspection fraction are project / engineering choices, not API 579 constants.</div></div>",
    "text": "Calculated remaining life : cycles (and years when the cycles per year are entered) for the crack to grow from its present size to the limiting size. Required life × margin and the ratio calculated ÷ required: the check is met when the ratio is at least 1. Allowable service life = calculated life ÷ margin factor. Inspection interval = inspection fraction × allowable life (limited by the cap, if one is entered), and the number of inspections that fall inside the required life. A square plot of crack size against cycles with the four limits marked. If the crack does not grow (ΔK at or below the threshold) the life is unlimited and the result says so; if the present crack already fails the FAD the verdict is NOT ACCEPTABLE NOW whatever the life. Engineering choices The margin factor and the inspection fraction are project / engineering choices, not API 579 constants."
   }
  ]
 }
];
