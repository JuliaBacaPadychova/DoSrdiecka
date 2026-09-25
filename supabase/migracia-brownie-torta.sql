-- ---------------------------------------------------------------------
-- MIGRÁCIA: brownie torta, želé disky, mousse — a prepočet na priemer
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Na poradí nezáleží: migrácia iba pridáva. Kým sa nespustí, správa webu
-- beží ako doteraz — recept bez priemeru sa počíta po starom.
--
-- ČO TO ROBÍ
--
-- 1) PREPOČET NA PRIEMER. Torta sa neškáluje počtom kusov, ale plochou:
--    gramáže sa násobia (nový priemer² / pôvodný priemer²). Z 12 na 18 cm
--    je to 324/144 = 2,25. Recept preto dostáva stĺpec diameter_cm — na
--    aký priemer je napísaný — a výrobok dostáva svoj priemer.
--
-- 2) PREPOČET NA VRSTVY. Recept na brownie korpus je napísaný na 4
--    korpusy, krém na 3 vrstvy. Keď z tej istej torty urobíš 3 korpusy
--    a 2 krémy, korpus sa násobí ešte 3/4 a krém 2/3 — každá zložka
--    zvlášť. Recept preto dostáva layers (na koľko vrstiev je napísaný)
--    a väzba na výrobok dostáva layers (koľko vrstiev ide do tejto torty).
--
--    Spolu: koeficient = (nový² / pôvodný²) × (koľko vrstiev / na koľko).
--    Na 18 cm a 3 korpusy to je 2,25 × 0,75 = 1,6875, presne ako v hárku
--    "Prepocet vrstiev a kremu".
--
-- 3) RECEPTY z PDF "BROWNIE TORTA" a z excelu (disky a mousse).
--
-- Bezpečné spustiť aj opakovane — nič už zapísané sa neprepíše.
-- ---------------------------------------------------------------------

alter table recipes add column if not exists diameter_cm numeric(6,2);
alter table recipes add column if not exists layers int;

comment on column recipes.diameter_cm is
  'Na aký priemer torty (v cm) je recept napísaný. Prázdne = recept sa priemerom neprepočítava (zákusky).';
comment on column recipes.layers is
  'Na koľko vrstiev je recept napísaný (brownie korpus 4, krém 3). Prázdne = jedna.';

alter table products add column if not exists diameter_cm numeric(6,2);
comment on column products.diameter_cm is
  'Priemer torty v cm. Podľa neho sa prepočítajú recepty písané na iný priemer.';

alter table product_recipes add column if not exists layers int;
comment on column product_recipes.layers is
  'Koľko vrstiev tejto zložky ide do tejto torty. Prázdne = toľko, na koľko je recept napísaný.';

-- Priemer veľkostí sa dá prečítať z podnadpisu ("Ø 20 cm"). Vypĺňa sa len
-- tam, kde ešte nie je, a len pri tortách — pri zákuskoch priemer nedáva
-- zmysel. Keby si niektorý priemer prepísala ručne, ostane tvoj.
update products
   set diameter_cm = nullif(regexp_replace(sub, '[^0-9]', '', 'g'), '')::numeric
 where category_id = 'torty'
   and diameter_cm is null
   and sub ~ '[0-9]';

-- ---------------------------------------------------------------------
-- NOVÉ SUROVINY
--
-- Muscovado z PDF sa berie ako trstinový cukor — tak to má aj excel.
-- ---------------------------------------------------------------------
insert into ingredients (name, unit, pack_size, pack_price, note) values
  ('Ovocná zmes mrazená', 'g',  null, null,
   'Cenu aj balenie doplniť. Mrazené ovocie na coulis — akú zmes, je na dohode.'),
  ('Pyré jahoda',         'g',  null, null, 'Cenu aj balenie doplniť.'),
  ('Jahody čerstvé',      'g',  null, null, 'Cenu aj balenie doplniť. Do compoté sa krájajú na kocky cca 0,5 cm.'),
  ('Limetková šťava',     'ml', null, null, 'Cenu aj balenie doplniť.'),
  ('Čokoláda biela 32%',  'g',   400, null,
   'Cenu doplniť. Recept na mangový mousse pýta 32 %, číselník má aj 28 % — sú to dve rôzne čokolády.')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- RECEPTY NA BROWNIE TORTU
