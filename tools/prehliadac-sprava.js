// Preklikanie správy webu v skutočnom prehliadači.
//
// Testy v test/ overujú výpočty a API. Toto overuje to, čo z nich vidno:
// že sa formulár naozaj uloží, že sa zoznam prekreslí, že políčko je tam,
// kde má byť. Veci, ktoré `node --test` nikdy nezachytí.
//
// Nie je súčasťou `npm test` a nemá závislosť v package.json — projekt
// zámerne beží na nule balíčkov. Playwright treba mať zvlášť:
//
//   NODE_PATH=/cesta/k/node_modules node tools/prehliadac-sprava.js
//
// Podrobnejšie v tools/README.md.

const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..');
// Obrázky idú vedľa spusteného skriptu, nie do repozitára.
const VYSTUP = process.env.PREHLIADAC_VYSTUP || fs.mkdtempSync(path.join(require('os').tmpdir(), 'dosrdiecka-'));
const PORT = process.env.PREHLIADAC_PORT || '3111';

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

  // Suroviny
  const sur = (id, name, unit, ps, pp) => ({ id, name, unit, pack_size: ps, pack_price: pp, negligible: false, kind: 'surovina', note: '', price_date: null, price_source: '', active: true });
  db.ingredients.push(
    sur('i-voda','Voda','ml',null,null), sur('i-mlieko','Mlieko plnotučné 3,5%','ml',1000,1.21),
    sur('i-maslo','Maslo 82%','g',250,3.08), sur('i-muka','Múka hladká','g',1000,0.88),
    sur('i-vajcia','Vajcia celé v ml','ml',50,0.30), sur('i-sol','Soľ','g',null,0.44),
    sur('i-cukorK','Cukor kryštálový','g',1000,1.32), sur('i-cukorKr','Cukor krupicový','g',1000,1.32),
    sur('i-mas','Mascarpone','g',250,2.53), sur('i-smot','Smotana na šľahanie 33% (malá)','ml',180,1.43),
    sur('i-cokB','Čokoláda biela 28%','g',400,7.80), sur('i-cokG','Čokoláda gold 30,4%','g',400,10.25),
    sur('i-pasta','Pasta pistáciová 100%','g',350,24), sur('i-cukorP','Cukor práškový','g',1000,1.65),
    sur('i-kava','Káva','g',200,8), sur('i-pyreM','Pyré malina','g',1000,24),
    sur('i-pektin','Pektín NH','g',null,null), sur('i-citron','Citrónová šťava','ml',null,null),
  );
  db.ingredients[0].negligible = true;

  const rec = (id, name, kind, q, u, steps) => ({ id, name, kind, yield_qty: q, yield_unit: u, steps: steps || '', note: '', source_url: '', active: true });
  db.recipes.push(
    rec('r-cesto','Odpalované cesto','cesto',20,'ks','Vajcia rozmixuj...\nRúru predhrej na 200 °C.'),
    rec('r-craq','Craquelin svetlý','cesto',20,'ks','Suroviny zmiešaj a vypracuj cesto.'),
    rec('r-pist','Pistáciový krém','krem',10,'ks','Čokoládu rozpusti...'),
    rec('r-kava','Kávová ganache','krem',12,'ks','Smotanu zohrej s kávou...'),
    rec('r-coulis','Malinové coulis','vklad',150,'g','Pyré zohrej s cukrom a pektínom.'),
  );

  let n = 0;
  const pol = (r, i, a, opt, note) => db.recipe_items.push({ id: 'ri-' + (++n), recipe_id: r, ingredient_id: i, amount: a, optional: !!opt, note: note || '', sort_order: n });
  pol('r-cesto','i-voda',95); pol('r-cesto','i-mlieko',95); pol('r-cesto','i-maslo',85);
  pol('r-cesto','i-muka',115); pol('r-cesto','i-vajcia',195); pol('r-cesto','i-sol',4); pol('r-cesto','i-cukorK',8);
  pol('r-craq','i-muka',170); pol('r-craq','i-cukorKr',170); pol('r-craq','i-maslo',140);
  pol('r-pist','i-mas',260); pol('r-pist','i-smot',85); pol('r-pist','i-cokB',60);
  pol('r-pist','i-pasta',48); pol('r-pist','i-cukorP',20); pol('r-pist','i-sol',null,false,'štipka — nevynechať');
  pol('r-kava','i-smot',300); pol('r-kava','i-kava',30,false,'zrnková'); pol('r-kava','i-cokB',60);
  pol('r-kava','i-cokG',60); pol('r-kava','i-mas',250,false,'na spevnenie');
  pol('r-coulis','i-pyreM',150); pol('r-coulis','i-cukorK',15); pol('r-coulis','i-pektin',2.5);
  pol('r-coulis','i-citron',null,false,'pár kvapiek');

  const choux = db.products.find((p) => p.name === 'Choux');
  db.products.push({ ...choux, id: 'p-kavovy', sub: 'Pistáciovo kávový', sort_order: 2 });
  let v = 0;
  const vazba = (p, r, q) => db.product_recipes.push({ id: 'pr-' + (++v), product_id: p, recipe_id: r, qty_per_piece: q, note: '' });
  vazba('p-kavovy','r-cesto',1); vazba('p-kavovy','r-craq',1); vazba('p-kavovy','r-pist',1);
  vazba('p-kavovy','r-kava',1); vazba('p-kavovy','r-coulis',12);
  vazba(choux.id,'r-cesto',1); vazba(choux.id,'r-craq',1); vazba(choux.id,'r-pist',1);

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
  process.env.SUPABASE_ANON_KEY = 'fake';
  process.env.ADMIN_EMAILS = fake.adminCredentials.email;
  process.env.PORT = PORT;
  process.chdir(REPO);
  require(path.join(REPO, 'dev-server.js'));
  await new Promise((r) => setTimeout(r, 800));

  const browser = await chromium.launch({ executablePath: process.env.PREHLIADAC_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1500 } });
  const chyby = [];
  page.on('console', (m) => { if (m.type() === 'error') chyby.push(m.text()); });
  page.on('pageerror', (e) => chyby.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => chyby.push('zlyhalo: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) chyby.push(r.status() + ' ' + r.url()); });

  await page.goto(`http://localhost:${PORT}/admin/`, { waitUntil: 'networkidle' });
  await page.fill('#loginEmail', fake.adminCredentials.email);
  await page.fill('#loginPassword', fake.adminCredentials.password);
  await page.click('button:has-text("Prihlásiť")');
  await page.waitForSelector('.admin-tabs', { timeout: 5000 });

  await page.click('button[data-tab="recepty"]');
  await page.waitForFunction(() => document.querySelectorAll('#recPrichut option').length > 0, { timeout: 5000 });
  await page.selectOption('#recPrichut', { label: 'Choux — Pistáciovo kávový' });
  await page.fill('#recKusy', '24');
  await page.click('button:has-text("Zobraziť recepty")');
  await page.waitForSelector('#receptyRozpis table', { timeout: 5000 });

  const text = await page.textContent('#receptyRozpis');
  const nadpisy = await page.$$eval('#receptyRozpis h3', (h) => h.map((x) => x.textContent.trim().replace(/\s+/g, ' ')));
  console.log('RECEPTY V ROZPISE:'); nadpisy.forEach((t) => console.log('  ' + t));
  const kontroly = [
    ['cesto 1,2× dávky', /Recept je na 20 ks — teraz z neho potrebuješ 1,2× dávku/],
    ['mascarpone na 24 ks (624 g)', /624/],
    ['coulis 288 g', /288/],
    ['štipka soli ostáva', /podľa chuti/],
  ];
  for (const [co, re] of kontroly) console.log((re.test(text.replace(/\s+/g, ' ')) ? '  OK   ' : '  CHYBA') + '  ' + co);
  await page.screenshot({ path: path.join(VYSTUP, 'recepty.png'), fullPage: false });

  const ok = (co, podmienka) => console.log((podmienka ? '  OK   ' : '  CHYBA') + '  ' + co);

  console.log('\nHANDOFF DO KALKULAČKY:');
  await page.click('button:has-text("Poslať do kalkulačky")');
  await page.waitForTimeout(600);
  let riadky = await page.$$eval('#zozPolozky .form', (r) => r.length);
  ok('príchuť pribudla do zoznamu (' + riadky + ' riadok)', riadky === 1);

  // druhá príchuť z receptov sa má PRIDAŤ, nie nahradiť tú prvú
  await page.click('button[data-tab="recepty"]');
  await page.waitForFunction(() => document.querySelectorAll('#recPrichut option').length > 0, { timeout: 5000 });
  await page.selectOption('#recPrichut', { label: 'Choux — Pistáciovo mangový' });
  await page.fill('#recKusy', '10');
  await page.click('button:has-text("Zobraziť recepty")');
  await page.waitForSelector('#receptyRozpis table', { timeout: 5000 });
  await page.click('button:has-text("Poslať do kalkulačky")');
  await page.waitForTimeout(600);
  riadky = await page.$$eval('#zozPolozky .form', (r) => r.length);
  ok('druhá príchuť sa pridala, prvá ostala (' + riadky + ' riadky)', riadky === 2);

  await page.fill('#zozDen', '2026-10-18');
  await page.fill('#zozNazov', 'sobota');
  await page.click('button:has-text("Uložiť zoznam")');
  await page.waitForFunction(() => (document.getElementById('zozStav') || {}).textContent === 'Uložené.', { timeout: 5000 });
  ok('zoznam sa uložil (' + db.shopping_plans.length + ')', db.shopping_plans.length === 1);
  ok('uložil sa s oboma príchuťami aj termínom',
    db.shopping_plans[0].items.length === 2 && db.shopping_plans[0].day === '2026-10-18');

  await page.click('button:text-is("Spočítať")');
  await page.waitForSelector('#kalVysledok table', { timeout: 5000 });
  const kal = await page.textContent('#kalVysledok');
  ok('kalkulačka počíta obe príchute', /Pistáciovo kávový/.test(kal) && /Pistáciovo mangový/.test(kal));

  let nadpis = await page.textContent('#zozOtvoreny');
  ok('nadpis hovorí, ktorý zoznam je otvorený', /sobota/.test(nadpis));
  let prehlad = await page.textContent('#zozZoznamy');
  ok('prehľad uložených zoznamov je vidieť', /sobota/.test(prehlad) && /otvorený/.test(prehlad));

  await page.click('button:has-text("Nový zoznam")');
  await page.waitForTimeout(300);
  riadky = await page.$$eval('#zozPolozky .form', (r) => r.length);
  ok('nový zoznam začína čistý', riadky === 1);
  nadpis = await page.textContent('#zozOtvoreny');
  ok('nadpis povie, že zoznam nie je uložený', /neuložený/.test(nadpis));

  await page.click('#zozZoznamy button:has-text("Otvoriť")');
  await page.waitForTimeout(300);
  riadky = await page.$$eval('#zozPolozky .form', (r) => r.length);
  ok('uložený zoznam sa dá znovu otvoriť (' + riadky + ' riadky)', riadky === 2);

  console.log('\nPREPNUTIE MEDZI ZOZNAMAMI:');
  // druhý zoznam s iným obsahom
  await page.click('button:has-text("Nový zoznam")');
  await page.waitForTimeout(300);
  await page.fill('#zozDen', '2026-11-01');
  await page.fill('#zozNazov', 'nedeľa');
  await page.selectOption('#zozPolozky .kalProdukt', { label: 'Choux — Pistáciovo mangový' });
  await page.fill('#zozPolozky .kalKusy', '30');
  await page.click('button:has-text("Uložiť zoznam")');
  await page.waitForFunction(() => (document.getElementById('zozStav') || {}).textContent === 'Uložené.', { timeout: 5000 });
  await page.click('button:text-is("Spočítať")');
  await page.waitForSelector('#kalVysledok table', { timeout: 5000 });
  let vysledok = await page.textContent('#kalVysledok');
  ok('výsledok patrí druhému zoznamu', /30 ks/.test(vysledok));

  // prepnúť späť na prvý — výsledok dole sa musí prepočítať
  const prvyId = db.shopping_plans.find((z) => z.name === 'sobota').id;
  await page.click(`#zozZoznamy button[onclick*="${prvyId}"]`);
  await page.waitForTimeout(900);
  vysledok = await page.textContent('#kalVysledok');
  ok('po prepnutí patrí výsledok otvorenému zoznamu',
    /24 ks/.test(vysledok) && !/30 ks/.test(vysledok));

  console.log('\nABECEDNÉ ZORADENIE:');
  const moznosti = await page.$$eval('#zozPolozky .form:first-child .kalProdukt option', (o) => o.map((x) => x.textContent.trim()));
  const zoradene = [...moznosti].sort((a, b) => a.localeCompare(b, 'sk'));
  if (JSON.stringify(moznosti) !== JSON.stringify(zoradene)) {
    console.log('    je:  ' + moznosti.join(' | '));
    console.log('    má:  ' + zoradene.join(' | '));
  }
  ok('príchute sú zoradené podľa abecedy', JSON.stringify(moznosti) === JSON.stringify(zoradene));

  // skok do objednávok nesmie zahodiť, v čom pracujem
  await page.evaluate(() => {
    const d = document.getElementById('kalDay');
    if (d) d.closest('details').open = true;
  });
  await page.fill('#kalDay', '2026-10-18');
  await page.click('button:has-text("Spočítať z objednávok")');
  await page.waitForTimeout(600);
  nadpis = await page.textContent('#zozOtvoreny');
  ok('po pozretí objednávok je stále vidieť otvorený zoznam', /sobota/.test(nadpis));

  console.log('\nZBALENÉ FORMULÁRE:');
  await page.click('button[data-tab="suroviny"]');
  await page.waitForSelector('#surovinyList table', { timeout: 5000 });
  let otvoreny = await page.$eval('#surovinaForm', (d) => d.open);
  ok('formulár novej suroviny je zbalený', otvoreny === false);
  await page.click('#surovinyList button:has-text("Upraviť")');
  await page.waitForTimeout(300);
  otvoreny = await page.$eval('#surovinaForm', (d) => d.open);
  const nadpisSur = await page.textContent('#surovinaFormTitle');
  ok('úprava formulár rozbalí', otvoreny === true && /Úprava/.test(nadpisSur));
  ok('tlačidlo Nová surovina ostáva vidieť',
    !!(await page.$('button:text-is("Nová surovina")')));
  await page.click('button:text-is("Nová surovina")');
  await page.waitForTimeout(300);
  ok('tlačidlo vráti prázdny formulár',
    (await page.textContent('#surovinaFormTitle')) === 'Nová surovina');

  console.log('\nOBCHOD PRI SUROVINE:');
  ok('vo formulári je políčko Obchod', !!(await page.$('#surObchod')));
  const hlavicky = await page.$$eval('#surovinyList thead th', (t) => t.map((x) => x.textContent.trim()));
  ok('v tabuľke je stĺpec Obchod', hlavicky.includes('Obchod'));
  await page.click('#surovinyList button:has-text("Upraviť")');
  await page.waitForTimeout(300);
  await page.fill('#surObchod', 'patisserie.sk');
  await page.fill('#surPackPrice', '2.99');
  await page.click('button:has-text("Uložiť surovinu")');
  await page.waitForTimeout(700);
  const ulozena = db.ingredients.find((i) => i.price_source === 'patisserie.sk');
  ok('obchod sa uložil', !!ulozena);
  ok('spolu s cenou (' + (ulozena || {}).pack_price + ') a dátumom (' + (ulozena || {}).price_date + ')',
    ulozena && String(ulozena.pack_price) === '2.99'
    && ulozena.price_date === new Date().toISOString().slice(0, 10));
  const riadok = await page.textContent('#surovinyList');
  ok('obchod je vidieť v tabuľke', /patisserie\.sk/.test(riadok));

  await page.click('button[data-tab="products"]');
  await page.waitForTimeout(500);
  otvoreny = await page.$eval('#productForm', (d) => d.open);
  ok('formulár nového výrobku je zbalený', otvoreny === false);
  await page.click('#productsList button:has-text("Upraviť")');
  await page.waitForTimeout(300);
  otvoreny = await page.$eval('#productForm', (d) => d.open);
  ok('úprava výrobku formulár rozbalí', otvoreny === true);

  console.log('\nHĽADANIE A FILTRE:');
  ok('v Ponuke je pole na nájdenie výrobku', !!(await page.$('#prodHladat')));
  const vyrobky = await page.$$eval('#prodHladat option', (o) => o.slice(1).map((x) => x.textContent.trim()));
  const zoradeneV = [...vyrobky].sort((a, b) => a.localeCompare(b, 'sk'));
  ok('výrobky sú zoradené podľa abecedy', JSON.stringify(vyrobky) === JSON.stringify(zoradeneV));
  await page.selectOption('#prodHladat', { label: 'Choux — Pistáciovo kávový' });
  await page.waitForTimeout(300);
  const nazovV = await page.textContent('#productFormTitle');
  ok('výber otvorí výrobok na úpravu', /Úprava|Choux/.test(nazovV) || (await page.inputValue('#pSub')) === 'Pistáciovo kávový');

  await page.click('button[data-tab="recepty"]');
  await page.waitForSelector('#receptyList details', { timeout: 5000 });
  ok('v Receptoch je filter podľa príchute', !!(await page.$('#recFilterPrichut')));

  // ľavý výber: názvy receptov, nie druhy
  const nazvyReceptov = await page.$$eval('#recFilter option', (o) => o.map((x) => x.textContent.trim()));
  ok('ľavý výber ponúka názvy receptov', nazvyReceptov.includes('Odpalované cesto')
    && !nazvyReceptov.includes('len cestá'));
  const bezPrveho = nazvyReceptov.slice(1);
  ok('názvy sú podľa abecedy',
    JSON.stringify(bezPrveho) === JSON.stringify([...bezPrveho].sort((a, b) => a.localeCompare(b, 'sk'))));
  await page.selectOption('#recFilter', { label: 'Odpalované cesto' });
  await page.waitForTimeout(400);
  const jeden = await page.$$eval('#receptyList details', (d) => d.map((x) => ({ t: x.querySelector('summary').textContent, open: x.open })));
  ok('vybraný recept je jediný v zozname (' + jeden.length + ')', jeden.length === 1
    && /Odpalované cesto/.test(jeden[0].t));
  ok('a rovno sa rozbalí', jeden[0].open === true);
  await page.selectOption('#recFilter', '');
  await page.waitForTimeout(400);

  // "nepriradené" sa presunulo do pravého výberu
  await page.selectOption('#recFilterPrichut', 'nepriradene');
  await page.waitForTimeout(400);
  const nepriradene = await page.$$eval('#receptyList details summary', (d) => d.map((x) => x.textContent));
  const maByt = db.recipes.filter((r) => !db.product_recipes.some((v) => v.recipe_id === r.id)).length;
  ok('vypíšu sa práve nepriradené recepty (' + nepriradene.length + ' z ' + db.recipes.length + ')',
    nepriradene.length === maByt && nepriradene.every((t) => /nepriradený k príchuti/.test(t)));
  await page.selectOption('#recFilterPrichut', '');
  await page.waitForTimeout(400);
  const poradie = await page.$$eval('#receptyList details summary strong', (d) => d.map((x) => x.textContent.trim()));
  ok('zoznam receptov je celý podľa abecedy',
    JSON.stringify(poradie) === JSON.stringify([...poradie].sort((a, b) => a.localeCompare(b, 'sk'))));
  const vsetky = await page.$$eval('#receptyList details', (d) => d.length);
  await page.selectOption('#recFilterPrichut', { label: 'Choux — Pistáciovo mangový' });
  await page.waitForTimeout(400);
  const filtrovane = await page.$$eval('#receptyList details summary', (d) => d.map((x) => x.textContent));
  ok('filter zúži zoznam (' + vsetky + ' → ' + filtrovane.length + ')', filtrovane.length < vsetky && filtrovane.length > 0);
  ok('ostali len recepty tej príchute',
    filtrovane.every((t) => /Pistáciovo mangový/.test(t)));
  await page.selectOption('#recFilterPrichut', '');
  await page.waitForTimeout(400);
  ok('prázdny filter vráti všetky', (await page.$$eval('#receptyList details', (d) => d.length)) === vsetky);

  console.log('\nÚPRAVA RECEPTU:');
  await page.click('button[data-tab="recepty"]');
  await page.waitForSelector('#receptyList details', { timeout: 5000 });
  const zbalene = await page.$$eval('#receptyList details', (d) => d.filter((x) => !x.open).length);
  ok('zoznam je zbalený (' + zbalene + ' receptov)', zbalene >= 5);

  // Rozbaliť pistáciový krém a zmeniť mascarpone z 260 na 300
  await page.click('#receptyList summary:has-text("Pistáciový krém")');
  const vstup = page.locator('#recept-r-pist input[data-polozka]').first();
  await vstup.fill('300');
  await page.fill('#poznamka-r-pist', 'Nešľahať, len premiešať metličkou.');
  await page.click('#recept-r-pist button:has-text("Uložiť zmeny")');
  await page.waitForFunction(() => {
    const s = document.getElementById('stav-r-pist');
    return s && s.textContent.includes('Uložené');
  }, { timeout: 5000 });
  const polozkaPo = db.recipe_items.find((x) => x.recipe_id === 'r-pist' && x.ingredient_id === 'i-mas');
  ok('gramáž sa uložila (' + polozkaPo.amount + ')', String(polozkaPo.amount) === '300');

  // poznámka pri surovine — dá sa prepísať tým istým tlačidlom
  const polozkaSol = db.recipe_items.find((x) => x.recipe_id === 'r-pist' && x.ingredient_id === 'i-sol');
  const poznPole = await page.$(`input[data-polozka-pozn="${polozkaSol.id}"]`);
  ok('poznámka pri surovine je políčko', !!poznPole);
  ok('je v nej to, čo je v databáze', poznPole && (await poznPole.inputValue()).includes('štipka'));
  await page.fill(`input[data-polozka-pozn="${polozkaSol.id}"]`, 'dve štipky, morská');
  // zároveň zmeníme gramáž tej istej suroviny — musí sa uložiť oboje
  await page.fill(`input[data-polozka="${polozkaSol.id}"]`, '2');
  await page.click('#recept-r-pist button:has-text("Uložiť zmeny")');
  await page.waitForFunction(() => {
    const s = document.getElementById('stav-r-pist');
    return s && s.textContent.includes('Uložené');
  }, { timeout: 5000 });
  const solPo = db.recipe_items.find((x) => x.id === polozkaSol.id);
  ok('poznámka sa uložila (' + solPo.note + ')', solPo.note === 'dve štipky, morská');
  ok('a gramáž tej istej suroviny tiež (' + solPo.amount + ')', String(solPo.amount) === '2');
  ok('poznámka sa uložila', (db.recipes.find((x) => x.id === 'r-pist').note || '').includes('Nešľahať'));

  console.log('\nPRIDANIE SUROVINY:');
  await page.selectOption('#nova-surovina-r-pist', { label: 'Vanilka (g)' }).catch(() => {});
  const maVanilku = await page.$('#nova-surovina-r-pist option:has-text("Pektín NH")');
  await page.selectOption('#nova-surovina-r-pist', { label: 'Pektín NH (g)' });
  await page.fill('#nove-mnozstvo-r-pist', '3');
  await page.click('#recept-r-pist button:has-text("Pridať")');
  await page.waitForTimeout(600);
  ok('surovina pribudla do receptu',
    db.recipe_items.some((x) => x.recipe_id === 'r-pist' && x.ingredient_id === 'i-pektin'));

  console.log('\nNOVÝ RECEPT:');
  await page.click('button:has-text("Nový recept")');
  await page.fill('#nrNazov', 'Karamelová poleva');
  await page.fill('#nrVytaznost', '10');
  await page.click('button:has-text("Založiť recept")');
  await page.waitForTimeout(600);
  ok('recept sa založil', db.recipes.some((x) => x.name === 'Karamelová poleva'));
  const novyId = (db.recipes.find((x) => x.name === 'Karamelová poleva') || {}).id;

  // čerstvý recept ešte nikam nepatrí — musí sa dať nájsť ako nepriradený
  await page.selectOption('#recFilterPrichut', 'nepriradene');
  await page.waitForTimeout(400);
  const bezPrichute = await page.$$eval('#receptyList details summary', (d) => d.map((x) => x.textContent));
  ok('nový recept je medzi nepriradenými (' + bezPrichute.length + ')',
    bezPrichute.some((t) => /Karamelová poleva/.test(t))
    && bezPrichute.every((t) => /nepriradený k príchuti/.test(t)));
  await page.selectOption('#recFilterPrichut', '');
  await page.waitForTimeout(400);
  await page.evaluate((x) => {
    const d = document.getElementById('recept-' + x); if (d) d.open = true;
  }, novyId);
  await page.selectOption('#nova-prichut-' + novyId, { label: 'Choux — Pistáciovo kávový' });
  await page.click('#recept-' + novyId + ' button:has-text("Priradiť")');
  await page.waitForTimeout(600);
  ok('recept sa priradil k príchuti',
    db.product_recipes.some((v) => v.recipe_id === novyId && v.product_id === 'p-kavovy'));

  console.log('\nPRIRADENIE RECEPTU NA GRAMY:');
  page.on('dialog', (d) => d.accept());
  await page.click('#receptyList summary:has-text("Malinové coulis")');
  const maPolicko = await page.$('#nove-nakus-r-coulis');
  ok('pri recepte na gramy sa políčko pýta', !!maPolicko);
  const polickoKs = await page.$('#nove-zdavky-r-pist');
  ok('pri recepte na kusy sa pýta, koľko vyjde z dávky', !!polickoKs);
  const predvyplnene = polickoKs ? await polickoKs.inputValue() : '';
  ok('predvyplnené výťažnosťou receptu (' + predvyplnene + ')', predvyplnene === '10');

  await page.selectOption('#nova-prichut-r-coulis', { label: 'Choux — Pistáciovo mangový' });
  await page.click('#recept-r-coulis button:has-text("Priradiť")');
  await page.waitForTimeout(400);
  ok('bez gramov sa priradenie neuloží',
    !db.product_recipes.some((v) => v.recipe_id === 'r-coulis' && v.product_id === 'p-choux'));

  await page.fill('#nove-nakus-r-coulis', '10');
  await page.click('#recept-r-coulis button:has-text("Priradiť")');
  await page.waitForTimeout(600);
  const vazbaG = db.product_recipes.find((v) => v.recipe_id === 'r-coulis' && v.product_id === 'p-choux');
  ok('s gramami sa priradenie uloží (' + (vazbaG || {}).qty_per_piece + ')', vazbaG && String(vazbaG.qty_per_piece) === '10');

  const vazbaKs = db.product_recipes.find((v) => v.recipe_id === novyId && v.product_id === 'p-kavovy');
  ok('pri recepte na kusy sa uloží počet z dávky (' + (vazbaKs || {}).pieces_per_batch + ')',
    vazbaKs && Number(vazbaKs.qty_per_piece) === 1 && Number(vazbaKs.pieces_per_batch) === 10);

  console.log('\nÚPRAVA PRIRADENIA:');
  const rozbal = async (id) => page.evaluate((x) => {
    const d = document.getElementById('recept-' + x); if (d) d.open = true;
  }, id);
  await rozbal('r-cesto');
  const vazbaCesta = db.product_recipes.find((v) => v.recipe_id === 'r-cesto' && v.product_id === 'p-kavovy');
  const polickoVazby = await page.$(`input[data-vazba="${vazbaCesta.id}"]`);
  ok('pri priradení sa dá počet prepísať', !!polickoVazby);
  ok('predvyplnené výťažnosťou receptu (' + (polickoVazby ? await polickoVazby.inputValue() : '') + ')',
    polickoVazby && (await polickoVazby.inputValue()) === '20');
  await page.fill(`input[data-vazba="${vazbaCesta.id}"]`, '12');
  await page.click('#recept-r-cesto button:has-text("Uložiť zmeny")');
  await page.waitForFunction(() => {
    const s = document.getElementById('stav-r-cesto');
    return s && s.textContent.includes('Uložené');
  }, { timeout: 5000 });
  const poUprave = db.product_recipes.find((v) => v.id === vazbaCesta.id);
  ok('zmena sa uložila (' + poUprave.pieces_per_batch + ')', String(poUprave.pieces_per_batch) === '12');
  const inaVazba = db.product_recipes.find((v) => v.recipe_id === 'r-cesto' && v.product_id !== 'p-kavovy');
  ok('ostatné priradenia ostali nedotknuté',
    inaVazba.pieces_per_batch === undefined || inaVazba.pieces_per_batch === null);

  const prichuteVRecepte = await page.$$eval('#recept-r-cesto tbody tr td:first-child',
    (t) => t.map((x) => x.textContent.trim()).filter((x) => x.includes('—')));
  const zoradeneP = [...prichuteVRecepte].sort((a, b) => a.localeCompare(b, 'sk'));
  ok('priradené príchute sú podľa abecedy',
    JSON.stringify(prichuteVRecepte) === JSON.stringify(zoradeneP));

  console.log('\nPORADIE SUROVÍN:');
  await rozbal('r-cesto');
  const poradiePred = await page.$$eval('#recept-r-cesto tr[data-riadok] td:first-child',
    (t) => t.map((x) => x.childNodes[0].textContent.trim()));
  ok('suroviny majú poradie (' + poradiePred.length + ')', poradiePred.length === 7);
  // posunúť poslednú surovinu o jedno vyššie
  const posledny = await page.$$eval('#recept-r-cesto tr[data-riadok]', (t) => t[t.length - 1].dataset.riadok);
  await page.click(`#recept-r-cesto tr[data-riadok="${posledny}"] button[title="posunúť vyššie"]`);
  await page.waitForTimeout(200);
  const poradiePo = await page.$$eval('#recept-r-cesto tr[data-riadok] td:first-child',
    (t) => t.map((x) => x.childNodes[0].textContent.trim()));
  ok('posun prehodil riadky (' + poradiePred[6] + ' ↔ ' + poradiePred[5] + ')',
    poradiePo[5] === poradiePred[6] && poradiePo[6] === poradiePred[5]);
  await page.click('#recept-r-cesto button:has-text("Uložiť zmeny")');
  await page.waitForFunction(() => {
    const s = document.getElementById('stav-r-cesto');
    return s && s.textContent.includes('Uložené');
  }, { timeout: 5000 });
  const vDb = db.recipe_items.filter((x) => x.recipe_id === 'r-cesto')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((x) => db.ingredients.find((i) => i.id === x.ingredient_id).name);
  ok('nové poradie sa uložilo do databázy', vDb[5] === poradiePred[6] && vDb[6] === poradiePred[5]);
  const poRefreshi = await page.$$eval('#recept-r-cesto tr[data-riadok] td:first-child',
    (t) => t.map((x) => x.childNodes[0].textContent.trim()));
  ok('a drží aj po znovunačítaní', JSON.stringify(poRefreshi) === JSON.stringify(poradiePo));

  // to podstatné: rozpis hore musí ukázať suroviny v tom istom poradí
  await page.selectOption('#recPrichut', { label: 'Choux — Pistáciovo kávový' });
  await page.fill('#recKusy', '20');
  await page.click('button:has-text("Zobraziť recepty")');
  await page.waitForSelector('#receptyRozpis table', { timeout: 5000 });
  const vRozpise = await page.$$eval('#receptyRozpis div', (bloky) => {
    const cesto = bloky.find((b) => (b.querySelector('h3') || {}).textContent?.includes('Odpalované cesto'));
    return cesto ? [...cesto.querySelectorAll('tbody td:first-child')].map((t) => t.textContent.trim()) : [];
  });
  ok('rozpis hore ukazuje to isté poradie',
    JSON.stringify(vRozpise) === JSON.stringify(poradiePo));

  console.log('\nPREMENOVANIE RECEPTU:');
  await rozbal('r-pist');
  await page.fill('#nazov-r-pist', 'Pistáciový krém na choux');
  await page.click('#recept-r-pist button:has-text("Uložiť zmeny")');
  await page.waitForFunction(() => {
    const s = document.getElementById('stav-r-pist');
    return s && s.textContent.includes('Uložené');
  }, { timeout: 5000 });
  ok('názov sa dá zmeniť (' + db.recipes.find((r) => r.id === 'r-pist').name + ')',
    db.recipes.find((r) => r.id === 'r-pist').name === 'Pistáciový krém na choux');

  await rozbal('r-pist');
  await page.fill('#nazov-r-pist', '   ');
  await page.click('#recept-r-pist button:has-text("Uložiť zmeny")');
  await page.waitForTimeout(500);
  const hlaska = await page.textContent('#stav-r-pist');
  ok('prázdny názov sa odmietne', /nemôže byť prázdny/.test(hlaska));
  ok('názov ostal pôvodný', db.recipes.find((r) => r.id === 'r-pist').name === 'Pistáciový krém na choux');

  console.log('\nPOSTUP:');
  await rozbal('r-pist');
  const postupPole = await page.$('#postup-r-pist');
  ok('postup je v úprave receptu vidieť', !!postupPole);
  ok('je v ňom to, čo je v databáze',
    postupPole && (await postupPole.inputValue()).includes('Čokoládu rozpusti'));
  await page.fill('#postup-r-pist', 'Nový postup:\nKrok jeden.\nKrok dva.');
  await page.fill('#nazov-r-pist', 'Pistáciový krém na choux');
  await page.click('#recept-r-pist button:has-text("Uložiť zmeny")');
  await page.waitForFunction(() => {
    const s = document.getElementById('stav-r-pist');
    return s && s.textContent.includes('Uložené');
  }, { timeout: 5000 });
  ok('zmena postupu sa uložila',
    (db.recipes.find((r) => r.id === 'r-pist').steps || '').includes('Krok dva'));

  console.log('\nVÝŤAŽNOSŤ A MAZANIE RECEPTU:');
  await rozbal(novyId);
  await page.fill('#vytaznost-' + novyId, '12');
  await page.click('#recept-' + novyId + ' button:has-text("Uložiť zmeny")');
  await page.waitForTimeout(700);
  ok('výťažnosť sa dá opraviť (' + db.recipes.find((r) => r.id === novyId).yield_qty + ')',
    String(db.recipes.find((r) => r.id === novyId).yield_qty) === '12');

  await rozbal(novyId);
  await page.click('#recept-' + novyId + ' button:has-text("Zmazať recept")');
  await page.waitForTimeout(500);
  ok('priradený recept sa zmazať nedá', db.recipes.some((r) => r.id === novyId));

  const vazbaId = db.product_recipes.find((v) => v.recipe_id === novyId).id;
  await page.click(`#recept-${novyId} button[onclick*="${vazbaId}"]`);
  await page.waitForTimeout(600);
  await rozbal(novyId);
  await page.click('#recept-' + novyId + ' button:has-text("Zmazať recept")');
  await page.waitForTimeout(700);
  ok('nepriradený recept sa zmazať dá', !db.recipes.some((r) => r.id === novyId));

  console.log('\nČOHO JE RECEPT NA 10 KUSOV:');
  await page.click('button[data-tab="recepty"]');
  await page.waitForTimeout(400);
  await rozbal('r-pist');
  const popisPole = await page.$('#popis-r-pist');
  ok('políčko „Kusov čoho" je v úprave receptu', !!popisPole);
  const vJednomRiadku = await page.evaluate(() => {
    const a = document.getElementById('nazov-r-pist').getBoundingClientRect();
    const b = document.getElementById('vytaznost-r-pist').getBoundingClientRect();
    const c = document.getElementById('popis-r-pist').getBoundingClientRect();
    return Math.abs(a.top - b.top) < 2 && Math.abs(b.top - c.top) < 2 && a.left < b.left && b.left < c.left;
  });
  ok('všetky tri políčka sú na jednom riadku vedľa seba', vJednomRiadku);
  const hinty = await page.$$eval('#recept-r-pist .fieldhint', (h) => h.map((x) => x.textContent));
  ok('dlhé poznámky pod políčkami sú preč',
    !hinty.some((t) => /mení sa len vtedy|Nič sa podľa toho nepočíta/.test(t)));
  ok('jednotka ostala vidieť pri popiske',
    /kusov/.test(await page.textContent('label[for="vytaznost-r-pist"]')));
  await page.fill('#popis-r-pist', 'veterníkov');
  await page.click('#recept-r-pist button:has-text("Uložiť zmeny")');
  await page.waitForFunction(() => {
    const s = document.getElementById('stav-r-pist');
    return s && s.textContent.includes('Uložené');
  }, { timeout: 5000 });
  ok('popis sa uložil do databázy', db.recipes.find((r) => r.id === 'r-pist').yield_label === 'veterníkov');

  await page.selectOption('#recPrichut', { label: 'Choux — Pistáciovo kávový' });
  await page.fill('#recKusy', '20');
  await page.click('button:has-text("Zobraziť recepty")');
  await page.waitForSelector('#receptyRozpis table', { timeout: 5000 });
  const sPopisom = (await page.textContent('#receptyRozpis')).replace(/\s+/g, ' ');
  ok('rozpis píše „na 10 ks veterníkov"', /Recept je na 10 ks veterníkov/.test(sPopisom));
  ok('recepty bez popisu ostali ako boli', /Recept je na 20 ks —/.test(sPopisom));

  const hlavicka = (await page.textContent('#recept-r-pist summary')).replace(/\s+/g, ' ').trim();
  console.log('  hlavička: ' + hlavicka);
  ok('vpredu stojí „kusov čoho", nie druh receptu',
    /^Pistáciový krém na choux · veterníkov · na 10 ks · 7 surovín/.test(hlavicka));
  ok('druh (krém/cesto/vklad) je preč', !/krém ·|· cesto ·|· vklad ·/.test(hlavicka));
  ok('vzadu ostali celé názvy príchutí',
    / · Choux — Pistáciovo kávový, Choux — Pistáciovo mangový$/.test(hlavicka));
  const bezPopisu = (await page.textContent('#recept-r-craq summary')).replace(/\s+/g, ' ').trim();
  ok('recept bez vyplneného „kusov čoho" (' + bezPopisu.slice(0, 50) + ')',
    /^Craquelin svetlý · na 20 ks · 3 surovín/.test(bezPopisu));
  ok('v rozpise už nie je druh v zátvorke',
    !/\((krém|cesto|vklad|poleva|ozdoba|iné)\)/.test(await page.textContent('#receptyRozpis')));

  console.log('\nULOŽENÉ RECEPTY:');
  // Predvolený handler prijíma dialógy naprázdno; pri prompte treba
  // vedieť, aké meno sa vypíše.
  page.removeAllListeners('dialog');
  let odpoved = '';
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? odpoved : undefined));

  await page.click('button[data-tab="recepty"]');
  await page.waitForFunction(() => document.querySelectorAll('#recPrichut option').length > 0, { timeout: 5000 });
  ok('karta je nad „Čo mám miešať"', await page.evaluate(() =>
    document.getElementById('ulozeneList').getBoundingClientRect().top
    < document.getElementById('recPrichut').getBoundingClientRect().top));

  await page.selectOption('#recPrichut', { label: 'Choux — Pistáciovo kávový' });
  await page.fill('#recKusy', '24');
  odpoved = 'Sobotné kávové';
  await page.click('button:has-text("Uložiť tento recept")');
  await page.waitForFunction(() => /Uložené ako/.test(document.getElementById('ulozeneStav').textContent), { timeout: 5000 });
  ok('uložilo sa aj s počtom kusov', db.recipe_presets.length === 1 && db.recipe_presets[0].pieces === 24);

  await page.selectOption('#recPrichut', { label: 'Choux — Pistáciovo mangový' });
  await page.fill('#recKusy', '10');
  odpoved = 'Mangové na 10';
  await page.click('button:has-text("Uložiť tento recept")');
  await page.waitForFunction(() => document.querySelectorAll('#ulozeneList tbody tr').length === 2, { timeout: 5000 });
  const mena = await page.$$eval('#ulozeneList tbody tr td:first-child', (t) => t.map((x) => x.textContent.trim()));
  ok('zoznam je abecedne (' + mena.join(' | ') + ')', mena[0] === 'Mangové na 10');

  await page.fill('#recKusy', '6');
  await page.click('#ulozeneList button:has-text("Sobotné kávové")');
  await page.waitForFunction(() => {
    const h = document.querySelector('#receptyRozpis h3');
    return h && /24 ks/.test(h.textContent);
  }, { timeout: 5000 });
  ok('kliknutie vypísalo rozpis na uložený počet',
    /Pistáciovo kávový — 24 ks/.test((await page.textContent('#receptyRozpis')).replace(/\s+/g, ' ')));
  ok('prepísalo aj políčko s počtom', (await page.inputValue('#recKusy')) === '24');

  // Ukladá sa výber, nie gramáže: po zmene receptu musí vyjsť nové číslo.
  db.recipe_items.find((x) => x.recipe_id === 'r-pist' && x.ingredient_id === 'i-mas').amount = 300;
  await page.click('#ulozeneList button:has-text("Sobotné kávové")');
  await page.waitForTimeout(800);
  ok('po úprave receptu sa uložený recept prepočíta (300 g na 10 ks → 720 na 24)',
    /720/.test(await page.textContent('#receptyRozpis')));

  odpoved = 'Kávové na sobotu';
  await page.click('#ulozeneList tr:has-text("Sobotné kávové") button:has-text("Premenovať")');
  await page.waitForFunction(() => /Premenované/.test(document.getElementById('ulozeneStav').textContent), { timeout: 5000 });
  const premenovane = db.recipe_presets.find((m) => m.name === 'Kávové na sobotu');
  ok('premenovanie sa uložilo', !!premenovane);
  ok('premenovanie nezmenilo výber', premenovane && premenovane.pieces === 24);

  await page.click('#ulozeneList tr:has-text("Mangové na 10") button:has-text("Zmazať")');
  await page.waitForFunction(() => document.querySelectorAll('#ulozeneList tbody tr').length === 1, { timeout: 5000 });
  ok('zmazal sa len ten jeden', db.recipe_presets.length === 1 && db.recipe_presets[0].name === 'Kávové na sobotu');
  ok('samotné recepty sa mazaním nedotkli', db.recipes.some((r) => r.id === 'r-pist'));

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(VYSTUP, 'ulozene.png'), fullPage: false });

  console.log('\nPOZNÁMKA K ULOŽENÉMU RECEPTU:');
  await page.click('button[data-tab="recepty"]');
  await page.waitForTimeout(400);
  await page.selectOption('#recPrichut', { label: 'Choux — Pistáciovo kávový' });
  await page.fill('#recKusy', '20');
  await page.click('button:has-text("Zobraziť recepty")');
  await page.waitForSelector('#rozpisPoznamka', { timeout: 5000 });
  ok('políčko na poznámku je nad prvým receptom', await page.evaluate(() => {
    const p = document.getElementById('rozpisPoznamka').getBoundingClientRect();
    const r = document.querySelector('#receptyRozpis h3:not(.admin-row h3)');
    const prvy = [...document.querySelectorAll('#receptyRozpis h3')][1];
    return prvy ? p.top < prvy.getBoundingClientRect().top : false;
  }));
  ok('vysvetľujúci odsek je preč',
    !/Gramáže sú prepočítané na/.test(await page.textContent('#receptyRozpis')));

  odpoved = 'Kávové na 20';
  await page.fill('#rozpisPoznamka', 'Craquelin na 20 ks robím dvojmo.');
  await page.click('#receptyRozpis button:has-text("Uložiť poznámku")');
  await page.waitForFunction(() => /Uložené/.test(document.getElementById('rozpisPoznStav').textContent),
    { timeout: 5000 });
  const novy = db.recipe_presets.find((x) => x.name === 'Kávové na 20');
  ok('bez uloženého receptu sa rovno založí nový aj s poznámkou',
    !!novy && novy.note === 'Craquelin na 20 ks robím dvojmo.');

  await page.fill('#rozpisPoznamka', 'Craquelin dvojmo, polevy bolo málo.');
  await page.click('#receptyRozpis button:has-text("Uložiť poznámku")');
  await page.waitForTimeout(600);
  ok('druhé uloženie už len prepíše poznámku toho istého receptu',
    db.recipe_presets.filter((x) => x.name === 'Kávové na 20').length === 1
    && db.recipe_presets.find((x) => x.name === 'Kávové na 20').note === 'Craquelin dvojmo, polevy bolo málo.');

  await page.fill('#recKusy', '6');
  await page.click('#ulozeneList button:has-text("Kávové na 20")');
  await page.waitForSelector('#rozpisPoznamka', { timeout: 5000 });
  ok('otvorenie uloženého receptu vypíše jeho poznámku',
    (await page.inputValue('#rozpisPoznamka')) === 'Craquelin dvojmo, polevy bolo málo.');

  await page.selectOption('#recPrichut', { label: 'Choux — Pistáciovo mangový' });
  await page.fill('#recKusy', '10');
  await page.click('button:has-text("Zobraziť recepty")');
  await page.waitForSelector('#rozpisPoznamka', { timeout: 5000 });
  ok('iný rozpis nezdedí cudziu poznámku', (await page.inputValue('#rozpisPoznamka')) === '');

  console.log('\nRUČNÉ OBJEDNÁVKY MIMO LIMITU:');
  // Deň s limitom 6: webová objednávka ho vyčerpá, ručná sa zapíše aj tak
  // a zo zvyšnej kapacity neuberie.
  const denLimit = '2027-03-06';
  db.open_days.push({ day: denLimit, is_open: true, cap_zakusky: 6, cap_torty: 1, cap_chlebik: 1 });
  const zapis = async (meno, kusy) => page.evaluate(async ([den, m, k]) => {
    const r = await fetch('/api/admin/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 Authorization: 'Bearer ' + localStorage.getItem('dosrdiecka_access_token') },
      body: JSON.stringify({ day: den, name: m, phone: '0900', note: 'test',
                             items: [{ product_id: 'p-choux', qty: k }] }),
    });
    return r.status;
  }, [denLimit, meno, kusy]);

  ok('ručná objednávka 6 ks prešla', (await zapis('Ručná A', 6)) === 200);
  ok('druhá ručná do už plného dňa prešla tiež', (await zapis('Ručná B', 6)) === 200);

  await page.click('button[data-tab="days"]');
  await page.waitForTimeout(600);
  const riadokDna = await page.evaluate((d) => {
    const tr = [...document.querySelectorAll('#daysList tbody tr')].find((r) => r.textContent.includes(d));
    return tr ? tr.textContent.replace(/\s+/g, ' ').trim() : '';
  }, denLimit);
  console.log('  deň: ' + riadokDna);
  ok('zvyšná kapacita na webe ostala celá (6 ks)', /6 ks · 1 torta/.test(riadokDna));
  ok('a je vidieť, čo je dohodnuté mimo web', /mimo web: 12 ks/.test(riadokDna));

  console.log('\nPENIAZE:');
  // Objednávky do obdobia. Jedna zaplatená s eurom navyše, jedna nezaplatená,
  // jedna zrušená (tá sa nesmie rátať nikam).
  const dnes = new Date();
  const mes = `${dnes.getFullYear()}-${String(dnes.getMonth() + 1).padStart(2, '0')}`;
  db.orders.push(
    { id: 'op1', order_no: 101, day: mes + '-10', customer_name: 'Zuzka', phone: '', email: '',
      note: '', status: 'vybavena', total_estimate: 18, paid_amount: 19, paid_on: mes + '-10', paid_note: '' },
    { id: 'op2', order_no: 102, day: mes + '-11', customer_name: 'Eva', phone: '', email: '',
      note: '', status: 'nova', total_estimate: 12, paid_amount: null, paid_on: null, paid_note: '' },
    { id: 'op3', order_no: 103, day: mes + '-12', customer_name: 'Iva', phone: '', email: '',
      note: '', status: 'zrusena', total_estimate: 99, paid_amount: null, paid_on: null, paid_note: '' },
  );

  await page.click('button[data-tab="peniaze"]');
  await page.waitForSelector('#penSuhrn table', { timeout: 5000 });
  const suhrn = (await page.textContent('#penSuhrn')).replace(/\s+/g, ' ');
  console.log('  súhrn: ' + suhrn.slice(0, 200));
  ok('obdobie sa predvyplnilo na tento mesiac',
    (await page.inputValue('#penOd')) === mes + '-01');
  ok('objednávky sčítané bez zrušenej (30 €)', /Objednávky \(2\) 30 €/.test(suhrn));
  ok('prijaté zvlášť od objednaného (19 €)', /Prijaté 19 €/.test(suhrn));
  ok('rozdiel je vidieť', /-11 € oproti objednávkam/.test(suhrn));
  ok('nezaplatená objednávka je menom vypísaná', /Nezaplatené \(1\) 12 € Eva #102/.test(suhrn));

  const penRiadky = await page.$$eval('#penObjednavky tbody tr', (r) => r.length);
  ok('zrušená objednávka nie je ani v tabuľke (' + penRiadky + ' riadky)', penRiadky === 2);

  await page.fill('[data-platba="op2"]', '15');
  await page.fill('[data-platba-pozn="op2"]', 'zaokrúhlila nahor');
  await page.click('#tab-peniaze button:has-text("Uložiť zmeny")');
  await page.waitForFunction(() => /Uložené/.test(document.getElementById('penStav').textContent),
    { timeout: 5000 });
  const evka = db.orders.find((o) => o.id === 'op2');
  ok('platba sa uložila (' + evka.paid_amount + ' €)', Number(evka.paid_amount) === 15);
  ok('dátum platby sa doplnil sám', !!evka.paid_on);
  ok('poznámka pri platbe sa uložila', evka.paid_note === 'zaokrúhlila nahor');
  ok('cena objednávky sa platbou neprepísala', Number(evka.total_estimate) === 12);

  const poUlozeni = (await page.textContent('#penSuhrn')).replace(/\s+/g, ' ');
  ok('súhrn sa prepočítal (34 € prijaté)', /Prijaté 34 €/.test(poUlozeni));
  ok('nezaplatených už niet', /Nezaplatené \(0\)/.test(poUlozeni));

  await page.fill('[data-platba="op2"]', '');
  await page.click('#tab-peniaze button:has-text("Uložiť zmeny")');
  await page.waitForFunction(() => /Uložené/.test(document.getElementById('penStav').textContent),
    { timeout: 5000 });
  ok('vymazaná suma vráti objednávku medzi nezaplatené',
    db.orders.find((o) => o.id === 'op2').paid_amount === null
    && /Nezaplatené \(1\)/.test((await page.textContent('#penSuhrn')).replace(/\s+/g, ' ')));

  // Prebytočné </div> v Kalkulačke zatvárali obal stránky priamo tam, takže
  // Nastavenia (a po pridaní aj Peniaze) vypadli von: bez okrajov, plná šírka.
  const vObale = await page.evaluate(() => ['recepty', 'kalkulacka', 'peniaze', 'settings']
    .filter((t) => document.getElementById('tab-' + t).parentElement.id !== 'dashboardView'));
  ok('všetky záložky sú v obale stránky' + (vObale.length ? ' (vonku: ' + vObale.join(', ') + ')' : ''),
    vObale.length === 0);

  await page.screenshot({ path: path.join(VYSTUP, 'peniaze.png'), fullPage: false });

  await page.click('button[data-tab="kalkulacka"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(VYSTUP, 'kalkulacka.png'), fullPage: false });
  await page.click('button[data-tab="recepty"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const d = document.querySelector('#receptyList details'); if (d) d.open = true;
    d.scrollIntoView();
  });
  await page.waitForTimeout(300);
  const farba = await page.$eval('#receptyList label', (l) => getComputedStyle(l).color + ' / ' + getComputedStyle(l).fontWeight);
  ok('popisky sú tmavé a tučné (' + farba + ')', /51, 48, 43/.test(farba) && /700/.test(farba));

  console.log('\nNIČ NEPRETEKÁ MIMO STRÁNKU:');
  // Tabuľky v správe bývajú širšie než karta — objednávky majú osem
  // stĺpcov. Keď prebytok nepohltí karta, vodorovný posuvník dostane celá
  // stránka a posledný stĺpec sa odreže. Je to chyba, ktorú testy na
  // výpočty nikdy nechytia, tak sa meria tu, na šírkach bežných laptopov.
  for (const sirka of [1024, 1280, 1366]) {
    await page.setViewportSize({ width: sirka, height: 820 });
    const zle = [];
    for (const tab of ['orders', 'days', 'products', 'suroviny', 'recepty', 'kalkulacka', 'peniaze', 'settings']) {
      await page.click(`button[data-tab="${tab}"]`);
      await page.waitForTimeout(350);
      const cez = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (cez > 2) zle.push(`${tab} o ${cez} px`);
    }
    ok(`pri ${sirka} px stránka nemá vodorovný posuvník` + (zle.length ? ' (' + zle.join(', ') + ')' : ''),
      zle.length === 0);
  }

  // A tlačidlo v poslednom stĺpci musí byť celé vidieť, nie odrezané.
  await page.setViewportSize({ width: 1366, height: 820 });
  await page.click('button[data-tab="orders"]');
  await page.waitForSelector('#ordersList button:has-text("Do receptov")', { timeout: 5000 });
  const vonku = await page.evaluate(() => {
    const b = document.querySelector('#ordersList button');
    const karta = b.closest('.admin-card').getBoundingClientRect();
    return Math.round(b.getBoundingClientRect().right - karta.right);
  });
  ok('„Do receptov" je celé v karte (' + vonku + ' px za okrajom)', vonku <= 0);

  console.log('\nDLHÁ POZNÁMKA NESTLAČÍ PRAVÚ STRANU:');
  // Poznámka od zákazníčky býva aj na pár viet. Keď sa nezalomí, roztiahne
  // stĺpec Zákazník cez pol tabuľky a „Položky" potom lámu každý výrobok
  // na tri riadky.
  await page.evaluate(async () => {
    const r = await fetch('/api/admin/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 Authorization: 'Bearer ' + localStorage.getItem('dosrdiecka_access_token') },
      body: JSON.stringify({ day: '2027-05-08', name: 'Ľubomíra Števuliaková', phone: '+421949172298',
        note: 'ziadne intolerancie, moze byt akakolvek prichut choux ak by si robila inu prichut pre '
          + 'niekoho mozes to dat naraz :) ak by si nemala ziadne ine objednavky nemusis len kvoli mne '
          + 'robit ale boli bomboveeee',
        items: [{ product_id: 'p-choux', qty: 6 }] }),
    });
    return r.status;
  });
  await page.click('button[data-tab="days"]');
  await page.click('button[data-tab="orders"]');
  await page.waitForTimeout(700);
  const pozn = await page.evaluate(() => {
    const span = [...document.querySelectorAll('#ordersList .objpozn')][0];
    if (!span) return null;
    const td = span.closest('td');
    return {
      blok: getComputedStyle(span).display,
      sirka: Math.round(span.getBoundingClientRect().width),
      stlpec: Math.round(td.getBoundingClientRect().width),
    };
  });
  ok('poznámka je samostatný blok, nie inline text', pozn && pozn.blok === 'block');
  ok('a je zalomená na rozumnú šírku (' + (pozn && pozn.sirka) + ' px)',
    pozn && pozn.sirka > 0 && pozn.sirka <= 400);
  ok('stĺpec Zákazník tým neroztiahne tabuľku (' + (pozn && pozn.stlpec) + ' px)',
    pozn && pozn.stlpec <= 440);

  console.log('\nMINUTÉ PENIAZE PREŽIJÚ ZMAZANIE ZOZNAMU:');
  // Nákupný zoznam je plán a maže sa. Koľko odišlo z peňaženky je fakt
  // a ostať má — inak sa Peniaze spätne menia podľa toho, čo si majiteľka
  // medzitým upratala.
  page.removeAllListeners('dialog');
  let suma = '';
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? suma : undefined));

  await page.click('button[data-tab="kalkulacka"]');
  await page.waitForTimeout(600);
  await page.click('button:has-text("Nový zoznam")');
  await page.waitForTimeout(300);
  await page.fill('#zozDen', '2027-06-12');
  await page.fill('#zozNazov', 'sobota na zmazanie');
  await page.selectOption('#zozPolozky .kalProdukt', { label: 'Choux — Pistáciovo kávový' });
  await page.fill('#zozPolozky .kalKusy', '12');
  await page.click('button:has-text("Uložiť zoznam")');
  await page.waitForFunction(() => /Uložené/.test(document.getElementById('zozStav').textContent),
    { timeout: 5000 });
  ok('zoznam na pokus je uložený', db.shopping_plans.some((z) => z.name === 'sobota na zmazanie'));

  suma = '103,20';   // prepísané podľa bločku
  await page.click('button:has-text("Zmazať tento zoznam")');
  await page.waitForTimeout(1200);
  ok('zoznam je zmazaný', !db.shopping_plans.some((z) => z.name === 'sobota na zmazanie'));
  const nakupZoZoznamu = db.purchases[db.purchases.length - 1];
  ok('ale suma z bločku ostala zapísaná (' + (nakupZoZoznamu && nakupZoZoznamu.amount) + ' €)',
    !!nakupZoZoznamu && Number(nakupZoZoznamu.amount) === 103.2);
  ok('aj s dátumom zo zoznamu', nakupZoZoznamu && nakupZoZoznamu.day === '2027-06-12');
  ok('a so zamrazenou spotrebou, nie prázdnou',
    nakupZoZoznamu && nakupZoZoznamu.consumption !== null && Number(nakupZoZoznamu.consumption) > 0);

  await page.click('button[data-tab="peniaze"]');
  await page.waitForTimeout(400);
  await page.fill('#penOd', '2027-06-01');
  await page.fill('#penDo', '2027-06-30');
  await page.click('#tab-peniaze button:has-text("Zobraziť")');
  await page.waitForSelector('#penSuhrn table', { timeout: 5000 });
  const peniaze = (await page.textContent('#penSuhrn')).replace(/\s+/g, ' ');
  ok('Peniaze to započítajú, hoci zoznam už neexistuje', /Reálny nákup \(1 nákup\) 103,2 €/.test(peniaze));
  ok('plánovaný nákup tam po zmazaní zoznamu nie je', !/Plánovaný nákup/.test(peniaze));
  const vypis = (await page.textContent('#nakupyList')).replace(/\s+/g, ' ');
  console.log('  zoznam nákupov: ' + vypis.trim().slice(0, 120));
  ok('a nákup je vidieť v zozname nákupov', /2027-06-12/.test(vypis) && /103,2/.test(vypis));

  console.log('\nSPÝTA SA AJ VTEDY, KEĎ SUMU NEVIE VYPOČÍTAŤ:');
  // Časť surovín nemá vyplnené balenie ani cenu, takže vypočítaný nákup
  // vyjde 0. Pôvodne sa vtedy otázka MLČKY preskočila: zoznam zmizol aj
  // s číslom a nedalo sa zistiť prečo. Sumu z bločku pritom majiteľka vie,
  // aj keď ju systém spočítať nevie.
  const povodneCeny = db.ingredients.map((i) => [i.pack_price, i.pack_size]);
  db.ingredients.forEach((i) => { i.pack_price = null; i.pack_size = null; });

  await page.click('button[data-tab="kalkulacka"]');
  await page.waitForTimeout(600);
  await page.click('button:has-text("Nový zoznam")');
  await page.waitForTimeout(300);
  await page.fill('#zozDen', '2027-07-03');
  await page.fill('#zozNazov', 'bez cien');
  await page.selectOption('#zozPolozky .kalProdukt', { label: 'Choux — Pistáciovo kávový' });
  await page.fill('#zozPolozky .kalKusy', '6');
  await page.click('button:has-text("Uložiť zoznam")');
  await page.waitForFunction(() => /Uložené/.test(document.getElementById('zozStav').textContent),
    { timeout: 5000 });

  let ponukaSumy = null;
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => {
    if (d.type() === 'prompt') ponukaSumy = d.defaultValue();
    d.accept(d.type() === 'prompt' ? '48,30' : undefined);
  });
  await page.click('button:has-text("Zmazať tento zoznam")');
  await page.waitForTimeout(1500);

  ok('otázka na sumu príde, aj keď sa vypočítať nedala', ponukaSumy !== null);
  ok('a políčko je prázdne, nie nula (' + JSON.stringify(ponukaSumy) + ')', ponukaSumy === '');
  const bezCien = db.purchases.find((n) => /bez cien/.test(n.note || ''));
  ok('suma z bločku sa aj tak zapíše (' + (bezCien && bezCien.amount) + ' €)',
    !!bezCien && Number(bezCien.amount) === 48.3);
  ok('spotreba ostane prázdna, keď sa nedá dopočítať', bezCien && bezCien.consumption === null);

  db.ingredients.forEach((i, idx) => { [i.pack_price, i.pack_size] = povodneCeny[idx]; });
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? suma : undefined));
  await page.click('button[data-tab="peniaze"]');
  await page.waitForTimeout(400);
  await page.click('#tab-peniaze button:has-text("Zobraziť")');
  await page.waitForSelector('#penSuhrn table', { timeout: 5000 });

  console.log('\nNÁKUP SA DÁ ZAPÍSAŤ AJ BEZ ZOZNAMU:');
  await page.fill('#nakDen', '2027-06-20');
  await page.fill('#nakSuma', '12.50');
  await page.fill('#nakPozn', 'maslo navyše');
  await page.click('button:has-text("Zapísať nákup")');
  await page.waitForFunction(() => /Zapísané/.test(document.getElementById('nakStav').textContent)
    && !/Počítam/.test(document.getElementById('penSuhrn').textContent), { timeout: 5000 });
  const rucny = db.purchases.find((n) => n.note === 'maslo navyše');
  ok('ručne zapísaný nákup sa uložil', !!rucny && Number(rucny.amount) === 12.5);
  ok('bez spotreby ostane prázdna, nie nula', rucny && rucny.consumption === null);
  const poRucnom = (await page.textContent('#penSuhrn')).replace(/\s+/g, ' ');
  ok('súhrn sa prepočítal (115,7 €)', /Reálny nákup \(2 nákupy\) 115,7 €/.test(poRucnom));
  ok('a povie, že jeden nákup nemá údaj o spotrebe',
    /1 nákup bez tohto údaju sa neráta/.test(poRucnom));

  console.log('\nPENIAZE: NÁKUP, SPOTREBA, REÁLNY NÁKUP:');
  await page.click('button[data-tab="peniaze"]');
  await page.waitForSelector('#penSuhrn table', { timeout: 5000 });
  const riadkySuhrnu = await page.$$eval('#penSuhrn tbody tr',
    (rs) => rs.map((r) => r.children[0].textContent.replace(/\s+/g, ' ').trim()));
  const kde = (re) => riadkySuhrnu.findIndex((r) => re.test(r));
  ok('poradie je Nákup → Z toho sa naozaj minie → Reálny nákup ('
    + riadkySuhrnu.slice(kde(/^Nákup/)).join(' / ') + ')',
    kde(/^Nákup/) >= 0 && kde(/^Z toho/) === kde(/^Nákup/) + 1
    && kde(/^Reálny nákup/) === kde(/^Z toho/) + 1);
  ok('„Plánovaný nákup" samostatne už nie je', kde(/^Plánovaný/) === -1);
  const penText = (await page.textContent('#penSuhrn')).replace(/\s+/g, ' ');
  ok('pri marži sa povie, z čoho je spotreba počítaná',
    /bez réžie a bez práce · (zo zapísaných nákupov|z nákupného zoznamu|spotreba zatiaľ)/.test(penText));
  ok('nula sa skloňuje ako päť, nie ako dva', !/\b0 (nákupy|zoznamy|objednávky)\b/.test(penText));

  console.log('\nPOLÍČKA SÚ NA PÍSANIE, NIE NA KLIKANIE ŠÍPKAMI:');
  // Šípka pri step 0,001 raz ticho spravila z „20 ks" hodnotu „20,002 ks"
  // a prepočítala tým cenu za kus. Číselné polia sú odvtedy bez nich.
  const soSipkami = [];
  for (const tab of ['orders', 'days', 'products', 'suroviny', 'recepty', 'kalkulacka', 'peniaze']) {
    await page.click(`button[data-tab="${tab}"]`);
    await page.waitForTimeout(350);
    const zle = await page.evaluate((t) => [...document.querySelectorAll(
      '#tab-' + t + ' input[type="number"]')]
      .filter((el) => getComputedStyle(el).appearance !== 'textfield')
      .map((el) => el.id || el.className || 'bez id').slice(0, 3), tab);
    if (zle.length) soSipkami.push(`${tab}: ${zle.join(', ')}`);
  }
  ok('žiadne číselné pole v správe nemá šípky' + (soSipkami.length ? ' (' + soSipkami.join(' | ') + ')' : ''),
    soSipkami.length === 0);

  console.log('\nPOLÍČKA V NÁKUPOCH STOJA V JEDNEJ LÍNII:');
  // Nápoveda pod jedným políčkom dvíhala celú bunku nad ostatné.
  await page.click('button[data-tab="peniaze"]');
  await page.waitForTimeout(400);
  const vrchy = await page.evaluate(() => ['nakDen', 'nakSuma', 'nakSpotreba', 'nakPozn']
    .map((id) => Math.round(document.getElementById(id).getBoundingClientRect().top)));
  const rozptyl = Math.max(...vrchy) - Math.min(...vrchy);
  // Pole s dátumom je od prehliadača o pár pixelov vyššie, to nevadí.
  ok('rozptyl je pár pixelov, nie celý riadok (' + rozptyl + ' px)', rozptyl <= 3);

  console.log('\nOBNOVENIE STRÁNKY NEVYHODÍ ZO ZÁLOŽKY:');
  await page.click('button[data-tab="recepty"]');
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.admin-tabs', { timeout: 5000 });
  await page.waitForTimeout(500);
  ok('po obnovení ostane otvorená tá istá záložka', await page.evaluate(() =>
    document.getElementById('tab-recepty').classList.contains('on')));
  await page.click('button[data-tab="peniaze"]');
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.admin-tabs', { timeout: 5000 });
  await page.waitForTimeout(500);
  ok('platí to pre ktorúkoľvek, nielen pre jednu', await page.evaluate(() =>
    document.getElementById('tab-peniaze').classList.contains('on')));
  await page.screenshot({ path: path.join(VYSTUP, 'recepty-uprava.png'), fullPage: false });
  console.log('obrázky:', VYSTUP);
  console.log('chyby v prehliadači:', chyby.length ? chyby : 'žiadne');
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('ZLYHALO:', e.message); process.exit(1); });
