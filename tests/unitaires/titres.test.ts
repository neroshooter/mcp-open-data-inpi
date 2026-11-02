import { describe, expect, it } from 'vitest';
import { analyserNoticeBrevet, classificationLisible } from '../../src/analyseurs/brevet.js';
import { analyserNoticeModele } from '../../src/analyseurs/modele.js';
import { lirePageResultats } from '../../src/analyseurs/recherche.js';
import type { ReponseRecherchePI } from '../../src/api/pi.js';
import { formaterFicheBrevet, formaterFicheModele } from '../../src/formats/titres.js';
import { normaliserNumeroBrevet, normaliserNumeroModele } from '../../src/outils/titres.js';
import { jeu, jeuJSON } from './aides.js';

describe('notice de brevet français délivré', () => {
  const fiche = analyserNoticeBrevet(jeu('brevet-1.xml'), 'FR3073063');

  it('lit la publication au format INPI, le dépôt et la nature', () => {
    expect(fiche.publication).toMatchObject({ pays: 'FR', numero: '3073063', code: 'A1', date: '20190503', bopi: '2019-18' });
    expect(fiche.depot).toMatchObject({ pays: 'FR', numero: '1760304', date: '20171031' });
    expect(fiche.nature).toBe('Demande française');
    expect(fiche.titre).toBe('TERMINAL DE PAIEMENT');
  });

  it('distingue déposant (avec SIREN), titulaire actuel, inventeurs et mandataire', () => {
    expect(fiche.deposants[0]).toMatchObject({ nom: 'SOCIETE EXEMPLE 1', siren: '000007919' });
    expect(fiche.titulaires[0]?.nom).toBe('SOCIETE EXEMPLE 3');
    expect(fiche.inventeurs.map((i) => i.nom)).toEqual(['Prenom1 NOM1', 'Prenom1 NOM2']);
    expect(fiche.mandataires).toHaveLength(1);
  });

  it('lit les inscriptions au Registre national des brevets', () => {
    expect(fiche.inscriptions).toEqual([
      { numero: '0251101', date: '20220621', nature: "Changement d'adresse", code: 'CA', bopi: '2022-30' },
      { numero: '0251103', date: '20220621', nature: 'Transmission totale de propriété', code: 'TO', bopi: '2022-30' },
    ]);
  });

  it('lit les annuités, la délivrance et le rapport de recherche', () => {
    expect(fiche.datesProcedure).toContainEqual({ libelle: 'Dernière annuité payée (9e annuité)', date: '20251030' });
    expect(fiche.datesProcedure).toContainEqual({ libelle: 'Prochaine annuité (10e annuité), échéance', date: '20261102' });
    expect(fiche.datesProcedure).toContainEqual({ libelle: 'Délivrance', date: '20200612', bopi: '2020-24', precision: 'publication B1' });
  });

  it('rend lisibles les classifications et liste les documents cités', () => {
    expect(fiche.classificationsCIB).toEqual(['G06K 7/01', 'G07F 19/00']);
    expect(fiche.classificationsCPC).toContain('G06Q 20/203');
    expect(fiche.citations).toHaveLength(3);
  });

  it('produit une fiche complète', () => {
    const texte = formaterFicheBrevet(fiche);
    expect(texte).toContain('## Inscriptions au Registre national des brevets');
    expect(texte).toContain('Transmission totale de propriété (inscription n° 0251103) — BOPI 2022-30');
    expect(texte).toContain('Délivrance : 12/06/2020 (publication B1) — BOPI 2020-24');
  });
});

describe('notice de brevet européen et de demande rejetée', () => {
  it('lit le statut, le statut OEB et la déchéance', () => {
    const f = analyserNoticeBrevet(jeu('brevet-2.xml'), 'EP3813503');
    expect(f.statut).toBe('Déchu');
    expect(f.statutOEB).toBe('Brevet non en vigueur');
    expect(f.nature).toBe('Demande euroPCT');
    expect(f.langueAbrege).toBe('en');
    expect(f.inscriptions[0]?.nature).toBe('Dérogation à la compétence de la Juridiction Unifiée du Brevet');
    expect(f.datesProcedure.map((d) => d.libelle)).toEqual(
      expect.arrayContaining(['Délivrance', 'Déchéance', 'Publication de la déchéance']),
    );
  });

  it('lit le rejet d’une demande française', () => {
    const f = analyserNoticeBrevet(jeu('brevet-3.xml'), 'FR2979292');
    expect(f.statut).toBe('Rejeté');
    expect(f.datesProcedure).toContainEqual({ libelle: 'Rejet de la demande', date: '20131217' });
    expect(f.classificationsCIB).toEqual(['B60J 7/08']);
  });
});

