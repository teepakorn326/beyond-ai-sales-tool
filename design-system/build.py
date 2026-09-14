"""Builds the Visa Document Checker design-system bundle for Claude Design.

Each preview is a standalone HTML file whose first line is a @dsCard marker;
the Design System pane groups cards by that marker. Tokens are inlined so
every card renders on its own.
"""
from pathlib import Path

OUT = Path(__file__).parent / "design-system"
OUT.mkdir(exist_ok=True)

TOKENS = """
:root{
  --primary:#2563EB;--primary-hover:#1D4ED8;--primary-soft:#DBEAFE;--surface-blue:#EFF6FF;
  --bg:#F8FAFC;--surface-2:#F1F5F9;--card:#FFFFFF;
  --text:#0F172A;--text-2:#475569;--muted:#64748B;--border:#E2E8F0;--border-strong:#CBD5E1;
  --success:#16A34A;--success-soft:#DCFCE7;--success-text:#166534;
  --warning:#D97706;--warning-soft:#FEF3C7;--warning-text:#92400E;
  --error:#DC2626;--error-soft:#FEE2E2;--error-text:#991B1B;
  --info:#2563EB;--info-soft:#DBEAFE;--info-text:#1E40AF;
  --radius-sm:6px;--radius:8px;--radius-lg:12px;
  --shadow-1:0 1px 2px rgba(15,23,42,.06);--shadow-2:0 8px 24px rgba(15,23,42,.12);
  --font:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--bg);color:var(--text);font:14px/20px var(--font);font-feature-settings:"cv11","ss01";}
h1,h2,h3{margin:0;letter-spacing:-.01em}
.stack{display:flex;flex-direction:column;gap:16px}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.caption{font-size:12px;color:var(--muted);margin-top:4px}
.overline{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.label{font-size:12px;font-weight:500;color:var(--muted)}
.value{font-size:14px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums}
.mono{font-family:var(--mono);font-size:12.5px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px 20px}
.card.compact{padding:12px 16px;border-radius:var(--radius)}
.stripe{border-left:3px solid var(--border-strong)}
.stripe.ok{border-left-color:var(--success)}.stripe.warn{border-left-color:var(--warning)}.stripe.err{border-left-color:var(--error)}.stripe.info{border-left-color:var(--primary)}
/* Button */
.btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:var(--radius);font:500 14px/1 var(--font);border:1px solid transparent;cursor:pointer;transition:background-color 120ms ease-out,border-color 120ms ease-out}
.btn:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.btn-primary{background:var(--primary);color:#fff}.btn-primary:hover{background:var(--primary-hover)}
.btn-secondary{background:var(--card);color:var(--text);border-color:var(--border-strong)}.btn-secondary:hover{background:var(--surface-2)}
.btn-ghost{background:transparent;color:var(--text-2)}.btn-ghost:hover{background:var(--surface-2)}
.btn-external{background:var(--card);color:var(--text);border:1px dashed var(--border-strong)}.btn-external:hover{border-color:var(--text-2)}
.btn-danger{background:var(--error);color:#fff}
.btn-sm{height:32px;padding:0 10px;font-size:13px}.btn-lg{height:40px;padding:0 18px}
.btn[disabled]{opacity:.5;cursor:not-allowed}
/* Pill / StatusBadge */
.pill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:500;white-space:nowrap;border:1px solid transparent}
.pill-ok{background:var(--success-soft);color:var(--success-text)}
.pill-warn{background:var(--warning-soft);color:var(--warning-text)}
.pill-err{background:var(--error-soft);color:var(--error-text)}
.pill-info{background:var(--info-soft);color:var(--info-text)}
.pill-neutral{background:var(--surface-2);color:var(--text-2);border-color:var(--border)}
/* ProvenanceChip */
.chip{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 6px;border-radius:4px;font-size:11.5px;color:var(--muted);border:1px solid var(--border);background:var(--card)}
.chip-confirmed{color:var(--success-text);border-color:var(--success)}
.chip-edited{color:var(--info-text);border-color:var(--primary)}
/* Field */
.field{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px}
.field .head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.field .meta{display:flex;gap:8px;align-items:center;margin-top:6px;font-size:12px;color:var(--muted)}
.field .actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.original{font-size:12px;color:var(--muted);margin-top:4px}
input.inline{height:32px;border:1px solid var(--primary);border-radius:var(--radius-sm);padding:0 10px;font:600 14px var(--font);color:var(--text);width:100%}
/* Note */
.note{border:1px solid var(--primary);background:var(--surface-blue);border-radius:var(--radius);padding:10px 12px;margin-top:8px}
.note .title{color:var(--info-text);font-weight:600;font-size:13px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
.pair .box{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px}
/* Table */
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card)}
th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600;background:var(--surface-2);text-align:left;padding:10px 12px;border-bottom:1px solid var(--border)}
td{padding:0 12px;height:44px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums;vertical-align:middle}
tr:hover td{background:var(--bg)}
.tbl{border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
/* Sidebar / nav */
.sidebar{width:240px;height:520px;background:var(--card);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:16px 12px;gap:2px}
.sidebar .brand{display:flex;align-items:center;gap:8px;font-weight:600;padding:4px 8px 16px}
.sidebar .brand i{width:22px;height:22px;border-radius:6px;background:var(--primary);display:inline-block}
.nav{display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;border-radius:var(--radius-sm);color:var(--text-2);font-weight:500;text-decoration:none}
.nav:hover{background:var(--surface-2);color:var(--text)}
.nav.active{background:var(--primary-soft);color:var(--info-text)}
.nav .ic{width:18px;height:18px;border:1.5px solid currentColor;border-radius:4px;opacity:.8}
.sidebar .foot{margin-top:auto;border-top:1px solid var(--border);padding-top:12px;display:flex;gap:10px;align-items:center}
.avatar{width:28px;height:28px;border-radius:999px;background:var(--primary-soft);color:var(--info-text);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:600}
.topbar{height:56px;background:var(--card);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;padding:0 24px}
.crumb{color:var(--muted)}.crumb b{color:var(--text);font-weight:500}
.search{flex:0 1 360px;height:36px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);display:flex;align-items:center;padding:0 12px;color:var(--muted);gap:8px}
.search kbd{margin-left:auto;font:11px var(--mono);border:1px solid var(--border);border-radius:4px;padding:1px 5px;background:var(--card)}
/* Stepper */
.stepper{display:flex;align-items:center;gap:8px}
.step{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 10px 0 4px;border-radius:999px;border:1px solid var(--border);font-size:13px;color:var(--text-2);background:var(--card)}
.step .n{width:20px;height:20px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;background:var(--surface-2);color:var(--muted)}
.step.done{border-color:transparent;background:var(--success-soft);color:var(--success-text)}.step.done .n{background:var(--success);color:#fff}
.step.current{border-color:var(--primary);color:var(--info-text);background:var(--surface-blue)}.step.current .n{background:var(--primary);color:#fff}
.stepper .sep{width:16px;height:1px;background:var(--border-strong)}
/* Metric */
.metric{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px 18px;box-shadow:var(--shadow-1);min-width:180px}
.metric .num{font-size:28px;line-height:32px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:4px}
/* Dropzone */
.dropzone{border:2px dashed var(--primary);background:var(--surface-blue);border-radius:var(--radius-lg);padding:36px 24px;text-align:center}
.dropzone h3{font-size:16px;font-weight:600}
.dropzone p{color:var(--text-2);margin:6px auto 14px;max-width:52ch}
/* Toast */
.toast{display:inline-flex;align-items:center;gap:10px;background:var(--text);color:#fff;border-radius:var(--radius);padding:10px 14px;box-shadow:var(--shadow-2);font-size:14px}
.toast .dot{width:8px;height:8px;border-radius:999px}
.toast a{color:#93C5FD;margin-left:8px;font-weight:500}
/* Dialog */
.dialog{width:440px;background:var(--card);border-radius:var(--radius-lg);box-shadow:var(--shadow-2);border:1px solid var(--border);padding:20px 24px}
.dialog h3{font-size:16px;font-weight:600}
.dialog p{color:var(--text-2);margin:8px 0 16px}
.dialog .foot{display:flex;justify-content:flex-end;gap:8px}
/* Message */
.msg{max-width:560px;border-radius:var(--radius);padding:10px 14px;font-size:15px;line-height:22px}
.msg-user{background:var(--surface-blue);border:1px solid var(--primary-soft);margin-left:auto}
.msg-ai{background:var(--card);border:1px solid var(--border)}
.src{display:inline-block;border:1px solid var(--border);background:var(--surface-2);border-radius:var(--radius-sm);padding:8px 10px;font-size:13px;margin-top:8px}
.src .rule{font:500 12px var(--mono);color:var(--muted)}
.approval{border:1px solid var(--warning);background:var(--card);border-radius:var(--radius);padding:12px 14px;max-width:560px}
.approval .draft{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);padding:8px 10px;font-style:italic;color:var(--text-2);margin:8px 0}
.empty{text-align:center;padding:48px 24px;border:1px dashed var(--border-strong);border-radius:var(--radius-lg);background:var(--card)}
.empty .ico{width:40px;height:40px;border-radius:10px;background:var(--surface-2);margin:0 auto 12px}
.thumb{width:40px;height:52px;background:var(--surface-2);border:1px solid var(--border-strong);border-radius:3px;flex:none}
.viewer-bar{display:flex;justify-content:space-between;align-items:center;height:40px;padding:0 12px;border:1px solid var(--border);border-bottom:0;border-radius:var(--radius) var(--radius) 0 0;background:var(--card);font-size:13px}
.viewer{background:var(--surface-2);border:1px solid var(--border);border-radius:0 0 var(--radius) var(--radius);height:260px;display:flex;align-items:center;justify-content:center}
.page{width:180px;height:230px;background:var(--card);border:1px solid var(--border-strong);box-shadow:var(--shadow-2);padding:12px;font-size:9px;color:var(--muted);line-height:1.5}
.hl{background:var(--primary-soft);outline:1px solid var(--primary);border-radius:2px;color:var(--info-text);padding:0 2px}
.ic-btn{width:28px;height:28px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card);display:inline-flex;align-items:center;justify-content:center;color:var(--text-2)}
"""

FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">'

I = {  # inline SVG icons, 12px, currentColor, so status never relies on colour alone
    "check": '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    "tri": '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"><path d="M12 3 2 21h20L12 3z"/></svg>',
    "tri-fill": '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 2 21h20L12 3z"/></svg>',
    "block": '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>',
    "pending": '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 3v9h9" fill="currentColor" stroke="none"/></svg>',
    "dot": '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>',
    "dotted": '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="3 3"><circle cx="12" cy="12" r="9"/></svg>',
    "pencil": '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M17 3l4 4L7 21H3v-4L17 3z"/></svg>',
    "mail": '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    "camera": '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3"/></svg>',
    "doc": '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5"/></svg>',
    "info": '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
}

def pill(kind, icon, text):
    return f'<span class="pill pill-{kind}">{I[icon]}{text}</span>'

def chip(kind, icon, text):
    cls = {"extracted": "", "confirmed": " chip-confirmed", "edited": " chip-edited"}[kind]
    return f'<span class="chip{cls}">{I[icon]}{text}</span>'

def page(group, name, subtitle, width, body, extra_css=""):
    return (f'<!-- @dsCard group="{group}" name="{name}" subtitle="{subtitle}" width="{width}" -->\n'
            f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{name}</title>{FONTS}'
            f'<style>{TOKENS}{extra_css}</style></head><body>{body}</body></html>')

files: dict[str, str] = {}

# ---------------------------------------------------------------- foundations
sw = lambda name, var, hexv, use: f'<div class="row" style="gap:12px"><span style="width:44px;height:32px;border-radius:6px;background:{hexv};border:1px solid rgba(15,23,42,.1)"></span><div><div class="value">{name}</div><div class="caption"><span class="mono">{var} · {hexv}</span> · {use}</div></div></div>'
files["foundations/colors.html"] = page("Foundations", "Colors", "Slate neutrals, blue for action, semantic for status", 720, f"""
<div class="stack">
<div><div class="overline">Action</div>{sw('Primary','--primary','#2563EB','buttons, links, active nav, selection, progress, focus')}{sw('Primary hover','--primary-hover','#1D4ED8','hover / pressed')}{sw('Primary soft','--primary-soft','#DBEAFE','selected row, active nav bg, info pill')}{sw('Surface blue','--surface-blue','#EFF6FF','dropzone, viewer highlight, user message')}</div>
<div><div class="overline">Surfaces</div>{sw('App background','--bg','#F8FAFC','page ground')}{sw('Surface 2','--surface-2','#F1F5F9','table header, viewer canvas, chips')}{sw('Card','--card','#FFFFFF','cards, panels, sidebar')}</div>
<div><div class="overline">Text and lines</div>{sw('Text','--text','#0F172A','primary text, values')}{sw('Text 2','--text-2','#475569','explanations')}{sw('Muted','--muted','#64748B','labels, meta (14px+ only)')}{sw('Border','--border','#E2E8F0','all hairlines')}{sw('Border strong','--border-strong','#CBD5E1','inputs, hover')}</div>
<div><div class="overline">Semantic (never the only carrier of meaning)</div>{sw('Success','--success / -soft / -text','#16A34A · #DCFCE7 · #166534','pass, ready, confirmed')}{sw('Warning','--warning / -soft / -text','#D97706 · #FEF3C7 · #92400E','warn, needs review, medium band')}{sw('Error','--error / -soft / -text','#DC2626 · #FEE2E2 · #991B1B','block, unreadable, destructive')}{sw('Info','--info / -soft / -text','#2563EB · #DBEAFE · #1E40AF','system notes (BE date, normalised date)')}</div>
<p class="caption">Pill text always uses the dark shade on the soft background (≥7:1). Mid-tone semantic colours are never used as text below 18px.</p>
</div>""")

