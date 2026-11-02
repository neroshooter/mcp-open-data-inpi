import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ClientPI } from '../../src/api/pi.js';
import { decoderEntites, lirePageResultats } from '../../src/analyseurs/recherche.js';
import { Configuration } from '../../src/config.js';
import { AccesNonActive, IdentifiantsInvalides, IndisponibiliteINPI, QuotaDepasse } from '../../src/erreurs.js';
import { ClientHTTP } from '../../src/http/client.js';
import { masquer } from '../../src/journal.js';
import { avecPied, AVERTISSEMENT } from '../../src/presentation.js';
import { combiner, critere, critereDates, critereOu, dateCompacte } from '../../src/requetes.js';
import { VERSION } from '../../src/version.js';
import { reponseFactice } from './aides.js';

describe('requêtes au format INPI', () => {
  it('place entre guillemets une valeur de plusieurs mots', () => {
    expect(critere('Mark', 'le grill de PAUL')).toBe('[Mark="le grill de PAUL"]');
    expect(critere('Mark', 'WORLDLINE')).toBe('[Mark=WORLDLINE]');
  });

  it('neutralise les crochets et guillemets saisis par l’utilisateur', () => {
    expect(critere('Mark', 'A] OU [Mark=B')).toBe('[Mark="A OU Mark=B"]');
  });

  it('combine plusieurs classes avec OU et plusieurs critères avec ET', () => {
    expect(critereOu('ClassNumber', [9, 36])).toBe('[ClassNumber=(9 OU 36)]');
    expect(combiner(['[A=1]', undefined, '[B=2]'])).toBe('[A=1] ET [B=2]');
    expect(() => combiner([undefined])).toThrow(/au moins un critère/);
  });

  it('convertit les dates et laisse ouverte une borne absente', () => {
    expect(dateCompacte('02/11/2026')).toBe('20261102');
    expect(critereDates('ApplicationDate', '2013-01-01')).toBe('[ApplicationDate=20130101:99991231]');
    expect(critereDates('ApplicationDate')).toBeUndefined();
  });
});

describe('résultats de recherche', () => {
  it('décode les entités HTML laissées par l’INPI', () => {
    expect(decoderEntites('Marque ayant fait l&apos;objet d&apos;une renonciation')).toBe(
      "Marque ayant fait l'objet d'une renonciation",
    );
    expect(decoderEntites('&#233;t&#xE9;')).toBe('été');
  });

  it('déduit la référence préfixée depuis le lien de la notice', () => {
    const page = lirePageResultats({
      metadata: { count: 34, position: 0, size: 1 },
      results: [
        {
          documentId: '19023157',
          xml: { href: 'https://api-gateway.inpi.fr/services/apidiffusion/api/marques/notice/EU19023157' },
          fields: [
            { name: 'Mark', value: 'EXEMPLE', values: null },
            { name: 'ClassNumber', value: null, values: ['35', '36'] },
            { name: 'Mark', value: 'doublon ignoré', values: null },
          ],
        },
      ],
    });
    expect(page.total).toBe(34);
    expect(page.resultats[0]).toEqual({ reference: 'EU19023157', champs: { Mark: 'EXEMPLE', ClassNumber: ['35', '36'] } });
  });
});

describe('client HTTP', () => {
  const service = { nom: 'Service test', intervalleMs: 0, delaiBaseMs: 1 };

  it('réessaie après une erreur passagère (405, 500) puis renvoie la réponse', async () => {
    const fetchFactice = vi
      .fn()
      .mockResolvedValueOnce(reponseFactice(405))
      .mockResolvedValueOnce(reponseFactice(500))
      .mockResolvedValueOnce(reponseFactice(200, 'ok'));
    const r = await new ClientHTTP(service, fetchFactice).requete('https://exemple.invalid/a');
    expect(r.texte()).toBe('ok');
    expect(fetchFactice).toHaveBeenCalledTimes(3);
  });

  it('signale une indisponibilité, et jamais un résultat vide, après épuisement des essais', async () => {
    const fetchFactice = vi.fn().mockImplementation(async () => reponseFactice(500));
    await expect(new ClientHTTP(service, fetchFactice).requete('https://exemple.invalid/a', { essais: 3 })).rejects.toBeInstanceOf(
      IndisponibiliteINPI,
    );
    expect(fetchFactice).toHaveBeenCalledTimes(3);
  });

  it('traite une coupure réseau comme une panne passagère', async () => {
    const fetchFactice = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(reponseFactice(200, 'ok'));
    const r = await new ClientHTTP(service, fetchFactice).requete('https://exemple.invalid/a');
    expect(r.statut).toBe(200);
  });

  it('ne réessaie pas un 429 et le signale comme une limite de l’INPI', async () => {
    const fetchFactice = vi.fn().mockResolvedValue(reponseFactice(429));
    await expect(new ClientHTTP(service, fetchFactice).requete('https://exemple.invalid/a')).rejects.toBeInstanceOf(QuotaDepasse);
    expect(fetchFactice).toHaveBeenCalledTimes(1);
  });
});

