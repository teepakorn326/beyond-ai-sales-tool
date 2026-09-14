"""Generates the design-canvas artboards for Visa Document Checker.

Run:  python3 build_canvas.py
Writes Main.dc.html (Cases) plus one .dc.html per screen, DirectionB/C
alternates of the Case Overview, and canvas.json. Tokens match ../tokens.css.
"""
from pathlib import Path
import json

HERE = Path(__file__).parent

FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap">'

CSS = """
:root{--primary:#2563EB;--primary-hover:#1D4ED8;--primary-soft:#DBEAFE;--surface-blue:#EFF6FF;--bg:#F8FAFC;--surface-2:#F1F5F9;--card:#FFFFFF;--text:#0F172A;--text-2:#475569;--muted:#64748B;--border:#E2E8F0;--border-strong:#CBD5E1;--success:#16A34A;--success-soft:#DCFCE7;--success-text:#166534;--warning:#D97706;--warning-soft:#FEF3C7;--warning-text:#92400E;--error:#DC2626;--error-soft:#FEE2E2;--error-text:#991B1B;--info-text:#1E40AF;--r-sm:6px;--r:8px;--r-lg:12px;--shadow-1:0 1px 2px rgba(15,23,42,.06);--shadow-2:0 8px 24px rgba(15,23,42,.12);--font:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;--mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/20px var(--font);font-feature-settings:"cv11","ss01"}
a{color:var(--primary);text-decoration:none}a:hover{color:var(--primary-hover)}
svg{flex:none}
.app{width:1440px;display:grid;grid-template-columns:240px minmax(0,1fr);background:var(--bg)}
.app.collapsed{grid-template-columns:64px minmax(0,1fr)}
/* sidebar */
.sidebar{background:var(--card);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:16px 12px;gap:2px}
.brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;padding:4px 8px 18px;color:var(--text)}
.brand .mark{width:24px;height:24px;border-radius:6px;background:var(--primary);display:flex;align-items:center;justify-content:center;color:#fff}
.nav{display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;border-radius:var(--r-sm);color:var(--text-2);font-weight:500}
.nav.active{background:var(--primary-soft);color:var(--info-text)}
.sidefoot{margin-top:auto;border-top:1px solid var(--border);padding-top:12px;display:flex;gap:10px;align-items:center}
.collapsed .sidebar{padding:16px 12px;align-items:center}.collapsed .brand{padding:4px 0 18px}.collapsed .nav{width:40px;justify-content:center;padding:0}.collapsed .nav span,.collapsed .brand span,.collapsed .sidefoot div{display:none}
.avatar{width:28px;height:28px;border-radius:999px;background:var(--primary-soft);color:var(--info-text);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex:none}
/* topbar */
.topbar{height:56px;background:var(--card);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;padding:0 24px}
.crumb{color:var(--muted);display:flex;gap:6px;align-items:center;white-space:nowrap}.crumb b{color:var(--text);font-weight:500}
.search{width:360px;height:36px;border:1px solid var(--border);border-radius:var(--r);background:var(--bg);display:flex;align-items:center;padding:0 12px;color:var(--muted);gap:8px}
.search kbd{margin-left:auto;font:11px var(--mono);border:1px solid var(--border);border-radius:4px;padding:1px 5px;background:var(--card);color:var(--muted)}
.icbtn{width:36px;height:36px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--card);display:flex;align-items:center;justify-content:center;color:var(--text-2)}
.icbtn.sm{width:28px;height:28px}
.spacer{flex:1}
/* content */
.content{padding:24px 32px 40px;display:flex;flex-direction:column;gap:24px;min-width:0}
.pagehead{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.h1{font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.01em;margin:0}
.h1.display{font-size:24px;line-height:32px;letter-spacing:-.02em}
.sub{color:var(--text-2);margin-top:2px}
.h2{font-size:16px;line-height:24px;font-weight:600;margin:0}
.overline{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.label{font-size:12px;font-weight:500;color:var(--muted)}
.value{font-weight:600;font-variant-numeric:tabular-nums}
.muted{color:var(--muted)}.t2{color:var(--text-2)}
.mono{font-family:var(--mono);font-size:12.5px}
.row{display:flex;align-items:center;gap:8px}
.stack{display:flex;flex-direction:column;gap:8px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px 20px}
.card.compact{padding:12px 16px;border-radius:var(--r)}
.stripe{border-left:3px solid var(--border-strong)}.stripe.ok{border-left-color:var(--success)}.stripe.warn{border-left-color:var(--warning)}.stripe.err{border-left-color:var(--error)}.stripe.info{border-left-color:var(--primary)}
/* buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:var(--r);font:500 14px/1 var(--font);border:1px solid transparent;white-space:nowrap}
.btn.primary{background:var(--primary);color:#fff}
.btn.secondary{background:var(--card);color:var(--text);border-color:var(--border-strong)}
.btn.ghost{background:transparent;color:var(--text-2)}
.btn.external{background:var(--card);color:var(--text);border:1px dashed var(--border-strong)}
.btn.sm{height:32px;padding:0 10px;font-size:13px}.btn.lg{height:40px;padding:0 18px}
.btn.disabled{opacity:.5}
/* pills, chips */
.pill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:500;white-space:nowrap;border:1px solid transparent}
.pill.ok{background:var(--success-soft);color:var(--success-text)}.pill.warn{background:var(--warning-soft);color:var(--warning-text)}.pill.err{background:var(--error-soft);color:var(--error-text)}.pill.info{background:var(--primary-soft);color:var(--info-text)}.pill.neutral{background:var(--surface-2);color:var(--text-2);border-color:var(--border)}
.chip{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 6px;border-radius:4px;font-size:11.5px;color:var(--muted);border:1px solid var(--border);background:var(--card);white-space:nowrap}
.chip.confirmed{color:var(--success-text);border-color:var(--success)}.chip.edited{color:var(--info-text);border-color:var(--primary)}
/* metric */
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.metric{background:var(--card);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px 18px;box-shadow:var(--shadow-1)}
.metric .num{font-size:28px;line-height:32px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:4px}
/* table */
.tbl{background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
table{border-collapse:collapse;width:100%}
th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600;background:var(--surface-2);text-align:left;padding:0 12px;height:40px;border-bottom:1px solid var(--border)}
td{padding:0 12px;height:44px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums;vertical-align:middle}
tr:last-child td{border-bottom:0}
.filterbar{display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid var(--border)}
.select{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:1px solid var(--border-strong);border-radius:var(--r-sm);background:var(--card);font-size:13px;color:var(--text)}
.input{height:36px;border:1px solid var(--border-strong);border-radius:var(--r-sm);background:var(--card);display:flex;align-items:center;padding:0 10px;color:var(--text);font-variant-numeric:tabular-nums}
.seg{display:inline-flex;gap:2px}.seg i{width:14px;height:8px;border-radius:2px;background:var(--border-strong)}.seg i.on{background:var(--primary)}
.pager{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;color:var(--muted);font-size:13px;border-top:1px solid var(--border)}
/* stepper */
.stepper{display:flex;align-items:center;gap:8px}
.step{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 10px 0 4px;border-radius:999px;border:1px solid var(--border);font-size:13px;color:var(--text-2);background:var(--card)}
.step .n{width:20px;height:20px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;background:var(--surface-2);color:var(--muted)}
.step.done{border-color:transparent;background:var(--success-soft);color:var(--success-text)}.step.done .n{background:var(--success);color:#fff}
.step.current{border-color:var(--primary);color:var(--info-text);background:var(--surface-blue)}.step.current .n{background:var(--primary);color:#fff}
.sep{width:16px;height:1px;background:var(--border-strong)}
/* upload */
.dropzone{border:2px dashed var(--primary);background:var(--surface-blue);border-radius:var(--r-lg);padding:36px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px}
.thumb{width:40px;height:52px;background:var(--surface-2);border:1px solid var(--border-strong);border-radius:3px;flex:none;display:flex;flex-direction:column;gap:3px;padding:6px 5px}
.thumb i{display:block;height:2px;background:var(--border-strong);border-radius:1px}
.thumb.wide{width:52px;height:40px}
.bar{height:4px;background:var(--surface-2);border-radius:2px}.bar i{display:block;height:4px;background:var(--primary);border-radius:2px}
/* tabs */
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--border)}
.tab{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 12px;color:var(--text-2);font-weight:500;border-bottom:2px solid transparent;margin-bottom:-1px}
.tab.on{color:var(--primary);border-bottom-color:var(--primary)}
.tab .count{font-size:11px;background:var(--surface-2);border-radius:999px;padding:1px 7px;color:var(--muted)}
/* viewer */
.viewerbar{display:flex;justify-content:space-between;align-items:center;height:44px;padding:0 12px;border:1px solid var(--border);border-bottom:0;border-radius:var(--r) var(--r) 0 0;background:var(--card);font-size:13px}
.viewer{background:var(--surface-2);border:1px solid var(--border);display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow:hidden}
.page{width:520px;background:var(--card);border:1px solid var(--border-strong);box-shadow:var(--shadow-2);padding:36px 40px;font-size:12px;line-height:20px;color:var(--text-2);font-family:Georgia,"Times New Roman",serif}
.page .hl{background:var(--primary-soft);outline:1px solid var(--primary);border-radius:2px;color:var(--info-text);padding:0 2px}
.pagestrip{display:flex;gap:8px;padding:10px 12px;border:1px solid var(--border);border-top:0;border-radius:0 0 var(--r) var(--r);background:var(--card);align-items:center}
/* fields */
.field{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px}
.field .head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.field .meta{display:flex;gap:8px;align-items:center;margin-top:6px;font-size:12px;color:var(--muted)}
.field .actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.field.collapsed{padding:8px 14px;display:flex;align-items:center;gap:10px}
.note{border:1px solid var(--primary);background:var(--surface-blue);border-radius:var(--r);padding:10px 12px;margin-top:8px}
.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:6px}
.pair .box{background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);padding:6px 10px}
/* assistant */
.msg{max-width:600px;border-radius:var(--r);padding:12px 14px;font-size:15px;line-height:22px}
.msg.user{background:var(--surface-blue);border:1px solid var(--primary-soft);align-self:flex-end}
.msg.ai{background:var(--card);border:1px solid var(--border)}
.src{border:1px solid var(--border);background:var(--surface-2);border-radius:var(--r-sm);padding:8px 10px;font-size:13px;margin-top:8px;display:flex;flex-direction:column;gap:4px}
.approval{border:1px solid var(--warning);background:var(--card);border-radius:var(--r);padding:12px 14px;max-width:600px}
.draft{border:1px solid var(--border);border-radius:var(--r-sm);background:var(--bg);padding:8px 10px;font-style:italic;color:var(--text-2);margin:8px 0}
.composer{display:flex;gap:8px;align-items:center;border:1px solid var(--border-strong);border-radius:var(--r);background:var(--card);padding:6px 6px 6px 14px;color:var(--muted)}
.verdict{position:sticky;top:24px}
"""

