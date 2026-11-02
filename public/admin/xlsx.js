// Zápis zošita pre Excel (.xlsx) priamo v prehliadači.
//
// Prečo ručne: projekt zámerne beží na nule balíčkov a .xlsx je len ZIP
// s niekoľkými XML súbormi. CSV by bolo kratšie, ale Excel si pri ňom
// podľa nastavení Windowsu domýšľa oddeľovač aj kódovanie a slovenské
// znaky sa rozsypú. Zošit je jednoznačný: čísla sú čísla, text je text.
//
// ZIP sa zapisuje bez kompresie (metóda 0 — "stored"). Súbory sú malé,
// takže sa tým nič nestratí, a odpadá celý deflate.
//
// Použitie:
//   Xlsx.stiahni('nakup.xlsx', {
//     nazov: 'Nákup',
//     stlpce: [{ hlavicka: 'Surovina', sirka: 28 }, …],
//     riadky: [['Múka', 1200, …], …],   // číslo = číslo, inak text
//     nadpis: 'Nákup na 8. 11. 2026',   // nepovinný riadok nad tabuľkou
//   });

window.Xlsx = (function () {
  'use strict';

  // --- CRC32 (ZIP ho vyžaduje pri každej položke) ---
  const TABULKA = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bajty) {
    let c = 0xffffffff;
    for (let i = 0; i < bajty.length; i++) c = TABULKA[(c ^ bajty[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const utf8 = (s) => new TextEncoder().encode(s);

  // --- ZIP ---
  function zip(polozky) {
    const kodovane = polozky.map((p) => {
      const nazov = utf8(p.nazov);
      const data = typeof p.data === 'string' ? utf8(p.data) : p.data;
      return { nazov, data, crc: crc32(data) };
    });

    // Najprv veľkosť, nech sa alokuje raz.
    let dlzka = 0;
    kodovane.forEach((p) => { dlzka += 30 + p.nazov.length + p.data.length; });
    kodovane.forEach((p) => { dlzka += 46 + p.nazov.length; });
    dlzka += 22;

    const von = new Uint8Array(dlzka);
    const dv = new DataView(von.buffer);
    let pos = 0;
    const u16 = (v) => { dv.setUint16(pos, v, true); pos += 2; };
    const u32 = (v) => { dv.setUint32(pos, v, true); pos += 4; };
    const bajty = (b) => { von.set(b, pos); pos += b.length; };

    const zaciatky = [];
    kodovane.forEach((p) => {
      zaciatky.push(pos);
      u32(0x04034b50);          // hlavička položky
      u16(20);                  // potrebná verzia
      u16(0x0800);              // názvy súborov v UTF-8
      u16(0);                   // bez kompresie
      u16(0); u16(0);           // čas a dátum (nepodstatné)
      u32(p.crc);
      u32(p.data.length);       // zbalená veľkosť = pôvodná
      u32(p.data.length);
      u16(p.nazov.length);
      u16(0);                   // bez doplnkov
      bajty(p.nazov);
      bajty(p.data);
    });

    const zaciatokRegistra = pos;
    kodovane.forEach((p, i) => {
      u32(0x02014b50);          // položka registra
      u16(20); u16(20);
      u16(0x0800);
      u16(0);
      u16(0); u16(0);
      u32(p.crc);
      u32(p.data.length);
      u32(p.data.length);
      u16(p.nazov.length);
      u16(0); u16(0); u16(0); u16(0);
      u32(0);                   // atribúty
      u32(zaciatky[i]);
      bajty(p.nazov);
    });

    const velkostRegistra = pos - zaciatokRegistra;

    u32(0x06054b50);            // koniec registra
    u16(0); u16(0);
    u16(kodovane.length); u16(kodovane.length);
    u32(velkostRegistra);
    u32(zaciatokRegistra);
    u16(0);
    return von;
  }

  // --- XML ---
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Riadiace znaky v XML 1.0 nemajú čo robiť a Excel na nich spadne.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  // A, B, … Z, AA, AB … Stĺpcov je v praxi pár, ale nech to nemá strop.
  function pismeno(i) {
    let s = '';
    for (let n = i + 1; n > 0;) {
      const zvysok = (n - 1) % 26;
      s = String.fromCharCode(65 + zvysok) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  // Štýly: 0 obyčajný, 1 tučný (hlavička), 2 číslo na dve desatinné.
  const STYLY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  function bunka(hodnota, riadok, stlpec, tucne) {
    const adresa = pismeno(stlpec) + riadok;
    if (hodnota === null || hodnota === undefined || hodnota === '') {
      return `<c r="${adresa}"${tucne ? ' s="1"' : ''}/>`;
    }
    if (typeof hodnota === 'number' && Number.isFinite(hodnota)) {
      const styl = Number.isInteger(hodnota) ? '' : ' s="2"';
      return `<c r="${adresa}"${styl}><v>${hodnota}</v></c>`;
    }
    return `<c r="${adresa}" t="inlineStr"${tucne ? ' s="1"' : ''}`
      + `><is><t xml:space="preserve">${esc(hodnota)}</t></is></c>`;
  }

  function harok(harky) {
    const stlpce = harky.stlpce || [];
    const sirky = stlpce.length
      ? `<cols>${stlpce.map((s, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${s.sirka || 16}" customWidth="1"/>`).join('')}</cols>`
      : '';

    const riadky = [];
    let cislo = 1;
    if (harky.nadpis) {
      riadky.push(`<row r="${cislo}">${bunka(harky.nadpis, cislo, 0, true)}</row>`);
      cislo += 2;   // prázdny riadok pod nadpisom
    }
    riadky.push(`<row r="${cislo}">${
      stlpce.map((s, i) => bunka(s.hlavicka, cislo, i, true)).join('')}</row>`);
    cislo += 1;
    (harky.riadky || []).forEach((r) => {
      riadky.push(`<row r="${cislo}">${
        r.map((v, i) => bunka(v, cislo, i, false)).join('')}</row>`);
      cislo += 1;
    });

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${sirky}<sheetData>${riadky.join('')}</sheetData></worksheet>`;
  }

  function zosit(harky) {
    // Názov hárku: Excel zakazuje : \\ / ? * [ ] a viac ako 31 znakov.
    const nazov = esc(String(harky.nazov || 'Hárok1').replace(/[:\\/?*[\]]/g, ' ').slice(0, 31));
    return zip([
      {
        nazov: '[Content_Types].xml',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
      },
      {
        nazov: '_rels/.rels',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
      },
      {
        nazov: 'xl/workbook.xml',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${nazov}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      },
      {
        nazov: 'xl/_rels/workbook.xml.rels',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
      },
      { nazov: 'xl/styles.xml', data: STYLY },
      { nazov: 'xl/worksheets/sheet1.xml', data: harok(harky) },
    ]);
  }

  function stiahni(nazovSuboru, harky) {
    const bajty = zosit(harky);
    const blob = new Blob([bajty], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nazovSuboru;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Odkaz ani adresu neodstraňovať hneď: kliknutie sa spracúva až po
    // skončení tejto funkcie a prehliadač sťahovanie zruší, keď mu prvok
    // alebo obsah spod rúk zmizne.
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 10000);
  }

  return { stiahni, zosit };
})();