--
-- Všetky sú napísané na priemer 12 cm, tak ako PDF. Prefix "Brownie"
-- hovorí, že patria k tejto torte a inde sa nepoužívajú.
--
-- Prášok do pečiva, sóda a soľ sú zámerne BEZ GRAMÁŽE — v recepte sú
-- vedené v lyžičkách. Ukážu sa v rozpise, do ceny nevstúpia a priemerom
-- sa neprepočítajú; pri väčšej torte ich treba domyslieť.
-- ---------------------------------------------------------------------
insert into recipes (name, yield_qty, yield_unit, yield_label, diameter_cm, layers, note, steps) values
  ('Brownie korpus', 1, 'ks', 'tortu Ø 12 cm', 12, 4,
   'Napísané na 12 cm a 4 korpusy — z jednej dávky sa pečie v dvoch 12 cm ráfikoch a každý sa prereže na polovicu. Cesto sa dá rozdeliť na tenší (1/3) a hrubší (2/3) ráfik; tenší skontroluj po 35 minútach, hrubší po 60. Prášok, sóda a soľ sú v lyžičkách, takže sa priemerom neprepočítajú.',
   $rec$Všetky ingrediencie musia byť izbovej teploty. Rúru predhrej na 140 °C a vymasti tortovú formu.
Vo vodnom kúpeli rozpusti maslo s čokoládou a nechaj vychladnúť.
V jednej miske zmiešaj múku, prášok do pečiva, soľ, sódu, kakao a oba cukry. Kakao preosej, inak ostanú hrudky.
V ďalšej miske rozšľahaj vajcia a pridaj cmar.
Obsah misiek spolu zmiešaj.
Cesto vylej do formy a peč pri 140 °C asi 90 minút. Špajdľa má vyjsť s vlhkými hustými omrvinkami, nie dosucha a nie s lesklým tekutým cestom.
Upečený korpus nechaj vychladnúť vo forme, potom ho opatrne nožom oddeľ od bokov a vyklop.
Vychladnuté korpusy zrež a zarovnaj vršky a prerež pílkou na polovicu — treba získať 4 rovnomerné korpusy.$rec$),

  ('Brownie slaný karamel', 1, 'ks', 'tortu Ø 12 cm', 12, 3,
   'Suchá metóda. Dávka je podľa PDF a vyjde jej viac, než sa do 12 cm torty zmestí — koľko jej naozaj treba, sa upraví po prvom skladaní. Vrstvy sú nastavené ako pri kréme, takže pri menšom počte náplní sa dávka zmenší rovnako.',
   $rec$V menšom hrnci postupne ohrievaj šľahačku pod bod varu — kým sa z nej nezačne pariť. V žiadnom prípade ju nenechaj prevrieť.
Do studeného hrnca (ideálne s dvojitým dnom) nasyp asi 1/3 cukru a počkaj, kým sa celý rozpustí. Potom po častiach prisypávaj zvyšok až do úplného rozpustenia.
Do karamelu prilievaj horúcu šľahačku NA ETAPY a za stáleho miešania, aj po okrajoch hrnca, kým sa ingrediencie nespoja.
Vypni šporák a prisyp soľ. Keď sa rozpustí, ešte raz dôkladne premiešaj a prelej do nádoby.$rec$),

  ('Brownie vanilkový krém', 1, 'ks', 'tortu Ø 12 cm', 12, 3,
   'Napísané na 3 vrstvy krému.',
   $rec$V mise mixéra spoj všetky suroviny a šľahaj do hustého vanilkového krému.
Na záver krém poriadne premiešaj silikónovou lopatkou a premiestni do cukrárskeho vrecka.$rec$),

  ('Brownie ovocné coulis', 1, 'ks', 'tortu Ø 12 cm', 12, 3,
   'Napísané na 3 vrstvy — coulis ide na prvý, druhý aj tretí korpus.',
   $rec$Všetky suroviny zmiešaj v hrnci a nechaj chvíľu prevrieť.
Jemne podchladnuté coulis rozmixuj v blendri a prelej do pohárov.$rec$),

  ('Brownie ganache', 1, 'ks', 'tortu Ø 12 cm', 12, 1,
   'Na obter torty. Vrstvami sa neriadi, len plochou — pri väčšom priemere rastie aj vrch torty, takže radšej nech trochu ostane.',
   $rec$Na vodnom kúpeli rozpusti čokoládu.
Vo vedľajšom malom hrnci zahrej šľahačku s medom (alebo glukózovým sirupom) do ohriatia a rozpustenia.
Na etapy nalievaj a premiešavaj čokoládu so šľahačkovou zmesou, na záver pridaj maslo. Nechaj odstáť 5 minút a dôkladne premiešaj.
Ganáž prelej do misky a nechaj vychladnúť pri izbovej teplote do potrebnej konzistencie.
Tortu obtri až po stabilizácii v chladničke, ideálne cez noc, aspoň však po 6 hodinách.$rec$),

