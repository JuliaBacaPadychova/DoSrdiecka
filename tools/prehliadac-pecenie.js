// Celé pečenie naraz v skutočnom prehliadači.
//
// Objednávka s choux aj veterníkmi musí v rozpise ukázať odpalované cesto
// RAZ, s dávkami spočítanými dokopy — a výber jednej príchute musí ostať
// taký, aký bol.
//
// Spúšťa sa rovnako ako tools/prehliadac-sprava.js, viď tools/README.md.

const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..');
// Obrázky idú vedľa spusteného skriptu, nie do repozitára.
const VYSTUP = process.env.PREHLIADAC_VYSTUP || fs.mkdtempSync(path.join(require('os').tmpdir(), 'dosrdiecka-'));
const PORT = process.env.PREHLIADAC_PORT || '3121';

// Playwright nie je závislosť projektu — hľadá sa tam, kde ho má, kto
// skript spúšťa. Bez neho nemá zmysel pokračovať, tak to treba povedať
// zrozumiteľne a nie spadnúť na "Cannot find module".
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright nie je po ruke. Spusti skript s NODE_PATH, ktorý naň ukazuje —\n'
    + 'napríklad: NODE_PATH=/cesta/k/node_modules node ' + path.relative(REPO, __filename));
  process.exit(2);
}
const { startFakeSupabase } = require(path.join(REPO, 'test/fake-supabase.js'));

