// Dátum prijatia objednávky a export nákupného zoznamu do Excelu.
//
// Zošit sa naozaj stiahne a uloží — či sa dá otvoriť, overuje
// tools/over-xlsx.py nad stiahnutým súborom.
//
//   NODE_PATH=/cesta/k/node_modules node tools/prehliadac-export.js

const path = require('path');
const fs = require('fs');
const os = require('os');

const REPO = path.resolve(__dirname, '..');
const VYSTUP = process.env.PREHLIADAC_VYSTUP
  || fs.mkdtempSync(path.join(os.tmpdir(), 'dosrdiecka-'));
const PORT = process.env.PREHLIADAC_PORT || '3114';

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright nie je po ruke. Spusti skript s NODE_PATH, ktorý naň ukazuje —\n'
    + 'napríklad: NODE_PATH=/cesta/k/node_modules node ' + path.relative(REPO, __filename));
  process.exit(2);
}
const { startFakeSupabase } = require(path.join(REPO, 'test/fake-supabase.js'));
const { spawn } = require('child_process');

const ok = [];
const bad = [];
const check = (n, pass, d) => (pass ? ok : bad).push(d ? `${n} — ${d}` : n);
const den = (p) => new Date(Date.now() + p * 86400000).toISOString().slice(0, 10);

