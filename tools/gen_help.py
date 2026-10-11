#!/usr/bin/env python3
"""
gen_help.py — turn the ATLAS KPTC/RPTC Help & User Tutorial (.docx) into the in-app Help content.

    python tools/gen_help.py <manual.docx>      ->  src/help/help.generated.js

Needs pandoc and beautifulsoup4. Every heading, paragraph, equation, table and list of the manual is kept; the
generator only (a) splits the manual into topics (one per numbered section) and sub-sections (one per x.y heading),
(b) tags equation lines and call-out boxes so the app can style them, and (c) drops the three parts of the manual
that are notes to the software developer rather than help for the user (cover page, "Help Contents" table,
Appendix A/B "suggested help topics / integration").
"""
import json, re, subprocess, sys, pathlib
from bs4 import BeautifulSoup, NavigableString

src = sys.argv[1]
html = subprocess.run(['pandoc', src, '-t', 'html', '--wrap=none'], capture_output=True, text=True, check=True).stdout
soup = BeautifulSoup('<div id="root">' + html + '</div>', 'html.parser')
root = soup.find(id='root')

DROP_TOPICS = {'help-contents'}                      # replaced by the app's own topic list
DROP_PREFIX = ('Appendix A', 'Appendix B')           # developer notes on how to build the Help menu
GROUPS = {   # topic number -> navigation group
    1: 'Start here', 13: 'Start here',
    3: 'Entering a case', 4: 'Entering a case', 5: 'Entering a case', 6: 'Entering a case', 10: 'Entering a case',
    12: 'Results', 14: 'Results',
    2: 'Theory and worked examples', 7: 'Theory and worked examples', 8: 'Theory and worked examples',
    9: 'Theory and worked examples', 11: 'Theory and worked examples',
    15: 'Reference', 16: 'Reference',
}


def text_of(el):
    return re.sub(r'\s+', ' ', el.get_text(' ', strip=True)).strip()


def tidy(el):
    """tag equation paragraphs and call-out boxes, wrap tables for scrolling"""
    # equation = a paragraph made only of bold text that contains '=' / arrow
    if el.name == 'p':
        kids = [k for k in el.children if not (isinstance(k, NavigableString) and not str(k).strip())]
        if kids and all(getattr(k, 'name', None) == 'strong' for k in kids) and re.search(r'[=→]', el.get_text()):
            el['class'] = ['h-eq']
            for s in el.find_all('strong'):
                s.unwrap()
    # one-cell table = call-out box
    if el.name == 'table':
        rows = el.find_all('tr')
        cells = el.find_all(['th', 'td'])
        if len(cells) == 1:
            cell = cells[0]
            lead = cell.find('strong')
            title = lead.get_text().strip().rstrip(':') if lead else ''
            if lead:
                lead.extract()
            box = soup.new_tag('div', **{'class': 'h-callout'})
            if title:
                t = soup.new_tag('div', **{'class': 'h-callout-t'})
                t.string = title
                box.append(t)
            p = soup.new_tag('div')
            p.string = text_of(cell)
            box.append(p)
            return box
        el['class'] = ['h-table']
        for c in el.find_all('colgroup'):
            c.decompose()
        wrap = soup.new_tag('div', **{'class': 'h-table-wrap'})
        el.wrap(wrap)
        return wrap
    return el


topics, cur, sub = [], None, None
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
cover = []
for el in list(root.children):
    if isinstance(el, NavigableString):
        continue
    if el.name == 'h1':
        title = text_of(el)
        if el.get('id') in DROP_TOPICS or title.startswith(DROP_PREFIX):
            cur = sub = None
            continue
        m = re.match(r'^(\d+)\.\s*(.*)$', title)
        num = int(m.group(1)) if m else 0
        cur = {'id': f's{num}' if m else 'intro', 'num': num, 'title': m.group(2) if m else title,
               'group': GROUPS.get(num, 'Start here'), 'sections': []}
        topics.append(cur)
        sub = {'id': cur['id'], 'title': 'Overview', 'els': []}
        cur['sections'].append(sub)
        continue
    if cur is None:
        if el.name == 'p':
            cover.append(text_of(el))
        continue
    if el.name == 'h2':
        title = text_of(el)
        m = re.match(r'^(\d+)\.(\d+)\s*(.*)$', title)
        sid = f's{m.group(1)}-{m.group(2)}' if m else f'{cur["id"]}-{slug(title)}'
        sub = {'id': sid, 'title': title, 'els': []}
        cur['sections'].append(sub)
        continue
    if el.name == 'img' or el.find('img'):
        continue
    sub['els'].append(tidy(el))

# Short notes where the manual describes the Excel/Python package but the desktop app behaves differently.
# They are shown in a separate box titled "In this desktop application" and never replace the manual's own text.
APP_NOTES = {
    's3-1': 'Here the SI / FPS switch (toolbar, or Options menu) converts every value you have already typed, exactly and reversibly, '
            'so you do not need the conversion utility or to re-enter values. The warning above applies to the Excel / Python workbook.',
    's9-1': 'The Results dashboard states the variable-load method that was used: Equivalent Spectrum / cycle-weighted growth.',
    's13-1': 'The analysis runs automatically while you type, so there is no separate solve step: Run (F5) simply opens the Results tab. '
             'Save (Ctrl+S) whenever you like; unsaved work is recovered if the program closes unexpectedly.',
    's13-3': 'The desktop application does not write OUTPUT / PLOTS folders. Results are always live on screen; use File > Export Results (Excel), '
             'Export Crack Growth History (CSV), Save as PNG (each plot) or Print / Save as PDF to keep a copy for the project record.',
    's14': 'The first row (unit conversion), "Outputs not found" and "Old results disappeared" refer to the Excel / Python package. '
           'In this application, unit switching converts typed values automatically, and results are never written to a folder, so those cases do not arise.',
}

out = []
for t in topics:
    secs = []
    for s in t['sections']:
        if not s['els']:
            continue
        h = ''.join(str(e) for e in s['els'])
        if s['id'] in APP_NOTES:
            h += ('<div class="h-callout app"><div class="h-callout-t">In this desktop application</div><div>'
                  + APP_NOTES[s['id']] + '</div></div>')
        secs.append({'id': s['id'], 'title': s['title'], 'html': h, 'text': text_of(BeautifulSoup(h, 'html.parser'))})
    t['sections'] = secs
    out.append(t)

# the first topic ("How to Use This Help Manual") becomes the welcome page
credit = [c for c in cover if c.startswith('Prepared by')]
by = credit[0] if credit else ''
org = next((c for c in cover if 'Consultancy' in c), '')
data = {'title': 'KPTC / RPTC — Help & User Tutorial',
        'subtitle': next((c for c in cover if c.startswith('Plate with')), ''),
        'preparedBy': by, 'org': org, 'topics': out}

dst = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'help' / 'help.generated.js'
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text('/* GENERATED by tools/gen_help.py from the ATLAS KPTC/RPTC Help & User Tutorial — do not edit by hand */\n'
               'export const HELP = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n', encoding='utf-8')
print(f'{len(out)} topics, {sum(len(t["sections"]) for t in out)} sections ->', dst)
for t in out:
    print(f'  {t["id"]:6} [{t["group"]}] {t["title"]}  ({len(t["sections"])} sections)')