files["foundations/typography.html"] = page("Foundations", "Typography", "Inter, tabular numerals, IBM Plex Mono for IDs", 720, """
<div class="stack" style="gap:0">
<div class="row" style="padding:10px 0;border-bottom:1px dashed var(--border)"><span class="mono" style="width:190px;color:var(--muted)">display 24/32 600</span><span style="font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.02em">Case #0413</span></div>
<div class="row" style="padding:10px 0;border-bottom:1px dashed var(--border)"><span class="mono" style="width:190px;color:var(--muted)">h1 20/28 600</span><span style="font-size:20px;line-height:28px;font-weight:600">Review extracted information</span></div>
<div class="row" style="padding:10px 0;border-bottom:1px dashed var(--border)"><span class="mono" style="width:190px;color:var(--muted)">h2 16/24 600</span><span style="font-size:16px;line-height:24px;font-weight:600">Consistency checks</span></div>
<div class="row" style="padding:10px 0;border-bottom:1px dashed var(--border)"><span class="mono" style="width:190px;color:var(--muted)">body 14/20 400</span><span>Possible romanisation variation detected. A person must confirm.</span></div>
<div class="row" style="padding:10px 0;border-bottom:1px dashed var(--border)"><span class="mono" style="width:190px;color:var(--muted)">body-lg 15/22 400</span><span style="font-size:15px;line-height:22px">Used in assistant messages and long explanations.</span></div>
<div class="row" style="padding:10px 0;border-bottom:1px dashed var(--border)"><span class="mono" style="width:190px;color:var(--muted)">value 14/20 600 tnum</span><span class="value">SUWANNA JAROENSUK · 14 Mar 2028</span></div>
<div class="row" style="padding:10px 0;border-bottom:1px dashed var(--border)"><span class="mono" style="width:190px;color:var(--muted)">label 12/16 500</span><span class="label">Date of birth</span></div>
<div class="row" style="padding:10px 0;border-bottom:1px dashed var(--border)"><span class="mono" style="width:190px;color:var(--muted)">overline 11/16 600 +6%</span><span class="overline">Documents involved</span></div>
<div class="row" style="padding:10px 0"><span class="mono" style="width:190px;color:var(--muted)">mono 12.5/18</span><span class="mono">R5 · block-v1 · 2026-03-15</span></div>
</div>""")

files["foundations/spacing-radius-elevation.html"] = page("Foundations", "Spacing, radius, elevation", "4-based scale, 6/8/12 radius, two shadow levels", 720, """
<div class="stack">
<div><div class="overline">Spacing</div><div class="row" style="align-items:flex-end;margin-top:8px">""" + "".join(f'<div style="text-align:center"><div style="width:{s}px;height:{s}px;background:var(--primary-soft);border:1px solid var(--primary)"></div><div class="caption">{s}</div></div>' for s in (4,8,12,16,20,24,32,48)) + """</div></div>
<div><div class="overline">Radius</div><div class="row" style="margin-top:8px"><div style="width:72px;height:48px;border:1px solid var(--border-strong);border-radius:6px;background:var(--card)"></div><span class="caption">6 inputs, chips</span><div style="width:72px;height:48px;border:1px solid var(--border-strong);border-radius:8px;background:var(--card)"></div><span class="caption">8 buttons, cards, tables</span><div style="width:72px;height:48px;border:1px solid var(--border-strong);border-radius:12px;background:var(--card)"></div><span class="caption">12 panels, verdict, dropzone</span><div style="width:72px;height:24px;border:1px solid var(--border-strong);border-radius:999px;background:var(--card)"></div><span class="caption">999 pills</span></div></div>
<div><div class="overline">Elevation</div><div class="row" style="margin-top:8px"><div style="width:140px;height:72px;border:1px solid var(--border);border-radius:8px;background:var(--card)"></div><span class="caption">0 · border only (95% of surfaces)</span><div style="width:140px;height:72px;border:1px solid var(--border);border-radius:8px;background:var(--card);box-shadow:var(--shadow-1)"></div><span class="caption">1 · cards on app bg</span><div style="width:140px;height:72px;border:1px solid var(--border);border-radius:8px;background:var(--card);box-shadow:var(--shadow-2)"></div><span class="caption">2 · popovers, dialog</span></div></div>
<div><div class="overline">Focus</div><div class="row" style="margin-top:8px"><button class="btn btn-secondary" style="outline:2px solid var(--primary);outline-offset:2px">Focused control</button><span class="caption">2px primary ring, 2px offset, never removed · 120ms colour transitions · reduced-motion respected</span></div></div>
</div>""")

# ---------------------------------------------------------------- components
files["components/button.html"] = page("Actions", "Button", "Primary / secondary / ghost / external (dashed) / danger · sm, md, lg · disabled", 640, f"""
<div class="stack">
<div class="row"><button class="btn btn-primary">+ New case</button><button class="btn btn-secondary">Open</button><button class="btn btn-ghost">Compare documents</button><button class="btn btn-external">{I['doc']}Request new document</button><button class="btn btn-danger">Delete case</button></div>
<div class="row"><button class="btn btn-primary btn-sm">Confirm</button><button class="btn btn-primary">Confirm 4 fields</button><button class="btn btn-primary btn-lg">Continue to review</button><button class="btn btn-primary" disabled>Finish review</button></div>
<div class="row"><button class="btn btn-secondary">{I['camera']}Request new photo</button><button class="btn btn-external">{I['doc']}Request new document</button><span class="caption">The two request actions are deliberately different: new photo is internal-ish; new document leaves the building and opens the confirmation dialog.</span></div>
<p class="caption">Blue means "you can act here". It is never used to convey status. Labels say exactly what happens; never "OK" or "Submit".</p>
</div>""")

