-- ---------------------------------------------------------------------
-- MIGRÁCIA: receptár, suroviny a kalkulácia nákladov
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Nahrádza excel "Choux_varianty.xlsx" a "Odpalovane_cesto.xlsx":
--   ingredients      — kartotéka surovín (bývalý hárok Ciselnik)
--   recipes          — recepty: cesto, krém, poleva, vklad (hárok Všetko)
--   recipe_items     — čo a koľko ide do ktorého receptu
--   product_recipes  — ktoré recepty tvoria ktorú príchuť na webe
--
-- Prečo takto a nie ďalšie hárky v exceli:
--  * jeden recept je zapísaný RAZ a škáluje sa počtom kusov, nie kópiou
--    hárku (v exceli bol každý variant vlastný hárok),
--  * nákupný zoznam sa dá sčítať cez VIAC príchutí naraz (SUMIF v exceli
--    vedel sčítať len v rámci jedného hárku),
--  * názvy surovín sú tu jedny jediné — v exceli mal receptár vlastné
--    názvy ("mascarpone", "smotana 33%") a číselník iné ("Mascarpone",
--    "Smotana na šľahanie 33% (malá)"), takže sa vôbec nespájali.
--
-- Bezpečné spustiť aj opakovane: tabuľky sa vytvoria len ak chýbajú a
-- záznamy sa vkladajú len ak ešte nie sú. Ceny ani množstvá, ktoré si
-- medzitým upravila v správe webu, sa NEPREPÍŠU.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- SUROVINY (kartotéka)
--
-- pack_size / pack_price = balenie, v akom sa surovina kupuje. Keď sú
-- prázdne (soľ, sóda, vanilka, obal — kupuje sa "ako kedy kde"), riadok
-- v kalkulácii NEZMIZNE, ale sa vypíše ako "doplň balenie". V exceli ho
-- IFERROR ticho zhltol a cena vyšla nižšia, než bola.
--
-- negligible = vedomé rozhodnutie, že sa surovina do ceny neráta (voda).
-- kind = 'surovina' | 'obal' | 'rezia' — obal a réžia sa rátajú na kus,
-- nie na gramy, preto majú vlastný druh.
-- ---------------------------------------------------------------------
create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null default 'g' check (unit in ('g','ml','ks')),
  pack_size numeric(10,3),
  pack_price numeric(10,3),
  price_date date,
  price_source text not null default '',
  negligible boolean not null default false,
  kind text not null default 'surovina' check (kind in ('surovina','obal','rezia')),
  allergens text not null default '',
  note text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RECEPTY
--
-- yield_qty + yield_unit = na čo je recept napísaný. Odpalované cesto je
-- napísané na 20 choux (a to isté cesto vydá 12 veterníkov — to sa rieši
-- v product_recipes, nie druhým receptom). Coulis je napísané na 150 g,
-- nie na kusy, preto yield_unit.
-- ---------------------------------------------------------------------
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'krem' check (kind in ('cesto','krem','poleva','vklad','ozdoba','ine')),
  yield_qty numeric(10,3) not null,
  yield_unit text not null default 'ks' check (yield_unit in ('ks','g')),
  steps text not null default '',
  source_url text not null default '',
  note text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- POLOŽKY RECEPTU
--
-- amount smie byť prázdne: "štipka soli" a "½ ČL vanilky" sú v recepte
-- naozaj bez gramáže. Takýto riadok sa v recepte ukáže, ale do ceny
-- nevstúpi — a je vidieť, že tam je, nie že sa stratil.
-- ---------------------------------------------------------------------
create table if not exists recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  amount numeric(10,3),
  optional boolean not null default false,
  note text not null default '',
  unique (recipe_id, ingredient_id)
);
create index if not exists recipe_items_recipe_id_idx on recipe_items(recipe_id);

-- ---------------------------------------------------------------------
-- ČO TVORÍ PRÍCHUŤ
--
-- products = príchuť na webe (napr. Choux / Pistáciovo kávový). Tu sa
-- k nej priviažu recepty a povie sa, koľko z receptu ide na JEDEN kus:
--   cesto na 20 choux  -> qty_per_piece = 1   (jeden kus z výťažnosti)
--   coulis na 150 g    -> qty_per_piece = 12  (12 g na kus)
-- Jednotka qty_per_piece je vždy yield_unit daného receptu.
-- ---------------------------------------------------------------------
create table if not exists product_recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete restrict,
  qty_per_piece numeric(10,3) not null default 1,
  note text not null default '',
  unique (product_id, recipe_id)
);
create index if not exists product_recipes_product_id_idx on product_recipes(product_id);

