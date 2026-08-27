(function () {
  const MONTHS = ['', 'Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl',
    'August', 'September', 'Október', 'November', 'December'];

  const today = new Date();

  const state = {
    step: 1,
    day: null, // 'YYYY-MM-DD'
    capZ: 0,
    capT: 0,
    qty: {}, // product.id -> qty
    viewYear: today.getFullYear(),
    viewMonth: today.getMonth() + 1, // 1-12
  };

  let CATS = [];
  let PRODUCTS = [];
  let DAYS_BY_DATE = {}; // 'YYYY-MM-DD' -> {is_open, cap_zakusky, cap_torty, remaining_zakusky, remaining_torty}

  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDate(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }
  function euro(n) { return `${n} €`; }

  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && (data.message || data.error)) || 'Nastala chyba.');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---------- menu ----------
  async function loadMenu() {
    const data = await fetchJson('/api/menu');
    CATS = data.categories || [];
    PRODUCTS = data.products || [];
    PRODUCTS.forEach((p) => { if (state.qty[p.id] === undefined) state.qty[p.id] = 0; });

    if (data.settings) {
      if (data.settings.hero_title) document.getElementById('heroTitle').textContent = data.settings.hero_title;
      if (data.settings.hero_lead) document.getElementById('heroLead').textContent = data.settings.hero_lead;
      if (data.settings.about_text) document.getElementById('aboutText').innerHTML = data.settings.about_text;
    }

    document.getElementById('menu').innerHTML = CATS.map((c) => {
      const cards = PRODUCTS.filter((p) => p.category_id === c.id).map((p) => `
        <article class="card">
          <div class="ph"><img src="${p.image_url}" alt="${p.name} – ${p.sub}" loading="lazy"></div>
          <div class="body">
            <h4>${p.name}</h4><div class="sub">${p.sub || ''}</div>
            <div class="desc">${p.description || ''}</div>
            ${p.alt_text ? `<div class="alt">${p.alt_text}</div>` : ''}
            <div class="meta">
              <div class="price">od ${p.price} €<small> /ks</small>${p.min_label ? `<br><small>${p.min_label}</small>` : ''}</div>
              <div><span class="tag">Alergény: ${p.allergens || '—'}</span></div>
            </div>
            <div class="mctrl" id="mc-${p.id}"></div>
          </div>
        </article>`).join('');
      return `<div class="catblock"><div class="cathead"><h3>${c.name}</h3><span class="cl"></span></div>
        <p class="catnote">${c.note || ''}</p><div class="grid">${cards}</div></div>`;
    }).join('');

    renderMenuControls();
    updateCartBtn();
  }

  // ---------- calendar ----------
  async function loadDaysForView() {
    const cal = document.getElementById('cal');
    cal.innerHTML = '<p class="muted">Načítavam kalendár…</p>';
    const data = await fetchJson(`/api/days?year=${state.viewYear}&month=${state.viewMonth}`);
    DAYS_BY_DATE = {};
    (data.days || []).forEach((d) => { DAYS_BY_DATE[d.day] = d; });
    buildCal();
    updateNextFree();
    updateCartNote();
  }

  function isFreeEntry(d) {
    return d && d.is_open && (d.remaining_zakusky >= 6 || d.remaining_torty >= 1);
  }

  // Poznámka nad kalendárom: čo je v košíku a či sa vôbec niekam zmestí.
  function updateCartNote() {
    const el = document.getElementById('cartNote');
    if (!el) return;
    const n = totalItems();
    if (n === 0) { el.hidden = true; el.innerHTML = ''; return; }
    const open = Object.values(DAYS_BY_DATE).filter((d) => d.is_open);
    const anyFits = open.some((d) => cartFits(d));
    el.hidden = false;
    el.innerHTML = anyFits || !open.length
      ? `V košíku máš <b>${n} ks</b> — vyber termín, na ktorý to upečiem.`
      : `V košíku máš <b>${n} ks</b> a v tomto mesiaci sa toľko nezmestí ani na jeden termín.
         Skús iný mesiac, uber pár kúskov, alebo mi napíš a dohodneme sa.`;
  }

  function updateNextFree() {
    const el = document.getElementById('nextFree');
    const dates = Object.keys(DAYS_BY_DATE).filter((k) => isFreeEntry(DAYS_BY_DATE[k])).sort();
    if (dates.length) {
      const [y, m, d] = dates[0].split('-').map(Number);
      el.textContent = `${d}. ${m}. ${y}`;
    } else if (el.textContent === '—') {
      el.textContent = 'čoskoro';
    }
  }

  function buildCal() {
    const y = state.viewYear, m = state.viewMonth;
    const first = new Date(y, m - 1, 1);
    let sd = first.getDay(); sd = (sd === 0) ? 6 : sd - 1;
    const days = new Date(y, m, 0).getDate();
    let html = '';
    for (let i = 0; i < sd; i++) html += '<div class="cell empty"></div>';

    const isPastMonth = (y < today.getFullYear()) || (y === today.getFullYear() && m < today.getMonth() + 1);

    for (let d = 1; d <= days; d++) {
      const key = fmtDate(y, m, d);
      const entry = DAYS_BY_DATE[key];
      const dateObj = new Date(y, m - 1, d);
      const isPastDay = dateObj < new Date(today.getFullYear(), today.getMonth(), today.getDate());

      if (entry && entry.is_open && !isPastDay) {
        const free = isFreeEntry(entry);
        if (free) {
          let lines = '';
          if (entry.remaining_zakusky >= 6) lines += `<small class="kz">${entry.remaining_zakusky} ks</small>`;
          if (entry.remaining_torty >= 1) lines += `<small class="tt">${entry.remaining_torty} torta</small>`;
          const tight = totalItems() > 0 && !cartFits(entry);
          const label = tight
            ? `${d}. ${MONTHS[m]}, voľné, ale tvoj výber sa naň celý nezmestí`
            : `${d}. ${MONTHS[m]}, voľné`;
          html += `<button class="cell free${state.day === key ? ' sel' : ''}${tight ? ' tight' : ''}" data-d="${key}" onclick="DoSrdiecka.pickDay('${key}')" aria-label="${label}">
            <span class="dnum">${d}</span>${lines}</button>`;
        } else {
          html += `<div class="cell full" aria-label="${d}. ${MONTHS[m]}, plný"><span class="dnum">${d}</span><small>Plný</small></div>`;
        }
      } else {
        html += `<div class="cell" aria-label="${d}. ${MONTHS[m]}, nepečiem"><span class="dnum">${d}</span></div>`;
      }
    }
    document.getElementById('cal').innerHTML = html;
    document.getElementById('calTitle').textContent = `${MONTHS[m]} ${y}`;
    document.getElementById('prevMonth').disabled = isPastMonth ||
      (y === today.getFullYear() && m === today.getMonth() + 1);
  }

  function shiftMonth(delta) {
    let m = state.viewMonth + delta;
    let y = state.viewYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    if (y < today.getFullYear() || (y === today.getFullYear() && m < today.getMonth() + 1)) return;
    state.viewYear = y; state.viewMonth = m;
    loadDaysForView();
  }

  function pickDay(key) {
    const entry = DAYS_BY_DATE[key];
    if (!entry) return;
    state.day = key;
    state.capZ = entry.remaining_zakusky;
    state.capT = entry.remaining_torty;
    // Košík sa zámerne nemaže — zákazníčka si ho mohla naplniť už v ponuke.
    // Ak sa na zvolený deň nezmestí, povie jej to hláška v kroku 2.
    buildCal();
    const [y, m, d] = key.split('-').map(Number);
    document.getElementById('dayLabel').textContent = `${d}. ${MONTHS[m].toLowerCase()} ${y}`;
    setStep(2);
  }

  // ---------- košík v ponuke a v hlavičke ----------

  // Ovládanie pri každom výrobku v ponuke: prvý klik pridá minimum,
  // potom sa z tlačidla stane počítadlo.
  function renderMenuControls() {
    PRODUCTS.forEach((p) => {
      const box = document.getElementById('mc-' + p.id);
      if (!box) return;
      const q = state.qty[p.id] || 0;
      if (q === 0) {
        const canAdd = budget(p) >= p.min_qty;
        box.innerHTML = `<button class="btn ghost sm" ${canAdd ? '' : 'disabled'}
          onclick="DoSrdiecka.addItem('${p.id}')">Do košíka${p.min_qty > 1 ? ' · ' + p.min_qty + ' ks' : ''}</button>`
          + (canAdd ? '' : `<span class="mhint">Na zvolený termín sa už nezmestí.</span>`);
      } else {
        box.innerHTML = `<div class="stepper">
            <button onclick="DoSrdiecka.decItem('${p.id}')" aria-label="Ubrať">−</button>
            <span class="q">${q}</span>
            <button onclick="DoSrdiecka.incItem('${p.id}')" ${budget(p) >= 1 ? '' : 'disabled'} aria-label="Pridať">+</button>
          </div><span class="mhint">v košíku</span>`;
      }
    });
  }

  function updateCartBtn() {
    const btn = document.getElementById('cartBtn');
    if (!btn) return;
    const n = totalItems();
    btn.hidden = (n === 0);
    document.getElementById('cartCount').textContent = n;
  }

  // Jediné miesto, ktoré po zmene košíka zosúladí celú stránku.
  function afterCartChange() {
    renderMenuControls();
    updateCartBtn();
    updateCartNote();
    buildCal();
    if (state.step === 2) renderItems();
  }

  function goCart() {
    document.getElementById('objednavka').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (state.day) setStep(2);
  }

  // ---------- step 2 ----------
  function usedZ() { return PRODUCTS.filter((p) => p.category_id === 'zakusky').reduce((s, p) => s + state.qty[p.id], 0); }
  function usedT() { return PRODUCTS.filter((p) => p.category_id === 'torty').reduce((s, p) => s + state.qty[p.id], 0); }
  function budget(p) {
    // Kým termín nie je vybraný, košík sa napĺňa voľne — čo sa naň zmestí,
    // rozhodne až kalendár, ktorý nevyhovujúce dni označí.
    if (!state.day) return 9999;
    if (p.category_id === 'zakusky') return state.capZ - usedZ();
    if (p.category_id === 'torty') return state.capT - usedT();
    return 9999; // chlebík zatiaľ bez tvrdého stropu
  }

  // O koľko obsah košíka presahuje kapacitu vybraného dňa.
  function overZ() { return state.day ? Math.max(0, usedZ() - state.capZ) : 0; }
  function overT() { return state.day ? Math.max(0, usedT() - state.capT) : 0; }

  // Zmestí sa celý košík na daný deň?
  function cartFits(entry) {
    return entry.remaining_zakusky >= usedZ() && entry.remaining_torty >= usedT();
  }
  function totalItems() { return PRODUCTS.reduce((s, p) => s + state.qty[p.id], 0); }

  function renderItems() {
    document.getElementById('capZ').textContent = Math.max(0, state.capZ - usedZ());
    document.getElementById('capT').textContent = Math.max(0, state.capT - usedT());
    let html = '';
    CATS.forEach((c) => {
      const items = PRODUCTS.filter((p) => p.category_id === c.id);
      if (!items.length) return;
      html += `<div class="ocat">${c.name}</div>`;
      html += items.map((p) => {
        const q = state.qty[p.id], b = budget(p);
        const canAdd = (b >= p.min_qty), canPlus = (b >= 1);
        let ctrl = q === 0
          ? `<button class="btn ghost sm addbtn" ${canAdd ? '' : 'disabled'} onclick="DoSrdiecka.addItem('${p.id}')">Pridať${p.min_qty > 1 ? ' · od ' + p.min_qty + ' ks' : ''}</button>`
          : `<div class="stepper"><button onclick="DoSrdiecka.decItem('${p.id}')" aria-label="Ubrať">−</button>
             <span class="q">${q}</span><button onclick="DoSrdiecka.incItem('${p.id}')" ${canPlus ? '' : 'disabled'} aria-label="Pridať">+</button></div>`;
        let msg = '';
        if (q === 0 && !canAdd) {
          msg = p.category_id === 'torty'
            ? `<div class="cap-msg">Na tento termín je torta už obsadená — skús iný deň.</div>`
            : `<div class="cap-msg">Na tento termín sa už nezmestí (min. ${p.min_qty} ks). Skús iný deň alebo menej iných kúskov.</div>`;
        }
        return `<div class="oitem"><img class="th" src="${p.image_url}" alt="">
          <div class="info"><h5>${p.name}</h5><div class="l2">${p.sub || ''}</div>
          <div class="l3">od ${p.price} € /ks${p.min_label ? ' · ' + p.min_label : ''}</div>${msg}</div>${ctrl}</div>`;
      }).join('');
    });
    document.getElementById('orderItems').innerHTML = html;

    // Výber sa nikdy nemení sám — len povieme, čo treba ubrať.
    const warn = document.getElementById('capWarn');
    const oz = overZ(), ot = overT();
    if (warn) {
      if (oz || ot) {
        const parts = [];
        if (oz) parts.push(`<b>${oz} ks</b> zákuskov`);
        if (ot) parts.push(`<b>${ot}</b> tortu`);
        warn.hidden = false;
        warn.innerHTML = `Na tento termín sa toho zmestí menej, než máš v košíku —
          uber ${parts.join(' a ')}, alebo sa vráť a zvoľ iný termín.`;
      } else {
        warn.hidden = true;
        warn.innerHTML = '';
      }
    }
    document.getElementById('toStep3').disabled = (totalItems() === 0 || oz > 0 || ot > 0);
  }
  function addItem(id) { const p = PRODUCTS.find((x) => x.id === id); if (budget(p) >= p.min_qty) state.qty[id] = p.min_qty; afterCartChange(); }
  function incItem(id) { const p = PRODUCTS.find((x) => x.id === id); if (budget(p) >= 1) { state.qty[id]++; afterCartChange(); } }
  function decItem(id) { const p = PRODUCTS.find((x) => x.id === id); state.qty[id]--; if (state.qty[id] < p.min_qty) state.qty[id] = 0; afterCartChange(); }

  // ---------- step 3 ----------
  function renderSummary() {
    const rows = PRODUCTS.filter((p) => state.qty[p.id] > 0).map((p) => {
      const q = state.qty[p.id];
      return `<div class="sumline"><span>${p.name} — ${p.sub || ''} · ${q} ks</span><span>od ${q * p.price} €</span></div>`;
    }).join('');
    const [y, m, d] = state.day.split('-').map(Number);
    document.getElementById('sumList').innerHTML =
      `<div class="sumline" style="color:var(--peach-deep);font-weight:600"><span>Termín odberu</span><span>${d}. ${MONTHS[m].toLowerCase()} ${y}</span></div>` + rows;
    const total = PRODUCTS.reduce((s, p) => s + state.qty[p.id] * p.price, 0);
    document.getElementById('sumTotal').textContent = 'od ' + total + ' €';
  }

  function setStep(n) {
    if (n === 2 && !state.day) return;
    if (n === 3 && totalItems() === 0) return;
    state.step = n;
    [1, 2, 3].forEach((i) => {
      document.getElementById('p' + i).classList.toggle('on', i === n);
      const s = document.getElementById('s' + i);
      s.classList.toggle('on', i === n); s.classList.toggle('done', i < n);
    });
    if (n === 2) renderItems();
    if (n === 3) renderSummary();
    document.getElementById('objednavka').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function goOrder() { document.getElementById('objednavka').scrollIntoView({ behavior: 'smooth' }); }

  function showFormError(msg) {
    const el = document.getElementById('formErr');
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.textContent = msg;
    el.style.display = 'block';
  }

  async function submitOrder() {
    showFormError('');
    const name = document.getElementById('fname').value.trim();
    const phone = document.getElementById('fphone').value.trim();
    const email = document.getElementById('femail').value.trim();
    const note = document.getElementById('fnote').value.trim();

    if (!name || !phone || !email) {
      showFormError('Vyplň prosím meno, telefón a e-mail.');
      return;
    }

    const items = PRODUCTS.filter((p) => state.qty[p.id] > 0)
      .map((p) => ({ product_id: p.id, qty: state.qty[p.id] }));

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    try {
      await fetchJson('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: state.day, name, phone, email, note, items }),
      });
      document.getElementById('checkout').style.display = 'none';
      document.getElementById('success').style.display = 'block';
    } catch (err) {
      if (err.status === 409) {
        showFormError(err.message + ' Vrátim ťa na výber výrobkov, aby si mohla upraviť množstvo.');
        await loadDaysForView();
        const entry = DAYS_BY_DATE[state.day];
        if (entry) { state.capZ = entry.remaining_zakusky; state.capT = entry.remaining_torty; }
        setStep(2);
        renderItems();
      } else {
        showFormError('Objednávku sa nepodarilo odoslať. Skontroluj pripojenie a skús to znova.');
      }
    } finally {
      btn.disabled = false;
    }
  }

  function resetAll() {
    state.day = null;
    PRODUCTS.forEach((p) => { state.qty[p.id] = 0; });
    document.getElementById('fname').value = '';
    document.getElementById('fphone').value = '';
    document.getElementById('femail').value = '';
    document.getElementById('fnote').value = '';
    showFormError('');
    document.getElementById('checkout').style.display = 'block';
    document.getElementById('success').style.display = 'none';
    loadDaysForView();
    afterCartChange();
    setStep(1);
  }

  window.DoSrdiecka = { pickDay, addItem, incItem, decItem };
  window.goOrder = goOrder;
  window.goCart = goCart;
  window.setStep = setStep;
  window.submitOrder = submitOrder;
  window.resetAll = resetAll;
  window.shiftMonth = shiftMonth;

  loadMenu().catch(() => { document.getElementById('menu').innerHTML = '<p class="err">Ponuku sa nepodarilo načítať.</p>'; });
  loadDaysForView().catch(() => { document.getElementById('cal').innerHTML = '<p class="err">Kalendár sa nepodarilo načítať.</p>'; });
})();