files["components/status-badge.html"] = page("Status", "StatusBadge", "Case status, rule verdict, document review state · icon + label + colour", 640, f"""
<div class="stack">
<div><div class="overline">Case status</div><div class="row" style="margin-top:6px">{pill('ok','check','Ready')}{pill('warn','tri','Needs review')}{pill('neutral','pending','Pending documents')}{pill('err','block','Blocked')}</div></div>
<div><div class="overline">Rule verdict (pass / warn / block + pending status)</div><div class="row" style="margin-top:6px">{pill('ok','check','Passed')}{pill('warn','tri','Warning')}{pill('err','block','Blocked')}{pill('neutral','pending','Pending')}</div><p class="caption">Pending is never green. Warn is never green.</p></div>
<div><div class="overline">Document review state</div><div class="row" style="margin-top:6px">{pill('info','dotted','Extracting…')}{pill('warn','tri','Needs review')}{pill('ok','check','Reviewed')}{pill('neutral','mail','Requested from student')}</div></div>
<div><div class="overline">Upload processing</div><div class="row" style="margin-top:6px">{pill('info','dotted','Uploading')}{pill('info','dotted','Processing')}{pill('ok','check','Processed')}{pill('err','block','Failed')}</div></div>
</div>""")

files["components/confidence-badge.html"] = page("Status", "ConfidenceBadge", "high / medium / low / unreadable bands, with the action each implies", 640, f"""
<div class="stack">
<div class="row">{pill('ok','dot','High confidence')}<span class="caption">may be confirmed in the high-confidence batch</span></div>
<div class="row">{pill('warn','tri','Review recommended')}<span class="caption">medium band · confirm individually</span></div>
<div class="row">{pill('err','tri-fill','Needs confirmation')}<span class="caption">low band · confirm individually, card expanded by default</span></div>
<div class="row">{pill('err','block','Unable to read')}<span class="caption">manual entry, new photo or new document</span></div>
<div class="row"><span class="pill pill-ok">{I['dot']}High confidence <span style="opacity:.7">· 98%</span></span><span class="caption">optional numeric suffix, only if the pipeline emits a score</span></div>
<p class="caption">The schema emits a band, not a number. Rows of coloured bars are not used anywhere.</p>
</div>""")

files["components/provenance-chip.html"] = page("Status", "ProvenanceChip", "Extracted · Reviewer confirmed · Edited by reviewer", 640, f"""
<div class="stack">
<div class="row">{chip('extracted','dotted','Extracted')}<span class="caption">model output, not yet trusted, lives in extracted_json</span></div>
<div class="row">{chip('confirmed','check','Reviewer confirmed')}<span class="caption">value now in confirmed_json; only this reaches the rules</span></div>
<div class="row">{chip('edited','pencil','Edited by reviewer')}<span class="caption">value changed; original extracted value stays visible beneath</span></div>
<div class="row"><span class="chip">{I['check']}Present · not stored</span><span class="caption">for passport_number_present / report_number_present</span></div>
</div>""")

files["components/metric-card.html"] = page("Data display", "MetricCard", "Neutral / ok / warn / err tone via left stripe · clickable filter", 760, """
<div class="row" style="align-items:stretch">
<div class="metric"><div class="label">Total cases</div><div class="num">128</div><div class="caption">across 3 intakes</div></div>
<div class="metric stripe ok"><div class="label">Ready to submit</div><div class="num">41</div><div class="caption">+6 this week</div></div>
<div class="metric stripe warn"><div class="label">Needs review</div><div class="num">63</div><div class="caption">11 low confidence</div></div>
<div class="metric stripe err"><div class="label">Blocked</div><div class="num">9</div><div class="caption">6 English test validity</div></div>
</div><p class="caption">Clicking a card applies its status filter to the table below. Big numbers only on the dashboard.</p>""")

files["components/case-table.html"] = page("Data display", "CaseTable", "44px rows, initial + surname, 4-segment review bar, status pill, state-dependent row action", 900, f"""
<div class="tbl"><table>
<tr><th>Case</th><th>Student</th><th>Intake</th><th>Documents</th><th>Review</th><th>Status</th><th>Last updated</th><th></th></tr>
<tr><td class="mono">#0413</td><td>S. Jaroensuk</td><td>Feb 2027</td><td>4 / 4</td><td><span style="letter-spacing:2px;color:var(--primary)">▮▮▮</span><span style="letter-spacing:2px;color:var(--border-strong)">▮</span> 3/4</td><td>{pill('warn','tri','Needs review')}</td><td>12 min ago</td><td><button class="btn btn-secondary btn-sm">Continue review</button></td></tr>
<tr><td class="mono">#0412</td><td>N. Srisuwan</td><td>Feb 2027</td><td>4 / 4</td><td><span style="letter-spacing:2px;color:var(--primary)">▮▮▮▮</span> 4/4</td><td>{pill('ok','check','Ready')}</td><td>1 h ago</td><td><button class="btn btn-secondary btn-sm">Open</button></td></tr>
<tr><td class="mono">#0409</td><td>K. Boonmee</td><td>Jul 2027</td><td>3 / 4</td><td><span style="letter-spacing:2px;color:var(--primary)">▮▮</span><span style="letter-spacing:2px;color:var(--border-strong)">▮▮</span> 2/3</td><td>{pill('neutral','pending','Pending documents')}</td><td>Yesterday</td><td><button class="btn btn-secondary btn-sm">Open</button></td></tr>
<tr><td class="mono">#0401</td><td>T. Wongsawat</td><td>Feb 2027</td><td>4 / 4</td><td><span style="letter-spacing:2px;color:var(--primary)">▮▮▮▮</span> 4/4</td><td>{pill('err','block','Blocked')}</td><td>2 d ago</td><td><button class="btn btn-secondary btn-sm">View issue</button></td></tr>
</table></div>""")