-- Rovnaká ochrana ako pri ostatných tabuľkách: do databázy sa chodí len
-- cez naše /api funkcie so service-role kľúčom, nikdy z prehliadača.
alter table ingredients enable row level security;
alter table recipes enable row level security;
alter table recipe_items enable row level security;
alter table product_recipes enable row level security;

-- ---------------------------------------------------------------------
-- KARTOTÉKA SUROVÍN — prevzatá z hárku Ciselnik
--
-- Ceny sú tie z excelu a sú približne pol roka staré. Preto má každá
-- surovina price_date a price_source: nech je o pol roka vidieť, ktorá
-- cena je zastaraná, a nie je to len pocit.
-- ---------------------------------------------------------------------
insert into ingredients (name, unit, pack_size, pack_price, price_source, note) values
  ('Čokoláda biela 28%',              'g',   400,   7.800, 'excel Ciselnik', ''),
  ('Čokoláda gold 30,4%',             'g',   400,  10.250, 'excel Ciselnik', ''),
  ('Čokoláda mliečna 33%',            'g',   400,   8.500, 'excel Ciselnik', ''),
  ('Čokoláda tmavá 54%',              'g',   400,   8.900, 'excel Ciselnik', ''),
  ('Cmar',                            'ml',  500,   3.000, 'excel Ciselnik', ''),
  ('Cukor krupicový',                 'g',  1000,   1.320, 'excel Ciselnik', ''),
  ('Cukor kryštálový',                'g',  1000,   1.320, 'excel Ciselnik', ''),
  ('Cukor práškový',                  'g',  1000,   1.650, 'excel Ciselnik', ''),
  ('Cukor trstinový',                 'g',  1000,   2.750, 'excel Ciselnik', ''),
  ('Káva',                            'g',   200,   8.000, 'excel Ciselnik', ''),
  ('Kakao holandského typu',          'g',   100,   1.650, 'excel Ciselnik', ''),
  ('Karamel',                         'g',   450,   3.300, 'excel Ciselnik', ''),
  ('Lieskovcový krém 100%',           'g',   200,   9.350, 'excel Ciselnik', ''),
  ('Mandľová múka',                   'g',   500,   8.800, 'excel Ciselnik', ''),
  ('Mascarpone',                      'g',   250,   2.530, 'excel Ciselnik', ''),
  ('Maslo 82%',                       'g',   250,   3.080, 'excel Ciselnik', ''),
  ('Maslo kakaové',                   'g',   400,  12.500, 'excel Ciselnik', ''),
  ('Med',                             'g',  1000,   5.000, 'excel Ciselnik', ''),
  ('Mlieko plnotučné 3,5%',           'ml', 1000,   1.210, 'excel Ciselnik', ''),
  ('Múka hladká',                     'g',  1000,   0.880, 'excel Ciselnik', ''),
  ('Múka polohrubá',                  'g',  1000,   0.880, 'excel Ciselnik', ''),
  ('Múka T650',                       'g',  1000,   0.880, 'excel Ciselnik', ''),
  ('Olej slnečnicový',                'ml', 1000,   2.090, 'excel Ciselnik', ''),
  ('Pasta pistáciová 100%',           'g',   350,  24.000, 'excel Ciselnik', ''),
  ('Prášok do pečiva',                'g',    12,   0.165, 'excel Ciselnik', ''),
  ('Pyré malina',                     'g',  1000,  24.000, 'excel Ciselnik', ''),
  ('Pyré mango',                      'g',  1000,  12.100, 'excel Ciselnik', ''),
  ('Pyré rebarbora',                  'g',  1000,  12.100, 'excel Ciselnik', ''),
  ('Sirup glukózový',                 'g',  1000,   6.600, 'excel Ciselnik', ''),
  ('Škrob kukuričný',                 'g',    40,   0.440, 'excel Ciselnik', ''),
  ('Smotana na šľahanie 33% (malá)',  'ml',  180,   1.430, 'excel Ciselnik', ''),
  ('Smotana na šľahanie 33% (väčšia)','ml',  250,   1.990, 'excel Ciselnik', ''),
  ('Smotana na šľahanie 35% (malá)',  'ml',  250,   1.870, 'excel Ciselnik', ''),
  ('Smotana na šľahanie 40%',         'ml',  200,   2.390, 'excel Ciselnik', ''),
  ('Smotanový syr',                   'g',   250,   2.420, 'excel Ciselnik', 'Philadelphia a podobné'),
  ('Tvaroh jemný odtučnený',          'g',   250,   1.540, 'excel Ciselnik', ''),
  ('Tvaroh tučný',                    'g',   250,   2.000, 'excel Ciselnik', ''),
  ('Vajcia bielko',                   'g',    30,   0.300, 'excel Ciselnik', ''),
  ('Vajcia celé v ml',                'ml',   50,   0.300, 'excel Ciselnik', ''),
  ('Vajcia ks',                       'ks',   10,   3.000, 'excel Ciselnik', ''),
  ('Vajcia žĺtko',                    'g',    20,   0.300, 'excel Ciselnik', ''),
  ('Vanilkový cukor',                 'g',    20,   0.220, 'excel Ciselnik', ''),
  ('Želatína prášková',               'g',    20,   1.320, 'excel Ciselnik', '')
