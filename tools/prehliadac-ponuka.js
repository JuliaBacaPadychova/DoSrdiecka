// Ponuka na verejnej stránke v skutočnom prehliadači.
//
// Správu preklikávajú ostatné dva scenáre. Toto je to, čo vidí
// zákazníčka: karty v ponuke, prelistovanie viacerých fotiek a výrobky,
// ktoré sa ešte nedajú objednať.
//
// Spúšťa sa rovnako ako tools/prehliadac-sprava.js, viď tools/README.md.

const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..');
const VYSTUP = process.env.PREHLIADAC_VYSTUP || fs.mkdtempSync(path.join(require('os').tmpdir(), 'dosrdiecka-'));
const PORT = process.env.PREHLIADAC_PORT || '3131';

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

  // Torta s tromi fotkami a dvoma veľkosťami — na galériu aj na to, či
  // prepnutie veľkosti nevráti fotku na prvú.
  const torta = db.products.find((p) => p.id === 'p-brownie');
  torta.description = 'Vláčne brownie s vanilkovým krémom.';
  torta.gallery = ['/assets/img/choux.jpg', '/assets/img/chlebik.jpg'];
  db.products.push({ ...torta, id: 'p-brownie-16', sub: 'Ø 16 cm', price: 55, sort_order: 2 });

  // Kysnuté: chlebík a dva výrobky, ktoré sa ešte nedajú objednať.
  const kys = db.categories.find((c) => c.id === 'chlebik');
  kys.name = 'Kysnuté';
  kys.note = '';
  kys.sort_order = 9;
  const teaser = (id, name, poradie) => ({ id, category_id: 'chlebik', name, sub: '',
    description: '', alt_text: '', price: 0, min_qty: 1, min_label: '', allergens: '',
    image_url: '', active: true, sort_order: poradie, teaser: true, gallery: [] });
  db.products.push(teaser('p-knedla', 'Domáca parená knedľa', 2),
    teaser('p-rozky', 'Domáce rožky', 3));

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  process.env.PORT = PORT;
  process.chdir(REPO);
  require(path.join(REPO, 'dev-server.js'));
  await new Promise((r) => setTimeout(r, 800));

  const browser = await chromium.launch({ executablePath: process.env.PREHLIADAC_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  const chyby = [];
  page.on('pageerror', (e) => chyby.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) chyby.push(r.status() + ' ' + r.url()); });

  const ok = (co, podmienka) => console.log((podmienka ? '  OK   ' : '  CHYBA') + '  ' + co);

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu .card', { timeout: 8000 });

  console.log('PORADIE A NADPISY KATEGÓRIÍ:');
  const kategorie = await page.$$eval('.cathead h3', (h) => h.map((x) => x.textContent.trim()));
  ok('kysnuté sú posledné, pod tortami (' + kategorie.join(' · ') + ')',
    kategorie[kategorie.length - 1] === 'Kysnuté');
  const popisky = await page.$$eval('.catblock', (b) => b.map((x) => !!x.querySelector('.catnote')));
  ok('kategória bez popisu nemá pod nadpisom ani prázdny odstavec',
    popisky[popisky.length - 1] === false);

  console.log('\nVIAC FOTIEK K JEDNÉMU VÝROBKU:');
  const gal = '.ph.gal';
  ok('karta s viacerými fotkami má šípky', (await page.$$(`${gal} .gnav`)).length === 2);
  ok('a bodku na každú fotku', (await page.$$(`${gal} .gdots span`)).length === 3);
  // Šípky musia byť vidieť bez nabehnutia myšou — inak návštevník
  // netuší, že sú tam ďalšie fotky.
  const vidnoSipky = await page.$eval(`${gal} .gnav.next`, (el) => {
    const st = getComputedStyle(el);
    return Number(st.opacity) > 0.5 && st.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
  });
  ok('šípky sú vidieť aj bez nabehnutia myšou', vidnoSipky);

  const stav = () => page.$eval(gal, (el) => {
    const obr = Array.from(el.querySelectorAll('img'));
    return {
      naVrchu: obr.findIndex((i) => i.classList.contains('on')),
      bodka: Array.from(el.querySelectorAll('.gdots span')).findIndex((s) => s.classList.contains('on')),
      popisov: obr.filter((i) => i.alt).length,
    };
  });
  const zaciatok = await stav();
  ok('navrchu je hlavná fotka', zaciatok.naVrchu === 0 && zaciatok.bodka === 0);
  ok('popis má len tá fotka, ktorá je vidieť', zaciatok.popisov === 1);

  await page.click(`${gal} .gnav.next`);
  await page.waitForTimeout(400);
  const poDopravo = await stav();
  ok('šípka doprava posunie na druhú fotku', poDopravo.naVrchu === 1 && poDopravo.bodka === 1);
  ok('popis sa presunul s ňou', poDopravo.popisov === 1);

  await page.click(`${gal} .gnav.prev`);
  await page.click(`${gal} .gnav.prev`);
  await page.waitForTimeout(400);
  const poDolava = await stav();
  ok('doľava sa z prvej preklopí na poslednú (' + poDolava.naVrchu + ')', poDolava.naVrchu === 2);

  // Prekreslenie ponuky nesmie zahodiť, kde v listovaní návštevník je.
  await page.click('.chipv:not(.on)');
  await page.waitForTimeout(400);
  const poVelkosti = await stav();
  ok('prepnutie veľkosti nevráti fotku na prvú', poVelkosti.naVrchu === 2);

  ok('karta s jednou fotkou šípky nemá',
    (await page.$$('.card:not(:has(.ph.gal)) .gnav')).length === 0);

  console.log('\nČO SA EŠTE NEDÁ OBJEDNAŤ:');
  const teasery = await page.$$('.card.teaser');
  ok('obe karty „čoskoro" sú v ponuke (' + teasery.length + ')', teasery.length === 2);
  const prvy = await page.$eval('.card.teaser', (el) => ({
    nadpis: el.querySelector('h4').textContent.trim(),
    napis: el.querySelector('.soon-text') ? el.querySelector('.soon-text').textContent.trim() : null,
    maCenu: !!el.querySelector('.price'),
    maTlacidlo: !!el.querySelector('button'),
    maAlergeny: !!el.querySelector('.tag'),
  }));
  ok('má názov a nápis Čoskoro (' + prvy.nadpis + ')', prvy.napis === 'Čoskoro' && !!prvy.nadpis);
  ok('nemá cenu, alergény ani tlačidlo',
    !prvy.maCenu && !prvy.maTlacidlo && !prvy.maAlergeny);
  const vysky = await page.$$eval('.card.teaser', (k) => k.map((x) => Math.round(x.getBoundingClientRect().height)));
  ok('obe karty sú rovnako vysoké aj pri dlhšom názve (' + vysky.join(' / ') + ')',
    vysky[0] === vysky[1]);
  ok('sú v tom istom bloku ako chlebík',
    await page.$eval('.card.teaser', (el) => {
      const blok = el.closest('.catblock');
      return blok.querySelector('.cathead h3').textContent.trim() === 'Kysnuté'
        && blok.querySelectorAll('.card:not(.teaser)').length >= 1;
    }));
  // To najdôležitejšie: do objednávky sa nesmú dostať ani omylom.
  ok('neobjednateľný výrobok nie je medzi tými, ktoré sa dajú pridať',
    await page.evaluate(() => !document.querySelector('[id^="mc-p-knedla"]')
      && !document.querySelector('[id^="mc-p-rozky"]')));

  await page.screenshot({ path: path.join(VYSTUP, 'ponuka.png'), fullPage: true });
  console.log('\nobrázky:', VYSTUP);
  console.log('chyby v prehliadači:', chyby.length ? chyby : 'žiadne');
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('ZLYHALO:', e.message); process.exit(1); });
