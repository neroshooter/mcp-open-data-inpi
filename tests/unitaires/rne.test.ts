import { describe, expect, it } from 'vitest';
import { lireChiffresCles, montantLiasse } from '../../src/analyseurs/comptes.js';
import { analyserDocuments } from '../../src/analyseurs/documents.js';
import { analyserEntreprise } from '../../src/analyseurs/entreprise.js';
import { formaterChiffresCles, formaterDocuments, formaterFicheEntreprise } from '../../src/formats/entreprise.js';
import { choisirComptes, normaliserSiren } from '../../src/outils/rne.js';
import { jeuJSON } from './aides.js';

describe('fiche entreprise', () => {
  const fiche = analyserEntreprise(jeuJSON('rne-entreprise.json'));

  it('lit identité, forme juridique, capital, objet, durée et clôture', () => {
    expect(fiche).toMatchObject({
      siren: '000007919',
      denomination: 'SOCIETE EXEMPLE 28',
      typePersonne: 'morale',
      codeFormeJuridique: '5710',
      formeJuridique: 'SAS, société par actions simplifiée',
      capital: { montant: 3857804, devise: 'EUR', variable: false },
      dureeAnnees: 49,
      dateClotureExercice: '3112',
      dateFinExistence: '2045-12-07',
    });
    expect(fiche.objet).toMatch(/^Objet social d'exemple/);
  });

  it('assemble l’adresse du siège avec le libellé du type de voie', () => {
    expect(fiche.siege).toBe("1 AVENUE DE L'EXEMPLE 1, 10404 Villexemple-8");
  });

  it('lit les dates d’immatriculation de chaque registre', () => {
    expect(fiche.immatriculations).toContainEqual({
      registre: 'Registre du commerce et des sociétés (RCS)',
      date: '1996-07-15',
    });
  });

  it('sépare dirigeants et commissaires aux comptes, avec le libellé de leur qualité', () => {
    expect(fiche.dirigeants.map((d) => `${d.qualite} : ${d.nom}`)).toEqual([
      'Président de SAS : Prenom2 NOM4',
      'Directeur Général : Prenom3 NOM4',
    ]);
    expect(fiche.commissairesAuxComptes.map((d) => d.qualite)).toEqual([
      'Commissaire aux comptes titulaire',
      'Commissaire aux comptes suppléant',
    ]);
    expect(fiche.commissairesAuxComptes[0]?.siren).toBe('000031676');
  });

  it('ne restitue ni bénéficiaires effectifs ni dates de naissance', () => {
    const texte = formaterFicheEntreprise(fiche);
    expect(texte).toContain('Les bénéficiaires effectifs ne sont pas restitués');
    expect(texte).not.toMatch(/1970-01|naissance/i);
    expect(texte).toContain('prospection commerciale');
  });
});

describe('documents déposés', () => {
  const docs = analyserDocuments(jeuJSON('rne-documents.json'));

  it('liste les actes, y compris ceux sans date de dépôt, placés en fin de liste', () => {
    expect(docs.actes).toHaveLength(64);
    const sansDate = docs.actes.filter((a) => !a.dateDepot);
    expect(sansDate).toHaveLength(2);
    expect(docs.actes.slice(-2).every((a) => !a.dateDepot)).toBe(true);
  });

  it('repère les actes contenant des statuts', () => {
    const statuts = docs.actes.filter((a) => a.contientStatuts);
    expect(statuts).toHaveLength(15);
    expect(statuts.every((a) => a.types.some((t) => /statut/i.test(t)))).toBe(true);
    expect(docs.actes.filter((a) => a.natureInconnue)).toHaveLength(42);
  });

  it('rattache les données saisies aux comptes déposés', () => {
    expect(docs.comptes).toHaveLength(2);
    expect(docs.comptes[0]).toMatchObject({ dateCloture: '2024-12-31', typeBilan: 'C', libelleType: 'Comptes sociaux (comptes annuels complets)' });
    expect(docs.comptes.every((c) => c.idSaisie)).toBe(true);
  });

  it('applique le filtre des statuts et signale les actes non classables', () => {
    const texte = formaterDocuments('000007919', docs, { statutsSeulement: true, type: 'actes' });
    expect(texte).toContain('Actes contenant des statuts (15 sur 64 actes)');
    expect(texte).toContain('42 acte(s) ancien(s)');
    expect(texte).not.toContain('Comptes annuels (');
  });
});

describe('chiffres clés des comptes complets', () => {
  const donnees = jeuJSON<{ bilansSaisis: unknown[] }>('rne-documents.json');
  const c = lireChiffresCles(donnees.bilansSaisis[0]);
  const poste = (libelle: string) => c.postes.find((p) => p.libelle === libelle);

  it('lit les postes dans les bonnes colonnes de la liasse', () => {
    expect(c.typeBilan).toBe('C');
    expect(poste("Chiffre d'affaires net")).toMatchObject({ n: 27236380, n1: 28071582 }); // FJ m3 / m4
    expect(poste('Résultat net (bénéfice ou perte)')).toMatchObject({ n: -813020, n1: -1858416 }); // HN m1 / m2
    expect(poste('Capital social')).toMatchObject({ n: 3857804, n1: 3857804 }); // DA
    expect(poste('Capitaux propres')).toMatchObject({ n: 5497634, n1: 6550921 }); // DL
    expect(poste('Total des dettes')).toMatchObject({ n: 8127372, n1: 8611941 }); // EC
    expect(poste('Total du bilan')).toMatchObject({ n: 13740814, n1: 15284938 }); // EE
    expect(poste("Résultat d'exploitation")).toMatchObject({ n: -2570465, n1: -3583210 }); // GG m3 / m4
  });

  it('indique la nature des comptes et les deux années', () => {
    expect(c).toMatchObject({ nature: 'sociaux', annee: '2024', anneePrecedente: '2023' });
    expect(formaterChiffresCles('000007919', c)).toContain('**Nature des comptes** : Comptes sociaux (société seule)');
  });

  it('présente un tableau exercice / exercice précédent', () => {
    const texte = formaterChiffresCles('000007919', c);
    expect(texte).toContain('| Poste | Exercice 2024 | Exercice 2023 |');
    expect(texte).toMatch(/\| Résultat net \(bénéfice ou perte\) \| -813 020 € \| -1 858 416 € \|/);
  });
});

describe('chiffres clés des comptes simplifiés et cas particuliers', () => {
  const bilan = (type: string, confid: string, liasses: object[]) => ({
    id: 'abc',
    bilanSaisi: {
      bilan: {
        identite: { codeTypeBilan: type, codeConfidentialite: confid, codeSaisie: '00', dateClotureExercice: '2025-12-31', dateClotureExerciceNMoins1: '2024-12-31' },
        detail: { pages: [{ numero: 1, liasses }] },
      },
    },
  });

  it('additionne les postes 210, 214 et 218 et lit le passif en colonnes 3 et 4', () => {
    const c = lireChiffresCles(
      bilan('S', '0', [
        { code: '210', m1: '000000000001000', m2: '000000000000900' },
        { code: '214', m1: '000000000000200', m2: '000000000000100' },
        { code: '218', m1: '000000000000030', m2: '000000000000020' },
        { code: '310', m1: '-000000000000050', m2: '000000000000040' },
        { code: '142', m3: '000000000000500', m4: '000000000000450' },
        { code: '180', m3: '000000000002000', m4: '000000000001800' },
      ]),
    );
    expect(c.postes.find((p) => p.libelle === "Chiffre d'affaires net")).toMatchObject({ n: 1230, n1: 1020 });
    expect(c.postes.find((p) => p.libelle.startsWith('Résultat net'))).toMatchObject({ n: -50, n1: 40 });
    expect(c.postes.find((p) => p.libelle === 'Capitaux propres')).toMatchObject({ n: 500, n1: 450 });
    expect(c.postes.find((p) => p.libelle === 'Total du bilan')).toMatchObject({ n: 2000, n1: 1800 });
    expect(c.avertissement).toMatch(/rapprochez ces montants du PDF/);
  });

  it('ne restitue aucun chiffre pour des comptes confidentiels', () => {
    const c = lireChiffresCles(bilan('C', '1', [{ code: 'FJ', m3: '000000000001000' }]));
    expect(c.postes).toHaveLength(0);
    expect(c.avertissement).toMatch(/confidentialité/);
  });

  it('renvoie vers le PDF pour un type de comptes non pris en charge', () => {
    const c = lireChiffresCles(bilan('B', '0', [{ code: 'A3', m1: '000000000001000' }]));
    expect(c.postes).toHaveLength(0);
    expect(c.avertissement).toMatch(/PDF/);
  });

  it('reconnaît les comptes consolidés et déduit l’année précédente si elle manque', () => {
    const c = lireChiffresCles({
      id: 'x',
      bilanSaisi: {
        bilan: {
          identite: { codeTypeBilan: 'K', codeConfidentialite: '0', codeSaisie: '00', dateClotureExercice: '2025-03-31', dureeExerciceNMoins1: '12' },
          detail: { pages: [{ numero: 3, liasses: [{ code: 'FJ', m3: '000000000001000', m4: '000000000000900' }] }] },
        },
      },
    });
    expect(c).toMatchObject({ nature: 'consolides', libelleType: 'Comptes consolidés (groupe)', annee: '2025', anneePrecedente: '2024' });
    expect(formaterChiffresCles('000000000', c)).toContain('| Poste | Exercice 2025 | Exercice 2024 |');
  });

  it('convertit les montants signés de la liasse', () => {
    expect(montantLiasse('-000000002197350')).toBe(-2197350);
    expect(montantLiasse('000000000000000')).toBe(0);
    expect(montantLiasse('n/a')).toBeUndefined();
  });
});

describe('choix des comptes', () => {
  const saisis = [
    { id: 's23', dateCloture: '2023-12-31', typeBilan: 'C' },
    { id: 's24', dateCloture: '2024-12-31', typeBilan: 'C' },
    { id: 'k24', dateCloture: '2024-12-31', typeBilan: 'K' },
    { id: 'old', dateCloture: '2025-12-31', typeBilan: 'C', deleted: true },
  ];

  it('prend par défaut les comptes sociaux les plus récents', () => {
    expect(choisirComptes(saisis, {}).choisi.id).toBe('s24');
  });

  it('prend les comptes consolidés sur demande', () => {
    expect(choisirComptes(saisis, { comptes: 'consolides' }).choisi.id).toBe('k24');
    expect(choisirComptes(saisis, { comptes: 'sociaux', exercice: 2023 }).choisi.id).toBe('s23');
  });

  it('prend les consolidés par défaut s’il n’existe qu’eux', () => {
    expect(choisirComptes([{ id: 'k', dateCloture: '2024-12-31', typeBilan: 'K' }], {}).choisi.id).toBe('k');
  });

  it('liste les comptes disponibles quand la demande ne peut être satisfaite', () => {
    expect(() => choisirComptes(saisis, { comptes: 'consolides', exercice: 2023 })).toThrow(
      /Aucun compte consolidé saisi pour l'exercice 2023\. Comptes chiffrés disponibles : 2024 \(sociaux\), 2024 \(consolidés\), 2023 \(sociaux\)/,
    );
  });
});

describe('noms des dirigeants', () => {
  it('affiche toujours « Prénom(s) NOM », quelle que soit la casse du RNE', () => {
    const fiche = analyserEntreprise({
      formality: {
        siren: '000000000',
        content: {
          personneMorale: {
            identite: { entreprise: { denomination: 'EXEMPLE' } },
            composition: {
              pouvoirs: [
                { roleEntreprise: '65', individu: { descriptionPersonne: { nom: 'Exemple', prenoms: ['MARIE'] } } },
                { roleEntreprise: '65', individu: { descriptionPersonne: { nom: 'dupont', prenoms: ['jean-baptiste', 'LOUIS'], nomUsage: 'Martin' } } },
              ],
            },
          },
        },
      },
    });
    expect(fiche.dirigeants.map((d) => d.nom)).toEqual(['Marie EXEMPLE', "Jean-Baptiste Louis DUPONT (nom d'usage : MARTIN)"]);
  });
});

describe('SIREN', () => {
  it('accepte les espaces et rejette les formats invalides', () => {
    expect(normaliserSiren('403 052 111')).toBe('403052111');
    expect(() => normaliserSiren('40305211')).toThrow(/9 chiffres/);
  });
});