files["components/queue-row.html"] = page("Data display", "QueueTable row", "One row per issue; verdict icon in the issue cell; waiting time turns amber at 4h, red at 1d", 900, f"""
<div class="tbl"><table>
<tr><th style="width:32px"></th><th>Case</th><th>Student</th><th>Issue</th><th>Document</th><th>Confidence</th><th>Waiting</th><th>Assignee</th><th></th></tr>
<tr><td><input type="checkbox" id="q1"></td><td class="mono">#0413</td><td>S. Jaroensuk</td><td><span style="color:var(--error)">{I['tri-fill']}</span> Low-confidence graduation date</td><td>Transcript · p.2</td><td>{pill('err','tri-fill','Low')}</td><td>12 min</td><td class="caption">Unassigned</td><td><button class="btn btn-primary btn-sm">Review</button></td></tr>
<tr><td><input type="checkbox" id="q2"></td><td class="mono">#0413</td><td>S. Jaroensuk</td><td><span style="color:var(--warning)">{I['tri']}</span> Name variation needs confirmation <span class="mono" style="color:var(--muted)">R1</span></td><td>Transcript vs Passport</td><td>—</td><td>12 min</td><td class="caption">Unassigned</td><td><button class="btn btn-primary btn-sm">Review</button></td></tr>
<tr><td><input type="checkbox" id="q3"></td><td class="mono">#0409</td><td>K. Boonmee</td><td><span style="color:var(--muted)">{I['pending']}</span> English test not received</td><td>—</td><td>—</td><td style="color:var(--warning-text)">1 d</td><td>Somchai P.</td><td><button class="btn btn-secondary btn-sm">Request</button></td></tr>
<tr><td><input type="checkbox" id="q4"></td><td class="mono">#0401</td><td>T. Wongsawat</td><td><span style="color:var(--error)">{I['block']}</span> Passport expires before course ends <span class="mono" style="color:var(--muted)">R4</span></td><td>Passport</td><td>—</td><td style="color:var(--error-text)">2 d</td><td>Ploy K.</td><td><button class="btn btn-secondary btn-sm">View issue</button></td></tr>
</table></div><p class="caption">Keyboard: ↑↓ move · Enter open · A assign to me · 1–5 switch tab.</p>""")

files["components/review-field-card.html"] = page("Review", "ReviewFieldCard", "Confirmed / medium / low / unreadable / edited / inline-edit states", 520, f"""
<div class="stack">
<div class="field stripe ok"><div class="head"><span class="label">Student name (as printed)</span>{chip('confirmed','check','Reviewer confirmed')}</div><div class="value">SUVANNA JAROENSUK</div><div class="meta">{pill('ok','dot','High confidence')}<span>p.1</span></div></div>
<div class="field stripe warn"><div class="head"><span class="label">GPA</span>{chip('extracted','dotted','Extracted')}</div><div class="value">3.42 <span style="font-weight:400;color:var(--muted)">/ 4.00</span></div><div class="meta">{pill('warn','tri','Review recommended')}<span>p.1</span></div><div class="actions"><button class="btn btn-primary btn-sm">Confirm</button><button class="btn btn-secondary btn-sm">Edit</button></div></div>
<div class="field stripe err"><div class="head"><span class="label">Institution name</span>{chip('extracted','dotted','Extracted')}</div><div class="meta" style="margin-top:2px">{pill('err','block','Unable to read')}<span>p.1</span></div><input class="inline" id="f-inst" placeholder="Type the value as printed" style="margin-top:8px"><div class="actions"><button class="btn btn-primary btn-sm">Save</button><button class="btn btn-secondary btn-sm">{I['camera']}Request new photo</button><button class="btn btn-external btn-sm">{I['doc']}Request new document</button></div></div>
<div class="field stripe info"><div class="head"><span class="label">Date of birth</span>{chip('edited','pencil','Edited by reviewer')}</div><div class="value">4 Jul 2004</div><div class="original">Extracted: 4 Jul 2547 · BE year not converted</div><div class="meta">{pill('err','tri-fill','Needs confirmation')}<span>p.1</span></div></div>
<div class="field stripe warn"><div class="head"><span class="label">Major</span>{chip('extracted','dotted','Extracted')}</div><input class="inline" id="f-major" value="Business Administration"><div class="actions"><button class="btn btn-primary btn-sm">Save</button><button class="btn btn-ghost btn-sm">Cancel</button></div><div class="original">Editing in place · Enter saves, Esc cancels</div></div>
</div>""")

files["components/high-confidence-group.html"] = page("Review", "HighConfidenceGroup", "The only batch action in the product: Confirm N fields", 520, f"""
<div class="card compact" style="background:var(--surface-2)"><div class="row" style="justify-content:space-between"><span class="row" style="gap:8px">{pill('ok','dot','High confidence')}<span class="caption">3 fields</span></span><button class="btn btn-primary btn-sm">Confirm 3 fields</button></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><div class="field"><div class="label">Institution</div><div class="value">Chulalongkorn University</div></div><div class="field"><div class="label">Major</div><div class="value">Business Administration</div></div><div class="field"><div class="label">Qualification</div><div class="value">Bachelor of Business Administration</div></div></div></div>
<p class="caption">Medium and low fields never appear in this group and never get a batch action. There is no "Confirm all".</p>""")

files["components/date-conversion-note.html"] = page("Review", "DateConversionNote", "Buddhist Era conversion and month-only normalisation · printed value never hidden", 520, f"""
<div class="stack">
<div class="note"><div class="title">{I['info']} Buddhist Era date detected</div><div class="pair"><div class="box"><div class="label">Printed</div><div class="value mono">15/03/2569</div></div><div class="box"><div class="label">Converted</div><div class="value">15 Mar 2026 <span class="mono" style="font-weight:400;color:var(--muted)">2026-03-15</span></div></div></div><div class="row" style="margin-top:8px"><button class="btn btn-primary btn-sm">Confirm conversion</button><button class="btn btn-secondary btn-sm">Edit</button></div></div>
<div class="note"><div class="title">{I['info']} Date normalised by system</div><div class="pair"><div class="box"><div class="label">Printed</div><div class="value">March 2026</div></div><div class="box"><div class="label">Normalised</div><div class="value mono">2026-03-01</div><div class="caption">day filled by system</div></div></div><div class="row" style="margin-top:8px"><button class="btn btn-primary btn-sm">Confirm</button><button class="btn btn-secondary btn-sm">Edit</button></div></div>
</div>""")

