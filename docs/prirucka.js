// Generátor prevádzkovej príručky (Word) pre majiteľku.
//
// Spustenie:  npm install docx && node docs/prirucka.js
// Vytvorí vedľa seba Do-srdiecka-prirucka.docx.
//
// Príručku držíme tu, aby sa dala po každej zmene v kóde znova
// vygenerovať a neostala visieť v zastaranej verzii. Balík "docx" je
// potrebný LEN na toto — samotný web má naďalej nulové závislosti.

const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, BorderStyle, LevelFormat, PageBreak,
} = require("docx");

const ACCENT = "1F5348";
const WARN = "8A5512";
const GREY = "6B665C";
const LINE = "CFC9BA";
const HEADFILL = "EEF2F0";
const W = 9000;

// ---------- pomocné stavebné prvky ----------

const P = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: opts.after !== undefined ? opts.after : 120, line: 276 },
    alignment: opts.align,
    children: [new TextRun({
      text,
      size: opts.size || 21,
      bold: opts.bold,
      italics: opts.italics,
      color: opts.color || "1A1A1A",
    })],
  });

// odsek zložený z viacerých kúskov: [["tučné", true], ["normálne", false]]
const Pmix = (parts, opts = {}) =>
  new Paragraph({
    spacing: { after: opts.after !== undefined ? opts.after : 120, line: 276 },
    children: parts.map(([t, bold, color]) => new TextRun({
      text: t, bold: !!bold, size: opts.size || 21, color: color || "1A1A1A",
    })),
  });

const H1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, size: 30, bold: true, color: ACCENT })],
  });

const H2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 100 },
    children: [new TextRun({ text, size: 24, bold: true, color: "1A1A1A" })],
  });

const LABEL = (text) =>
  new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({
      text: text.toUpperCase(), size: 17, bold: true,
      color: GREY, characterSpacing: 30,
    })],
  });

const BULLET = (text, boldPrefix) =>
  new Paragraph({
    numbering: { reference: "odrazky", level: 0 },
    spacing: { after: 70, line: 276 },
    children: boldPrefix
      ? [new TextRun({ text: boldPrefix, bold: true, size: 21 }),
         new TextRun({ text: text, size: 21 })]
      : [new TextRun({ text, size: 21 })],
  });

const RULE = () =>
  new Paragraph({
    spacing: { before: 60, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE } },
    children: [new TextRun({ text: "", size: 2 })],
  });

const cell = (children, width, opts = {}) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    children,
  });

const th = (text, width) =>
  cell([new Paragraph({
    spacing: { after: 0 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 17, color: ACCENT, characterSpacing: 20 })],
  })], width, { fill: HEADFILL });

// bunka: pole [text, bold?] kúskov, každý kúsok vlastný odsek
const td = (lines, width) =>
  cell(lines.map((ln, i) => {
    const [text, bold, small] = Array.isArray(ln) ? ln : [ln, false, false];
    return new Paragraph({
      spacing: { after: i === lines.length - 1 ? 0 : 60, line: 264 },
      children: [new TextRun({
        text, bold: !!bold, size: small ? 18 : 20,
        color: small ? WARN : "1A1A1A",
        italics: !!small,
      })],
    });
  }), width);

const table = (widths, headers, rows) =>
  new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      left: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      right: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: LINE },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => th(h, widths[i])),
      }),
      ...rows.map((r) => new TableRow({
        children: r.map((c, i) => td(c, widths[i])),
      })),
    ],
  });

const SPACER = (h = 200) => new Paragraph({ spacing: { after: h }, children: [] });

// rámček s upozornením
const CALLOUT = (lines) =>
  new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      left: { style: BorderStyle.SINGLE, size: 18, color: WARN },
      right: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [new TableRow({
      children: [cell(
        lines.map((parts, i) => new Paragraph({
          spacing: { after: i === lines.length - 1 ? 0 : 100, line: 276 },
          children: parts.map(([t, bold]) => new TextRun({ text: t, bold: !!bold, size: 20 })),
        })),
        W, { fill: "FBF5EA" }
      )],
    })],
  });

// ---------- obsah dokumentu ----------