on conflict (name) do nothing;

-- Suroviny, ktoré sa kupujú "ako kedy kde" — balenie zatiaľ prázdne.
-- Vpíšeš ho v správe webu, keď ho raz budeš mať po ruke; dovtedy sa
-- v kalkulácii vypíšu ako nedoplnené, nie ako nula.
insert into ingredients (name, unit, pack_size, pack_price, price_source, note) values
  ('Soľ',            'g', null, 0.440, 'excel Ciselnik', 'cena z excelu, gramáž balenia doplniť podľa obalu'),
  ('Sóda bikarbóna', 'g', null, 0.890, 'excel Ciselnik', 'cena z excelu, gramáž balenia doplniť podľa obalu'),
  ('Vanilka',        'g',   20, 5.000, 'excel Ciselnik', 'mletá vanilka; 20 g z excelu — overiť podľa obalu')
on conflict (name) do nothing;

-- Voda sa do ceny vedome neráta.
insert into ingredients (name, unit, negligible, note) values
  ('Voda', 'ml', true, 'do ceny sa neráta')
on conflict (name) do nothing;

-- Želatína sa v receptoch počíta na plátky, nie na gramy — preto 'ks'.
-- 1 plátok Silver 180 bloom = 5 g.
insert into ingredients (name, unit, pack_size, pack_price, price_source, note) values
  ('Želatína plátková', 'ks', 1, 0.165, 'excel Ciselnik', 'Silver 180 bloom, 1 plátok = 5 g')
on conflict (name) do nothing;

-- Suroviny, ktoré v číselníku chýbali, hoci ich recepty používajú.
insert into ingredients (name, unit, pack_size, pack_price, note) values
  ('Pektín NH',        'g',  null, null, 'cenu aj balenie doplniť'),
  ('Agar',             'g',  null, null, 'cenu aj balenie doplniť'),
  ('Citrónová šťava',  'ml', null, null, 'cenu aj balenie doplniť'),
  ('Pyré jablko',      'g',  null, null, 'cenu aj balenie doplniť'),
  ('Pyré višňa',       'g',  null, null, 'cenu aj balenie doplniť')
on conflict (name) do nothing;

-- Obal sa ráta na kus, nie na gramy.
insert into ingredients (name, unit, kind, pack_size, pack_price, note) values
  ('Krabička na zákusky', 'ks', 'obal', null, null, 'kupuje sa podľa dostupnosti — cenu vpísať po nákupe')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- RECEPTY — z hárkov "Odpalované cesto" a "Všetko"
