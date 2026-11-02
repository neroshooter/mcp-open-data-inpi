"""Génère les tables de correspondance du RNE à partir du dictionnaire de
données publié par l'INPI (fichier XLSX « Dictionnaire de données INPI »).

Usage : python3 scripts/generer-referentiels.py chemin/vers/Dictionnaire.xlsx
Nécessite le module openpyxl. Le fichier produit, src/referentiels/rne.ts,
est versionné : ce script ne sert qu'à le régénérer après une mise à jour
du dictionnaire par l'INPI.
"""
import json
import pathlib
import sys

import openpyxl

FEUILLES = {
    "ROLES_ENTREPRISE": "roleEntreprise",
    "FORMES_JURIDIQUES": "formeJuridique",
    "TYPES_VOIE": "typeVoie",
    "TYPES_DOCUMENT": "typeDocument",
}


def lire(classeur, feuille):
    table = {}
    for ligne in list(classeur[feuille].iter_rows(values_only=True))[1:]:
        code, libelle = ligne[0], ligne[1]
        if code is None or libelle is None:
            continue
        code = str(code).strip()
        if feuille == "formeJuridique" and code.isdigit():
            code = code.zfill(4)
        libelle = " ".join(str(libelle).split())
        # Une même forme peut figurer plusieurs fois avec une condition (EURL, SASU…) :
        # on conserve le premier libellé, qui correspond au cas général.
        table.setdefault(code, libelle)
    return table


def main():
    source = pathlib.Path(sys.argv[1])
    classeur = openpyxl.load_workbook(source, read_only=True)
    sortie = [
        "// Fichier généré par scripts/generer-referentiels.py : ne pas modifier à la main.",
        "// Source : dictionnaire de données du Registre national des entreprises publié par l'INPI",
        f"// ({source.name}).",
        "",
    ]
    for nom, feuille in FEUILLES.items():
        table = lire(classeur, feuille)
        sortie.append(f"export const {nom}: Record<string, string> = {json.dumps(table, ensure_ascii=False, indent=2)};")
        sortie.append("")
    cible = pathlib.Path(__file__).resolve().parent.parent / "src" / "referentiels" / "rne.ts"
    cible.write_text("\n".join(sortie), encoding="utf-8")
    print(f"{cible} écrit")


if __name__ == "__main__":
    main()