CSS_B = """
.app{background:#F8FAFC}
.sidebar{background:#0F172A;border-right:0}.brand{color:#fff}.brand .mark{background:#2563EB}
.nav{color:#94A3B8;border-radius:4px}.nav.active{background:#1E3A8A;color:#fff}
.sidefoot{border-top-color:#1E293B;color:#E2E8F0}.sidefoot .muted{color:#94A3B8}.avatar{background:#1E3A8A;color:#BFDBFE}
.card,.card.compact,.field,.tbl,.metric{border-radius:4px}.btn,.btn.sm{border-radius:4px}.pill{border-radius:3px;font-family:var(--mono);font-size:11px;letter-spacing:.04em;text-transform:uppercase;height:20px}
.h1.display{font-family:var(--mono);font-weight:500;letter-spacing:0;font-size:22px}
.overline{letter-spacing:.1em}
td{height:40px;font-size:13.5px}th{height:36px}
.value{font-family:var(--mono);font-weight:500;font-size:13.5px}
"""

CSS_C = """
:root{--bg:#EFF6FF;--surface-2:#F1F5F9;--border:#E3EBF6}
body{font-size:15px;line-height:22px}
.sidebar{border-right:0;background:#fff;border-radius:0 16px 16px 0}
.card,.card.compact,.tbl,.metric,.field{border:0;box-shadow:0 1px 3px rgba(37,99,235,.08);border-radius:12px}
.stripe{border-left:0}
.card.compact.stripe.ok{background:#F0FDF4}.card.compact.stripe.warn{background:#FFFBEB}.card.compact.stripe.err{background:#FEF2F2}
.btn{border-radius:10px;height:40px}.btn.sm{height:36px;border-radius:8px}
.pill{height:24px;font-size:12.5px}
.topbar{background:transparent;border-bottom:0}
.content{gap:28px}
"""

