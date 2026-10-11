# Select EVERY option of EVERY drop-down on every input sheet in the running application.
import re, json, sys
from playwright.sync_api import sync_playwright
URL="file:///home/claude/proj/build/index.html"
errs=[]; checked=0; problems=[]; per_tab={}
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}); pg=ctx.new_page()
    pg.on("console", lambda m: errs.append(("console."+m.type,m.text)) if m.type in ("error","warning") else None)
    pg.on("pageerror", lambda e: errs.append(("pageerror",str(e))))
    pg.goto(URL); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="New Analysis…").first.click(); pg.wait_for_timeout(200)
    pg.get_by_text("Plate", exact=True).click(); pg.locator("[aria-label='Crack case'] .row").click()
    pg.get_by_label("Variable amplitude (spectrum)").check()
    pg.get_by_role("button", name="OK", exact=True).click(); pg.wait_for_timeout(600)
    pg.get_by_role("menuitem", name="Options").click(); pg.get_by_role("menuitem", name="Show Inputs Not Used by the Selected Options").click(); pg.wait_for_timeout(200)
    tabs=[t.inner_text() for t in pg.get_by_role("tab").all() if not t.inner_text().startswith(("Results","Plots"))]
    for tab in tabs:
        pg.get_by_role("tab", name=tab, exact=True).click(); pg.wait_for_timeout(250)
        n_sel=pg.locator(".workspace select.cell-in").count(); n_opt=0
        for i in range(n_sel):
            sel=pg.locator(".workspace select.cell-in").nth(i)
            label=sel.get_attribute("aria-label")
            values=sel.evaluate("e => Array.from(e.options).map(o => o.value)")
            original=sel.input_value()
            for v in values:
                sel.select_option(v); pg.wait_for_timeout(35)
                n_opt+=1; checked+=1
                if pg.get_by_text("Something went wrong").count():
                    problems.append((tab,label,v,"error screen")); pg.reload(); sys.exit(1)
                got=pg.locator(".workspace select.cell-in").nth(i).input_value()
                if got!=v: problems.append((tab,label,v,f"selection did not stick (got {got})"))
            pg.locator(".workspace select.cell-in").nth(i).select_option(original); pg.wait_for_timeout(35)
        # suggestion fields: an <input list=...> whose <datalist> holds the allowed/suggested values
        n_dl=pg.locator(".workspace input.cell-in[list]").count()
        for i in range(n_dl):
            inp=pg.locator(".workspace input.cell-in[list]").nth(i)
            label=inp.get_attribute("aria-label"); lid=inp.get_attribute("list")
            values=pg.evaluate("id => Array.from(document.getElementById(id).options).map(o => o.value)", lid)
            original=inp.input_value()
            for v in values:
                inp.fill(v); pg.wait_for_timeout(35); n_opt+=1; checked+=1
                if pg.get_by_text("Something went wrong").count(): problems.append((tab,label,v,"error screen")); sys.exit(1)
                got=pg.locator(".workspace input.cell-in[list]").nth(i).input_value()
                if str(got)!=str(v) and not (re.fullmatch(r"-?[\d.]+",v) and float(got)==float(v)): problems.append((tab,label,v,f"value did not stick (got {got})"))
            pg.locator(".workspace input.cell-in[list]").nth(i).fill(original); pg.wait_for_timeout(35)
        n_sel+=n_dl
        per_tab[tab]=(n_sel,n_opt)
        print(f"{tab:<20} {n_sel:>3} fields with options, {n_opt:>3} options chosen")
    pg.wait_for_timeout(500)
    st=pg.locator(".statusbar").inner_text().replace("\n"," | ")
    b.close()
print(f"TOTAL options selected: {checked}")
print("selection problems:", problems[:10] if problems else "none")
print("console/page errors:", errs[:5] if errs else "none")
print("RESULT:", "PASS" if not problems and not errs else "FAIL")
