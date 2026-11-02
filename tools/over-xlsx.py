# Otvorí stiahnutý zošit tak, ako ho otvorí Excel, a vypíše, čo v ňom je.
#
#   pip install --target /niekam openpyxl
#   PYTHONPATH=/niekam python3 tools/over-xlsx.py subor.xlsx
#
# Keď to prejde bez chyby, súbor je platný zošit — nie premenované CSV.

import sys
import zipfile

import openpyxl


def main(cesta):
    zf = zipfile.ZipFile(cesta)
    if zf.testzip() is not None:
        raise SystemExit("ZIP je poškodený")
    print("časti:", ", ".join(zf.namelist()))

    wb = openpyxl.load_workbook(cesta)
    ws = wb.active
    print("hárok:", ws.title, "| rozmer:", ws.dimensions)
    for riadok in ws.iter_rows(values_only=True):
        if any(b is not None for b in riadok):
            print("  ", riadok)

    cisla = [b.value for r in ws.iter_rows() for b in r if isinstance(b.value, (int, float))]
    print("čísel uložených ako čísla:", len(cisla))
    if not cisla:
        raise SystemExit("žiadne číslo sa neuložilo ako číslo — v tabuľke sa nedá počítať")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("použitie: over-xlsx.py subor.xlsx")
    main(sys.argv[1])