# ------------------------------------------------------------------ icons (stroke, currentColor)
def ic(name, s=16):
    p = {
        "check": '<path d="M20 6 9 17l-5-5"/>',
        "tri": '<path d="M12 3 2 21h20L12 3z"/>',
        "trif": '<path d="M12 3 2 21h20L12 3z" fill="currentColor"/>',
        "block": '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
        "pending": '<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9" fill="currentColor" stroke="none"/>',
        "dot": '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
        "dotted": '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>',
        "pencil": '<path d="M17 3l4 4L7 21H3v-4L17 3z"/>',
        "mail": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
        "camera": '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3"/>',
        "doc": '<path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5"/>',
        "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
        "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
        "bell": '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
        "plus": '<path d="M12 5v14M5 12h14"/>',
        "chev": '<path d="m9 6 6 6-6 6"/>',
        "chevl": '<path d="m15 6-6 6 6 6"/>',
        "chevd": '<path d="m6 9 6 6 6-6"/>',
        "more": '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
        "x": '<path d="M6 6l12 12M18 6 6 18"/>',
        "folder": '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
        "upload": '<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/>',
        "list": '<path d="M4 7h16M4 12h16M4 17h10"/>',
        "spark": '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
        "activity": '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
        "gear": '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
        "zoomin": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
        "zoomout": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
        "rotate": '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
        "fit": '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
        "shield": '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
        "send": '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    }[name]
    fill = "none"
    return (f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="{fill}" stroke="currentColor" '
            f'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{p}</svg>')

def pill(kind, icon, text):
    return f'<span class="pill {kind}">{ic(icon, 12)}{text}</span>'

def chip(kind, icon, text):
    cls = {"extracted": "", "confirmed": " confirmed", "edited": " edited"}[kind]
    return f'<span class="chip{cls}">{ic(icon, 11)}{text}</span>'

def thumb(wide=False):
    cls = "thumb wide" if wide else "thumb"
    return f'<div class="{cls}"><i></i><i style="width:70%"></i><i></i><i style="width:50%"></i></div>'

NAV = [("Cases", "folder"), ("New intake", "upload"), ("Review queue", "list"), ("Assistant", "spark"), ("System", "activity"), ("Settings", "gear")]

def sidebar(active, user=("Ploy K.", "Reviewer", "PK")):
    items = "".join(f'<div class="nav{" active" if n == active else ""}">{ic(i, 18)}<span>{n}</span></div>' for n, i in NAV)
    return (f'<aside class="sidebar"><div class="brand"><div class="mark">{ic("shield", 14)}</div><span>Doc Checker</span></div>{items}'
            f'<div class="sidefoot"><div class="avatar">{user[2]}</div><div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px">{user[0]}</div><div class="muted" style="font-size:12px">{user[1]}</div></div>{ic("more", 16)}</div></aside>')

def topbar(crumb, actions="", initials="PK"):
    return (f'<header class="topbar"><div class="crumb">{crumb}</div><div class="search">{ic("search", 16)}Search cases<kbd>⌘K</kbd></div>'
            f'<div class="spacer"></div>{actions}<div class="icbtn">{ic("bell", 16)}</div><div class="avatar">{initials}</div></header>')

def crumb(*parts):
    items = [f"<b>{p}</b>" if i == len(parts) - 1 else f"<span>{p}</span>" for i, p in enumerate(parts)]
    return ic("chev", 12).join(items)

def shell(active, crumb_html, body, actions="", collapsed=False, extra_css="", user=("Ploy K.", "Reviewer", "PK")):
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  {FONT}
  <style>{CSS}{extra_css}</style>
</helmet>
<div class="app{' collapsed' if collapsed else ''}" style="min-height:900px">
{sidebar(active, user)}
<div style="display:flex;flex-direction:column;min-width:0">
{topbar(crumb_html, actions, user[2])}
<main class="content">
{body}
</main>
</div>
</div>
</x-dc>
</body>
</html>
"""

def stepper(current):
    names = ["Upload", "Classify", "Review", "Validate"]
    out = []
    for i, n in enumerate(names, 1):
        if i < current:
            out.append(f'<span class="step done"><span class="n">{ic("check", 11)}</span>{n}</span>')
        elif i == current:
            out.append(f'<span class="step current"><span class="n">{i}</span>{n}</span>')
        else:
            out.append(f'<span class="step"><span class="n">{i}</span>{n}</span>')
    return '<div class="stepper">' + '<span class="sep"></span>'.join(out) + '</div>'

def seg(filled, total=4):
    return '<span class="seg">' + "".join(f'<i class="{"on" if i < filled else ""}"></i>' for i in range(total)) + '</span>'

# ------------------------------------------------------------------ Screen 1 · Cases (Main)
def cases():
    rows = [
        ("#0413", "S. Jaroensuk", "Jul 2028", "4 / 4", 3, 4, pill("err", "block", "Blocked"), "12 min ago", "View issue"),
        ("#0412", "N. Srisuwan", "Feb 2027", "4 / 4", 4, 4, pill("ok", "check", "Ready"), "1 h ago", "Open"),
        ("#0411", "P. Rattanakul", "Feb 2027", "4 / 4", 4, 4, pill("ok", "check", "Ready"), "2 h ago", "Open"),
        ("#0409", "K. Boonmee", "Jul 2027", "3 / 4", 2, 3, pill("neutral", "pending", "Pending documents"), "Yesterday", "Open"),
        ("#0407", "A. Chaiyaporn", "Jul 2027", "4 / 4", 1, 4, pill("warn", "tri", "Needs review"), "Yesterday", "Open"),
        ("#0405", "W. Thongchai", "Feb 2027", "4 / 4", 4, 4, pill("ok", "check", "Ready"), "2 d ago", "Open"),
        ("#0401", "T. Wongsawat", "Feb 2027", "4 / 4", 4, 4, pill("err", "block", "Blocked"), "2 d ago", "View issue"),
        ("#0398", "M. Phongsri", "Jul 2027", "2 / 4", 2, 2, pill("neutral", "pending", "Pending documents"), "3 d ago", "Open"),
    ]
    trs = "".join(
        f'<tr><td class="mono">{cid}</td><td>{st}</td><td>{intake}</td><td>{docs}</td><td><span class="row">{seg(f, t)}<span class="muted">{f}/{t}</span></span></td><td>{status}</td><td class="muted">{upd}</td><td style="text-align:right"><span class="btn secondary sm">{act}</span></td></tr>'
        for cid, st, intake, docs, f, t, status, upd, act in rows)
    body = f"""
<div class="pagehead"><div><h1 class="h1">Cases</h1><div class="sub">Review and validate student applications before submission.</div></div><span class="btn primary lg">{ic("plus", 16)}New case</span></div>
<div class="metrics">
  <div class="metric"><div class="label">Total cases</div><div class="num">128</div><div class="muted" style="font-size:12px">across 3 intakes</div></div>
  <div class="metric stripe ok"><div class="label">Ready to submit</div><div class="num">41</div><div class="muted" style="font-size:12px">+6 this week</div></div>
  <div class="metric stripe warn"><div class="label">Needs review</div><div class="num">63</div><div class="muted" style="font-size:12px">11 low confidence</div></div>
  <div class="metric stripe err"><div class="label">Blocked</div><div class="num">9</div><div class="muted" style="font-size:12px">6 English test validity</div></div>
</div>
<div class="tbl">
  <div class="filterbar"><div class="input" style="width:320px;height:32px;color:var(--muted);gap:8px">{ic("search", 14)}Search by case ID or student</div><div class="spacer"></div><span class="select">Status: All {ic("chevd", 12)}</span><span class="select">Intake: All {ic("chevd", 12)}</span><span class="select">Assignee: Anyone {ic("chevd", 12)}</span><span class="select">Sort: Last updated {ic("chevd", 12)}</span></div>
  <table><thead><tr><th>Case</th><th>Student</th><th>Intake</th><th>Documents</th><th>Review progress</th><th>Status</th><th>Last updated</th><th></th></tr></thead><tbody>{trs}</tbody></table>
  <div class="pager"><span>Showing 1–8 of 128</span><span class="row"><span class="icbtn sm">{ic("chevl", 12)}</span><span>1 / 16</span><span class="icbtn sm">{ic("chev", 12)}</span></span></div>
</div>"""
    return shell("Cases", crumb("Cases"), body)

# ------------------------------------------------------------------ Screen 2 · New case
def newcase():
    body = f"""
<div class="pagehead"><div><h1 class="h1">New student case</h1><div class="sub">Upload everything you have. Documents can arrive in any order.</div></div>{stepper(1)}</div>
<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px">
  <div class="card compact"><div class="label">Intake</div><div class="row" style="justify-content:space-between;margin-top:4px"><span class="value">Jul 2028</span>{ic("chevd", 14)}</div></div>
  <div class="card compact"><div class="label">Submission target</div><div class="value" style="margin-top:4px">30 Jun 2028</div></div>
  <div class="card compact"><div class="label">Course end date</div><div class="muted" style="margin-top:4px">Set when the course is chosen</div></div>
</div>
<div class="dropzone"><div style="font-size:16px;font-weight:600">Drop student documents here</div><div class="t2" style="max-width:52ch">Upload passports, transcripts, degree certificates, English test results and supporting documents.</div><span class="btn primary" style="margin-top:10px">Choose files</span><div class="muted" style="font-size:12px;margin-top:6px">PDF · JPG · PNG · HEIC · up to 20 MB each</div></div>
<div class="stack">
  <div class="overline">Uploaded · 3 files · 4 pages</div>
  <div class="card compact"><div class="row" style="gap:14px">{thumb(True)}<div style="flex:1;min-width:0"><div class="value">passport-01.jpg</div><div class="muted" style="font-size:12px">1.2 MB · 1 page</div></div>{pill("ok", "check", "Processed")}<span style="width:140px">Passport</span>{pill("ok", "dot", "High confidence")}<span class="icbtn sm">{ic("more", 14)}</span></div></div>
  <div class="card compact"><div class="row" style="gap:14px">{thumb()}<div style="flex:1;min-width:0"><div class="value">transcript.pdf</div><div class="muted" style="font-size:12px">640 KB · 2 pages</div></div>{pill("ok", "check", "Processed")}<span style="width:140px">Transcript</span>{pill("ok", "dot", "High confidence")}<span class="icbtn sm">{ic("more", 14)}</span></div></div>
  <div class="card compact stripe warn"><div class="row" style="gap:14px">{thumb(True)}<div style="flex:1;min-width:0"><div class="value">IMG_2291.heic</div><div class="muted" style="font-size:12px">3.4 MB · 1 page</div></div>{pill("ok", "check", "Processed")}<span style="width:140px">Needs classification</span>{pill("warn", "tri", "Low confidence")}<span class="icbtn sm">{ic("more", 14)}</span></div><div class="row" style="margin-top:8px;color:var(--warning-text);font-size:13px">{ic("tri", 13)}Confirm this document's type in the next step.</div></div>
  <div class="card compact"><div class="row" style="gap:14px"><div style="opacity:.5">{thumb()}</div><div style="flex:1;min-width:0"><div class="value">degree-cert.pdf</div><div class="muted" style="font-size:12px">Uploading · 62%</div><div class="bar" style="margin-top:6px;width:320px"><i style="width:62%"></i></div></div><span class="icbtn sm">{ic("x", 14)}</span></div></div>
</div>"""
    actions = f'<span class="btn secondary">Save draft</span><span class="btn primary disabled">Continue to classify</span>'
    return shell("New intake", crumb("Cases", "New case"), body, actions)

# ------------------------------------------------------------------ Screen 3 · Classify
def classify():
    def card(thumbs, detected, band, reason, select, buttons, warn=False, note=""):
        cls = "card compact stripe warn" if warn else "card compact"
        return (f'<div class="{cls}"><div class="row" style="align-items:flex-start;gap:14px"><div class="row" style="gap:4px">{thumbs}</div>'
                f'<div><div class="label">Detected{" · 2 pages grouped" if "grouped" in reason else ""}</div><div class="value" style="font-size:15px">{detected}</div><div style="margin-top:4px">{band}</div><div class="muted" style="font-size:12px;margin-top:4px">{reason}</div>{note}</div></div>'
                f'<div class="row" style="justify-content:space-between;margin-top:14px">{select}<span class="row">{buttons}</span></div></div>')
    sel = lambda t, warn=False: f'<span class="select" style="height:36px;min-width:200px;justify-content:space-between{";border-color:var(--warning)" if warn else ""}">{t}{ic("chevd", 12)}</span>'
    warn_note = f'<div class="row" style="color:var(--warning-text);font-size:13px;margin-top:6px">{ic("tri", 13)}Please confirm this document type.</div>'
    body = f"""
<div class="pagehead"><div><h1 class="h1">Confirm document types</h1><div class="sub">5 pages · 4 documents · <span style="color:var(--warning-text)">1 needs confirmation</span></div></div>{stepper(2)}</div>
<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px">
{card(thumb(True), "Passport", pill("ok", "dot", "High confidence"), "MRZ lines and bio-data page layout", sel("Passport"), '<span class="btn primary sm">Confirm</span>')}
{card(thumb() + thumb(), "Transcript", pill("ok", "dot", "High confidence"), "2 pages grouped · p.2 marked as continuation (“page 2 of 2”)", sel("Transcript"), '<span class="btn secondary sm">Split pages</span><span class="btn primary sm">Confirm</span>')}
{card(thumb(), "Degree certificate", pill("ok", "dot", "High confidence"), "Seal, conferral wording, single page", sel("Degree certificate"), '<span class="btn primary sm">Confirm</span>')}
{card(thumb(True), "English test?", pill("warn", "tri", "Low confidence"), "Score table visible, header cropped", sel("Select type", True), '<span class="btn secondary sm">Mark as Other</span><span class="btn primary sm disabled">Confirm</span>', True, warn_note)}
</div>
<div class="card compact" style="border-style:dashed"><div class="row" style="gap:12px"><span class="overline">Required document types</span><span class="row" style="gap:6px">{pill("info", "dot", "Passport · detected")}{pill("info", "dot", "Transcript · detected")}{pill("info", "dot", "Degree certificate · detected")}{pill("neutral", "pending", "English test · unconfirmed")}</span></div></div>"""
    actions = f'<span class="btn secondary">Back</span><span class="btn primary disabled">Continue to review</span>'
    return shell("New intake", crumb("Cases", "#0413", "Classify"), body, actions)

# ------------------------------------------------------------------ Screen 4 · Document review
def review():
    page = f"""<div class="page" style="text-align:center">
<div style="width:56px;height:56px;border-radius:999px;border:2px solid var(--border-strong);margin:0 auto 14px"></div>
<div style="font-weight:700;letter-spacing:.08em;color:var(--text)">CHULALONGKORN UNIVERSITY</div>
<div style="font-size:11px;letter-spacing:.12em;margin-bottom:22px">BY AUTHORITY OF THE UNIVERSITY COUNCIL</div>
<div>hereby confers upon</div>
<div style="font-size:15px;color:var(--text);margin:6px 0"><span class="hl">SUWANNA JAROENSUK</span></div>
<div>the degree of</div>
<div style="font-size:14px;color:var(--text);margin:6px 0">Bachelor of Business Administration</div>
<div>in Business Administration</div>
<div style="margin-top:14px">with all the rights, privileges and honours thereunto appertaining.</div>
<div style="margin-top:18px">Given at Bangkok on <span class="hl">12/05/2569</span></div>
<div style="display:flex;justify-content:space-between;margin-top:34px;font-size:10px;color:var(--muted)"><span>President</span><span>Registrar</span></div></div>"""
    left = f"""
<div style="display:flex;flex-direction:column;min-width:0">
  <div class="viewerbar"><span><b style="font-weight:600">Degree certificate</b> <span class="muted">· page 1 of 1</span></span><span class="row" style="gap:6px"><span class="icbtn sm">{ic("zoomout", 14)}</span><span class="mono">100%</span><span class="icbtn sm">{ic("zoomin", 14)}</span><span class="icbtn sm" style="width:auto;padding:0 8px;font-size:12px;gap:6px">{ic("fit", 14)}Fit width</span><span class="icbtn sm">{ic("rotate", 14)}</span><span class="icbtn sm">{ic("chevl", 14)}</span><span class="icbtn sm">{ic("chev", 14)}</span></span></div>
  <div class="viewer" style="height:640px">{page}</div>
  <div class="pagestrip"><div class="thumb" style="border-color:var(--primary);outline:2px solid var(--primary-soft);position:relative"><i></i><i style="width:70%"></i><i></i><span style="position:absolute;right:-4px;top:-4px;width:9px;height:9px;border-radius:999px;background:var(--warning);border:2px solid #fff"></span></div><span class="muted" style="font-size:12px;margin-left:6px">Dot marks a page with unconfirmed fields</span></div>
</div>"""
    right = f"""
<div class="stack" style="min-width:0">
  <div><h2 class="h2">Review extracted information</h2><div class="row" style="margin-top:4px;gap:10px"><span class="t2">Document: Degree certificate</span>{pill("warn", "tri", "Needs review")}<span class="muted">1 of 5 confirmed</span></div></div>
  <div class="card compact" style="background:var(--surface-2)"><div class="row" style="justify-content:space-between"><span class="row">{pill("ok", "dot", "High confidence")}<span class="muted">2 fields</span></span><span class="btn primary sm">Confirm 2 fields</span></div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px"><div class="field" style="padding:8px 10px"><div class="label">Qualification</div><div class="value" style="font-size:13px">Bachelor of Business Administration</div></div><div class="field" style="padding:8px 10px"><div class="label">Field of study</div><div class="value" style="font-size:13px">Business Administration</div></div></div></div>
  <div class="field stripe err"><div class="head"><span class="label">Date conferred</span>{chip("extracted", "dotted", "Extracted")}</div><div class="value" style="font-size:15px">12 May 2026</div><div class="meta">{pill("err", "trif", "Needs confirmation")}<span>p.1</span></div>
    <div class="note"><div class="row" style="color:var(--info-text);font-weight:600;font-size:13px">{ic("info", 14)}Buddhist Era date detected</div><div class="pair"><div class="box"><div class="label">Printed</div><div class="value mono">12/05/2569</div></div><div class="box"><div class="label">Converted</div><div class="value">12 May 2026 <span class="mono muted" style="font-weight:400">2026-05-12</span></div></div></div><div class="row" style="margin-top:8px"><span class="btn primary sm">Confirm conversion</span><span class="btn secondary sm">Edit</span></div></div>
    <div class="actions"><span class="btn secondary sm">{ic("camera", 14)}Request new photo</span><span class="btn external sm">{ic("doc", 14)}Request new document</span></div></div>
  <div class="field stripe warn"><div class="head"><span class="label">Name (as printed)</span>{chip("extracted", "dotted", "Extracted")}</div><div class="value" style="font-size:15px">SUWANNA JAROENSUK</div><div class="meta">{pill("warn", "tri", "Review recommended")}<span>p.1 · matches passport</span></div><div class="actions"><span class="btn primary sm">Confirm</span><span class="btn secondary sm">Edit</span></div></div>
  <div class="field stripe info"><div class="head"><span class="label">Institution name</span>{chip("edited", "pencil", "Edited by reviewer")}</div><div class="value" style="font-size:15px">Chulalongkorn University</div><div class="muted" style="font-size:12px;margin-top:2px">Extracted: Chulalongkorn Univeristy</div><div class="meta">{pill("warn", "tri", "Review recommended")}<span>p.1 · Ploy K., 4 min ago</span></div></div>
  <div class="row muted" style="font-size:12px;gap:6px;padding:4px 2px">{ic("chev", 12)}Document contained instruction-like text (ignored)</div>
</div>"""
    tabs = f'<div class="tabs"><span class="tab">{ic("check", 14)}Passport</span><span class="tab">{ic("check", 14)}Transcript</span><span class="tab on">Degree certificate<span class="count">4 left</span></span><span class="tab">{ic("check", 14)}IELTS</span></div>'
    body = f'{tabs}<div style="display:grid;grid-template-columns:58fr 42fr;gap:24px;align-items:start">{left}{right}</div>'
    actions = f'<span class="btn secondary">{ic("chevl", 14)}Transcript</span><span class="btn secondary">IELTS{ic("chev", 14)}</span><span class="btn primary disabled">Finish review</span>'
    return shell("New intake", crumb("Cases", "#0413", "Review", "Degree certificate"), body, actions, collapsed=True)

# ------------------------------------------------------------------ Screen 5 · Case overview
def overview_body():
    return f"""
<div class="pagehead"><div><div class="row" style="gap:12px"><h1 class="h1 display">Case #0413</h1>{pill("err", "block", "Blocked")}</div><div class="sub">SUWANNA JAROENSUK · Jul 2028 intake · Submission target 30 Jun 2028 · Assigned to Ploy K.</div></div>{stepper(3)}</div>
<div style="display:grid;grid-template-columns:64fr 36fr;gap:24px;align-items:start">
<div class="stack" style="gap:24px;min-width:0">
  <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px">
    <div class="card compact"><div class="label">Documents</div><div class="value" style="font-size:15px;margin-top:2px">4 / 4 uploaded</div><div style="margin-top:6px">{seg(4)}</div></div>
    <div class="card compact stripe warn"><div class="label">Review</div><div class="value" style="font-size:15px;margin-top:2px">3 / 4 confirmed</div><div style="margin-top:6px">{seg(3)}</div></div>
    <div class="card compact stripe err"><div class="label">Checks</div><div class="value" style="font-size:15px;margin-top:2px">1 blocked · 1 warning · 1 pending</div><div class="muted" style="font-size:12px;margin-top:6px">Re-runs when review completes</div></div>
  </div>
  <div class="tbl"><div class="row" style="padding:12px 16px;border-bottom:1px solid var(--border)"><span class="h2">Documents</span></div><table><tbody>
    <tr><td class="value">Passport</td><td class="muted">1 page</td><td>{pill("ok", "check", "Reviewed")}</td><td class="muted">Ploy K. · 2 h ago</td><td style="text-align:right">{ic("chev", 14)}</td></tr>
    <tr><td class="value">Transcript</td><td class="muted">2 pages</td><td>{pill("ok", "check", "Reviewed")}</td><td class="muted">Ploy K. · 1 h ago</td><td style="text-align:right">{ic("chev", 14)}</td></tr>
    <tr><td class="value">Degree certificate</td><td class="muted">1 page</td><td>{pill("warn", "tri", "Needs review")}</td><td class="muted">4 of 5 fields left</td><td style="text-align:right"><span class="btn primary sm">Review</span></td></tr>
    <tr><td class="value">IELTS</td><td class="muted">1 page</td><td>{pill("ok", "check", "Reviewed")}</td><td class="muted">Ploy K. · 40 min ago</td><td style="text-align:right">{ic("chev", 14)}</td></tr>
  </tbody></table></div>
  <div class="stack" style="gap:10px">
    <div class="row" style="justify-content:space-between"><span class="h2">Consistency checks</span><span class="muted mono">block-v1 · last run 12 min ago</span></div>
    <div class="card compact stripe ok"><div class="row">{pill("ok", "check", "Passed")}<span class="value">Date of birth matches on every document</span></div><div class="t2" style="margin-top:4px">Matches on every document. <span class="mono muted">R2 · Passport, Transcript, IELTS</span></div></div>
    <div class="card compact stripe warn"><div class="row">{pill("warn", "tri", "Warning")}<span class="value">Name variation detected</span></div><div class="t2" style="margin-top:4px">Transcript spelling differs from the passport in a way seen in Thai romanisation. A person must confirm it is the same student.</div>
      <div class="pair"><div class="box"><div class="label">Passport · authoritative</div><div class="value">SUWANNA JAROENSUK</div></div><div class="box"><div class="label">Transcript</div><div class="value">SU<u>V</u>ANNA JAROENSUK</div></div></div>
      <div class="row" style="margin-top:10px"><span class="btn primary sm">Confirm same person</span><span class="btn external sm">{ic("doc", 14)}Request reissued transcript</span><span class="btn ghost sm">Compare documents</span><span class="spacer"></span><span class="mono muted">R1</span></div></div>
    <div class="card compact stripe err"><div class="row">{pill("err", "block", "Blocked")}<span class="value">English test expires before the submission target</span></div><div class="t2" style="margin-top:4px">The IELTS result is valid for 2 years from the test date.</div>
      <div class="pair"><div class="box"><div class="label">Test expiry</div><div class="value">14 Mar 2028</div></div><div class="box"><div class="label">Submission target</div><div class="value">30 Jun 2028</div></div></div>
      <div class="row" style="margin-top:10px"><span class="btn primary sm">Request new English test</span><span class="btn secondary sm">Change submission target</span><span class="spacer"></span><span class="mono muted">R5 · IELTS</span></div></div>
    <div class="card compact stripe"><div class="row">{pill("neutral", "pending", "Pending")}<span class="value">Graduation date agrees between transcript and certificate</span></div><div class="t2" style="margin-top:4px">Waiting for the degree certificate to be reviewed. <span class="mono muted">R3</span></div></div>
    <div class="card compact stripe ok"><div class="row">{pill("ok", "check", "Passed")}<span class="value">Passport covers the end of the course</span></div><div class="t2" style="margin-top:4px">Covers the course with a 6-month buffer. <span class="mono muted">R4 · Passport</span></div></div>
  </div>
</div>
<div class="verdict stack" style="gap:16px">
  <div class="card stripe err"><div class="overline">Case verdict</div><div class="row" style="gap:8px;margin-top:6px;color:var(--error)">{ic("block", 20)}<span style="font-size:18px;font-weight:600;color:var(--error-text)">Blocked</span></div><div class="t2" style="margin:6px 0 12px">1 blocking issue must be resolved before this case can be submitted.</div>
    <div class="field"><div class="value">English test expires before submission target</div><div class="muted" style="font-size:12px;margin-top:2px">IELTS expires 14 Mar 2028; target is 30 Jun 2028.</div><span class="btn primary sm" style="margin-top:10px">View issue</span></div>
    <div class="overline" style="margin-top:16px">Also outstanding</div>
    <div class="stack" style="gap:4px;margin-top:6px;font-size:13px"><span class="row" style="color:var(--warning-text)">{ic("tri", 13)}Name variation needs confirmation (R1)</span><span class="row" style="color:var(--warning-text)">{ic("tri", 13)}Degree certificate: 4 fields to confirm</span><span class="row muted">{ic("pending", 13)}R3 waits on the degree certificate</span></div></div>
  <div class="card"><div class="overline">Activity</div><div class="stack" style="gap:8px;margin-top:8px;font-size:13px"><div><span class="muted">12 min ago</span> · Checks re-run (block-v1)</div><div><span class="muted">40 min ago</span> · Ploy K. confirmed IELTS (6 fields)</div><div><span class="muted">2 h ago</span> · Ploy K. edited Passport · Date of birth</div><div><span class="muted">Yesterday</span> · Somchai P. uploaded 4 files</div></div></div>
</div>
</div>"""

def overview(extra_css=""):
    actions = f'<span class="btn secondary">{ic("spark", 14)}Ask assistant</span><span class="btn secondary">Continue review</span><span class="icbtn">{ic("more", 16)}</span><span class="btn primary">View issue</span>'
    return shell("Cases", crumb("Cases", "#0413"), overview_body(), actions, extra_css=extra_css)

# ------------------------------------------------------------------ Screen 6 · Assistant
def assistant():
    body = f"""
<div class="pagehead"><div><h1 class="h1">Case Assistant</h1><div class="sub">Ask questions about this case. Answers cite the case record; actions that contact a student need your approval.</div></div><span class="chip" style="height:28px;padding:0 10px;font-size:13px">#0413 · S. Jaroensuk · {pill("err", "block", "Blocked")}</span></div>
<div class="card" style="max-width:800px;display:flex;flex-direction:column;gap:14px;min-height:700px">
  <div class="row" style="flex-wrap:wrap;gap:8px"><span class="btn secondary sm">Why is this case blocked?</span><span class="btn secondary sm">Which documents still need review?</span><span class="btn secondary sm">Does the student's name match?</span><span class="btn secondary sm">What needs to happen before submission?</span></div>
  <div class="msg user">เคส 0413 ทำไมยังยื่นไม่ได้ แล้วต้องทำอะไรบ้าง</div>
  <div class="msg ai"><div class="overline" style="margin-bottom:6px">Assistant · reads case record only</div>Case #0413 is blocked by one check and has two items waiting on a person.<div style="margin-top:10px"><b>Blocking:</b> the IELTS result expires before the submission target.</div><div class="src"><span class="mono muted">R5 · English test still valid on the submission date · IELTS</span><span class="row" style="gap:16px"><span><span class="label">Test expiry</span> <span class="value">14 Mar 2028</span></span><span><span class="label">Submission target</span> <span class="value">30 Jun 2028</span></span><a href="#">Open check</a></span></div><div style="margin-top:10px"><b>Waiting on a reviewer:</b> name variation on the transcript (R1) and 4 fields on the degree certificate.</div><div style="margin-top:10px">To move forward, the student needs a new English test result, or the submission target must change. I can draft a message to the student requesting a new IELTS result.</div></div>
  <div class="approval"><div class="row overline" style="color:var(--warning-text)">{ic("tri", 13)}Approval required · external action</div><div class="value" style="margin-top:4px;font-size:15px">Draft message: request a new IELTS result</div><div class="muted" style="font-size:12px">To: student (via agency email) · Tool: <span class="mono">send_student_message</span></div><div class="draft">Dear Suwanna, your IELTS result dated 14 Mar 2026 will expire before the planned submission date. Please book a new test and send us the result as soon as it is available.</div><div class="row"><span class="btn primary sm">Review action</span><span class="btn secondary sm">Edit draft</span><span class="btn ghost sm">Discard</span></div><div class="muted" style="font-size:12px;margin-top:8px">Nothing is sent until a person approves. The approval is recorded with your name.</div></div>
  <div class="msg user">What are the chances the visa gets approved?</div>
  <div class="msg ai" style="border-style:dashed"><div class="overline" style="margin-bottom:6px">Assistant · outside scope</div>I can't estimate visa outcomes. This tool checks whether documents are complete and consistent. For advice on the application itself, please speak with a licensed migration agent.<div style="margin-top:10px"><span class="btn secondary sm">Escalate to licensed agent</span></div></div>
  <div class="spacer"></div>
  <div class="composer"><span style="flex:1">Ask about this case, in Thai or English</span><span class="btn primary sm">{ic("send", 14)}Send</span></div>
</div>"""
    actions = '<span class="btn secondary">Open case</span>'
    return shell("Assistant", crumb("Assistant", "#0413"), body, actions, user=("Somchai P.", "Sales", "SP"))

# ------------------------------------------------------------------ Screen 7 · Review queue
def queue():
    rows = [
        ("#0398", "M. Phongsri", "muted", "pending", "Degree certificate not received", "", "—", "—", "3 d", "color:var(--error-text)", "Unassigned", "secondary", "Request"),
        ("#0401", "T. Wongsawat", "err", "block", "Passport expires before course ends", "R4", "Passport", "—", "2 d", "color:var(--error-text)", "Ploy K.", "secondary", "View issue"),
        ("#0409", "K. Boonmee", "muted", "pending", "English test not received", "", "—", "—", "1 d", "color:var(--error-text)", "Somchai P.", "secondary", "Request"),
        ("#0407", "A. Chaiyaporn", "warn", "tri", "Document type unconfirmed", "", "IMG_1180.heic", pill("warn", "tri", "Low"), "3 h", "", "Ploy K.", "primary", "Review"),
        ("#0413", "S. Jaroensuk", "err", "block", "English test expires before submission target", "R5", "IELTS", "—", "12 min", "", "Ploy K.", "secondary", "View issue"),
        ("#0413", "S. Jaroensuk", "warn", "tri", "Name variation needs confirmation", "R1", "Transcript vs Passport", "—", "12 min", "", "Ploy K.", "primary", "Review"),
        ("#0413", "S. Jaroensuk", "err", "trif", "Low-confidence conferral date", "", "Degree certificate · p.1", pill("err", "trif", "Low"), "12 min", "", "Ploy K.", "primary", "Review"),
    ]
    color = {"err": "var(--error)", "warn": "var(--warning)", "muted": "var(--muted)"}
    trs = "".join(
        f'<tr><td><span style="display:inline-block;width:16px;height:16px;border:1px solid var(--border-strong);border-radius:4px"></span></td><td class="mono">{cid}</td><td>{st}</td><td><span class="row" style="gap:8px"><span style="color:{color[tone]}">{ic(icon, 14)}</span>{issue}{" <span class=\"mono muted\">" + rule + "</span>" if rule else ""}</span></td><td class="muted">{doc}</td><td>{conf}</td><td style="{wstyle}">{wait}</td><td class="{"muted" if asg == "Unassigned" else ""}">{asg}</td><td style="text-align:right"><span class="btn {btn} sm">{act}</span></td></tr>'
        for cid, st, tone, icon, issue, rule, doc, conf, wait, wstyle, asg, btn, act in rows)
    body = f"""
<div class="pagehead"><div><h1 class="h1">Review queue</h1><div class="sub">Items waiting for a person. Oldest first.</div></div><span class="row"><span class="select" style="height:36px">Assignee: Anyone {ic("chevd", 12)}</span><span class="select" style="height:36px">Mine only</span></span></div>
<div class="tabs"><span class="tab on">All<span class="count">27</span></span><span class="tab">High priority<span class="count">4</span></span><span class="tab">Low confidence<span class="count">11</span></span><span class="tab">Missing documents<span class="count">6</span></span><span class="tab">Blocked<span class="count">9</span></span></div>
<div class="tbl"><table><thead><tr><th style="width:40px"></th><th>Case</th><th>Student</th><th>Issue</th><th>Document</th><th>Confidence</th><th>Waiting</th><th>Assigned reviewer</th><th></th></tr></thead><tbody>{trs}</tbody></table>
<div class="pager"><span class="row" style="gap:14px"><span><kbd class="mono">↑↓</kbd> move</span><span><kbd class="mono">Enter</kbd> open</span><span><kbd class="mono">A</kbd> assign to me</span><span><kbd class="mono">1–5</kbd> switch tab</span></span><span>Showing 7 of 27</span></div></div>"""
    actions = '<span class="btn secondary">Assign 3 to me</span>'
    return shell("Review queue", crumb("Review queue"), body, actions)

# ------------------------------------------------------------------ write
files = {
    "Main.dc.html": cases(),
    "NewCase.dc.html": newcase(),
    "Classify.dc.html": classify(),
    "DocumentReview.dc.html": review(),
    "CaseOverview.dc.html": overview(),
    "Assistant.dc.html": assistant(),
    "ReviewQueue.dc.html": queue(),
    "DirectionB.dc.html": overview(CSS_B),
    "DirectionC.dc.html": overview(CSS_C),
}
for name, html in files.items():
    (HERE / name).write_text(html, encoding="utf-8")

W, H, GX, GY = 1440, 900, 120, 200
row1 = ["Main.dc.html", "NewCase.dc.html", "Classify.dc.html", "DocumentReview.dc.html"]
row2 = ["CaseOverview.dc.html", "Assistant.dc.html", "ReviewQueue.dc.html"]
row3 = ["DirectionB.dc.html", "DirectionC.dc.html"]
titles = {"Main.dc.html": "1 · Cases", "NewCase.dc.html": "2 · New case · Upload", "Classify.dc.html": "3 · Classification review",
          "DocumentReview.dc.html": "4 · Document review", "CaseOverview.dc.html": "5 · Case overview (Direction A · Ledger)",
          "Assistant.dc.html": "6 · Case assistant", "ReviewQueue.dc.html": "7 · Review queue",
          "DirectionB.dc.html": "Alt · Case overview in Direction B · Registry", "DirectionC.dc.html": "Alt · Case overview in Direction C · Clinic"}
# Chat card fills its taller frame; the sticky verdict column needs the overview root to be as tall as the frame.

heights = {"CaseOverview.dc.html": 1320, "DirectionB.dc.html": 1320, "DirectionC.dc.html": 1380, "DocumentReview.dc.html": 1120, "Assistant.dc.html": 1120}
artboards = []
y = 0
for row in (row1, row2, row3):
    x = 0
    rowh = max(heights.get(f, H) for f in row)
    for f in row:
        artboards.append({"file": f, "title": titles[f], "x": x, "y": y, "w": W, "h": heights.get(f, H)})
        x += W + GX
    y += rowh + GY
canvas = {
    "artboards": artboards,
    "annotations": [
        {"id": "note-directions", "x": 0, "y": y - GY - heights["DirectionB.dc.html"] - 130, "w": 520,
         "text": "Alternates for comparison only. Same Case overview screen restyled.\nB · Registry: dark navy sidebar, 4px radius, monospace verdicts, denser rows.\nC · Clinic: light-blue ground, borderless 12px cards, tinted status fills, 15px body.\nDirection A (recommended) is every screen in the rows above."},
        {"id": "note-review", "x": 3 * (W + GX), "y": -130, "w": 480,
         "text": "Document review: sidebar collapses to 64px on this route. Left 58% viewer, right 42% fields. The only batch action is the high-confidence group; medium and low fields confirm one by one."},
    ],
    "launch": {"view": "canvas"},
}
(HERE / "canvas.json").write_text(json.dumps(canvas, indent=2), encoding="utf-8")
print("wrote", len(files), "artboards + canvas.json")