(async () => {
  const fake = await startFakeSupabase();
  const db = fake.db;

  const sur = (id, name, unit, ps, pp) => ({ id, name, unit, pack_size: ps, pack_price: pp,
    negligible: false, kind: 'surovina', note: '', price_date: null, price_source: '', active: true });
  db.ingredients.push(
    sur('i-muka', 'Múka hladká', 'g', 1000, 0.88),
    sur('i-maslo', 'Maslo 82%', 'g', 250, 3.08),
    sur('i-cukor', 'Cukor práškový', 'g', 1000, 1.65),
  );

  const rec = (id, name, kind, q, u) => ({ id, name, kind, yield_qty: q, yield_unit: u,
    yield_label: '', steps: '', note: '', source_url: '', active: true });
  db.recipes.push(
    rec('r-cesto', 'Odpalované cesto', 'cesto', 20, 'ks'),
    rec('r-poleva', 'Karamelová poleva', 'poleva', 10, 'ks'),
  );
  let n = 0;
  const pol = (r, i, a) => db.recipe_items.push({ id: 'ri-' + (++n), recipe_id: r,
    ingredient_id: i, amount: a, optional: false, note: '', sort_order: n });
  pol('r-cesto', 'i-muka', 115); pol('r-cesto', 'i-maslo', 85);
  pol('r-poleva', 'i-cukor', 50);

  // Dve príchute: choux (z dávky 20) a veterník (z dávky 12). Cesto je spoločné.
  const choux = db.products.find((p) => p.name === 'Choux');
  db.products.push({ ...choux, id: 'p-vet', name: 'Veterník', sub: 'Karamelový', sort_order: 2 });
  let v = 0;
  const vazba = (p, r, extra) => db.product_recipes.push(Object.assign(
    { id: 'pr-' + (++v), product_id: p, recipe_id: r, qty_per_piece: 1, note: '', sort_order: 0 }, extra || {}));
  vazba(choux.id, 'r-cesto');
  vazba('p-vet', 'r-cesto', { pieces_per_batch: 12 });
  vazba('p-vet', 'r-poleva');

  // Objednávka s oboma príchuťami — presne ten prípad zo zadania.
  db.open_days.push({ day: '2027-04-10', is_open: true, cap_zakusky: 40, cap_torty: 1, cap_chlebik: 1 });
  db.orders.push({ id: 'o-1', order_no: 13, day: '2027-04-10', customer_name: 'Naďka',
    phone: '0948440881', email: '', note: '', status: 'nova', total_estimate: 60,
    manual: false, paid_amount: null, paid_on: null, paid_note: '', created_at: new Date().toISOString() });
  db.order_items.push(
    { id: 'oi-1', order_id: 'o-1', product_id: choux.id, category_id: 'zakusky',
      name_snapshot: 'Choux', sub_snapshot: 'Karamelový', price_snapshot: 3, qty: 10 },
    { id: 'oi-2', order_id: 'o-1', product_id: 'p-vet', category_id: 'zakusky',
      name_snapshot: 'Veterník', sub_snapshot: 'Karamelový', price_snapshot: 3, qty: 12 },
  );

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
  process.env.SUPABASE_ANON_KEY = 'fake';
  process.env.ADMIN_EMAILS = fake.adminCredentials.email;
  process.env.PORT = PORT;
  process.chdir(REPO);
  require(path.join(REPO, 'dev-server.js'));
  await new Promise((r) => setTimeout(r, 800));

  const browser = await chromium.launch({ executablePath: process.env.PREHLIADAC_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
  const chyby = [];
  page.on('pageerror', (e) => chyby.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) chyby.push(r.status() + ' ' + r.url()); });

  const ok = (co, podmienka) => console.log((podmienka ? '  OK   ' : '  CHYBA') + '  ' + co);

  await page.goto(`http://localhost:${PORT}/admin/`, { waitUntil: 'networkidle' });
  await page.fill('#loginEmail', fake.adminCredentials.email);
  await page.fill('#loginPassword', fake.adminCredentials.password);
  await page.click('button:has-text("Prihlásiť")');
  await page.waitForSelector('.admin-tabs', { timeout: 5000 });

  console.log('OBJEDNÁVKA JEDNÝM KLIKOM DO RECEPTOV:');
  await page.waitForSelector('#ordersList button:has-text("Do receptov")', { timeout: 5000 });
  await page.click('#ordersList button:has-text("Do receptov")');
  await page.waitForSelector('#receptyRozpis h3', { timeout: 8000 });
  await page.waitForTimeout(500);

  ok('prepol na záložku Recepty',
    await page.evaluate(() => document.getElementById('tab-recepty').classList.contains('on')));

  const text = (await page.textContent('#receptyRozpis')).replace(/\s+/g, ' ');
  console.log('  hlavička: ' + text.slice(0, 150));
  ok('hlavička pomenuje objednávku', /Objednávka #13 — Naďka — 22 ks/.test(text));
  ok('vypíše obe príchute', /10× Choux — Pistáciovo mangový · 12× Veterník — Karamelový/.test(text));

  const nadpisy = await page.$$eval('#receptyRozpis > div > h3, #receptyRozpis h3',
    (h) => h.map((x) => x.textContent.trim()));
  const cesta = nadpisy.filter((x) => x === 'Odpalované cesto').length;
  ok('odpalované cesto je v rozpise RAZ (' + cesta + '×)', cesta === 1);
  ok('poleva (len pri veterníkoch) je tam tiež', nadpisy.includes('Karamelová poleva'));

  // 10 choux = 0,5 dávky (z dávky 20), 12 veterníkov = 1 dávka → 1,5 dávky
  ok('dávky sú spočítané (1,5×)', /potrebuješ 1,5× dávku/.test(text));
  ok('gramáž je spočítaná (115 g × 1,5 = 172,5 g)', /172,5 g/.test(text));
  ok('pri cestíčku je vidieť, že slúži obom príchutiam',
    /na: Choux — Pistáciovo mangový \(10 ks\) \+ Veterník — Karamelový \(12 ks\)/.test(text));
  ok('poleva takú poznámku nemá (je len pri jednej príchuti)',
    (text.match(/na: Choux/g) || []).length === 1);

  ok('nepíše sa „pri tejto príchuti" — príchutí je viac',
    !/pri tejto príchuti/.test(text));
  ok('šípky na preusporiadanie tu nie sú',
    (await page.$$('#receptyRozpis button[title="skôr"]')).length === 0);
  ok('ani políčko na poznámku', (await page.$('#rozpisPoznamka')) === null);

  await page.screenshot({ path: path.join(VYSTUP, 'pecenie-spolu.png'), fullPage: false });

  console.log('\nODTIAĽ DO KALKULAČKY:');
  await page.click('#receptyRozpis button:has-text("Poslať do kalkulačky")');
  await page.waitForTimeout(800);
  const riadky = await page.$$eval('#zozPolozky .form', (r) => r.length);
  ok('v kalkulačke sú obe príchute (' + riadky + ' riadky)', riadky === 2);
  const kusy = await page.$$eval('#zozPolozky .kalKusy', (i) => i.map((x) => x.value).sort());
  ok('aj s počtami z objednávky (' + kusy.join(', ') + ')', kusy.join(',') === '10,12');
  await page.click('button:text-is("Spočítať")');
  await page.waitForSelector('#kalVysledok table', { timeout: 5000 });
  const kal = (await page.textContent('#kalVysledok')).replace(/\s+/g, ' ');
  ok('kalkulačka počíta obe naraz', /Choux/.test(kal) && /Veterník/.test(kal));

  console.log('\nCELÝ DEŇ:');
  await page.click('button[data-tab="recepty"]');
  await page.fill('#recDen', '2027-04-10');
  await page.click('button:has-text("Zobraziť celé pečenie")');
  await page.waitForTimeout(900);
  const den = (await page.textContent('#receptyRozpis')).replace(/\s+/g, ' ');
  ok('rozpis na deň pomenuje termín', /Pečenie na 2027-04-10 — 1 objednávok/.test(den));
  ok('a dáva to isté (1,5× dávka)', /potrebuješ 1,5× dávku/.test(den));

  console.log('\nJEDNA PRÍCHUŤ OSTALA AKO BOLA:');
  await page.selectOption('#recPrichut', { label: 'Veterník — Karamelový' });
  await page.fill('#recKusy', '12');
  await page.click('button:has-text("Zobraziť recepty")');
  await page.waitForSelector('#rozpisPoznamka', { timeout: 5000 });
  const jedna = (await page.textContent('#receptyRozpis')).replace(/\s+/g, ' ');
  ok('pri jednej príchuti je poznámka späť', (await page.$('#rozpisPoznamka')) !== null);
  ok('aj šípky', (await page.$$('#receptyRozpis button[title="skôr"]')).length > 0);
  ok('a počíta len ju (1× dávka cesta)', /potrebuješ 1× dávku/.test(jedna));

  await page.screenshot({ path: path.join(VYSTUP, 'pecenie.png'), fullPage: false });
  console.log('\nobrázky:', VYSTUP);
  console.log('chyby v prehliadači:', chyby.length ? chyby : 'žiadne');
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('ZLYHALO:', e.message); process.exit(1); });