files["components/rule-check-card.html"] = page("Checks", "RuleCheckCard", "Pass / Warning / Blocked / Pending · explanation first, rule ID last, evidence inline", 640, f"""
<div class="stack">
<div class="card compact stripe ok"><div class="row" style="gap:8px">{pill('ok','check','Passed')}<span class="value">Date of birth matches on every document</span></div><div style="color:var(--text-2);margin-top:4px">Matches on every document. <span class="mono" style="color:var(--muted)">R2 · Passport, Transcript, IELTS</span></div></div>
<div class="card compact stripe warn"><div class="row" style="gap:8px">{pill('warn','tri','Warning')}<span class="value">Name variation detected</span></div><div style="color:var(--text-2);margin-top:4px">Transcript spelling differs from the passport in a way seen in Thai romanisation. A person must confirm it is the same student.</div>
<div class="pair"><div class="box"><div class="label">Passport · authoritative</div><div class="value">SUWANNA JAROENSUK</div></div><div class="box"><div class="label">Transcript</div><div class="value">SU<u>V</u>ANNA JAROENSUK</div></div></div>
<div class="row" style="margin-top:10px"><button class="btn btn-primary btn-sm">Confirm same person</button><button class="btn btn-external btn-sm">{I['doc']}Request reissued transcript</button><button class="btn btn-ghost btn-sm">Compare documents</button><span class="mono" style="color:var(--muted);margin-left:auto">R1</span></div></div>
<div class="card compact stripe err"><div class="row" style="gap:8px">{pill('err','block','Blocked')}<span class="value">English test expires before the submission target</span></div><div style="color:var(--text-2);margin-top:4px">The IELTS result is valid for 2 years from the test date.</div>
<div class="pair"><div class="box"><div class="label">Test expiry</div><div class="value">14 Mar 2028</div></div><div class="box"><div class="label">Submission target</div><div class="value">30 Jun 2028</div></div></div>
<div class="row" style="margin-top:10px"><button class="btn btn-primary btn-sm">Request new English test</button><button class="btn btn-secondary btn-sm">Change submission target</button><span class="mono" style="color:var(--muted);margin-left:auto">R5 · IELTS</span></div></div>
<div class="card compact stripe"><div class="row" style="gap:8px">{pill('neutral','pending','Pending')}<span class="value">Graduation date agrees between transcript and certificate</span></div><div style="color:var(--text-2);margin-top:4px">Waiting for the degree certificate to be reviewed. <span class="mono" style="color:var(--muted)">R3</span></div></div>
<div class="card compact stripe err"><div class="row" style="gap:8px">{pill('err','block','Blocked')}<span class="value">Date of birth differs by exactly 543 years</span></div><div style="color:var(--text-2);margin-top:4px">This is a Buddhist-era conversion issue at extraction, not a conflict between documents. Re-extract the transcript; do not request a new document.</div><div class="row" style="margin-top:10px"><button class="btn btn-primary btn-sm">Re-extract transcript</button><span class="mono" style="color:var(--muted);margin-left:auto">R2</span></div></div>
</div>""")

files["components/verdict-card.html"] = page("Checks", "VerdictCard", "Ready / Needs review / Blocked · always states the next action", 460, f"""
<div class="stack">
<div class="card stripe ok"><div class="overline">Case verdict</div><div class="row" style="gap:8px;margin-top:4px"><span style="color:var(--success)">{I['check']}</span><span style="font-size:18px;font-weight:600;color:var(--success-text)">Ready to submit</span></div><p style="color:var(--text-2);margin:6px 0 12px">All 4 documents have been reviewed and all blocking checks passed.</p><button class="btn btn-primary">Mark ready for submission</button><div class="caption" style="margin-top:8px">Ruleset block-v1 · checked 2 min ago</div></div>
<div class="card stripe warn"><div class="overline">Case verdict</div><div class="row" style="gap:8px;margin-top:4px"><span style="color:var(--warning)">{I['tri']}</span><span style="font-size:18px;font-weight:600;color:var(--warning-text)">Needs review</span></div><p style="color:var(--text-2);margin:6px 0 12px">2 items require confirmation before validation can continue.</p><div class="field"><div class="value">Name variation on the transcript</div><div class="caption">Confirm same person or request a reissued transcript.</div></div><div class="field" style="margin-top:8px"><div class="value">Degree certificate · 2 fields to confirm</div></div><button class="btn btn-primary" style="margin-top:12px">Continue review</button></div>
<div class="card stripe err"><div class="overline">Case verdict</div><div class="row" style="gap:8px;margin-top:4px"><span style="color:var(--error)">{I['block']}</span><span style="font-size:18px;font-weight:600;color:var(--error-text)">Blocked</span></div><p style="color:var(--text-2);margin:6px 0 12px">1 blocking issue must be resolved before this case can be submitted.</p><div class="field"><div class="value">English test expires before submission target</div><div class="caption">IELTS expires 14 Mar 2028; target is 30 Jun 2028.</div><button class="btn btn-primary btn-sm" style="margin-top:8px">View issue</button></div><div class="overline" style="margin-top:14px">Also outstanding</div><div class="caption">{I['tri']} Name variation needs confirmation (R1)<br>{I['pending']} R3 waits on the degree certificate</div></div>
</div>""")

files["components/source-evidence.html"] = page("Assistant", "SourceEvidence", "Rule ID, label, document, the two values that matter, link to the check", 520, f"""
<div class="src"><div class="rule">R5 · English test still valid on the submission date · IELTS</div><div class="row" style="gap:16px;margin-top:4px"><span><span class="label">Test expiry</span> <span class="value">14 Mar 2028</span></span><span><span class="label">Submission target</span> <span class="value">30 Jun 2028</span></span><a href="#" style="color:var(--primary);font-weight:500">Open check</a></div></div>
<br><div class="src"><div class="rule">Transcript · p.2 · Graduation date</div><div class="row" style="gap:16px;margin-top:4px"><span><span class="label">Printed</span> <span class="value mono">15/03/2569</span></span><span><span class="label">Confirmed</span> <span class="value">15 Mar 2026</span></span><span class="chip chip-confirmed">{I['check']}Reviewer confirmed</span><a href="#" style="color:var(--primary);font-weight:500">Open field</a></div></div>""")

files["components/assistant-message.html"] = page("Assistant", "AssistantThread messages", "User (Thai or English) · Assistant with overline · Guardrail response", 640, f"""
<div class="stack">
<div class="msg msg-user">เคส 0413 ทำไมยังยื่นไม่ได้ แล้วต้องทำอะไรบ้าง</div>
<div class="msg msg-ai"><div class="overline" style="margin-bottom:4px">Assistant · reads case record only</div>Case #0413 is blocked by one check and has two items waiting on a person.<br><br><b>Blocking:</b> the IELTS result expires before the submission target.<div class="src"><div class="rule">R5 · English test still valid on the submission date · IELTS</div><span class="label">Test expiry</span> <span class="value">14 Mar 2028</span> &nbsp; <span class="label">Submission target</span> <span class="value">30 Jun 2028</span></div><br>To move forward, the student needs a new English test result, or the submission target must change.</div>
<div class="msg msg-user">What are the chances the visa gets approved?</div>
<div class="msg msg-ai" style="border-style:dashed"><div class="overline" style="margin-bottom:4px">Assistant · outside scope</div>I can't estimate visa outcomes. This tool checks whether documents are complete and consistent. For advice on the application itself, please speak with a licensed migration agent. <button class="btn btn-secondary btn-sm" style="margin-top:8px">Escalate to licensed agent</button></div>
<div class="row"><button class="btn btn-secondary btn-sm">Why is this case blocked?</button><button class="btn btn-secondary btn-sm">Which documents still need review?</button><button class="btn btn-secondary btn-sm">Does the student's name match?</button></div>
</div>""")

