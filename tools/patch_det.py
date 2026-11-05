# destacamentos con puntos también en el formulario de revisión (se ejecuta desde build_index.py)
for k in ("me", "opp"):
    rep(f'<div class="field"><label for="{k}Det">Destacamento</label><input id="{k}Det" placeholder="Opcional"></div>',
        f'<div class="field"><label for="{k}DetBtn">Destacamentos</label><input type="hidden" id="{k}Det"><button type="button" class="det-btn form-det" id="{k}DetBtn" data-form="{k}" aria-haspopup="true">Elegir…</button></div>')
rep("""  const id = btn.dataset.gid, k = btn.dataset.k, g = games.find(x => x.id === id); if(!g) return;
  const army = g[k].army, all = DETACHMENTS[army] || [];
  let sel = detList(g[k]).filter(n => all.some(d => d[0] === n));""",
"""  const form = btn.dataset.form, id = btn.dataset.gid, k = form || btn.dataset.k, g = form ? null : games.find(x => x.id === id); if(!form && !g) return;
  const army = form ? ARMY_MATCH($("#"+k+"Army").value) : g[k].army, all = DETACHMENTS[army] || [];
  if(form && !all.length){ toast(army ? "No tengo destacamentos para ese ejército" : "Elige primero el ejército"); return; }
  let sel = detList(form ? { detachment: $("#"+k+"Det").value } : g[k]).filter(n => all.some(d => d[0] === n));""")
rep("""  detPop._commit = () => { const v = sel.join(" + "); if(v !== before) editGame(id, x => { x[k].detachment = v; }, "Destacamentos guardados"); };""",
"""  detPop._commit = () => { const v = sel.join(" + "); if(v === before) return;
    if(form){ $("#"+k+"Det").value = v; if(draft) draft[k].detachment = v; refreshFormDet(); }
    else editGame(id, x => { x[k].detachment = v; }, "Destacamentos guardados"); };""")
rep("""function renderHistory(){""", """const ARMY_MATCH = v => ARMIES.find(a => a.toLowerCase() === String(v||"").trim().toLowerCase()) || String(v||"").trim();
function refreshFormDet(){
  for(const k of ["me","opp"]){ const b = $("#"+k+"DetBtn"); if(!b) continue;
    const army = ARMY_MATCH($("#"+k+"Army").value), all = DETACHMENTS[army] || [];
    const list = detList({ detachment: $("#"+k+"Det").value }).filter(n => all.some(d => d[0] === n));
    if(all.length && list.join(" + ") !== $("#"+k+"Det").value){ $("#"+k+"Det").value = list.join(" + "); if(draft) draft[k].detachment = $("#"+k+"Det").value; }
    const used = list.reduce((a,n)=>a+detCost(army,n),0);
    b.innerHTML = !all.length ? `<span class="muted">${army ? "Sin lista para este ejército" : "Elige antes el ejército"}</span>` : (list.length ? esc(list.join(" + ")) : "Elegir…") + ` <span class="det-pts">${used}/${DET_BUDGET}</span>`;
  }
}
document.addEventListener("click", e => { const b = e.target.closest(".form-det"); if(b){ e.stopPropagation(); openDetPop(b); } });
document.addEventListener("input", e => { if(e.target.id === "meArmy" || e.target.id === "oppArmy") refreshFormDet(); });
function renderHistory(){""")
rep('  setStep(2); window.scrollTo({top:0}); renderArmySug();\n}', '  setStep(2); window.scrollTo({top:0}); renderArmySug(); refreshFormDet();\n}')
