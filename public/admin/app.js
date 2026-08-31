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
  }

  function renderOrders(orders) {
    const el = document.getElementById('ordersList');
    if (!orders.length) { el.innerHTML = '<p class="muted">Zatiaľ žiadne objednávky.</p>'; return; }
    el.innerHTML = `<table class="admin-table"><thead><tr>
        <th>Číslo</th><th>Termín</th><th>Zákazník</th><th>Položky</th><th>Cena</th><th>Stav</th><th></th>
      </tr></thead><tbody>${orders.map((o) => `
        <tr>
          <td class="ordno">${o.order_no ? '#' + o.order_no : '—'}</td>
          <td>${o.day}</td>
          <td>${o.customer_name}<br><span class="muted">${o.phone}<br>${o.email}</span>${o.note ? `<br><span class="muted">Pozn.: ${o.note}</span>` : ''}</td>
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
        </tr>`).join('')}</tbody></table>`;
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
            <button class="btn ghost sm zmazat" onclick="Admin.deleteDay('${d.day}')">Zrušiť</button>
          </td>
        </tr>`).join('')}</tbody></table>`;
  }

  // Zrušenie termínu ho z tabuľky odstráni úplne. Deň s prijatými
  // objednávkami server odmietne zmazať a povie prečo.
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
    document.getElementById('tab-products').scrollIntoView({ behavior: 'smooth' });
  }

  function resetProductForm() {
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

  // ---------- settings ----------
  async function loadSettings() {
    try {
      const data = await apiFetch('/api/admin/settings');
      const s = data.settings || {};
      document.getElementById('sHeroTitle').value = s.hero_title || '';
      document.getElementById('sHeroLead').value = s.hero_lead || '';
      document.getElementById('sAbout').value = s.about_text || '';
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

  window.Admin = {
    login, logout, showTab,
    updateOrderStatus, editDay, saveDay,
    deleteDay, editProduct, resetProductForm, saveProduct,
    saveSettings,
  };

  if (getAccess()) showDashboard(); else showLogin();
})();