files["components/approval-card.html"] = page("Assistant", "ApprovalCard", "External-risk action proposed by the assistant · nothing sends without a person", 600, f"""
<div class="approval"><div class="overline" style="color:var(--warning-text)">{I['tri']} Approval required · external action</div><div class="value" style="margin-top:4px">Draft message: request a new IELTS result</div><div class="caption">To: student (via agency email) · Tool: <span class="mono">send_student_message</span></div>
<div class="draft">Dear Suwanna, your IELTS result dated 14 Mar 2026 will expire before the planned submission date. Please book a new test and send us the result…</div>
<div class="row"><button class="btn btn-primary btn-sm">Review action</button><button class="btn btn-secondary btn-sm">Edit draft</button><button class="btn btn-ghost btn-sm">Discard</button></div>
<div class="caption" style="margin-top:8px">Nothing is sent until a person approves. The approval is recorded with your name.</div></div>""")

files["components/progress-stepper.html"] = page("Navigation", "ProgressStepper", "Upload → Classify → Review → Validate · done / current / upcoming", 640, """
<div class="stack">
<div class="stepper"><span class="step done"><span class="n">✓</span>Upload</span><span class="sep"></span><span class="step done"><span class="n">✓</span>Classify</span><span class="sep"></span><span class="step current"><span class="n">3</span>Review</span><span class="sep"></span><span class="step"><span class="n">4</span>Validate</span></div>
<div class="stepper"><span class="step current"><span class="n">1</span>Upload</span><span class="sep"></span><span class="step"><span class="n">2</span>Classify</span><span class="sep"></span><span class="step"><span class="n">3</span>Review</span><span class="sep"></span><span class="step"><span class="n">4</span>Validate</span></div>
<p class="caption">Each step is a link when reachable. The stepper is a real navigation control for the four routes under a case.</p>
</div>""")

files["components/app-sidebar.html"] = page("Navigation", "AppSidebar", "240px, white, active item in soft blue · user, role and menu at the bottom", 300, """
<div class="sidebar"><div class="brand"><i></i>Doc Checker</div>
<a class="nav" href="#"><span class="ic"></span>Cases</a><a class="nav" href="#"><span class="ic"></span>New intake</a><a class="nav active" href="#"><span class="ic"></span>Review queue</a><a class="nav" href="#"><span class="ic"></span>Assistant</a><a class="nav" href="#"><span class="ic"></span>System</a><a class="nav" href="#"><span class="ic"></span>Settings</a>
<div class="foot"><span class="avatar">PK</span><div><div class="value" style="font-size:13px">Ploy K.</div><div class="caption" style="margin:0">Reviewer</div></div><span style="margin-left:auto;color:var(--muted)">⋯</span></div></div>""")

files["components/top-navigation.html"] = page("Navigation", "TopNavigation", "56px · breadcrumb · ⌘K search · notifications · contextual actions · avatar", 900, """
<div class="topbar"><span class="crumb">Cases › <b>#0413</b> › Review › <b>Transcript</b></span><div class="search">🔍 Search cases… <kbd>⌘K</kbd></div><span style="margin-left:auto" class="ic-btn">🔔</span><button class="btn btn-secondary btn-sm">‹ Passport</button><button class="btn btn-secondary btn-sm">Degree cert ›</button><button class="btn btn-primary btn-sm">Finish review</button><span class="avatar">PK</span></div>""")

files["components/page-header.html"] = page("Navigation", "PageHeader", "Default and case variants", 800, f"""
<div class="stack">
<div class="row" style="justify-content:space-between"><div><h1 style="font-size:20px;font-weight:600">Cases</h1><div style="color:var(--text-2)">Review and validate student applications before submission.</div></div><button class="btn btn-primary btn-lg">+ New case</button></div>
<div class="row" style="justify-content:space-between;border-top:1px solid var(--border);padding-top:16px"><div><div class="row" style="gap:10px"><h1 style="font-size:24px;font-weight:600;letter-spacing:-.02em">Case #0413</h1>{pill('warn','tri','Needs review')}</div><div style="color:var(--text-2)">SUWANNA JAROENSUK · Feb 2027 intake · Submission target 30 Jun 2028 · Assigned to Ploy K.</div></div><div class="row"><button class="btn btn-secondary">✦ Ask assistant</button><button class="btn btn-primary">Continue review</button></div></div>
</div>""")

files["components/upload-dropzone.html"] = page("Intake", "UploadDropzone + UploadRow", "Large dropzone · 56px rows with thumbnail, size, state, detected type, band, pages", 720, f"""
<div class="stack">
<div class="dropzone"><h3>Drop student documents here</h3><p>Upload passports, transcripts, degree certificates, English test results and supporting documents.</p><button class="btn btn-primary">Choose files</button><div class="caption" style="margin-top:10px">PDF · JPG · PNG · HEIC · up to 20 MB each</div></div>
<div class="card compact"><div class="row"><span class="thumb" style="width:52px;height:40px"></span><div style="flex:1"><div class="value">passport-01.jpg</div><div class="caption" style="margin:0">1.2 MB · 1 page</div></div>{pill('ok','check','Processed')}<span>Passport</span>{pill('ok','dot','High confidence')}<span class="ic-btn">⋯</span></div></div>
<div class="card compact stripe warn"><div class="row"><span class="thumb" style="width:52px;height:40px"></span><div style="flex:1"><div class="value">IMG_2291.heic</div><div class="caption" style="margin:0">3.4 MB · 1 page</div></div>{pill('ok','check','Processed')}<span>Needs classification</span>{pill('warn','tri','Low confidence')}<span class="ic-btn">⋯</span></div><div class="caption" style="color:var(--warning-text);margin-top:8px">{I['tri']} Confirm this document's type in the next step.</div></div>
<div class="card compact"><div class="row"><span class="thumb" style="width:40px;height:52px;opacity:.5"></span><div style="flex:1"><div class="value">degree-cert.pdf</div><div class="caption" style="margin:0">Uploading · 62%</div><div style="height:4px;background:var(--surface-2);border-radius:2px;margin-top:6px"><div style="width:62%;height:4px;background:var(--primary);border-radius:2px"></div></div></div><span class="ic-btn">✕</span></div></div>
</div>""")