-- ---------------------------------------------------------------------
-- ŽELÉ DISKY A MOUSSE
--
-- Sú bez prefixu: dajú sa vložiť aj do inej torty. Každý je napísaný na
-- svoj priemer, takže sa prepočíta rovnakým vzorcom.
-- ---------------------------------------------------------------------
  ('Malinový želé disk', 1, 'ks', 'disk Ø 16 cm', 16, 1,
   'Pektín NH treba najprv zmiešať nasucho s cukrom, inak v pyré okamžite urobí hrudky, ktoré sa už nerozmiešajú.',
   $rec$Ráfik (16 cm) obaľ zospodu fóliou a polož na rovnú podložku.
V malej miske dôkladne rozmiešaj cukor s pektínom NH.
Pyré daj do menšieho hrnca a zahrej na cca 40 °C — má byť teplé na dotyk, nie vriace.
Do teplého pyré za stáleho miešania metličkou prisypávaj zmes cukru a pektínu, ako keď sypeš krupicu.
Zmes priveď do varu a za stáleho miešania nechaj bublať presne 1 až 2 minúty. Pektín NH sa aktivuje iba varom.
Stiahni z ohňa, vmiešaj citrónovú šťavu, nalej do ráfika a daj zamraziť aspoň na 4 hodiny.$rec$),

  ('Malinový mousse', 1, 'ks', 'disk Ø 16 cm', 16, 1,
   'S plátkovou želatínou 160–180 Bloom. Pri nej sa nemusí odmeriavať voda na napučanie — namáča sa do veľkého množstva ľadovej vody a potom sa vyžmýka.',
   $rec$Ráfik s fóliou polož na rovnú podložku.
Plátky želatíny vlož do misky s veľkým množstvom veľmi studenej vody (pokojne aj s kockou ľadu) a nechaj napučať 5–10 minút, kým nezmäknú.
Asi 40 g pyré daj do hrnca s cukrom a zohrej — nesmie vrieť, len byť dosť horúce na rozpustenie želatíny.
Zmäknutú želatínu vyber, pevne vyžmýkaj a vhoď do horúceho pyré. Rozmiešaj do úplného rozpustenia.
Túto teplú časť vlej do zvyšných 80 g studeného pyré a nechaj vychladnúť na izbovú teplotu (cca 25–28 °C).
Smotanu vyšľahaj do polotuha (mäkké špičky) a zľahka ju stierkou vmiešaj do vychladnutého základu. Nalej do ráfika a zamraz.$rec$),

  ('Jahodové compoté', 1, 'ks', 'vklad Ø 16 cm', 16, 1,
   'Čerstvé jahody sa "uzamknú" do stabilnej omáčky pektínom NH, aby nepustili šťavu do krému. Vklad Ø 16 cm ide do 18 cm torty.',
   $rec$Zmiešaj cukor s pektínom NH.
Pyré zahrej v hrnci na 40 °C, prisyp zmes cukru a pektínu a priveď k varu. Var presne 1 minútu.
Stiahni z ohňa, pridaj citrónovú šťavu a nechaj vychladnúť na izbovú teplotu — kým nezačne mierne hustnúť, ale je ešte tekuté.
Do vlažnej omáčky vmiešaj na kocky nakrájané čerstvé jahody.
Nalej do 16 cm ráfika vystlaného fóliou a daj krátko zamraziť; so zamrazeným vkladom sa lepšie manipuluje.
Keď základ stuhne priveľmi: zľahka ho zohrej (pár sekúnd v mikrovlnke alebo vo vodnom kúpeli), len aby povolil do konzistencie tekutejšieho medu (30–35 °C), a až potom vmiešaj jahody.
Keď je naopak priveľmi tuhý aj po rozmixovaní: pri opätovnom zohrievaní prilej po troškách 10–20 g vody alebo pyré.$rec$),

  ('Mangový mousse', 1, 'ks', 'disk Ø 18 cm', 18, 1,
   'Disk má výšku približne 1 cm. Do torty sa vkladá zamrazený, kde prirodzene povolí — do stredu, po krajoch aj navrch uzavretý krémom, ideálne do vyšších vrstiev.',
   $rec$Želatínu namoč do studenej vody.
Mangové pyré s limetkovou šťavou ohrej, pridaj napučanú želatínu a miešaj, kým sa úplne nerozpustí.
Pyré nalej na bielu čokoládu a premiešaj do hladkej hmoty. Nechaj mierne vychladnúť.
Do vlažnej zmesi vmiešaj po častiach do polotuha vyšľahanú smotanu.
Hotový mousse nalej do formy alebo obaleného ráfika s priemerom 18 cm.
Mrazí sa minimálne 6 hodín.$rec$)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- SUROVINY V RECEPTOCH
-- ---------------------------------------------------------------------
with polozka (recept, surovina, mnozstvo, poradie, pozn) as (values
  ('Brownie korpus',         'Múka T650',                       90,    1, ''),
  ('Brownie korpus',         'Maslo 82%',                       90,    2, ''),
  ('Brownie korpus',         'Cukor trstinový',                 90,    3, 'v PDF muscovado'),
  ('Brownie korpus',         'Cukor krupicový',                 90,    4, ''),
  ('Brownie korpus',         'Čokoláda tmavá 54%',              90,    5, ''),
  ('Brownie korpus',         'Vajcia ks',                        3,    6, ''),
  ('Brownie korpus',         'Kakao holandského typu',          20,    7, 'preosiať'),
  ('Brownie korpus',         'Cmar',                            40,    8, ''),
  ('Brownie korpus',         'Prášok do pečiva',              null,    9, '1/2 lyžičky'),
  ('Brownie korpus',         'Sóda bikarbóna',                null,   10, '1/4 lyžičky'),
  ('Brownie korpus',         'Soľ',                           null,   11, '1/2 lyžičky'),
  ('Brownie slaný karamel',  'Cukor krupicový',                200,    1, ''),
  ('Brownie slaný karamel',  'Smotana na šľahanie 40%',        200,    2, ''),
  ('Brownie slaný karamel',  'Soľ',                           null,    3, '1 lyžička'),
  ('Brownie vanilkový krém', 'Mascarpone',                     100,    1, ''),
  ('Brownie vanilkový krém', 'Cukor práškový',                  50,    2, ''),
  ('Brownie vanilkový krém', 'Tvaroh tučný',                   100,    3, ''),
  ('Brownie vanilkový krém', 'Smotanový syr',                  100,    4, ''),
  ('Brownie vanilkový krém', 'Smotana na šľahanie 40%',        100,    5, ''),
  ('Brownie vanilkový krém', 'Vanilka',                       null,    6, '1 vanilkový struk alebo 1 lyžička pasty'),
  ('Brownie ovocné coulis',  'Ovocná zmes mrazená',            100,    1, ''),
  ('Brownie ovocné coulis',  'Cukor krupicový',                 10,    2, ''),
  ('Brownie ganache',        'Čokoláda tmavá 54%',             185,    1, ''),
  ('Brownie ganache',        'Smotana na šľahanie 40%',         95,    2, ''),
  ('Brownie ganache',        'Maslo 82%',                      105,    3, ''),
  ('Brownie ganache',        'Med',                             22,    4, 'alebo glukózový sirup'),
  ('Malinový želé disk',     'Pyré malina',                    200,    1, 'Ponthier'),
  ('Malinový želé disk',     'Cukor krupicový',                 20,    2, ''),
  ('Malinový želé disk',     'Pektín NH',                      3.5,    3, ''),
  ('Malinový želé disk',     'Citrónová šťava',                  5,    4, '1 lyžička'),
  ('Malinový mousse',        'Pyré malina',                    120,    1, 'Ponthier'),
  ('Malinový mousse',        'Cukor krupicový',                 15,    2, ''),
  ('Malinový mousse',        'Želatína plátková',                2,    3, '3,5 g — cca 2 plátky, riaď sa váhou'),
  ('Malinový mousse',        'Smotana na šľahanie 33% (väčšia)', 120,   4, 'dobre vychladená, 33–40 %'),
  ('Jahodové compoté',       'Pyré jahoda',                    100,    1, 'rozmixované jahody alebo Ponthier'),
  ('Jahodové compoté',       'Jahody čerstvé',                 100,    2, 'na kocky cca 0,5 cm'),
  ('Jahodové compoté',       'Cukor krupicový',                 15,    3, ''),
  ('Jahodové compoté',       'Pektín NH',                      2.5,    4, ''),
  ('Jahodové compoté',       'Citrónová šťava',                 10,    5, ''),
  ('Mangový mousse',         'Pyré mango',                     100,    1, ''),
  ('Mangový mousse',         'Limetková šťava',                 30,    2, ''),
  ('Mangový mousse',         'Čokoláda biela 32%',              80,    3, 'ideálne v kôstkach'),
  ('Mangový mousse',         'Želatína plátková',              1.5,    4, '3 g — 1,5 plátku'),
  ('Mangový mousse',         'Smotana na šľahanie 33% (väčšia)', 150,   5, 'dobre vychladená')
)
insert into recipe_items (recipe_id, ingredient_id, amount, optional, note, sort_order)
select r.id, i.id, p.mnozstvo::numeric, false, p.pozn, p.poradie
from polozka p
join recipes r on r.name = p.recept
join ingredients i on i.name = p.surovina
on conflict (recipe_id, ingredient_id) do nothing;