(async () => {
  const fake = await startFakeSupabase();
  const db = fake.db;

  db.open_days.push({ day: den(6), is_open: true, cap_zakusky: 30, cap_torty: 2, cap_chlebik: 3 });

  // Objednávka prijatá o 23:30 UTC — u nás je to už ďalší deň.
  db.orders.push({
    id: 'o1', order_no: 21, day: den(6), customer_name: 'Martina Bertová',
    phone: '908957405', email: 'martinka@example.sk', note: '', total_estimate: 50,
    status: 'nova', manual: false, created_at: '2026-11-01T23:30:00.000Z',
  });
  db.order_items.push({
    id: 'i1', order_id: 'o1', product_id: 'p-choux', qty: 6, unit_price: 3.5,
    name_snapshot: 'Choux', sub_snapshot: 'Karamelový', category_id: 'zakusky',
  });

  // Receptár: dve suroviny, jeden recept, jedno priradenie — nech má
  // kalkulácia čo počítať. Jedna surovina je zámerne bez balenia a ceny,
  // aby sa v zošite overil aj riadok, ktorý sa nedá doceniť.
  db.ingredients.push(
    { id: 'i-muka', name: 'Múka hladká', unit: 'g', pack_size: 1000, pack_price: 0.88,
      negligible: false, kind: 'surovina', note: '', price_date: null, price_source: '', active: true },
    { id: 'i-sol', name: 'Soľ "morská" & hrubá', unit: 'g', pack_size: null, pack_price: null,
      negligible: false, kind: 'surovina', note: '', price_date: null, price_source: '', active: true },
  );
  db.recipes.push({
    id: 'r-cesto', name: 'Odpalované cesto', kind: 'cesto', yield_qty: 20, yield_unit: 'ks',
    steps: '', note: '', source_url: '', active: true,
  });
  db.recipe_items.push(
    { id: 'ri1', recipe_id: 'r-cesto', ingredient_id: 'i-muka', amount: 115,
      optional: false, note: '', sort_order: 1 },
    { id: 'ri2', recipe_id: 'r-cesto', ingredient_id: 'i-sol', amount: 4,
      optional: false, note: '', sort_order: 2 },
  );
  db.product_recipes.push({
    id: 'pr1', product_id: 'p-choux', recipe_id: 'r-cesto', qty_per_piece: 1, note: '',
  });
  db.shopping_plans.push({
    id: 'z1', day: den(6), name: 'sobota — Kováčovci',
    items: [{ product_id: 'p-choux', kusy: 20 }], created_at: new Date().toISOString(),
  });

  const srv = spawn('node', ['dev-server.js'], {
    cwd: REPO,
    env: {
      ...process.env, PORT, SUPABASE_URL: fake.url, SUPABASE_SERVICE_ROLE_KEY: 'fake',
      ADMIN_EMAILS: fake.adminCredentials.email, SMTP_HOST: 'localhost', SMTP_PORT: '465',
      SMTP_USER: 'k@x.sk', SMTP_PASSWORD: 'x',
    },
    stdio: 'ignore',
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => bad.push('CHYBA STRÁNKY: ' + e.message));
  const stiahnute = [];
  try {
    for (let i = 0; i < 40; i++) {
      try { await page.goto(`http://localhost:${PORT}/admin/`, { timeout: 1500 }); break; }
      catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    await page.fill('#loginEmail', fake.adminCredentials.email);
    await page.fill('#loginPassword', fake.adminCredentials.password);
    await page.click('text=Prihlásiť sa');
    await page.waitForSelector('#ordersList table', { timeout: 15000 });

    // --- dátum prijatia ---
    const hlavicky = await page.locator('#ordersList thead th').allTextContents();
    check('v zozname objednávok je stĺpec Prijatá', hlavicky.includes('Prijatá'),
      hlavicky.join(' | '));
    const prijata = (await page.locator('#ordersList .prijata').first().textContent()).trim();
    check('ukazuje dátum aj čas v našom čase, nie v UTC',
      prijata.includes('2. 11. 2026') && prijata.includes('0:30'), prijata.replace(/\s+/g, ' '));

    // --- export uloženého zoznamu ---
    await page.click('[data-tab="kalkulacka"]');
    await page.waitForSelector('#zozZoznamy table', { timeout: 15000 });
    check('pri uloženom zozname je tlačidlo Excel',
      (await page.locator('#zozZoznamy').getByRole('button', { name: 'Excel' }).count()) === 1);

    const stiahnutie = page.waitForEvent('download', { timeout: 20000 });
    await page.locator('#zozZoznamy').getByRole('button', { name: 'Excel' }).click();
    const sub = await stiahnutie;
    const cesta = path.join(VYSTUP, sub.suggestedFilename());
    await sub.saveAs(cesta);
    stiahnute.push(cesta);
    check('zošit sa stiahol pod zrozumiteľným názvom',
      /^nakup-.*\.xlsx$/.test(sub.suggestedFilename()), sub.suggestedFilename());
    check('a nie je prázdny', fs.statSync(cesta).size > 2000, `${fs.statSync(cesta).size} B`);

    // --- export spočítaného rozpisu ---
    await page.locator('#zozZoznamy').getByRole('button', { name: 'Otvoriť' }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Spočítať' }).first().click();
    await page.waitForSelector('#kalVysledok table', { timeout: 15000 });
    check('pri spočítanom zozname je tlačidlo na stiahnutie',
      await page.getByRole('button', { name: 'Stiahnuť do Excelu' }).isVisible());

    const stiahnutie2 = page.waitForEvent('download', { timeout: 20000 });
    await page.getByRole('button', { name: 'Stiahnuť do Excelu' }).click();
    const sub2 = await stiahnutie2;
    const cesta2 = path.join(VYSTUP, 'rozpis-' + sub2.suggestedFilename());
    await sub2.saveAs(cesta2);
    stiahnute.push(cesta2);
    check('aj ten sa stiahol', fs.statSync(cesta2).size > 2000, `${fs.statSync(cesta2).size} B`);
  } catch (e) {
    bad.push('VÝNIMKA: ' + e.message.split('\n')[0]);
  } finally {
    await browser.close();
    srv.kill();
    await fake.close();
  }

  console.log('\n--- PREŠLO ---');
  ok.forEach((t) => console.log('  ✓ ' + t));
  if (bad.length) {
    console.log('\n--- ZLYHALO ---');
    bad.forEach((t) => console.log('  ✗ ' + t));
  }
  console.log(`\n${ok.length} prešlo, ${bad.length} zlyhalo`);
  if (stiahnute.length) {
    console.log('\nStiahnuté zošity (over ich cez tools/over-xlsx.py):');
    stiahnute.forEach((c) => console.log('  ' + c));
  }
  process.exit(bad.length ? 1 : 0);
})();