files["components/document-card.html"] = page("Intake", "DocumentCard", "Classification review · high band pre-filled · low band requires a type · pages grouped visibly", 720, f"""
<div class="row" style="align-items:stretch">
<div class="card compact" style="flex:1"><div class="row" style="align-items:flex-start"><span class="thumb"></span><span class="thumb" style="margin-left:-6px"></span><div><div class="label">Detected · 2 pages grouped</div><div class="value">Transcript</div>{pill('ok','dot','High confidence')}<div class="caption">p.2 marked as continuation ("page 2 of 2")</div></div></div><div class="row" style="margin-top:12px;justify-content:space-between"><select id="dt1" style="height:32px;border:1px solid var(--border-strong);border-radius:6px;padding:0 8px;font:14px var(--font)"><option>Transcript</option><option>Passport</option><option>Degree certificate</option><option>English test</option><option>Other</option></select><span class="row" style="gap:6px"><button class="btn btn-secondary btn-sm">Split pages</button><button class="btn btn-primary btn-sm">Confirm</button></span></div></div>
<div class="card compact stripe warn" style="flex:1"><div class="row" style="align-items:flex-start"><span class="thumb" style="width:52px;height:40px"></span><div><div class="label">Detected</div><div class="value">English test?</div>{pill('warn','tri','Low confidence')}<div class="caption">Score table visible, header cropped</div><div class="caption" style="color:var(--warning-text)">{I['tri']} Please confirm this document type.</div></div></div><div class="row" style="margin-top:12px;justify-content:space-between"><select id="dt2" style="height:32px;border:1px solid var(--warning);border-radius:6px;padding:0 8px;font:14px var(--font)"><option>Select type…</option><option>Passport</option><option>Transcript</option><option>Degree certificate</option><option>English test</option><option>Other</option></select><span class="row" style="gap:6px"><button class="btn btn-secondary btn-sm">Mark as Other</button><button class="btn btn-primary btn-sm" disabled>Confirm</button></span></div></div>
</div>""")

files["components/document-viewer.html"] = page("Review", "DocumentViewer", "Toolbar: type, page, zoom, fit width, rotate · canvas with field highlight · page strip", 560, """
<div class="viewer-bar"><span><b style="font-weight:600">Academic transcript</b> <span class="caption" style="margin:0;display:inline">page 1 of 2</span></span><span class="row" style="gap:6px"><span class="ic-btn">−</span><span class="mono">100%</span><span class="ic-btn">+</span><span class="ic-btn" style="width:auto;padding:0 8px;font-size:12px">Fit width</span><span class="ic-btn">⟳</span><span class="ic-btn">‹</span><span class="ic-btn">›</span></span></div>
<div class="viewer"><div class="page">UNIVERSITY<br>OFFICIAL TRANSCRIPT<br><br>Name: <span class="hl">SUVANNA JAROENSUK</span><br>Date of birth: 04/07/2547<br>Major: Business Administration<br>GPA: 3.42 / 4.00<br><br>…<br>Graduated: <span class="hl">15/03/2569</span></div></div>
<div class="row" style="margin-top:8px;gap:6px"><span class="thumb" style="border-color:var(--primary);outline:2px solid var(--primary-soft)"></span><span class="thumb" style="position:relative"><i style="position:absolute;right:-3px;top:-3px;width:8px;height:8px;border-radius:999px;background:var(--warning)"></i></span><span class="caption">dot = page holds unconfirmed fields</span></div>""")

files["components/empty-state.html"] = page("Feedback", "EmptyState", "Icon, title, one-line body, one action", 520, """
<div class="empty"><div class="ico"></div><div class="value" style="font-size:15px">No cases match these filters</div><div class="caption">Clear the status filter or search by case ID or surname.</div><button class="btn btn-secondary btn-sm" style="margin-top:14px">Clear filters</button></div>
<br><div class="empty"><div class="ico"></div><div class="value" style="font-size:15px">Queue is clear</div><div class="caption">Nothing is waiting for a reviewer right now.</div></div>""")

files["components/toast.html"] = page("Feedback", "Toast", "Bottom-right, 4s, stacks to 3 · undo where reversible", 520, """
<div class="stack" style="align-items:flex-start"><div class="toast"><span class="dot" style="background:var(--success)"></span>4 fields confirmed</div><div class="toast"><span class="dot" style="background:var(--primary)"></span>Upload removed <a href="#">Undo</a></div><div class="toast"><span class="dot" style="background:var(--error)"></span>Could not save. Check your connection and try again.</div></div>""")

files["components/confirmation-dialog.html"] = page("Feedback", "ConfirmationDialog", "The only modal · destructive variant · external-send variant", 960, """
<div class="row" style="align-items:flex-start;gap:24px">
<div class="dialog"><h3>Delete case #0413?</h3><p>All 4 documents and their confirmed data will be removed. This cannot be undone.</p><label class="label" for="confirm-id">Type the case ID to confirm</label><input class="inline" id="confirm-id" placeholder="#0413" style="border-color:var(--border-strong);margin:4px 0 16px;font-weight:400"><div class="foot"><button class="btn btn-secondary">Cancel</button><button class="btn btn-danger" disabled>Delete case</button></div></div>
<div class="dialog"><h3>Send request to student?</h3><p>This message leaves the agency. It will be sent to the student's email on file and recorded on the case with your name.</p><div class="approval" style="max-width:none"><div class="caption" style="margin:0">Request new IELTS result · Tool: <span class="mono">send_student_message</span></div><div class="draft">Dear Suwanna, your IELTS result dated 14 Mar 2026 will expire before the planned submission date…</div></div><div class="foot" style="margin-top:16px"><button class="btn btn-secondary">Back to edit</button><button class="btn btn-primary">Approve and send</button></div></div>
</div>""")

files["README.md"] = """# Visa Document Checker design system

Tokens and component previews for the internal document-review tool. Direction A "Ledger":
white cards on a cool off-white ground, 1px slate hairlines, 8px radius, blue reserved for
actions and navigation, semantic colour always paired with an icon and a label.

Rules the components encode:
- Confidence is a band (high / medium / low / unreadable), never a bar.
- The only batch action is "Confirm N high-confidence fields". There is no Confirm All.
- Pending and Warn never render green.
- Printed date values are never hidden behind a conversion.
- The passport is authoritative: name conflicts resolve by confirming the person or requesting a reissued document.
- Anything that contacts a student stops at an ApprovalCard and the ConfirmationDialog.

Full spec: https://claude.ai/code/artifact/41581151-b72c-4a80-9453-e60c872f61ad
"""

files["tokens.css"] = TOKENS.strip() + "\n"

for path, content in files.items():
    p = OUT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
print(f"wrote {len(files)} files to {OUT}")
for path in sorted(files):
    print(" ", path)