--
-- Výťažnosť (yield_qty) je to číslo, ktoré bolo v exceli nad receptom
-- ("10KS", "8ks", "12ks", "20KS"). Podľa neho sa recept prepočítava na
-- objednaný počet kusov.
-- ---------------------------------------------------------------------
insert into recipes (name, kind, yield_qty, yield_unit, source_url, note, steps) values
  ('Odpalované cesto', 'cesto', 20, 'ks',
   'https://herohero.co/sweetpoint/post/balamakyqztffucdybiykmmeqxbyajzgag',
   'To isté cesto vydá cca 12 veterníkov / 12 Paris-Brestov / 25 profiterolek — pri veterníku sa nastaví qty_per_piece.',
   $rec$Vajcia rozmixuj ponorným mixérom a nechaj na izbovej teplote.
Do kastróla nalej vodu, mlieko, pridaj cukor, soľ a nakrájané maslo. Zahrievaj na stredný výkon; keď sa maslo rozpustí, krátko zvýš výkon a nechaj pár sekúnd prevrieť. Odstav.
Naraz pridaj hladkú múku a rýchlo dôkladne rozmiešaj metličkou.
Vráť na stredný plameň a cesto cca 3 minúty "odpaľuj" — začne sa mierne chytať na dno, to je v poriadku.
Presuň do misy robota a miešaj na najnižšie otáčky, kým teplota neklesne na 50–55 °C.
Pomaly prilievaj vajcia za stáleho miešania. Správna konzistencia: lesklé, ťahá sa, nie je riedke a netrhá sa.
Zakry fóliou na kontakt a nechaj vychladiť aspoň hodinu.
Pečenie: rúru predhrej na 200 °C, tvary striekaj na studený plech s perforovanou podložkou, vlož a stiahni teplotu.
  → 165 °C / 30 min pre menšie tvary (choux, profiterolky, mini venčeky)
  → 170 °C / 35 min pre väčšie (veterníky, Paris-Brest, venčeky)
Mrazené choux +15 min a nie viac, do 3 minút postupne otvárať dvierka.
Mrazené len pár dní stačí +14 min.$rec$),

  ('Craquelin svetlý', 'cesto', 20, 'ks',
   'https://herohero.co/sweetpoint/post/balamakyqztffucdmxlllrivdcqoynihw',
   'Dvojitá dávka oproti pôvodnému receptu — pri jednoduchej vždy chýbali kolieska. Výťažnosť 20 ks overiť.',
   $rec$Všetky suroviny zmiešaj a vypracuj kompaktné cesto (robot s K-metlou alebo ručne).
Rozvaľkaj medzi dvoma fóliami na hrúbku cca 2–3 mm a nechaj pol hodiny vychladiť v chladničke.
Vykrajuj kolieska s priemerom mierne väčším, než je nastriekané odpalované cesto.
Zamraz — v zmrazenom stave sa dobre manipuluje a drží tvar.
Pred pečením kolieska vylúpni a polož na surové odpalované cesto.$rec$),

  ('Craquelin tmavý', 'cesto', 20, 'ks',
   'https://herohero.co/sweetpoint/post/balamakyqztffucdmxlllrivdcqoynihw',
   'Dvojitá dávka, rovnako ako pri svetlom. Výťažnosť 20 ks overiť.',
   $rec$Postup rovnaký ako pri svetlom craqueline, len s kakaom.$rec$),

  ('Mangový krém', 'krem', 10, 'ks', '', '',
   $rec$Želatínu namoč do studenej vody.
Mango pyré s mliekom zohrej k varu.
Medzitým v miske zmiešaj cukor, žĺtka a škrob.
Do zmesi vlej časť horúceho základu, premiešaj a vráť späť do kastróla.
Za stáleho miešania prevar do zhustnutia.
Odstav, vmiešaj vyžmýkanú želatínu, potom mascarpone a dobre premixuj.
Zakry fóliou na kontakt a nechaj chladiť aspoň 3 hodiny.$rec$),

  ('Jablkové confit', 'vklad', 10, 'ks', '',
   'V exceli bolo v texte 35 g cukru, v prepočtovom stĺpci 40 g — tu je 40 g, overiť.',
   $rec$V kastróle zohrej jablkové pyré s vodou.
V inej miske zmiešaj cukor s pektínom a agarom.
Pridaj k teplému pyré a dôkladne rozmiešaj.
Priveď k varu a krátko prevar.
Zakry fóliou na kontakt, nechaj stuhnúť niekoľko hodín a pred použitím rozmačkaj vidličkou.$rec$),

  ('Pistáciový krém', 'krem', 10, 'ks',
   'https://herohero.co/sweetpoint/post/balamakyqztffucdtvvvnoehxetkakdvkkuw', '',
   $rec$Bielu čokoládu rozpusti nad parou alebo krátko v mikrovlnke (max 45–50 °C).
Smotanu zohrej len mierne (cca 40–50 °C), nesmie vrieť.
Smotanu vlej na rozpustenú čokoládu, nechaj 30 sekúnd stáť, potom premiešaj dohladka.
Pridaj pistáciovú pastu, práškový cukor, štipku soli, prípadne vanilku.
Premiešaj stierkou alebo metličkou (nie mixér).
Nakoniec zapracuj mascarpone izbovej teploty do hladkého krému.
Zakry fóliou na kontakt a nechaj chladiť aspoň 4 hodiny.
Nešľahať a nemixovať — len krátko premiešať metličkou.$rec$),

  ('Mango šľahaná ganache', 'krem', 8, 'ks', '', '',
   $rec$Želatínu nechaj napučať v studenej vode.
Smotanu a mango pyré zohrej na 80–85 °C.
Horúcu zmes vlej na bielu čokoládu, nechaj minútu stáť, premiešaj.
Pridaj vyžmýkanú želatínu a práškový cukor, miešaj do rozpustenia.
Pridaj mascarpone a krátko premixuj tyčovým mixérom.
Zakry fóliou na kontakt a nechaj chladiť ideálne 8 hodín.
Šľahaj na nízkych až stredných otáčkach, zastav pri mäkkých až stredných špičkách — ganache musí držať tvar, ale byť krémová.$rec$),

  ('Rebarborová šľahaná ganache', 'krem', 10, 'ks', '',
   'Voliteľne ½ ČL limetkovej alebo pomarančovej kôry.',
   $rec$Želatínu namoč do studenej vody (10 min).
Smotanu a rebarborové pyré zohrej na 80–85 °C.
Horúcu zmes nalej na bielu čokoládu, nechaj minútu stáť, premiešaj.
Pridaj vyžmýkanú želatínu, práškový cukor, prípadne citrusovú kôru.
Pridaj mascarpone a premixuj tyčovým mixérom do hladkej emulzie.
Zakry fóliou na kontakt, chladenie minimálne 6 hodín, ideálne cez noc.
Potom vyšľahaj do mäkkých až stredných špičiek — kyslosť pyré emulziu zatuhne rýchlejšie, sleduj štruktúru už po 20–30 sekundách.$rec$),

  ('Šľahaná ganache z bielej čokolády', 'krem', 20, 'ks', '',
   'Ganache navrch.',
   $rec$Smotanu s glukózovým sirupom zohrej na strednom plameni až k bodu varu.
Horúcu smotanu nalej na bielu čokoládu a miešaj stierkou, kým sa čokoláda nerozpustí.
Zmes premixuj ponorným mixérom dohladka.
Nechaj vychladnúť na 30 °C, pridaj smotanový syr a premixuj tyčovým mixérom.
Zakry fóliou na kontakt a daj do chladničky minimálne na 8 hodín.$rec$),

  ('Kávová ganache', 'krem', 12, 'ks', '',
   'Podľa poznámky v exceli by dávka vyšla aj na 20 ks — overiť skôr, než sa podľa toho bude počítať.',
   $rec$Smotanu daj do kastróla, prisyp kávu a zohrej tesne k bodu varu.
Stiahni z platne a nechaj 10 minút lúhovať. Cez sitko nalej na obe čokolády.
Nechaj rozpustiť a premixuj tyčovým mixérom. Pridaj mascarpone a znovu premixuj.
Nalej do čistej nádoby, prikry fóliou na kontakt a daj chladiť aspoň 10 hodín.
Nakoniec vyšľahaj do nadýchaného, ale pevného krému.$rec$),

  ('Malinové coulis', 'vklad', 150, 'g', '',
   'Recept je na cca 150 g hotového coulis — koľko gramov ide na jeden kus, sa nastaví pri príchuti.',
   $rec$Pyré zohrej, cukor zmiešaj s pektínom a vsyp za stáleho miešania.
Priveď k varu a krátko prevar. Dochuť pár kvapkami citrónovej šťavy.
Zakry fóliou na kontakt a nechaj stuhnúť.$rec$),

  ('Višňové coulis', 'vklad', 150, 'g', '',
   'Schwarzwald štýl. Recept je na cca 150 g hotového coulis.',
   $rec$Pyré zohrej, cukor zmiešaj s pektínom a vsyp za stáleho miešania.
Priveď k varu a krátko prevar.
Zakry fóliou na kontakt a nechaj stuhnúť.$rec$)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- POLOŽKY RECEPTOV
--
-- Množstvá sú v jednotke danej suroviny (g / ml / ks). Prázdne množstvo
-- = "štipka", "podľa chuti" — riadok sa v recepte ukáže, do ceny
-- nevstúpi. Riadky sa vložia len tam, kde ešte nie sú.
-- ---------------------------------------------------------------------
with polozka (recept, surovina, mnozstvo, volitelna, pozn) as (values
  -- cesto a craquelin
  ('Odpalované cesto', 'Voda',                            95,     false, ''),
  ('Odpalované cesto', 'Mlieko plnotučné 3,5%',           95,     false, ''),
  ('Odpalované cesto', 'Maslo 82%',                       85,     false, 'čerstvé'),
  ('Odpalované cesto', 'Múka hladká',                     115,    false, ''),
  ('Odpalované cesto', 'Vajcia celé v ml',                195,    false, 'rozmixované, izbová teplota'),
  ('Odpalované cesto', 'Soľ',                             4,      false, ''),
  ('Odpalované cesto', 'Cukor kryštálový',                8,      false, ''),
  ('Craquelin svetlý', 'Múka hladká',                     170,    false, ''),
  ('Craquelin svetlý', 'Cukor krupicový',                 170,    false, ''),
  ('Craquelin svetlý', 'Maslo 82%',                       140,    false, ''),
  ('Craquelin tmavý',  'Múka hladká',                     160,    false, ''),
  ('Craquelin tmavý',  'Cukor krupicový',                 160,    false, ''),
  ('Craquelin tmavý',  'Kakao holandského typu',          10,     false, ''),
  ('Craquelin tmavý',  'Maslo 82%',                       140,    false, ''),
  -- krémy a vklady
  ('Mangový krém',     'Mlieko plnotučné 3,5%',           90,     false, ''),
  ('Mangový krém',     'Pyré mango',                      135,    false, ''),
  ('Mangový krém',     'Vajcia žĺtko',                    55,     false, ''),
  ('Mangový krém',     'Škrob kukuričný',                 13,     false, ''),
  ('Mangový krém',     'Cukor kryštálový',                27,     false, ''),
  ('Mangový krém',     'Mascarpone',                      180,    false, ''),
  ('Mangový krém',     'Želatína plátková',               2,      false, ''),
  ('Jablkové confit',  'Pyré jablko',                     100,    false, ''),
  ('Jablkové confit',  'Voda',                            20,     false, ''),
  ('Jablkové confit',  'Pektín NH',                       5,      false, ''),
  ('Jablkové confit',  'Agar',                            1.2,    false, ''),
  ('Jablkové confit',  'Cukor kryštálový',                40,     false, ''),
  ('Jablkové confit',  'Citrónová šťava',                 8,      false, ''),
  ('Pistáciový krém',  'Mascarpone',                      260,    false, ''),
  ('Pistáciový krém',  'Smotana na šľahanie 33% (malá)',  85,     false, ''),
  ('Pistáciový krém',  'Čokoláda biela 28%',              60,     false, ''),
  ('Pistáciový krém',  'Pasta pistáciová 100%',           48,     false, ''),
  ('Pistáciový krém',  'Cukor práškový',                  20,     false, ''),
  ('Pistáciový krém',  'Soľ',                             null,   false, 'štipka — nevynechať'),
  ('Pistáciový krém',  'Vanilka',                         null,   true,  'voliteľne ½ ČL'),
  ('Mango šľahaná ganache', 'Mascarpone',                 130,    false, ''),
  ('Mango šľahaná ganache', 'Smotana na šľahanie 35% (malá)', 110, false, ''),
  ('Mango šľahaná ganache', 'Pyré mango',                 90,     false, ''),
  ('Mango šľahaná ganache', 'Čokoláda biela 28%',         75,     false, ''),
  ('Mango šľahaná ganache', 'Cukor práškový',             15,     false, ''),
  ('Mango šľahaná ganache', 'Želatína plátková',          1,      false, ''),
  ('Rebarborová šľahaná ganache', 'Mascarpone',           160,    false, ''),
  ('Rebarborová šľahaná ganache', 'Smotana na šľahanie 35% (malá)', 130, false, ''),
  ('Rebarborová šľahaná ganache', 'Pyré rebarbora',       115,    false, ''),
  ('Rebarborová šľahaná ganache', 'Čokoláda biela 28%',   105,    false, ''),
  ('Rebarborová šľahaná ganache', 'Cukor práškový',       25,     false, ''),
  ('Rebarborová šľahaná ganache', 'Želatína plátková',    1.25,   false, ''),
  ('Šľahaná ganache z bielej čokolády', 'Čokoláda biela 28%', 285, false, ''),
  ('Šľahaná ganache z bielej čokolády', 'Smotana na šľahanie 33% (malá)', 285, false, ''),
  ('Šľahaná ganache z bielej čokolády', 'Sirup glukózový', 32,    false, ''),
  ('Šľahaná ganache z bielej čokolády', 'Smotanový syr',  52,     false, 'Philadelphia'),
  ('Kávová ganache',   'Smotana na šľahanie 33% (malá)',  300,    false, ''),
  ('Kávová ganache',   'Káva',                            30,     false, 'zrnková'),
  ('Kávová ganache',   'Čokoláda biela 28%',              60,     false, ''),
  ('Kávová ganache',   'Čokoláda gold 30,4%',             60,     false, ''),
  ('Kávová ganache',   'Mascarpone',                      250,    false, 'na spevnenie'),
  ('Malinové coulis',  'Pyré malina',                     150,    false, 'Ponthier'),
  ('Malinové coulis',  'Cukor kryštálový',                15,     false, ''),
  ('Malinové coulis',  'Pektín NH',                       2.5,    false, '2 až 3 g'),
  ('Malinové coulis',  'Citrónová šťava',                 null,   false, 'pár kvapiek'),
  ('Višňové coulis',   'Pyré višňa',                      150,    false, 'Ponthier'),
  ('Višňové coulis',   'Cukor kryštálový',                15,     false, ''),
  ('Višňové coulis',   'Pektín NH',                       2.5,    false, '2 až 3 g')
)
insert into recipe_items (recipe_id, ingredient_id, amount, optional, note)
select r.id, i.id, p.mnozstvo::numeric, p.volitelna, p.pozn
from polozka p
join recipes r on r.name = p.recept
join ingredients i on i.name = p.surovina
on conflict (recipe_id, ingredient_id) do nothing;