-- ---------------------------------------------------------------------
-- ZLOŽENIE BROWNIE TORTY
--
-- Priradí sa ku VŠETKÝM veľkostiam naraz — priemer si každá veľkosť
-- nesie sama, takže recept netreba kopírovať. Predvolene 4 korpusy
-- a 3 vrstvy náplne, tak ako je recept napísaný; pri konkrétnej veľkosti
-- sa to dá v správe webu prepísať.
--
-- Disky a mousse priradené nie sú — je na majiteľke, do ktorej veľkosti
-- a namiesto čoho idú.
-- ---------------------------------------------------------------------
insert into product_recipes (product_id, recipe_id, qty_per_piece, pieces_per_batch, layers, note)
select p.id, r.id, 1, 1, r.layers, ''
from products p
join recipes r on r.name in ('Brownie korpus', 'Brownie slaný karamel',
                             'Brownie vanilkový krém', 'Brownie ovocné coulis', 'Brownie ganache')
where p.name = 'Brownie torta'
on conflict (product_id, recipe_id) do nothing;

-- ---------------------------------------------------------------------
-- KONTROLA PO SPUSTENÍ
--
-- Prvá tabuľka: recepty s priemerom. Druhá: veľkosti brownie torty aj
-- s koeficientom oproti 12 cm — má sedieť s PDF (16 cm = 1,78; 18 = 2,25).
-- ---------------------------------------------------------------------
select r.name as recept, r.diameter_cm as priemer, r.layers as vrstiev,
       count(ri.id) as surovin
  from recipes r
  left join recipe_items ri on ri.recipe_id = r.id
 where r.diameter_cm is not null
 group by r.id, r.name, r.diameter_cm, r.layers
 order by r.name;

select p.sub as velkost, p.diameter_cm as priemer,
       round((p.diameter_cm * p.diameter_cm) / (12 * 12), 4) as koeficient_z_12cm,
       count(pr.id) as priradenych_receptov
  from products p
  left join product_recipes pr on pr.product_id = p.id
 where p.name = 'Brownie torta'
 group by p.id, p.sub, p.diameter_cm
 order by p.diameter_cm;
