(function () {
  const LS_ACCESS = 'dosrdiecka_access_token';
  const LS_REFRESH = 'dosrdiecka_refresh_token';

  let CATS_BY_ID = { chlebik: 'Chlebík', zakusky: 'Zákusky', torty: 'Torty' };
  let PRODUCTS_CACHE = [];

  function getAccess() { return localStorage.getItem(LS_ACCESS); }
  function getRefresh() { return localStorage.getItem(LS_REFRESH); }
  function setTokens(access, refresh) {
    localStorage.setItem(LS_ACCESS, access);
    if (refresh) localStorage.setItem(LS_REFRESH, refresh);
  }
  function clearTokens() {
    localStorage.removeItem(LS_ACCESS);
    localStorage.removeItem(LS_REFRESH);
  }

  async function apiFetch(url, opts = {}, retry = true) {
    const headers = Object.assign({}, opts.headers, { Authorization: `Bearer ${getAccess()}` });
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (res.status === 401 && retry && getRefresh()) {
      const ok = await tryRefresh();
      if (ok) return apiFetch(url, opts, false);
    }
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      if (res.status === 401) showLogin();
      const err = new Error((data && (data.message || data.error)) || 'Nastala chyba.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function tryRefresh() {
    try {
      const res = await fetch('/api/admin/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: getRefresh() }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  }

  function showLogin() {
    clearTokens();
    document.getElementById('loginView').style.display = 'block';
    document.getElementById('dashboardView').style.display = 'none';
  }
  function showDashboard() {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'block';
    loadOrders();
  }

  async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginErr');
    errEl.style.display = 'none';
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Nesprávny e-mail alebo heslo.');
      setTokens(data.access_token, data.refresh_token);
      showDashboard();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  }

  function logout() {
    clearTokens();
    showLogin();
  }

  function showTab(name) {
    document.querySelectorAll('.admin-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll('.admin-panel').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + name));
    if (name === 'orders') loadOrders();
    if (name === 'days') loadDays();
    if (name === 'products') loadProducts();
    if (name === 'settings') loadSettings();
    if (name === 'suroviny') loadSuroviny();
    if (name === 'recepty') loadRecepty();
    if (name === 'kalkulacka') pripravKalkulacku();
  }

  // ---------- orders ----------
  async function loadOrders() {
    const el = document.getElementById('ordersList');
    el.innerHTML = '<p class="muted">Načítavam objednávky…</p>';
    try {
      const data = await apiFetch('/api/admin/orders');
      renderOrders(data.orders || []);
    } catch (err) {
      el.innerHTML = `<p class="err">${err.message}</p>`;
    }
    // Formulár na ručný zápis potrebuje ponuku. Načíta sa raz.
    try {
      if (!PRODUCTS_CACHE.length) {
        const data = await apiFetch('/api/admin/products');
        PRODUCTS_CACHE = data.products || [];
      }
      renderOrderItems();
    } catch (err) {
      document.getElementById('oItems').innerHTML = `<p class="err">${err.message}</p>`;
    }
  }

  // ---------- ručne zapísaná objednávka ----------
  function renderOrderItems() {
    const el = document.getElementById('oItems');
    if (!el) return;
    if (!PRODUCTS_CACHE.length) {
      el.innerHTML = '<p class="muted">V ponuke zatiaľ nie sú žiadne výrobky.</p>';
      return;
    }
    const poradie = ['chlebik', 'zakusky', 'torty'];
    const zoradene = [...PRODUCTS_CACHE].sort((a, b) =>
      poradie.indexOf(a.category_id) - poradie.indexOf(b.category_id)
      || a.name.localeCompare(b.name, 'sk')
      || String(a.sub || '').localeCompare(String(b.sub || ''), 'sk'));

    let html = '';
    let kategoria = null;
    zoradene.filter((p) => p.active).forEach((p) => {
      if (p.category_id !== kategoria) {
        kategoria = p.category_id;
        html += `<div class="okat">${CATS_BY_ID[kategoria] || kategoria}</div>`;
      }
      html += `<div class="orow">
          <div class="nazov">${p.name}${p.sub ? `<small>${p.sub}</small>` : ''}</div>
          <input type="number" min="0" step="1" placeholder="0"
            data-produkt="${p.id}" aria-label="Počet kusov — ${p.name} ${p.sub || ''}">
        </div>`;
    });
    el.innerHTML = html;
  }

  function zozbierajPolozky() {
    return [...document.querySelectorAll('#oItems input[data-produkt]')]
      .map((i) => ({ product_id: i.dataset.produkt, qty: parseInt(i.value, 10) || 0 }))
      .filter((x) => x.qty > 0);
  }

  function resetOrderForm() {
    ['oDay', 'oName', 'oPhone', 'oEmail', 'oNote'].forEach((id) => {
      document.getElementById(id).value = '';
    });
    document.querySelectorAll('#oItems input[data-produkt]').forEach((i) => { i.value = ''; });
    document.getElementById('orderErr').style.display = 'none';
    document.getElementById('orderOk').style.display = 'none';
  }

  async function saveOrder() {
    const errEl = document.getElementById('orderErr');
    const okEl = document.getElementById('orderOk');
    errEl.style.display = 'none'; okEl.style.display = 'none';

    const body = {
      day: document.getElementById('oDay').value,
      name: document.getElementById('oName').value.trim(),
      phone: document.getElementById('oPhone').value.trim(),
      email: document.getElementById('oEmail').value.trim(),
      note: document.getElementById('oNote').value.trim(),
      items: zozbierajPolozky(),
    };
    const zastav = (sprava) => { errEl.textContent = sprava; errEl.style.display = 'block'; };
    if (!body.day) return zastav('Vyber termín.');
    if (!body.name) return zastav('Vyplň meno zákazníčky.');
    if (!body.items.length) return zastav('Zadaj počet aspoň pri jednom výrobku.');

    try {
      const odpoved = await apiFetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      resetOrderForm();
      okEl.textContent = `Zapísané ako objednávka #${odpoved.order_no}. Kapacita dňa je o ňu znížená.`
        + (odpoved.day_created
          ? ` Termín ${body.day} v kalendári ešte nebol — pridala som ho ako zatvorený, takže sa na webe neponúka.`
          : '');
      okEl.style.display = 'block';
      loadOrders();
      loadDays();
    } catch (err) {
      zastav(err.message);
    }
  }

  // Objednávky rozdelené podľa stavu: hore to, čo ešte treba upiecť.
  // V jednom zozname sa v nich dalo ťažko vyznať.
  const SKUPINY = [
    { stav: 'nova', nadpis: 'Nové — čakajú na vybavenie', odNajblizsieho: true },
    { stav: 'vybavena', nadpis: 'Vybavené', odNajblizsieho: false },
    { stav: 'zrusena', nadpis: 'Zrušené', odNajblizsieho: false },
  ];

  function riadokObjednavky(o) {
    return `
        <tr>
          <td class="ordno">${o.order_no ? '#' + o.order_no : '—'}</td>
          <td>${o.day}</td>
          <td>${o.customer_name}<br><span class="muted">${o.phone || '—'}${
            o.email ? `<br>${o.email}` : ''}</span>${
            o.note ? `<br><span class="muted">Pozn.: ${o.note}</span>` : ''}</td>
          <td>${(o.order_items || []).map((it) => `${it.qty}× ${it.name_snapshot}`).join('<br>')}</td>
          <td>${(o.order_items || []).some((it) => it.category_id === 'torty') ? 'od ' : ''}${o.total_estimate} €</td>
          <td><span class="badge ${o.status}">${o.status}</span></td>
          <td>
            <select onchange="Admin.updateOrderStatus('${o.id}', this.value)">
              <option value="nova" ${o.status === 'nova' ? 'selected' : ''}>nová</option>
              <option value="vybavena" ${o.status === 'vybavena' ? 'selected' : ''}>vybavená</option>
              <option value="zrusena" ${o.status === 'zrusena' ? 'selected' : ''}>zrušená</option>
            </select>
          </td>
        </tr>`;
  }

  function renderOrders(orders) {
    const el = document.getElementById('ordersList');
    if (!orders.length) { el.innerHTML = '<p class="muted">Zatiaľ žiadne objednávky.</p>'; return; }

    el.innerHTML = SKUPINY.map((s) => {
      const moje = orders
        .filter((o) => o.status === s.stav)
        // Pri nových je najdôležitejší najbližší termín — ten sa pečie ako prvý.
        // Pri vybavených a zrušených je to história, tak od najnovšieho.
        .sort((a, b) => (s.odNajblizsieho ? a.day.localeCompare(b.day) : b.day.localeCompare(a.day)));

      const obsah = moje.length
        ? `<table class="admin-table"><thead><tr>
            <th>Číslo</th><th>Termín</th><th>Zákazník</th><th>Položky</th><th>Cena</th><th>Stav</th><th></th>
          </tr></thead><tbody>${moje.map(riadokObjednavky).join('')}</tbody></table>`
        : `<p class="prazdne">Žiadne.</p>`;

      return `<div class="ordgrp${s.stav === 'nova' ? '' : ' hotove'}">
          <h4>${s.nadpis} <span class="kolko">${moje.length}</span></h4>
          ${obsah}
        </div>`;
    }).join('');
  }

  async function updateOrderStatus(id, status) {
    try {
      await apiFetch(`/api/admin/orders?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      loadOrders();
    } catch (err) {
      alert('Zmenu sa nepodarilo uložiť: ' + err.message);
    }
  }

  // ---------- days ----------
  async function loadDays() {
    const el = document.getElementById('daysList');
    el.innerHTML = '<p class="muted">Načítavam dni…</p>';
    try {
      const today = new Date().toISOString().slice(0, 10);
      const data = await apiFetch(`/api/admin/days?from=${today}`);
      renderDays(data.days || []);
    } catch (err) {
      el.innerHTML = `<p class="err">${err.message}</p>`;
    }
  }

  function objednavokText(n) {
    if (n === 1) return '1 objednávku';
    if (n < 5) return `${n} objednávky`;
    return `${n} objednávok`;
  }

  function renderDays(days) {
    const el = document.getElementById('daysList');
    if (!days.length) { el.innerHTML = '<p class="muted">Zatiaľ žiadne otvorené dni. Pridaj prvý deň vyššie.</p>'; return; }
    el.innerHTML = `<table class="admin-table"><thead><tr>
        <th>Dátum</th><th>Stav</th><th>Zákusky</th><th>Torty</th><th>Chlebíky</th><th>Zvyšná kapacita</th><th></th>
      </tr></thead><tbody>${days.map((d) => `
        <tr>
          <td>${d.day}</td>
          <td>${d.is_open ? 'Otvorené' : 'Zatvorené'}</td>
          <td>${d.cap_zakusky}</td>
          <td>${d.cap_torty}</td>
          <td>${d.cap_chlebik}</td>
          <td>${d.remaining_zakusky} ks · ${d.remaining_torty} torta · ${d.remaining_chlebik} chlebík</td>
          <td class="akcie">
            <button class="btn ghost sm" onclick="Admin.editDay('${d.day}', ${d.is_open}, ${d.cap_zakusky}, ${d.cap_torty}, ${d.cap_chlebik})">Upraviť</button>
            ${d.pocet_objednavok
              ? `<span class="denpozn">Má ${objednavokText(d.pocet_objednavok)} — dá sa už len zavrieť.</span>`
              : `<button class="btn ghost sm zmazat" onclick="Admin.deleteDay('${d.day}')">Zrušiť</button>`}
          </td>
        </tr>`).join('')}</tbody></table>`;
  }

  // Zrušenie termínu ho z tabuľky odstráni úplne. Ponúka sa len pri dni
  // bez objednávok; server to kontroluje ešte raz, keby zoznam medzitým
  // zostarol a objednávka prišla práve teraz.
  async function deleteDay(day) {
    if (!confirm(`Naozaj zrušiť termín ${day}? Z kalendára zmizne úplne.`)) return;
    const errEl = document.getElementById('dayErr');
    errEl.style.display = 'none';
    try {
      await apiFetch(`/api/admin/days?day=${encodeURIComponent(day)}`, { method: 'DELETE' });
      loadDays();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      document.getElementById('tab-days').scrollIntoView({ behavior: 'smooth' });
    }
  }

  function editDay(day, isOpen, capZ, capT, capCh) {
    document.getElementById('dayDate').value = day;
    document.getElementById('dayOpen').value = String(isOpen);
    document.getElementById('dayCapZ').value = capZ;
    document.getElementById('dayCapT').value = capT;
    document.getElementById('dayCapCh').value = capCh;
    document.getElementById('tab-days').scrollIntoView({ behavior: 'smooth' });
  }

  async function saveDay() {
    const errEl = document.getElementById('dayErr');
    errEl.style.display = 'none';
    const day = document.getElementById('dayDate').value;
    if (!day) { errEl.textContent = 'Vyber dátum.'; errEl.style.display = 'block'; return; }
    const body = {
      day,
      is_open: document.getElementById('dayOpen').value === 'true',
      cap_zakusky: parseInt(document.getElementById('dayCapZ').value, 10),
      cap_torty: parseInt(document.getElementById('dayCapT').value, 10),
      cap_chlebik: parseInt(document.getElementById('dayCapCh').value, 10),
    };
    try {
      await apiFetch('/api/admin/days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      loadDays();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  }

  // ---------- products ----------
  async function loadProducts() {
    const el = document.getElementById('productsList');
    el.innerHTML = '<p class="muted">Načítavam ponuku…</p>';
    try {
      const data = await apiFetch('/api/admin/products');
      PRODUCTS_CACHE = data.products || [];
      renderProducts(PRODUCTS_CACHE);
      // Poradie vieme predvyplniť až teraz, keď poznáme existujúce čísla.
      // Ak práve upravuje konkrétny výrobok, jeho hodnotu neprepisujeme.
      if (!document.getElementById('productId').value) predvyplnPoradie();
    } catch (err) {
      el.innerHTML = `<p class="err">${err.message}</p>`;
    }
  }

  function renderProducts(products) {
    const el = document.getElementById('productsList');
    if (!products.length) { el.innerHTML = '<p class="muted">Zatiaľ žiadne výrobky.</p>'; return; }

    // Web spája výrobky s rovnakým názvom v tej istej kategórii do jednej
    // karty. Nech je to vidieť aj tu — inak by to vyzeralo ako omylom
    // vytvorený duplikát.
    const pocty = {};
    products.forEach((p) => {
      const k = p.category_id + '|' + p.name;
      pocty[k] = (pocty[k] || 0) + 1;
    });
    const jePrichut = (p) => pocty[p.category_id + '|' + p.name] > 1;

    // V tabuľke hľadá človek podľa názvu, nie podľa poradia na webe.
    // Poradie na webe určuje stĺpec Poradie vo formulári, nie toto.
    const zoradene = [...products].sort((a, b) =>
      a.name.localeCompare(b.name, 'sk') || String(a.sub || '').localeCompare(String(b.sub || ''), 'sk'));

    // Cena sa píše rovnako ako na webe: "od" len pri tortách.
    const cena = (p) => (p.category_id === 'torty' ? `od ${p.price} €` : `${p.price} €`);

    el.innerHTML = `<table class="admin-table"><thead><tr>
        <th>Fotka</th><th>Názov</th><th>Kategória</th><th>Cena</th><th>Zobrazené</th><th></th>
      </tr></thead><tbody>${zoradene.map((p) => `
        <tr>
          <td><img src="${p.image_url}" alt="" style="width:52px;height:52px;object-fit:cover;border-radius:8px"></td>
          <td>${p.name}<br><span class="muted">${p.sub || ''}</span>${
            jePrichut(p) ? `<br><span class="muted" style="font-size:.74rem">jedna z ${
              p.category_id === 'torty' ? 'veľkostí' : 'príchutí'} karty „${p.name}“</span>` : ''}</td>
          <td>${CATS_BY_ID[p.category_id] || p.category_id}</td>
          <td>${cena(p)}</td>
          <td>${p.active ? 'Áno' : 'Nie'}</td>
          <td><button class="btn ghost sm" onclick='Admin.editProduct(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Upraviť</button></td>
        </tr>`).join('')}</tbody></table>`;
  }

  function editProduct(p) {
    document.getElementById('productFormTitle').textContent = 'Upraviť výrobok';
    document.getElementById('productId').value = p.id;
    document.getElementById('pCategory').value = p.category_id;
    document.getElementById('pName').value = p.name;
    document.getElementById('pSub').value = p.sub || '';
    document.getElementById('pPrice').value = p.price;
    document.getElementById('pMinQty').value = p.min_qty;
    document.getElementById('pMinLabel').value = p.min_label || '';
    document.getElementById('pDesc').value = p.description || '';
    document.getElementById('pAlt').value = p.alt_text || '';
    document.getElementById('pAllerg').value = p.allergens || '';
    document.getElementById('pSort').value = p.sort_order;
    document.getElementById('pActive').value = String(p.active);
    document.getElementById('pImageUrl').value = p.image_url || '';
    document.getElementById('pImagePreview').innerHTML = p.image_url
      ? `<img src="${p.image_url}" alt="" style="width:100px;height:100px;object-fit:cover;border-radius:10px">` : '';
    // Formulár je zbalený — bez rozbalenia by kliknutie na Upraviť
    // vyzeralo, že sa nič nestalo.
    const formular = document.getElementById('productForm');
    if (formular) formular.open = true;
    document.getElementById('tab-products').scrollIntoView({ behavior: 'smooth' });
  }

  function resetProductForm(rozbalit) {
    document.getElementById('productFormTitle').textContent = 'Nový výrobok';
    document.getElementById('productId').value = '';
    ['pName', 'pSub', 'pPrice', 'pMinLabel', 'pDesc', 'pAlt', 'pAllerg', 'pImageUrl'].forEach((id) => { document.getElementById(id).value = ''; });
    document.getElementById('pMinQty').value = 1;
    // Nový výrobok ide na koniec. Pri príchuti je to presne to, čo treba:
    // karta zostane tam, kde bola (drží ju najnižšie číslo v skupine), a
    // nová príchuť sa v nej objaví ako posledná.
    predvyplnPoradie();
    document.getElementById('pCategory').value = 'zakusky';
    document.getElementById('pActive').value = 'true';
    document.getElementById('pImagePreview').innerHTML = '';
    document.getElementById('pImageFile').value = '';
    const formular = document.getElementById('productForm');
    if (formular && rozbalit) { formular.open = true; window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  function predvyplnPoradie() {
    const najvyssie = PRODUCTS_CACHE.reduce((m, p) => Math.max(m, p.sort_order || 0), 0);
    document.getElementById('pSort').value = najvyssie + 1;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleImageUpload() {
    const input = document.getElementById('pImageFile');
    const file = input.files[0];
    if (!file) return null;
    const contentBase64 = await fileToBase64(file);
    const data = await apiFetch('/api/admin/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType: file.type, contentBase64 }),
    });
    document.getElementById('pImageUrl').value = data.url;
    document.getElementById('pImagePreview').innerHTML = `<img src="${data.url}" alt="" style="width:100px;height:100px;object-fit:cover;border-radius:10px">`;
    return data.url;
  }

  async function saveProduct() {
    const errEl = document.getElementById('productErr');
    errEl.style.display = 'none';
    try {
      const fileInput = document.getElementById('pImageFile');
      if (fileInput.files[0]) await handleImageUpload();

      const id = document.getElementById('productId').value;
      const body = {
        category_id: document.getElementById('pCategory').value,
        name: document.getElementById('pName').value.trim(),
        sub: document.getElementById('pSub').value.trim(),
        price: parseFloat(document.getElementById('pPrice').value),
        min_qty: parseInt(document.getElementById('pMinQty').value, 10) || 1,
        min_label: document.getElementById('pMinLabel').value.trim(),
        description: document.getElementById('pDesc').value.trim(),
        alt_text: document.getElementById('pAlt').value.trim(),
        allergens: document.getElementById('pAllerg').value.trim(),
        active: document.getElementById('pActive').value === 'true',
        image_url: document.getElementById('pImageUrl').value.trim(),
        sort_order: parseInt(document.getElementById('pSort').value, 10) || 0,
      };
      if (!body.name || !Number.isFinite(body.price)) {
        errEl.textContent = 'Vyplň aspoň názov a cenu.';
        errEl.style.display = 'block';
        return;
      }

      if (id) {
        await apiFetch(`/api/admin/products?id=${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        if (!body.image_url) body.image_url = '/assets/img/chlebik.jpg';
        await apiFetch('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      resetProductForm();
      loadProducts();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  }

  // ---------- heslo ----------
  async function savePassword() {
    const errEl = document.getElementById('pwErr');
    const okEl = document.getElementById('pwOk');
    errEl.style.display = 'none'; okEl.style.display = 'none';

    const nove = document.getElementById('pwNew').value;
    const znova = document.getElementById('pwAgain').value;
    const zastav = (sprava) => {
      errEl.textContent = sprava;
      errEl.style.display = 'block';
    };

    // Preklep v hesle sa inak zistí až pri ďalšom prihlásení, keď už
    // nikto nevie, čo vlastne napísal.
    if (nove !== znova) return zastav('Heslá sa nezhodujú — skontroluj ich prosím.');
    if (nove.length < 10) return zastav('Heslo musí mať aspoň 10 znakov.');

    try {
      await apiFetch('/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: nove }),
      });
      document.getElementById('pwNew').value = '';
      document.getElementById('pwAgain').value = '';
      okEl.style.display = 'block';
    } catch (err) {
      zastav(err.message);
    }
  }

  // ---------- settings ----------
  async function loadSettings() {
    try {
      const data = await apiFetch('/api/admin/settings');
      const s = data.settings || {};
      document.getElementById('sHeroTitle').value = s.hero_title || '';
      document.getElementById('sHeroLead').value = s.hero_lead || '';
      document.getElementById('sAbout').value = s.about_text || '';
      document.getElementById('sLeadDays').value =
        Number.isInteger(s.lead_days) ? s.lead_days : 4;
    } catch (err) {
      document.getElementById('settingsErr').textContent = err.message;
      document.getElementById('settingsErr').style.display = 'block';
    }
  }

  async function saveSettings() {
    const errEl = document.getElementById('settingsErr');
    const okEl = document.getElementById('settingsOk');
    errEl.style.display = 'none'; okEl.style.display = 'none';
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_days: parseInt(document.getElementById('sLeadDays').value, 10),
          hero_title: document.getElementById('sHeroTitle').value.trim(),
          hero_lead: document.getElementById('sHeroLead').value.trim(),
          about_text: document.getElementById('sAbout').value.trim(),
        }),
      });
      okEl.style.display = 'block';
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  }


  // ---------- suroviny, recepty, kalkulácia ----------

  let RECEPTAR = null;
  let SUROVINY_CACHE = [];

  // Postgres radí diakritiku inak než slovenská abeceda, preto sa zoznamy
  // radia ešte raz tu — nech je Čokoláda za Cukrom a nie na konci.
  function podlaAbecedy(zoznam, kluc) {
    return [...zoznam].sort((a, b) => String(kluc(a)).localeCompare(String(kluc(b)), 'sk'));
  }
  function prichuteAbecedne() {
    return podlaAbecedy(PRODUCTS_CACHE.filter((p) => p.active !== false), (p) => `${p.name} — ${p.sub}`);
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function cislo(v) {
    return v === null || v === undefined || v === '' ? '' : v;
  }
  // Prázdna cena nie je nula — vypíše sa pomlčkou, nech je vidieť rozdiel
  // medzi "je to zadarmo" a "nevieme".
  function euro(v) {
    return v === null || v === undefined ? '—' : Number(v).toFixed(2) + ' €';
  }

  async function loadSuroviny() {
    const el = document.getElementById('surovinyList');
    el.innerHTML = '<p class="muted">Načítavam suroviny…</p>';
    try {
      const data = await apiFetch('/api/admin/receptar');
      RECEPTAR = data;
      renderSuroviny(data.suroviny || []);
    } catch (err) {
      el.innerHTML = `<p class="err">${esc(err.message)}</p>`;
    }
  }

  function renderSuroviny(suroviny) {
    const el = document.getElementById('surovinyList');
    SUROVINY_CACHE = suroviny;
    if (!suroviny.length) { el.innerHTML = '<p class="muted">Zatiaľ žiadne suroviny.</p>'; return; }
    // Zoznam nedoplnených surovín sa tu nevypisuje: v tabuľke ich značí
    // červené "doplniť" a pri samotnom prepočte ich kalkulačka zhrnie do
    // riadku "Nedopočítané" — tam to aj niečo mení.
    el.innerHTML = `
      <div class="form" style="margin:0 0 16px">
        <div class="full">
          <label for="surHladat">Nájsť surovinu</label>
          <select id="surHladat" onchange="Admin.vyberSurovinu(this.value)">
            <option value="">— vyber surovinu —</option>
            ${suroviny.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
          </select>
          <span class="fieldhint">Vybraná surovina sa otvorí na úpravu hore.</span>
        </div>
      </div>
      <table class="admin-table"><thead><tr>
        <th>Surovina</th><th>Balenie</th><th>Cena</th><th>Za jednotku</th><th>Platná od</th><th></th>
      </tr></thead><tbody>${suroviny.map((s) => `
        <tr id="sur-${s.id}">
          <td>${esc(s.name)}${s.kind !== 'surovina' ? ` <span class="muted">(${esc(s.kind)})</span>` : ''}
            ${s.note ? `<br><span class="muted" style="font-size:.85rem">${esc(s.note)}</span>` : ''}</td>
          <td>${s.pack_size === null ? '<span class="err">doplniť</span>' : esc(s.pack_size) + ' ' + esc(s.unit)}</td>
          <td>${s.pack_price === null ? (s.negligible ? '<span class="muted">neráta sa</span>' : '<span class="err">doplniť</span>') : euro(s.pack_price)}</td>
          <td>${s.pack_size && s.pack_price !== null ? (s.pack_price / s.pack_size).toFixed(4) + ' €/' + esc(s.unit) : '—'}</td>
          <td>${esc(s.price_date || '—')}</td>
          <td class="akcie"><button class="btn ghost sm" onclick="Admin.editSurovina('${s.id}')">Upraviť</button></td>
        </tr>`).join('')}</tbody></table>`;
  }

  // Výber z rozbaľovacieho políčka otvorí surovinu na úpravu hore a
  // zároveň označí jej riadok, nech je vidieť, kde v zozname je.
  function vyberSurovinu(id) {
    if (!id) return;
    editSurovina(id);
    const riadok = document.getElementById('sur-' + id);
    if (riadok) {
      riadok.style.background = 'rgba(0,0,0,.05)';
      setTimeout(() => { riadok.style.background = ''; }, 2500);
    }
  }

  function editSurovina(id) {
    const s = SUROVINY_CACHE.find((x) => x.id === id);
    if (!s) return;
    document.getElementById('surId').value = s.id;
    document.getElementById('surName').value = s.name;
    document.getElementById('surUnit').value = s.unit;
    document.getElementById('surPackSize').value = cislo(s.pack_size);
    document.getElementById('surPackPrice').value = cislo(s.pack_price);
    document.getElementById('surPriceDate').value = s.price_date || '';
    document.getElementById('surKind').value = s.kind;
    document.getElementById('surNegligible').value = String(!!s.negligible);
    document.getElementById('surNote').value = s.note || '';
    document.getElementById('surovinaFormTitle').textContent = 'Úprava: ' + s.name;
    const formular = document.getElementById('surovinaForm');
    if (formular) formular.open = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetSurovinaForm(rozbalit) {
    ['surId', 'surName', 'surPackSize', 'surPackPrice', 'surPriceDate', 'surNote']
      .forEach((id) => { document.getElementById(id).value = ''; });
    document.getElementById('surUnit').value = 'g';
    document.getElementById('surKind').value = 'surovina';
    document.getElementById('surNegligible').value = 'false';
    document.getElementById('surovinaFormTitle').textContent = 'Nová surovina';
    document.getElementById('surErr').style.display = 'none';
    const formular = document.getElementById('surovinaForm');
    if (formular && rozbalit) { formular.open = true; window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  async function saveSurovina() {
    const errEl = document.getElementById('surErr');
    errEl.style.display = 'none';
    const id = document.getElementById('surId').value;
    const telo = {
      name: document.getElementById('surName').value.trim(),
      unit: document.getElementById('surUnit').value,
      pack_size: document.getElementById('surPackSize').value,
      pack_price: document.getElementById('surPackPrice').value,
      price_date: document.getElementById('surPriceDate').value,
      kind: document.getElementById('surKind').value,
      negligible: document.getElementById('surNegligible').value === 'true',
      note: document.getElementById('surNote').value.trim(),
    };
    if (!telo.name) { errEl.textContent = 'Vyplň názov.'; errEl.style.display = 'block'; return; }
    // Prázdny dátum posielame len pri novej surovine; pri úprave ho server
    // doplní sám, keď sa mení cena.
    if (!telo.price_date) delete telo.price_date;
    try {
      await apiFetch(`/api/admin/receptar?co=surovina${id ? '&id=' + encodeURIComponent(id) : ''}`, {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telo),
      });
      resetSurovinaForm();
      loadSuroviny();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  }

  async function loadRecepty(rozbalit) {
    const el = document.getElementById('receptyList');
    el.innerHTML = '<p class="muted">Načítavam recepty…</p>';
    try {
      RECEPTAR = await apiFetch('/api/admin/receptar');
      if (!PRODUCTS_CACHE.length) {
        const p = await apiFetch('/api/admin/products');
        PRODUCTS_CACHE = p.products || [];
      }
      naplnPrichute();
      renderRecepty();
      if (rozbalit) {
        const box = document.getElementById('recept-' + rozbalit);
        if (box) box.open = true;
      }
    } catch (err) {
      el.innerHTML = `<p class="err">${esc(err.message)}</p>`;
    }
  }

  function nazovPrichute(productId) {
    const p = PRODUCTS_CACHE.find((x) => x.id === productId);
    return p ? `${p.name} — ${p.sub}` : 'neznámy výrobok';
  }

  // Do výberu idú len príchute, ktoré už majú priradené recepty —
  // ostatné by vypísali prázdny rozpis.
  function naplnPrichute() {
    const el = document.getElementById('recPrichut');
    if (!el || !RECEPTAR) return;
    const maRecepty = new Set(RECEPTAR.vazby.map((v) => v.product_id));
    const zoznam = podlaAbecedy(PRODUCTS_CACHE.filter((p) => maRecepty.has(p.id)), (p) => `${p.name} — ${p.sub}`);
    const doteraz = el.value;
    el.innerHTML = zoznam.length
      ? zoznam.map((p) => `<option value="${p.id}">${esc(p.name)} — ${esc(p.sub)}</option>`).join('')
      : '<option value="">— zatiaľ žiadna príchuť nemá recepty —</option>';
    if (doteraz && zoznam.some((p) => p.id === doteraz)) el.value = doteraz;
  }

  // Poradie, v akom sa pečie: najprv cesto, potom náplne, nakoniec ozdoby.
  const PORADIE_DRUHOV = ['cesto', 'krem', 'vklad', 'poleva', 'ozdoba', 'ine'];

  function cisloSk(v) {
    if (v === null || v === undefined) return '—';
    // Celé číslo bez desatinných miest, zvyšok max na tri.
    return String(Math.round(v * 1000) / 1000).replace('.', ',');
  }

  async function zobrazRozpis() {
    const el = document.getElementById('receptyRozpis');
    const product_id = document.getElementById('recPrichut').value;
    const kusy = parseInt(document.getElementById('recKusy').value, 10) || 0;
    if (!product_id || kusy <= 0) {
      el.innerHTML = '<p class="err">Vyber príchuť a počet kusov.</p>';
      return;
    }
    el.innerHTML = '<p class="muted">Počítam…</p>';
    try {
      const data = await apiFetch('/api/admin/receptar?co=kalkulacia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polozky: [{ product_id, kusy }] }),
      });
      renderRozpis(data.rozpis || [], product_id, nazovPrichute(product_id), kusy);
    } catch (err) {
      el.innerHTML = `<p class="err">${esc(err.message)}</p>`;
    }
  }

  function renderRozpis(rozpis, product_id, prichut, kusy) {
    const el = document.getElementById('receptyRozpis');
    if (!rozpis.length) {
      el.innerHTML = `<p class="muted">${esc(prichut)} nemá priradené žiadne recepty.</p>`;
      return;
    }
    const zoradene = [...rozpis].sort((a, b) =>
      PORADIE_DRUHOV.indexOf(a.recept.druh) - PORADIE_DRUHOV.indexOf(b.recept.druh));

    el.innerHTML = `
      <div class="admin-row" style="margin-bottom:4px">
        <h3 style="margin:0">${esc(prichut)} — ${kusy} ks</h3>
        <button class="btn ghost sm" onclick="Admin.doKalkulacky('${product_id}', ${kusy})">Poslať do kalkulačky</button>
      </div>
      <p class="muted" style="margin:0 0 18px;font-size:.88rem">Gramáže sú prepočítané na
        ${kusy} kusov. Stĺpec „v recepte" je pôvodná hodnota, tá sa nemení.
        Tlačidlo hore z toho istého počtu spraví nákupný zoznam s cenou.</p>
      ${zoradene.map((r) => `
        <div style="margin-bottom:24px">
          <h3 style="margin:0 0 2px">${esc(r.recept.nazov)}
            <span class="muted" style="font-weight:400">(${esc(r.recept.druh)})</span></h3>
          <p class="muted" style="margin:0 0 8px;font-size:.85rem">
            Recept je na ${cisloSk(r.recept.vytaznost)} ${esc(r.recept.jednotka_vytaznosti)} —
            teraz z neho potrebuješ <strong>${cisloSk(r.davky)}×</strong> dávku,
            čiže ${cisloSk(r.vytazok)} ${esc(r.recept.jednotka_vytaznosti)}.
            ${r.recept.poznamka ? '<br>' + esc(r.recept.poznamka) : ''}
          </p>
          <table class="admin-table"><thead><tr>
            <th>Surovina</th><th>Teraz</th><th>V recepte</th><th></th>
          </tr></thead><tbody>${r.polozky.map((p) => `
            <tr>
              <td>${esc(p.surovina)}${p.volitelna ? ' <span class="muted">(voliteľná)</span>' : ''}</td>
              <td><strong>${p.mnozstvo === null ? '—' : cisloSk(p.mnozstvo) + ' ' + esc(p.jednotka)}</strong></td>
              <td class="muted">${p.zakladne === null ? 'podľa chuti' : cisloSk(p.zakladne) + ' ' + esc(p.jednotka)}</td>
              <td class="muted" style="font-size:.85rem">${esc(p.poznamka)}</td>
            </tr>`).join('')}</tbody></table>
          ${r.recept.postup ? `<details style="margin-top:8px">
            <summary class="muted" style="cursor:pointer">Postup</summary>
            <p style="white-space:pre-wrap;margin:8px 0 0">${esc(r.recept.postup)}</p>
          </details>` : ''}
        </div>`).join('')}`;
  }

  // Zoznam receptov je zbalený — pri dvoch príchutiach sa to ešte dá
  // prejsť očami, pri veterníkoch a tortách už nie. Rozbalí sa ten,
  // ktorý sa ide upravovať.
  function renderRecepty() {
    const el = document.getElementById('receptyList');
    if (!RECEPTAR) return;
    const { recepty, polozky, vazby, suroviny } = RECEPTAR;
    if (!recepty.length) { el.innerHTML = '<p class="muted">Zatiaľ žiadne recepty.</p>'; return; }

    const filter = (document.getElementById('recFilter') || {}).value || '';
    const pouzite = new Set(vazby.map((v) => v.recipe_id));
    const vybrane = recepty
      .filter((r) => (filter === 'nepriradene' ? !pouzite.has(r.id) : (!filter || r.kind === filter)))
      .sort((a, b) => (PORADIE_DRUHOV.indexOf(a.kind) - PORADIE_DRUHOV.indexOf(b.kind))
        || a.name.localeCompare(b.name, 'sk'));

    if (!vybrane.length) { el.innerHTML = '<p class="muted">Tomuto výberu nič nezodpovedá.</p>'; return; }

    const surovinaPodlaId = new Map(suroviny.map((s) => [s.id, s]));
    const moznostiSurovin = podlaAbecedy(suroviny, (x) => x.name)
      .map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.unit)})</option>`).join('');
    const moznostiPrichuti = prichuteAbecedne()
      .map((p) => `<option value="${p.id}">${esc(p.name)} — ${esc(p.sub)}</option>`).join('');

    el.innerHTML = vybrane.map((r) => {
      const vlastne = polozky.filter((p) => p.recipe_id === r.id);
      const pouzitie = vazby.filter((v) => v.recipe_id === r.id);
      return `
      <details id="recept-${r.id}" style="margin-bottom:10px;border-bottom:1px solid rgba(0,0,0,.08);padding-bottom:10px">
        <summary style="cursor:pointer">
          <strong>${esc(r.name)}</strong>
          <span class="muted">· ${esc(r.kind)} · na ${cisloSk(r.yield_qty)} ${esc(r.yield_unit)}
          · ${vlastne.length} surovín ·
          ${pouzitie.length ? pouzitie.map((v) => esc(nazovPrichute(v.product_id))).join(', ')
                            : 'nepriradený k príchuti'}</span>
        </summary>

        <div style="padding:12px 0 0 4px">
          <div class="form" style="margin:0 0 12px">
            <div><label for="vytaznost-${r.id}">Recept je napísaný na</label>
              <input type="number" min="0" step="1" id="vytaznost-${r.id}"
                data-vytaznost="${r.id}" data-povodne="${esc(r.yield_qty)}"
                value="${esc(r.yield_qty)}">
              <span class="fieldhint">${r.yield_unit === 'g' ? 'gramov' : 'kusov'} —
                mení sa len vtedy, keď si recept naozaj prerobila alebo po pečení zistila,
                že vydá iný počet. Prepočet na inú objednávku robí výber hore.</span>
            </div>
          </div>
          <table class="admin-table"><tbody>${vlastne.map((p) => {
            const su = surovinaPodlaId.get(p.ingredient_id);
            return `<tr>
              <td>${esc(su ? su.name : 'neznáma surovina')}${p.optional ? ' <span class="muted">(voliteľná)</span>' : ''}
                ${p.note ? `<br><span class="muted" style="font-size:.85rem">${esc(p.note)}</span>` : ''}</td>
              <td style="width:170px">
                <input type="number" min="0" step="0.1" style="width:110px"
                  data-polozka="${p.id}" data-povodne="${cislo(p.amount)}"
                  value="${cislo(p.amount)}" placeholder="podľa chuti">
                ${esc(su ? su.unit : '')}
              </td>
              <td class="akcie" style="width:90px">
                <button class="btn ghost sm zmazat" onclick="Admin.zmazPolozku('${p.id}', '${esc(su ? su.name : '')}')">Odobrať</button>
              </td>
            </tr>`;
          }).join('')}</tbody></table>

          <div class="form" style="margin:12px 0 0">
            <div><label>Pridať surovinu</label>
              <select id="nova-surovina-${r.id}"><option value="">— vyber —</option>${moznostiSurovin}</select>
            </div>
            <div><label>Množstvo</label>
              <input type="number" min="0" step="0.1" id="nove-mnozstvo-${r.id}" placeholder="prázdne = podľa chuti">
            </div>
            <div style="display:flex;align-items:flex-end">
              <button class="btn ghost sm" onclick="Admin.pridajPolozku('${r.id}')">Pridať</button>
            </div>
            <div class="full"><label for="poznamka-${r.id}">Poznámka k receptu</label>
              <textarea id="poznamka-${r.id}" rows="2" data-poznamka="${r.id}"
                data-povodne="${esc(r.note || '')}">${esc(r.note || '')}</textarea>
            </div>
          </div>

          <p class="muted" style="margin:14px 0 6px;font-size:.88rem">Patrí k príchutiam:</p>
          ${pouzitie.length ? `<table class="admin-table"><tbody>${pouzitie.map((v) => `
            <tr>
              <td>${esc(nazovPrichute(v.product_id))}</td>
              <td class="muted">${r.yield_unit === 'g'
                ? cisloSk(v.qty_per_piece) + ' g do jedného zákusku'
                : ''}</td>
              <td class="akcie" style="width:90px">
                <button class="btn ghost sm zmazat" onclick="Admin.zrusPriradenie('${v.id}')">Odobrať</button>
              </td>
            </tr>`).join('')}</tbody></table>` : '<p class="muted">Zatiaľ k žiadnej.</p>'}

          <div class="form" style="margin:10px 0 0">
            <div><label>Priradiť k príchuti</label>
              <select id="nova-prichut-${r.id}"><option value="">— vyber —</option>${moznostiPrichuti}</select>
            </div>
            ${r.yield_unit === 'g' ? `
            <div><label for="nove-nakus-${r.id}">Gramov do jedného zákusku</label>
              <input type="number" min="0" step="0.1" id="nove-nakus-${r.id}" placeholder="napr. 12">
              <span class="fieldhint">Recept je na ${cisloSk(r.yield_qty)} g — napíš,
                koľko z toho ide do jedného zákusku.</span>
            </div>` : `
            <div class="full"><span class="fieldhint">Recept je na ${cisloSk(r.yield_qty)} kusov,
              takže jeden zákusok dostane jednu porciu z dávky. Nič ďalšie sa nezadáva.</span>
            </div>`}
            <div style="display:flex;align-items:flex-end">
              <button class="btn ghost sm" onclick="Admin.priradPrichut('${r.id}')">Priradiť</button>
            </div>
          </div>

          <div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button class="btn" onclick="Admin.ulozRecept('${r.id}')">Uložiť zmeny</button>
            <button class="btn ghost sm zmazat" onclick="Admin.zmazRecept('${r.id}')">Zmazať recept</button>
            <span class="muted" id="stav-${r.id}"></span>
          </div>
        </div>
      </details>`;
    }).join('');
  }

  // Uloží naraz všetko, čo sa v rozbalenom recepte zmenilo: gramáže aj
  // poznámku. Ukladá sa až na tlačidlo, nie pri každom kliknutí do
  // políčka — inak sa dá recept prepísať šípkou a ani si to nevšimneš.
  async function ulozRecept(receptId) {
    const box = document.getElementById('recept-' + receptId);
    const stav = document.getElementById('stav-' + receptId);
    if (!box) return;

    const ulohy = [];
    box.querySelectorAll('[data-polozka]').forEach((inp) => {
      if (inp.value === inp.dataset.povodne) return;
      ulohy.push(apiFetch(`/api/admin/receptar?co=polozka&id=${encodeURIComponent(inp.dataset.polozka)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: inp.value }),
      }));
    });
    const vyt = box.querySelector('[data-vytaznost]');
    if (vyt && vyt.value !== vyt.dataset.povodne) {
      ulohy.push(apiFetch(`/api/admin/receptar?co=recept&id=${encodeURIComponent(receptId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yield_qty: vyt.value }),
      }));
    }
    const pozn = box.querySelector('[data-poznamka]');
    if (pozn && pozn.value !== pozn.dataset.povodne) {
      ulohy.push(apiFetch(`/api/admin/receptar?co=recept&id=${encodeURIComponent(receptId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: pozn.value }),
      }));
    }

    if (!ulohy.length) { stav.textContent = 'Nič sa nezmenilo.'; return; }
    stav.textContent = 'Ukladám…';
    try {
      await Promise.all(ulohy);
      await loadRecepty(receptId);
      const novyStav = document.getElementById('stav-' + receptId);
      if (novyStav) novyStav.textContent = 'Uložené.';
    } catch (err) {
      stav.textContent = err.message;
    }
  }

  // Recept priradený k príchuti sa zmazať nedá — databáza to odmietne a
  // je to tak správne: príchuť by prišla o časť zloženia bez varovania.
  async function zmazRecept(receptId) {
    const recept = RECEPTAR.recepty.find((r) => r.id === receptId);
    const pouzitie = RECEPTAR.vazby.filter((v) => v.recipe_id === receptId);
    if (pouzitie.length) {
      alert(`Recept sa používa pri: ${pouzitie.map((v) => nazovPrichute(v.product_id)).join(', ')}.`
        + '\nNajprv ho odober z týchto príchutí, potom sa dá zmazať.');
      return;
    }
    if (!confirm(`Naozaj zmazať recept „${recept ? recept.name : ''}" aj s jeho surovinami?`)) return;
    try {
      await apiFetch(`/api/admin/receptar?co=recept&id=${encodeURIComponent(receptId)}`, { method: 'DELETE' });
      await loadRecepty();
    } catch (err) { alert(err.message); }
  }

  async function pridajPolozku(receptId) {
    const surovina = document.getElementById('nova-surovina-' + receptId).value;
    const mnozstvo = document.getElementById('nove-mnozstvo-' + receptId).value;
    if (!surovina) { alert('Vyber surovinu.'); return; }
    try {
      await apiFetch('/api/admin/receptar?co=polozka', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: receptId, ingredient_id: surovina, amount: mnozstvo }),
      });
      await loadRecepty(receptId);
    } catch (err) { alert(err.message); }
  }

  async function zmazPolozku(id, nazov) {
    if (!confirm(`Naozaj odobrať ${nazov || 'surovinu'} z receptu?`)) return;
    try {
      await apiFetch(`/api/admin/receptar?co=polozka&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadRecepty();
    } catch (err) { alert(err.message); }
  }

  async function priradPrichut(receptId) {
    const product_id = document.getElementById('nova-prichut-' + receptId).value;
    if (!product_id) { alert('Vyber príchuť.'); return; }

    // Recept písaný na kusy pokryje toľko zákuskov, na koľko je napísaný —
    // jeden zákusok dostane jednu porciu a niet sa na čo pýtať. Pýtame sa
    // len pri recepte na gramy (coulis na 150 g).
    const recept = RECEPTAR.recepty.find((r) => r.id === receptId);
    const naGramy = recept && recept.yield_unit === 'g';
    const pole = document.getElementById('nove-nakus-' + receptId);
    const qty = naGramy ? (pole ? pole.value : '') : 1;
    if (naGramy && !(Number(qty) > 0)) {
      alert('Napíš, koľko gramov z tohto receptu ide do jedného zákusku.');
      return;
    }
    try {
      await apiFetch('/api/admin/receptar?co=vazba', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id, recipe_id: receptId, qty_per_piece: qty }),
      });
      await loadRecepty(receptId);
    } catch (err) { alert(err.message); }
  }

  async function zrusPriradenie(id) {
    if (!confirm('Naozaj odobrať recept z tejto príchute?')) return;
    try {
      await apiFetch(`/api/admin/receptar?co=vazba&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadRecepty();
    } catch (err) { alert(err.message); }
  }

  function novyReceptForm(zobrazit = true) {
    document.getElementById('novyReceptForm').style.display = zobrazit ? 'block' : 'none';
    document.getElementById('nrErr').style.display = 'none';
  }

  async function ulozNovyRecept() {
    const errEl = document.getElementById('nrErr');
    errEl.style.display = 'none';
    const telo = {
      name: document.getElementById('nrNazov').value.trim(),
      kind: document.getElementById('nrDruh').value,
      yield_qty: document.getElementById('nrVytaznost').value,
      yield_unit: document.getElementById('nrJednotka').value,
      note: document.getElementById('nrPoznamka').value.trim(),
      steps: document.getElementById('nrPostup').value.trim(),
    };
    if (!telo.name) { errEl.textContent = 'Vyplň názov receptu.'; errEl.style.display = 'block'; return; }
    if (!(Number(telo.yield_qty) > 0)) {
      errEl.textContent = 'Napíš, na koľko je recept napísaný.'; errEl.style.display = 'block'; return;
    }
    try {
      const odpoved = await apiFetch('/api/admin/receptar?co=recept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telo),
      });
      ['nrNazov', 'nrPoznamka', 'nrPostup'].forEach((id) => { document.getElementById(id).value = ''; });
      novyReceptForm(false);
      await loadRecepty(odpoved.zaznam && odpoved.zaznam.id);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  }

  // ---------- nákupné zoznamy ----------

  let AKTUALNY_ZOZNAM = null; // id uloženého zoznamu, alebo null pre nový

  async function pripravKalkulacku() {
    if (!PRODUCTS_CACHE.length || !RECEPTAR) {
      try {
        const [p, r] = await Promise.all([
          apiFetch('/api/admin/products'),
          apiFetch('/api/admin/receptar'),
        ]);
        PRODUCTS_CACHE = p.products || PRODUCTS_CACHE;
        RECEPTAR = r;
      } catch { /* zoznam príchutí sa doplní po načítaní ponuky */ }
    }
    naplnZoznamy();
    if (!document.getElementById('zozPolozky').children.length) pridajKalRiadok();
  }

  // Prehľad všetkých zoznamov je vidieť stále, nie schovaný v rozbaľovačke —
  // inak sa po skoku do objednávok nedá povedať, v čom vlastne pracujem.
  function naplnZoznamy() {
    const el = document.getElementById('zozZoznamy');
    if (!el) return;
    const zoznamy = (RECEPTAR && RECEPTAR.zoznamy) || [];
    el.innerHTML = zoznamy.length
      ? `<table class="admin-table"><thead><tr>
          <th>Termín</th><th>Názov</th><th>Príchute</th><th>Kusov</th><th></th>
        </tr></thead><tbody>${zoznamy.map((z) => {
          const otvoreny = z.id === AKTUALNY_ZOZNAM;
          const kusov = (z.items || []).reduce((c, p) => c + (Number(p.kusy) || 0), 0);
          return `<tr${otvoreny ? ' style="background:rgba(0,0,0,.05)"' : ''}>
            <td>${esc(z.day || 'bez termínu')}</td>
            <td>${esc(z.name || '—')}</td>
            <td class="muted">${(z.items || []).map((p) => esc(nazovPrichute(p.product_id))).join(', ') || '—'}</td>
            <td>${kusov}</td>
            <td class="akcie">${otvoreny
              ? '<span class="muted">otvorený</span>'
              : `<button class="btn ghost sm" onclick="Admin.vyberZoznam('${z.id}')">Otvoriť</button>`}</td>
          </tr>`;
        }).join('')}</tbody></table>`
      : '<p class="muted">Zatiaľ žiadny uložený zoznam.</p>';

    const nadpis = document.getElementById('zozOtvoreny');
    if (nadpis) {
      const z = zoznamy.find((x) => x.id === AKTUALNY_ZOZNAM);
      nadpis.textContent = z ? `Otvorený zoznam: ${popisZoznamu(z)}` : 'Nový zoznam (zatiaľ neuložený)';
    }
  }

  function popisZoznamu(z) {
    const kusov = (z.items || []).reduce((s, p) => s + (Number(p.kusy) || 0), 0);
    return `${z.day || 'bez termínu'}${z.name ? ' — ' + z.name : ''} (${kusov} ks)`;
  }

  // Riadok, ktorý pridal program (prázdny zoznam pri otvorení), je
  // označený ako "predvolený". Keď príde príchuť z receptov alebo
  // z objednávok, predvolené riadky sa zahodia — inak by sa do nákupu
  // započítalo šesť kusov príchute, ktorú nikto nevybral. Len čo do
  // riadku niekto siahne, prestáva byť predvolený.
  function pridajKalRiadok(product_id, kusy) {
    const box = document.getElementById('zozPolozky');
    const riadok = document.createElement('div');
    riadok.className = 'form';
    riadok.style.marginBottom = '8px';
    if (!product_id) riadok.dataset.predvoleny = '1';
    riadok.innerHTML = `
      <div><label>Príchuť</label><select class="kalProdukt">
        ${prichuteAbecedne()
          .map((p) => `<option value="${p.id}">${esc(p.name)} — ${esc(p.sub)}</option>`).join('')}
      </select></div>
      <div><label>Počet kusov</label><input type="number" min="0" step="1" value="${kusy || 6}" class="kalKusy"></div>
      <div style="display:flex;align-items:flex-end">
        <button class="btn ghost sm zmazat" onclick="this.closest('.form').remove()">Odobrať</button>
      </div>`;
    box.appendChild(riadok);
    if (product_id) riadok.querySelector('.kalProdukt').value = product_id;
    riadok.addEventListener('input', () => { delete riadok.dataset.predvoleny; });
    riadok.addEventListener('change', () => { delete riadok.dataset.predvoleny; });
  }

  function zahodPredvoleneRiadky() {
    document.querySelectorAll('#zozPolozky .form[data-predvoleny]').forEach((r) => r.remove());
  }

  function zozPolozkyZoStranky() {
    return [...document.querySelectorAll('#zozPolozky .form')].map((r) => ({
      product_id: r.querySelector('.kalProdukt').value,
      kusy: parseInt(r.querySelector('.kalKusy').value, 10) || 0,
    })).filter((p) => p.product_id && p.kusy > 0);
  }

  function novyZoznam() {
    AKTUALNY_ZOZNAM = null;
    document.getElementById('zozDen').value = '';
    document.getElementById('zozNazov').value = '';
    document.getElementById('zozPolozky').innerHTML = '';
    document.getElementById('zozStav').textContent = '';
    document.getElementById('kalVysledok').innerHTML = '<p class="muted">Zostav zoznam a daj Spočítať.</p>';
    pridajKalRiadok();
    naplnZoznamy();
  }

  function vyberZoznam(id) {
    AKTUALNY_ZOZNAM = id || null;
    if (!id) { novyZoznam(); return; }
    const z = (RECEPTAR.zoznamy || []).find((x) => x.id === id);
    if (!z) return;
    document.getElementById('zozDen').value = z.day || '';
    document.getElementById('zozNazov').value = z.name || '';
    document.getElementById('zozPolozky').innerHTML = '';
    (z.items || []).forEach((p) => pridajKalRiadok(p.product_id, p.kusy));
    if (!(z.items || []).length) pridajKalRiadok();
    document.getElementById('zozStav').textContent = '';
    naplnZoznamy();
    // Výsledok dole musí patriť k otvorenému zoznamu. Keby tam ostal
    // výpočet z predošlého, nakúpilo by sa podľa cudzieho zoznamu.
    kalkulaciaRucna();
  }

  async function ulozZoznam() {
    const stav = document.getElementById('zozStav');
    const telo = {
      day: document.getElementById('zozDen').value || null,
      name: document.getElementById('zozNazov').value.trim(),
      items: zozPolozkyZoStranky(),
    };
    if (!telo.items.length) { stav.textContent = 'Zoznam je prázdny.'; return; }
    stav.textContent = 'Ukladám…';
    try {
      const odpoved = await apiFetch(
        `/api/admin/receptar?co=zoznam${AKTUALNY_ZOZNAM ? '&id=' + encodeURIComponent(AKTUALNY_ZOZNAM) : ''}`,
        {
          method: AKTUALNY_ZOZNAM ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(telo),
        });
      AKTUALNY_ZOZNAM = (odpoved.zaznam && odpoved.zaznam.id) || AKTUALNY_ZOZNAM;
      RECEPTAR = await apiFetch('/api/admin/receptar');
      naplnZoznamy();
      stav.textContent = 'Uložené.';
    } catch (err) {
      stav.textContent = err.message;
    }
  }

  async function zmazZoznam() {
    if (!AKTUALNY_ZOZNAM) { document.getElementById('zozStav').textContent = 'Tento zoznam ešte nie je uložený.'; return; }
    const z = (RECEPTAR.zoznamy || []).find((x) => x.id === AKTUALNY_ZOZNAM);
    if (!confirm(`Naozaj zmazať nákupný zoznam „${z ? popisZoznamu(z) : ''}"?`)) return;
    try {
      await apiFetch(`/api/admin/receptar?co=zoznam&id=${encodeURIComponent(AKTUALNY_ZOZNAM)}`, { method: 'DELETE' });
      RECEPTAR = await apiFetch('/api/admin/receptar');
      novyZoznam();
    } catch (err) { alert(err.message); }
  }

  async function kalkulaciaRucna() {
    const polozky = zozPolozkyZoStranky();
    const el = document.getElementById('kalVysledok');
    if (!polozky.length) { el.innerHTML = '<p class="err">Zoznam je prázdny.</p>'; return; }
    el.innerHTML = '<p class="muted">Počítam…</p>';
    try {
      const data = await apiFetch('/api/admin/receptar?co=kalkulacia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polozky }),
      });
      const den = document.getElementById('zozDen').value;
      const popis = polozky.map((p) => `${nazovPrichute(p.product_id)} — ${p.kusy} ks`).join(' + ');
      renderZoznam(data.zoznam, (den ? den + ': ' : '') + popis);
    } catch (err) {
      el.innerHTML = `<p class="err">${esc(err.message)}</p>`;
    }
  }

  // Z receptov: príchuť sa do zoznamu PRIDÁ, nie ním nahradí — na jeden
  // deň sa často pečie viac príchutí naraz.
  async function doKalkulacky(product_id, kusy) {
    showTab('kalkulacka');
    await pripravKalkulacku();
    zahodPredvoleneRiadky();
    const uz = [...document.querySelectorAll('#zozPolozky .form')]
      .find((r) => r.querySelector('.kalProdukt').value === product_id);
    if (uz) {
      uz.querySelector('.kalKusy').value = kusy;
    } else {
      pridajKalRiadok(product_id, kusy);
    }
    document.getElementById('zozStav').textContent =
      'Príchuť pridaná do zoznamu. Vyber termín a ulož ho — alebo pridaj ďalšiu príchuť.';
  }

  // Objednávky sú len pomôcka: prevezmú sa do zoznamu, kde sa dajú
  // doplniť o to, čo sa pečie navyše.
  async function objednavkyDoZoznamu() {
    const day = document.getElementById('kalDay').value;
    const stav = document.getElementById('zozStav');
    if (!day) { stav.textContent = 'Vyber termín v spodnej časti.'; return; }
    try {
      const data = await apiFetch(`/api/admin/receptar?den=${encodeURIComponent(day)}`);
      if (!data.polozky.length) { stav.textContent = 'Na ten termín nie je nič objednané.'; return; }
      if (!document.getElementById('zozDen').value) document.getElementById('zozDen').value = day;
      zahodPredvoleneRiadky();
      let pribudlo = 0;
      data.polozky.forEach((p) => {
        const uz = [...document.querySelectorAll('#zozPolozky .form')]
          .find((r) => r.querySelector('.kalProdukt').value === p.product_id);
        if (uz) { uz.querySelector('.kalKusy').value = p.kusy; } else { pridajKalRiadok(p.product_id, p.kusy); }
        pribudlo += 1;
      });
      stav.textContent = `Prevzaté z ${data.pocet_objednavok} objednávok (${pribudlo} príchutí).`
        + ' Doplň, čo pečieš navyše, a ulož.';
    } catch (err) { stav.textContent = err.message; }
  }

  async function kalkulaciaDna() {
    const day = document.getElementById('kalDay').value;
    const el = document.getElementById('kalVysledok');
    if (!day) { el.innerHTML = '<p class="err">Vyber termín.</p>'; return; }
    el.innerHTML = '<p class="muted">Počítam…</p>';
    try {
      const data = await apiFetch(`/api/admin/receptar?den=${encodeURIComponent(day)}`);
      const kusy = data.polozky.reduce((s, p) => s + p.kusy, 0);
      let hlavicka = `Objednané na ${day} — ${data.pocet_objednavok} objednávok, ${kusy} kusov`;
      if (data.bez_receptu.length) {
        hlavicka += `. Bez receptu (nerátalo sa): ${data.bez_receptu.join(', ')}`;
      }
      renderZoznam(data.zoznam, hlavicka);
    } catch (err) {
      el.innerHTML = `<p class="err">${esc(err.message)}</p>`;
    }
  }

  function renderZoznam(z, hlavicka) {
    const el = document.getElementById('kalVysledok');
    if (!z || !z.riadky.length) {
      el.innerHTML = `<p class="muted">${esc(hlavicka)}: niet čo počítať.</p>`;
      return;
    }
    el.innerHTML = `
      <h3 style="margin:0 0 4px">${esc(hlavicka)}</h3>
      <p style="margin:0 0 14px">
        Nákup (celé balenia): <strong>${euro(z.nakup)}</strong>
        ${z.nakup_na_kus !== null ? `· ${euro(z.nakup_na_kus)} na kus` : ''}<br>
        Spotreba (čo sa minie): <strong>${euro(z.spotreba)}</strong>
        ${z.spotreba_na_kus !== null ? `· ${euro(z.spotreba_na_kus)} na kus` : ''}
      </p>
      ${z.uplna ? '' : `<p class="err" style="margin:0 0 14px">Nedopočítané:
        ${z.nedopocitane.map(esc).join(', ')}. Skutočná cena je vyššia.</p>`}
      <table class="admin-table"><thead><tr>
        <th>Surovina</th><th>Potreba</th><th>Balení</th><th>Nákup</th><th>Spotreba</th><th></th>
      </tr></thead><tbody>${z.riadky.map((r) => `
        <tr>
          <td>${esc(r.surovina)}<br><span class="muted" style="font-size:.82rem">${r.recepty.map(esc).join(', ')}</span></td>
          <td>${r.mnozstvo === null ? '—' : esc(r.mnozstvo) + ' ' + esc(r.jednotka)}</td>
          <td>${r.balenia === null ? '—' : esc(r.balenia)}</td>
          <td>${euro(r.nakup)}</td>
          <td>${euro(r.spotreba)}</td>
          <td class="muted" style="font-size:.85rem">${{
            bez_mnozstva: 'v recepte bez gramáže',
            chyba_balenie: 'doplň balenie a cenu',
            nerata_sa: 'neráta sa',
            ok: '',
          }[r.stav] || ''}</td>
        </tr>`).join('')}</tbody></table>`;
  }

  window.Admin = {
    login, logout, showTab,
    updateOrderStatus, saveOrder, resetOrderForm, editDay, saveDay, savePassword,
    deleteDay, editProduct, resetProductForm, saveProduct,
    saveSettings,
    saveSurovina, resetSurovinaForm, editSurovina, vyberSurovinu,
    renderRecepty, ulozRecept, pridajPolozku, zmazPolozku, priradPrichut, zrusPriradenie,
    novyReceptForm, ulozNovyRecept, doKalkulacky, zmazRecept,
    pridajKalRiadok, kalkulaciaRucna, kalkulaciaDna, zobrazRozpis,
    novyZoznam, vyberZoznam, ulozZoznam, zmazZoznam, objednavkyDoZoznamu,
  };

  if (getAccess()) showDashboard(); else showLogin();
})();