const children = [];

// hlavička
children.push(new Paragraph({
  spacing: { after: 60 },
  children: [new TextRun({
    text: "PREVÁDZKOVÁ PRÍRUČKA", size: 17, bold: true, color: GREY, characterSpacing: 40,
  })],
}));
children.push(new Paragraph({
  spacing: { after: 140 },
  children: [new TextRun({ text: "Do srdiečka — zázemie webu", size: 44, bold: true, color: ACCENT })],
}));
children.push(P("Web beží na troch bezplatných službách a jednej platenej. Tento dokument hovorí, čo ktorá robí, čo v nej máš uložené a kam klikneš, keď niečo potrebuješ.", { color: "444444" }));
children.push(Pmix([
  ["Web: ", true], ["https://dosrdiecka.sk        "],
  ["Správa: ", true], ["https://dosrdiecka.sk/admin/"],
], { after: 40 }));
children.push(RULE());

// --- Rýchly prehľad ---
children.push(H1("Rýchly prehľad"));
children.push(P("Ak si z celého dokumentu zapamätáš len jednu tabuľku, nech je to táto."));
children.push(SPACER(80));
children.push(table(
  [2100, 3500, 3400],
  ["Služba", "Úloha", "Ako často tam ideš"],
  [
    [["GitHub"], ["Archív kódu"], ["Prakticky nikdy — kód mením ja"]],
    [["Vercel"], ["Tu web reálne beží"], ["Keď niečo nefunguje (Logs) alebo pri zmene hesla"]],
    [["Supabase"], ["Databáza a tvoje prihlásenie"], ["Len pri zabudnutom hesle do správy"]],
    [["Websupport"], ["Doména a e-mailová schránka"], ["Takmer nikdy — nastavené je"]],
    [["Správa (/admin/)"], ["Dni, limity, ponuka, objednávky"], ["Denne — 95 % tvojej práce"]],
  ]
));

// --- Tri veci ---
children.push(H1("Tri veci, ktoré sa oplatí zapamätať"));

children.push(H2("1. Reťaz je GitHub → Vercel"));
children.push(P("Čokoľvek sa uloží do repozitára na GitHube, Vercel do minúty sám nasadí na živý web. Preto sú užitočné tie práva na zápis, ktoré si mi udelila — úpravy nahrám a ty len pozrieš výsledok. Nemusíš nič sťahovať, nahrávať ani preklikávať."));

children.push(H2("2. Logy vidíš len hodinu dozadu"));
children.push(P("Na bezplatnom pláne Vercelu história hlásení nesiaha ďalej. Keď niečo zlyhá, choď do Vercel → Logs hneď, nie večer. Inak sa stopa stratí a budeme čakať, kým sa problém zopakuje."));

children.push(H2("3. Heslo k schránke je na dvoch miestach"));
children.push(P("Keď ho niekedy zmeníš u Websupportu, musíš ho hneď prepísať aj vo Vercel premenných. Inak sa objednávky budú ukladať ďalej, ale notifikácie ti prestanú chodiť — a to si nemusíš hneď všimnúť."));

