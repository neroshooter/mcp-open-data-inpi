import { describe, expect, it } from 'vitest';
import { analyserNoticeMarque } from '../../src/analyseurs/marque.js';
import { formaterFicheMarque } from '../../src/formats/marque.js';
import { normaliserNumeroMarque } from '../../src/outils/marques.js';
import { jeu } from './aides.js';

describe('notice de marque française avec sections CDATA', () => {
  const fiche = analyserNoticeMarque(jeu('marque-fr-2.xml'));

  it('lit le nom de la marque enveloppé dans une section CDATA', () => {
    expect(fiche.nom).toBe('la marque exemple 2');
  });

  it('lit le titulaire actuel, sa forme juridique et son SIREN', () => {
    expect(fiche.titulairesActuels).toHaveLength(1);
    expect(fiche.titulairesActuels[0]).toMatchObject({
      nom: 'SOCIETE EXEMPLE 6',
      siren: '000015838',
      formeJuridique: 'Société par actions simplifiée',
      typePersonne: 'PM',
    });
    expect(fiche.deposants[0]?.siren).toBe('000015838');
  });

  it('assemble le nom du mandataire (cabinet et conseil)', () => {
    expect(fiche.mandataires[0]?.nom).toBe('SOCIETE EXEMPLE 7 (Prenom1 NOM2)');
  });

  it('lit dates, statut, renouvellement, oppositions et codes de Vienne', () => {
    expect(fiche).toMatchObject({
      reference: `FR${fiche.numero}`,
      statut: 'Marque enregistrée',
      type: 'Figurative',
      dateDepot: '2026-01-27',
      dateEnregistrement: '2026-05-15',
      dateExpiration: '2036-01-27',
      renouvellement: { debut: '2035-01-27', fin: '2036-07-28' },
      nombreOppositions: 0,
      classificationNice: '12',
    });
    expect(fiche.codesVienne).toEqual(['27.05.01', '29.01.08', '29.01.11']);
  });

  it('restitue le libellé intégral des produits et services', () => {
    expect(fiche.classes).toHaveLength(1);
    expect(fiche.classes[0]?.numero).toBe('43');
    expect(fiche.classes[0]?.libelle).toMatch(/^Services de restauration \(alimentation\)/);
    expect(fiche.classes[0]?.libelle.length).toBeGreaterThan(200);
  });

  it('liste les publications au BOPI', () => {
    expect(fiche.publications.map((p) => p.numero)).toEqual(['2026-08', '2026-20']);
  });
});

describe("notice de marque française avec historique d'inscriptions", () => {
  const fiche = analyserNoticeMarque(jeu('marque-fr-1.xml'));

  it('reprend toutes les inscriptions, dans l’ordre chronologique', () => {
    expect(fiche.inscriptions).toHaveLength(8);
    expect(fiche.inscriptions.map((i) => i.nature)).toContain('Transmission totale de propriété');
    const dates = fiche.inscriptions.map((i) => i.dateDepot ?? i.publications[0]?.date ?? '');
    expect([...dates].sort()).toEqual(dates);
  });

  it('lit le bénéficiaire et son SIREN pour une transmission', () => {
    const transmission = fiche.inscriptions.find((i) => i.nature === 'Transmission totale de propriété');
    expect(transmission?.beneficiaires[0]?.siren).toMatch(/^\d{9}$/);
    expect(transmission?.publications[0]).toEqual({ numero: '2021-25', date: '2021-06-25' });
  });

  it('restitue les libellés après renonciation partielle', () => {
    const renonciation = fiche.inscriptions.find((i) => i.nature === 'Renonciation partielle');
    expect(renonciation?.libellesApresLimitation[0]?.libelle).toMatch(/après le retrait ou la renonciation/);
  });

  it('signale l’absence de rubrique « titulaire actuel » en renvoyant à la dernière transmission', () => {
    expect(fiche.titulairesActuels).toHaveLength(0);
    const texte = formaterFicheMarque(fiche);
    expect(texte).toContain('ne contient pas de rubrique « titulaire actuel »');
    expect(texte).toContain('Transmission totale de propriété');
    expect(texte).toContain('### Classe 9');
  });
});

describe("notice de marque de l'Union européenne", () => {
  const fiche = analyserNoticeMarque(jeu('marque-eu-3.xml'));

  it('préfixe la référence par EU et traduit le statut', () => {
    expect(fiche.reference).toMatch(/^EU\d{9}$/);
    expect(fiche.statut).toBe('Enregistrée (Registered)');
    expect(fiche.nature).toBe('Marque individuelle');
  });

  it('retient la forme juridique précise plutôt que « Legal Entity »', () => {
    expect(fiche.deposants[0]?.formeJuridique).toBe('Société anonyme');
    expect(fiche.deposants[0]?.siren).toBeUndefined();
    expect(fiche.deposants[0]?.identifiant).toMatch(/^\d+$/);
  });

  it('liste les publications au bulletin de l’EUIPO avec leur section', () => {
    expect(fiche.publications).toEqual([
      { numero: '2024/116', date: '2024-06-20', section: 'A.1' },
      { numero: '2024/187', date: '2024-09-30', section: 'B.1' },
    ]);
  });
});

describe('notice de marque internationale', () => {
  const fiche = analyserNoticeMarque(jeu('marque-wo-4.xml'));

  it('lit les pays désignés et l’enregistrement de base', () => {
    expect(fiche.paysDesignes).toContain('EM (Protocol)');
    expect(fiche.enregistrementDeBase?.date).toBe('2010-03-08');
    expect(fiche.officeOrigine).toBe('SI');
  });

  it('choisit les libellés en français et lit les déposants en format libre', () => {
    expect(fiche.classes.map((c) => c.numero)).toEqual(['35', '37', '41', '42']);
    expect(fiche.classes[0]?.libelle).toMatch(/^Publicité/);
    expect(fiche.deposants[0]?.nom).toBe('SOCIETE EXEMPLE 10');
  });

  it('restitue en français le texte libre d’une limitation', () => {
    const libelles = fiche.inscriptions.flatMap((i) => i.libellesApresLimitation.map((l) => l.libelle));
    expect(libelles).toContain('Admis pour tous les services des classes 35 et 42.');
  });
});

describe('analyse défensive', () => {
  it('refuse un document qui n’est pas une notice', () => {
    expect(() => analyserNoticeMarque('<html></html>')).toThrow(/TradeMark absent/);
  });
});

describe('normalisation des numéros de marque', () => {
  it.each([
    ['4020655', 'FR4020655'],
    ['FR 4 020 655', 'FR4020655'],
    ['fr4020655', 'FR4020655'],
    ['EU19023157', 'EU019023157'],
    ['EM019023157', 'EU019023157'],
    ['019023157', 'EU019023157'],
    ['WO1234567', 'WO1234567'],
  ])('%s devient %s', (saisie, attendu) => {
    expect(normaliserNumeroMarque(saisie)).toBe(attendu);
  });

  it('rejette une saisie qui n’est pas un numéro', () => {
    expect(() => normaliserNumeroMarque('WORLDLINE')).toThrow(/non reconnu/);
  });
});