describe('API Propriété industrielle (simulée)', () => {
  const config = new Configuration({ INPI_EMAIL: 'test@exemple.invalid', INPI_MOT_DE_PASSE: 'motdepasse-test' });

  function simulateur(reponseRecherche: () => Response) {
    const appels: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFactice = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      appels.push({ url: u, init });
      if (u.endsWith('/services/uaa/api/authenticate')) {
        return reponseFactice(401, '', { 'set-cookie': 'XSRF-TOKEN=jeton-xsrf; Path=/' });
      }
      if (u.endsWith('/auth/login')) {
        return reponseFactice(
          200,
          { access_token: 'jeton-acces', expires_in: 300 },
          { 'set-cookie': ['access_token=jeton-acces; Path=/', 'refresh_token=jeton-rafraichissement; Path=/'] },
        );
      }
      return reponseRecherche();
    });
    return { appels, fetchFactice };
  }

  it('s’authentifie en deux temps puis transmet Bearer, X-XSRF-TOKEN et cookies', async () => {
    const { appels, fetchFactice } = simulateur(() => reponseFactice(200, { metadata: { count: 0, position: 0, size: 1 }, results: [] }));
    const client = new ClientPI(config, fetchFactice);
    const r = await client.rechercher('marques', { collections: ['FR'], query: '[Mark=X]' });
    expect(r.metadata.count).toBe(0);
    const connexion = appels.find((a) => a.url.endsWith('/auth/login'));
    expect((connexion?.init?.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('jeton-xsrf');
    expect(JSON.parse(String(connexion?.init?.body))).toMatchObject({ username: 'test@exemple.invalid', password: 'motdepasse-test' });
    const recherche = appels.find((a) => a.url.endsWith('/marques/search'));
    const entetes = recherche?.init?.headers as Record<string, string>;
    expect(entetes.Authorization).toBe('Bearer jeton-acces');
    expect(entetes['X-XSRF-TOKEN']).toBe('jeton-xsrf');
    expect(entetes.Cookie).toContain('refresh_token=jeton-rafraichissement');
  });

  it('traduit un 403 en accès non activé pour la famille concernée', async () => {
    const { fetchFactice } = simulateur(() => reponseFactice(403, { detail: 'Access is denied' }));
    const erreur = await new ClientPI(config, fetchFactice)
      .rechercher('brevets', { collections: ['FR'], query: '[TIT=X]' })
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(AccesNonActive);
    expect((erreur as Error).message).toContain('Brevets');
  });

  it('signale des identifiants refusés', async () => {
    const fetchFactice = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/authenticate')
        ? reponseFactice(401, '', { 'set-cookie': 'XSRF-TOKEN=x; Path=/' })
        : reponseFactice(401),
    );
    await expect(
      new ClientPI(config, fetchFactice).rechercher('marques', { collections: ['FR'], query: '[Mark=X]' }),
    ).rejects.toBeInstanceOf(IdentifiantsInvalides);
  });
});

describe('protection des identifiants', () => {
  it('n’expose jamais les identifiants lors d’une sérialisation', () => {
    const config = new Configuration({ INPI_EMAIL: 'secret@exemple.invalid', INPI_MOT_DE_PASSE: 'MotDePasseSecret' });
    const texte = JSON.stringify(config) + String(config);
    expect(texte).not.toContain('MotDePasseSecret');
    expect(texte).not.toContain('secret@exemple.invalid');
  });

  it('masque les secrets enregistrés, les jetons et les cookies dans le journal', () => {
    new Configuration({ INPI_EMAIL: 'secret2@exemple.invalid', INPI_MOT_DE_PASSE: 'AutreSecret123' });
    const message = masquer(
      'login secret2@exemple.invalid / AutreSecret123 Bearer abc.def.ghi Cookie: access_token=xyz; XSRF-TOKEN=abc {"password":"p"}',
    );
    expect(message).not.toMatch(/secret2@|AutreSecret123|abc\.def\.ghi|xyz|"p"/);
  });

  it('utilise le mot de passe propre à l’API PI s’il est fourni', () => {
    const config = new Configuration({ INPI_EMAIL: 'a@b.invalid', INPI_MOT_DE_PASSE: 'commun', INPI_PI_MOT_DE_PASSE: 'propre' });
    expect(config.identifiantsPI().motDePasse).toBe('propre');
    expect(config.identifiantsRNE().motDePasse).toBe('commun');
  });
});

describe('présentation', () => {
  it('ajoute la source, le lien et l’avertissement à chaque réponse', () => {
    const texte = avecPied('Corps', { nom: 'Source test', lien: 'https://data.inpi.fr/x' }, new Date('2026-11-02T12:00:00Z'));
    expect(texte).toContain('Source : Source test — https://data.inpi.fr/x');
    expect(texte).toContain('2 novembre 2026');
    expect(texte).toContain(AVERTISSEMENT);
  });
});

describe('version', () => {
  it('est identique dans package.json et dans le code', () => {
    const paquet = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(VERSION).toBe(paquet.version);
  });
});