// --- Ako to funguje ---
children.push(H1("Čo sa stane, keď niekto objedná"));
children.push(P("Toto je jediný postup, ktorý stojí za to pochopiť — všetko ostatné z neho vyplýva."));
children.push(SPACER(80));
children.push(table(
  [2400, 6600],
  ["Kde", "Čo sa deje"],
  [
    [["Vercel"], ["Zákazníčka otvorí web. Stránku jej doručí Vercel — tam sú uložené obrázky, texty aj celý vzhľad."]],
    [["Vercel → Supabase"], ["Vyberá termín. Vercel sa v tej chvíli pýta Supabase, koľko sa na daný deň ešte zmestí."]],
    [["Supabase"], ["Odošle objednávku. Supabase ju uloží a zároveň zamkne kapacitu dňa, takže sa limit neprekročí ani pri dvoch objednávkach naraz."]],
    [["Websupport"], ["Vercel hneď odošle dve správy cez tvoju schránku: notifikáciu tebe a potvrdenie zákazníčke."]],
  ]
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// --- Štyri služby ---
children.push(H1("Štyri služby podrobne"));
children.push(P("Každá má jednu úlohu. Keď si zapamätáš tú úlohu, vždy vieš, kam ísť."));

children.push(H2("GitHub — archív kódu"));
children.push(P("Archív, v ktorom je uložený zdrojový kód webu, všetkých 35 súborov. Je to jediné miesto, odkiaľ Vercel berie to, čo má zobraziť."));
children.push(BULLET("github.com/JuliaBacaPadychova/DoSrdiecka, vetva main", "Repozitár: "));
children.push(BULLET("Stránky, obrázky, serverové funkcie, databázová schéma", "Obsah: "));
children.push(BULLET("Prakticky nikdy sama. Zmeny v kóde robím ja.", "Kedy sem ideš: "));
children.push(BULLET("Zadarmo", "Cena: "));

children.push(H2("Vercel — tu web beží"));
children.push(P("Server, na ktorom web reálne beží. Doručuje stránky zákazníčkam a spúšťa funkcie, ktoré prijímajú objednávky a odosielajú e-maily."));
children.push(BULLET("DoSrdiecka, projekt do-srdiecka", "Tím: "));
children.push(BULLET("Cez tvoj GitHub účet", "Prihlásenie: "));
children.push(BULLET("Settings → Environment Variables — sedem premenných, medzi nimi kľúč k databáze, heslo k schránke a zoznam ADMIN_EMAILS", "Nastavenia: "));
children.push(BULLET("Záložka Logs ukáže, čo presne zlyhalo — ale len hodinu dozadu", "Keď niečo nejde: "));
children.push(BULLET("Zadarmo, plán Hobby", "Cena: "));

children.push(H2("Supabase — databáza"));
children.push(P("Drží ponuku, otvorené dni s limitmi, prijaté objednávky, fotky výrobkov — a aj tvoje prihlásenie do správy webu."));
children.push(BULLET("do-srdiecka, región Írsko", "Projekt: "));
children.push(BULLET("qjqsqllghqzoqykodkar.supabase.co", "Adresa: "));
children.push(BULLET("Kategórie, výrobky, otvorené dni, objednávky, položky objednávok, nastavenia", "Tabuľky: "));
children.push(BULLET("Zákusky, torty a chlebíky majú vlastný denný limit — meníš ich v správe pri každom dni", "Limity: "));
children.push(BULLET("Authentication → Users — tu žije prihlásenie do /admin/", "Tvoj účet: "));
children.push(BULLET("Keď si potrebuješ obnoviť heslo do správy, alebo keď ti pošlem migráciu na spustenie v SQL Editore. Inak takmer nikdy.", "Kedy sem ideš: "));
children.push(BULLET("Zadarmo", "Cena: "));

children.push(H2("Websupport — doména a pošta"));
children.push(P("Tvoja doména dosrdiecka.sk a e-mailová schránka. Toto si mala už predtým — web sa na to len napojí."));
children.push(BULLET("dosrdiecka.sk — pripojená, web na nej beží cez zabezpečené https", "Doména: "));
children.push(BULLET("kolacik@dosrdiecka.sk — sem chodia notifikácie o objednávkach", "Schránka: "));
children.push(BULLET("Keď budeš pridávať DNS záznamy pre web, MX záznamy nechaj tak — tie držia tvoju poštu", "Pozor: "));
children.push(BULLET("Platené — jediná položka, ktorá niečo stojí", "Cena: "));

children.push(new Paragraph({ children: [new PageBreak()] }));

// --- Keď chcem ---
children.push(H1("Keď chcem…"));
children.push(P("Skoro všetko bežné vybavíš v správe webu. Do ostatných služieb ideš len výnimočne."));
children.push(SPACER(80));
children.push(table(
  [4300, 4700],
  ["Chcem", "Kam idem"],
  [
    [["Otvoriť nový deň na objednávky, zmeniť limit, zavrieť deň"], [["Správa → Dni a limity", true]]],
    [["Zmeniť cenu, popis, alergény alebo fotku výrobku"], [["Správa → Ponuka", true]]],
    [["Pridať k výrobku ďalšiu príchuť"], [["Správa → Ponuka → Nový výrobok s rovnakým názvom", true], ["Podnadpis je názov príchute. Web ich spojí do jednej karty. Minimálny odber platí pri každej príchuti zvlášť.", false, true]]],
    [["Ponúknuť pri výrobku možnosť na želanie"], [["To isté, len alergény nechaj prázdne", true], ["Karta ich potom vôbec nespomenie. Zloženie sa dohodne z poznámky, ktorú zákazníčka k objednávke musí napísať.", false, true]]],
    [["Zmeniť poradie výrobkov a príchutí na webe"], [["Správa → Ponuka → Poradie", true], ["Každý riadok potrebuje vlastné číslo, inak sa príchute môžu poprehadzovať.", false, true]]],
    [["Pozrieť objednávky, označiť vybavenú alebo zrušenú"], [["Správa → Objednávky", true], ["Zrušená objednávka automaticky uvoľní kapacitu dňa", false, true]]],
    [["Prepísať úvodný text na titulke"], [["Správa → Nastavenia", true], ["Hlavný nadpis môže mať viac riadkov — kde stlačíš Enter, tam sa na webe zalomí.", false, true]]],
    [["Zmeniť denný limit zákuskov, tort alebo chlebíkov"], [["Správa → Dni a limity", true], ["Každý deň má tri samostatné limity", false, true]]],
    [["Obnoviť si zabudnuté heslo do správy"], [["Supabase → Authentication → Users", true]]],
    [["Zistiť, prečo niečo nefunguje"], [["Vercel → do-srdiecka → Logs", true], ["Len hodinu dozadu — choď tam hneď, ako problém nastane", false, true]]],
    [["Zmeniť heslo k e-mailovej schránke"], [["Websupport, a hneď potom Vercel → Environment Variables", true], ["Inak prestanú chodiť notifikácie o objednávkach", false, true]]],
    [["Zmeniť e-mail, ktorým sa hlásim do správy"], [["Supabase → Authentication → Users, a hneď potom ADMIN_EMAILS vo Verceli", true], ["Keď sa tie dve adresy rozídu, správa nepustí dnu ani teba", false, true]]],
    [["Zmeniť texty, vzhľad alebo správanie webu"], [["Napíš mi — mením to v kóde na GitHube", true]]],
  ]
));

// --- Heslá ---
children.push(H1("Heslá a kľúče"));
children.push(P("Šesť vecí, ktoré existujú. Tri z nich stačí mať v poznámkach, tri žijú vo Verceli."));
children.push(SPACER(80));
children.push(table(
  [2700, 3200, 3100],
  ["Čo", "Kde žije", "Na čo"],
  [
    [[["Prihlásenie do správy", true], ["e-mail + heslo"]], ["Vytvorené v Supabase, ty ho máš v poznámkach"], ["Denná práca na /admin/"]],
    [[["Účet Supabase", true]], ["E-mail alebo Google"], ["Prístup k databáze"]],
    [[["Heslo k databáze", true]], ["Tvoje poznámky"], ["Núdzové situácie. Bežne ho nepotrebuješ."]],
    [[["Kľúč service_role", true]], [["Iba vo Verceli", true]], ["Web ním číta a zapisuje do databázy"]],
    [[["Heslo k schránke", true]], [["Websupport + vo Verceli", true]], ["Odosielanie notifikácií"]],
    [[["Účet GitHub", true]], ["Tvoje prihlásenie"], ["Cez neho sa hlásiš aj do Vercelu"]],
    [[["ADMIN_EMAILS", true], ["nie je tajné"]], ["Vo Verceli"], ["Určuje, kto sa dostane do správy. Prihlásenie samo o sebe nestačí."]],
  ]
));
children.push(SPACER(160));
children.push(CALLOUT([
  [["Kľúč service_role a heslo k schránke nikdy nedávaj do kódu, na GitHub ani do chatu.", true],
   [" Patria výhradne do políčok vo Vercel nastaveniach, kam vidí len tvoj účet."]],
  [["Ten kľúč má plný prístup k databáze — kto ho má, môže čítať aj mazať objednávky a kontakty zákazníčok."]],
]));

// --- Kde stojíme ---
children.push(H1("Kde stojíme"));
[
  ["hotovo", "Kód je na GitHube", "35 súborov, overené oproti otestovanej verzii"],
  ["hotovo", "Databáza beží", "tabuľky, ponuka aj ukážkové dni sú založené"],
  ["hotovo", "Web je nasadený", "beží na dosrdiecka.sk, .vercel.app zostáva ako záloha"],
  ["hotovo", "Správa funguje", "prihlásenie, dni, limity, ponuka"],
  ["hotovo", "Objednávka prešla celým kolom", "uložila sa, znížila kapacitu, notifikácia dorazila"],
  ["hotovo", "Doména dosrdiecka.sk", "pripojená aj so zabezpečeným https, www presmeruje"],
  ["hotovo", "Košík", "objednávka sa dá začať aj z ponuky, nielen výberom termínu"],
  ["hotovo", "Dva e-maily", "notifikácia tebe a potvrdenie zákazníčke, s názvami výrobkov"],
  ["hotovo", "Denný limit chlebíka", "18 ks zákuskov, 1 torta, 1 chlebík na deň"],
  ["hotovo", "Do správy len povolené e-maily", "prihlásenie samo o sebe nestačí, registrácia je vypnutá"],
  ["hotovo", "Objednávku založí len server", "cez verejný kľúč to už nejde"],
  ["hotovo", "Kapacity nie sú verejne čitateľné", "pohľad rešpektuje ochranu tabuliek"],
  ["hotovo", "Povinná poznámka o alergiách", "bez nej sa objednávka neodošle, kontroluje to aj server"],
  ["hotovo", "Číslo objednávky", "v predmete oboch e-mailov aj na potvrdzovacej obrazovke"],
  ["hotovo", "Najbližší voľný termín", "ukazuje skutočný dátum, aj keď je až v ďalšom mesiaci"],
  ["hotovo", "Príchute pri výrobku", "všetky zákusky majú príchute v jednej karte, každá s vlastným minimom 6 ks"],
  ["hotovo", "Objednávka na želanie", "pri Choux aj pavlove si zákazníčka vypýta vlastnú kombináciu a napíše ju do poznámky"],
  ["zostáva", "Ochrana proti uniknutým heslám", "je za plateným programom Supabase; heslo si over na haveibeenpwned.com/Passwords"],
  ["zostáva", "Príchute pri tortách", "keď mi povieš, aké majú byť"],
].forEach(([stav, co, detail]) => {
  children.push(new Paragraph({
    spacing: { after: 90, line: 276 },
    children: [
      new TextRun({ text: stav === "hotovo" ? "✓  " : "○  ", bold: true, size: 21, color: stav === "hotovo" ? ACCENT : WARN }),
      new TextRun({ text: co, bold: true, size: 21 }),
      new TextRun({ text: " — " + detail, size: 21, color: "444444" }),
    ],
  }));
});

children.push(SPACER(280));
children.push(new Paragraph({
  border: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE } },
  spacing: { before: 120, after: 0 },
  children: [new TextRun({
    text: "Do srdiečka · prevádzková príručka k webu · aktualizované po prvom kole úprav a bezpečnostných opravách",
    size: 17, color: GREY, italics: true,
  })],
}));

// ---------- dokument ----------

const doc = new Document({
  creator: "Do srdiečka",
  title: "Do srdiečka — prevádzková príručka k webu",
  description: "Čo robí GitHub, Vercel, Supabase a Websupport, čo máš kde uložené a kam ísť, keď niečo potrebuješ.",
  numbering: {
    config: [{
      reference: "odrazky",
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: "•",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 200 } } },
      }],
    }],
  },
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 21 } },
    },
  },
  sections: [{
    properties: {
      page: { margin: { top: 1200, bottom: 1200, left: 1440, right: 1440 } },
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = require("path").join(__dirname, "Do-srdiecka-prirucka.docx");
  fs.writeFileSync(out, buf);
  console.log("OK");
});
