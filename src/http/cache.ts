// Cache en mémoire de courte durée.
//
// Il évite de solliciter l'INPI deux fois de suite pour la même question.
// Rien n'est écrit sur le disque : le cache disparaît à l'arrêt du serveur.

interface Entree<T> {
  valeur: T;
  expireA: number;
}

export class CacheMemoire<T> {
  readonly #entrees = new Map<string, Entree<T>>();

  constructor(
    private readonly dureeMs: number,
    private readonly tailleMax = 200,
  ) {}

  lire(cle: string): T | undefined {
    const entree = this.#entrees.get(cle);
    if (!entree) return undefined;
    if (entree.expireA <= Date.now()) {
      this.#entrees.delete(cle);
      return undefined;
    }
    return entree.valeur;
  }

  ecrire(cle: string, valeur: T): void {
    if (this.#entrees.size >= this.tailleMax) {
      // Éviction de l'entrée la plus ancienne (ordre d'insertion de la Map).
      const plusAncienne = this.#entrees.keys().next().value;
      if (plusAncienne !== undefined) this.#entrees.delete(plusAncienne);
    }
    this.#entrees.set(cle, { valeur, expireA: Date.now() + this.dureeMs });
  }

  /** Renvoie la valeur en cache ou la calcule puis la mémorise. */
  async obtenir(cle: string, calcul: () => Promise<T>): Promise<T> {
    const enCache = this.lire(cle);
    if (enCache !== undefined) return enCache;
    const valeur = await calcul();
    this.ecrire(cle, valeur);
    return valeur;
  }

  vider(): void {
    this.#entrees.clear();
  }
}
