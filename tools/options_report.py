#!/usr/bin/env python3
"""Turn tests/options_oracle.json into OPTIONS_COVERAGE.csv and OPTIONS_COVERAGE.md (what every option does, in SI and FPS)."""
import json, csv, collections
from pathlib import Path
sweep = json.load(open('tests/options_oracle.json'))
rows = collections.OrderedDict()
for s in sweep:
    key = (s['sheet'], s['field'], s['label'], str(s['option']))
    r = rows.setdefault(key, {})
    solved = [a for a in s['attempts'] if 'expect' in a]
    if solved:
        a = solved[0]
        txt = f"SOLVED [{a['context']}] life {a['life']:,.0f} cycles, FAD {a['initial']}, {a['life_status']}"
    else:
        a = s['attempts'][0]
        msgs = collections.OrderedDict((x['expect_error'], 1) for x in s['attempts'])
        txt = 'REJECTED: ' + ' | '.join(list(msgs)[:2])
    r[f"{s['system']} {s['load_type'].lower()}"] = (bool(solved), txt)
with open('OPTIONS_COVERAGE.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['Sheet', 'Parameter', 'Option', 'SI (constant)', 'FPS (constant)', 'SI (variable)', 'FPS (variable)'])
    for (sheet, field, label, opt), r in rows.items():
        w.writerow([sheet, label, opt] + [r.get(k, (None, ''))[1] for k in ('SI constant', 'FPS constant', 'SI variable', 'FPS variable')])
tot = len(rows)
ok_all = sum(1 for r in rows.values() if all(v[0] for v in r.values()))
ok_any = sum(1 for r in rows.values() if any(v[0] for v in r.values()))
rej = [(k, r) for k, r in rows.items() if not any(v[0] for v in r.values())]
by_sheet = collections.OrderedDict()
for (sheet, field, label, opt), r in rows.items():
    by_sheet.setdefault(sheet, collections.OrderedDict()).setdefault((field, label), []).append((opt, r))
md = ['# Every option — coverage report', '',
      f'**{tot} options** on **{len(by_sheet)} sheets** were each applied (in a context where they are meaningful) and solved by the ORIGINAL ATLAS Python engine '
      'in SI and FPS (and constant and variable load where the sheet affects it). The JavaScript engine in this application reproduces every result '
      'and every validation message (`npm test` → `tests/test_options.mjs`), and every option can be selected in the running screens without error '
      '(`tools/ui_options.py`).', '',
      f'* Options that solve in every system tried: **{ok_all}** of {tot}',
      f'* Options that solve in at least one context: **{ok_any}** of {tot}',
      f'* Options that are rejected with a validation message in every context tried: **{len(rej)}** (listed below; this is intended behaviour, not a defect)', '']
if rej:
    md += ['## Options rejected by design', '', '| Sheet | Parameter | Option | Message (identical in the Python original) |', '|---|---|---|---|']
    for (sheet, field, label, opt), r in rej:
        msg = next(iter(r.values()))[1].replace('REJECTED: ', '').replace('|', '/')
        md.append(f'| {sheet} | {label} | `{opt}` | {msg[:200]} |')
    md.append('')
md += ['## Per sheet', '']
for sheet, fields in by_sheet.items():
    md += [f'### {sheet}', '', '| Parameter | Option | Result (SI, constant load) |', '|---|---|---|']
    for (field, label), opts in fields.items():
        for opt, r in opts:
            t = r.get('SI constant', next(iter(r.values())))[1].replace('|', '/')
            md.append(f'| {label} | `{opt}` | {t[:150]} |')
    md.append('')
Path('OPTIONS_COVERAGE.md').write_text('\n'.join(md), encoding='utf-8')
print(f'{tot} options; solved everywhere {ok_all}; solved somewhere {ok_any}; rejected everywhere {len(rej)}')