describe('classifications', () => {
  it.each([
    ['B60J   7/08        20060101AFI20110829BHFR        ', 'B60J 7/08'],
    ['H05K  13/0813  ', 'H05K 13/0813'],
    ['G06Q', 'G06Q'],
  ])('« %s » devient « %s »', (brut, attendu) => {
    expect(classificationLisible(brut)).toBe(attendu);
  });
});

describe('notice de dessin ou modèle international', () => {
  const fiche = analyserNoticeModele(jeu('modele-1.xml'), 'WODM071720-001');

  it('lit le dépôt, l’office et les pays désignés', () => {
    expect(fiche).toMatchObject({ office: 'WO', numeroDepot: 'DM/071720', dateDepot: '2009-02-23', nombreModeles: 2 });
    expect(fiche.paysDesignes).toContain('EM (Hague Agreement - 1999 Act)');
  });

  it('lit le modèle : titre en français, Locarno, expiration, créateur', () => {
    const m = fiche.modeles[0];
    expect(m?.titre).toBe('1.-2. Terminaux de paiement');
    expect(m?.classesLocarno).toEqual(['1402']);
    expect(m?.dateExpiration).toBe('2029-02-23');
    expect(m?.createurs).toHaveLength(1);
  });

  it('reprend l’historique, y compris le nouveau titulaire', () => {
    const natures = fiche.modeles[0]?.inscriptions.map((i) => i.nature);
    expect(natures).toEqual(expect.arrayContaining(['Registration', 'Cession', 'Renouvellement', 'Changement De Titulaire']));
    const changement = fiche.modeles[0]?.inscriptions.find((i) => i.beneficiaires.length);
    expect(changement?.beneficiaires[0]?.nom).toMatch(/^SOCIETE EXEMPLE/);
    expect(fiche.mandataires.map((m) => m.mention)).toContain('RIDM : 2011-07-06');
  });

  it('signale les autres modèles du dépôt', () => {
    expect(formaterFicheModele(fiche)).toContain("Ce dépôt compte 2 modèles. L'API de l'INPI ne restitue que la notice détaillée du premier");
  });
});

describe('notice de dessin ou modèle français', () => {
  const fiche = analyserNoticeModele(jeu('modele-2.xml'), 'FR20140182-001');

  it('lit le statut traduit, le lieu de dépôt et les reproductions', () => {
    expect(fiche.office).toBe('FR');
    expect(fiche.lieuDepot).toBe('INPI ILE DE FRANCE');
    expect(fiche.modeles[0]).toMatchObject({ statut: 'Enregistré (Registered)', nombreReproductions: 1, classesLocarno: ['0301'] });
    expect(fiche.deposants[0]?.siren).toMatch(/^\d{9}$/);
  });
});

describe('résultats de recherche de brevets et de modèles', () => {
  it('retire les fragments XML des numéros de brevet et lit la référence', () => {
    const page = lirePageResultats(jeuJSON<ReponseRecherchePI>('recherche-brevets.json'));
    expect(page.resultats[0]?.reference).toBe('FR3073063');
    expect(page.resultats[0]?.champs.PUBN).toBe('FR3073063 A1');
    expect(page.resultats[0]?.champs.DEPN).toBe('FR1760304');
  });

  it('identifie chaque modèle d’un dépôt international', () => {
    const page = lirePageResultats(jeuJSON<ReponseRecherchePI>('recherche-modeles.json'));
    expect(page.resultats.map((r) => r.reference)).toContain('WODM071720-001');
  });
});

describe('numéros', () => {
  it.each([
    ['FR20140182', { base: 'FR20140182', rang: '001' }],
    ['FR 20140182-2', { base: 'FR20140182', rang: '002' }],
    ['WODM071720-001', { base: 'WODM071720', rang: '001' }],
    ['DM/071720', { base: 'WODM071720', rang: '001' }],
  ])('modèle %s', (saisie, attendu) => {
    expect(normaliserNumeroModele(saisie)).toEqual(attendu);
  });

  it('normalise les numéros de brevet', () => {
    expect(normaliserNumeroBrevet('fr 3 073 063')).toBe('FR3073063');
    expect(normaliserNumeroBrevet('EP3813503A1')).toBe('EP3813503');
    expect(() => normaliserNumeroBrevet('terminal')).toThrow(/non reconnu/);
  });
});