-- ---------------------------------------------------------------------
-- ZLOŽENIE PRÍCHUTÍ (čo tvorí jeden kus)
--
-- qty_per_piece je v jednotke výťažnosti receptu: pri receptoch písaných
-- na kusy je 1 = "jeden kus z tej dávky", pri coulis (písané na 150 g) je
-- to počet gramov na kus.
-- ---------------------------------------------------------------------
with vazba (prichut, recept, na_kus, pozn) as (values
  ('Pistáciovo mangový', 'Odpalované cesto',        1,  ''),
  ('Pistáciovo mangový', 'Craquelin svetlý',        1,  ''),
  ('Pistáciovo mangový', 'Mango šľahaná ganache',   1,  'navrch — drží tvar lepšie než varený mangový krém'),
  ('Pistáciovo mangový', 'Pistáciový krém',         1,  'dovnútra'),
  ('Pistáciovo mangový', 'Jablkové confit',         1,  'dovnútra'),
  ('Pistáciovo kávový',  'Odpalované cesto',        1,  ''),
  ('Pistáciovo kávový',  'Craquelin svetlý',        1,  ''),
  ('Pistáciovo kávový',  'Kávová ganache',          1,  'navrch'),
  ('Pistáciovo kávový',  'Pistáciový krém',         1,  'dovnútra'),
  ('Pistáciovo kávový',  'Malinové coulis',         12, 'ODHAD 12 g na kus — upraviť po prvej skúške')
)
insert into product_recipes (product_id, recipe_id, qty_per_piece, note)
select p.id, r.id, v.na_kus::numeric, v.pozn
from vazba v
join products p on p.name = 'Choux' and p.sub = v.prichut
join recipes r on r.name = v.recept
on conflict (product_id, recipe_id) do nothing;

-- ---------------------------------------------------------------------
-- KONTROLA PO SPUSTENÍ
--
-- Vypíše, koľko surovín má ktorý recept a v koľkých príchutiach sa
-- používa. Keby mal recept menej surovín, než má v exceli, znamená to
-- preklep v názve — riadok by sa potichu nevložil.
-- ---------------------------------------------------------------------
select r.name as recept, r.kind as druh, r.yield_qty as vytaznost,
       r.yield_unit as jednotka,
       count(distinct ri.id) as pocet_surovin,
       count(distinct pr.id) as v_prichutiach
from recipes r
left join recipe_items ri on ri.recipe_id = r.id
left join product_recipes pr on pr.recipe_id = r.id
group by r.id, r.name, r.kind, r.yield_qty, r.yield_unit
order by r.kind, r.name;
