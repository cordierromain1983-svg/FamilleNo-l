# 🎁 Carnet des cadeaux

Un petit site familial pour noter les cadeaux de Noël qu'on a achetés pour les autres,
**sans jamais pouvoir voir ceux qui nous sont destinés**.

- Connexion par **prénom + mot de passe**
- Une étiquette par membre de la famille avec ses cadeaux, qui les a achetés, le prix, un lien, le statut (idée / acheté / emballé)
- Seul l'acheteur peut modifier ou supprimer son cadeau
- Le masquage est garanti **par le serveur** (règles Firestore) : même en fouillant le code de la page, impossible de lire sa propre liste
- Hébergement gratuit : **GitHub Pages** (le site) + **Firebase** (connexion et base de données, offre gratuite « Spark »)

Compte environ 20 minutes pour tout mettre en place, une seule fois.

---

## 1. Créer le projet Firebase

1. Va sur <https://console.firebase.google.com> et connecte-toi avec un compte Google.
2. **Créer un projet** → nom au choix (ex. `cadeaux-famille`). Tu peux désactiver Google Analytics.
3. Sur la page d'accueil du projet, clique sur l'icône **Web `</>`** pour ajouter une application Web.
   Donne-lui un nom, ne coche pas « Hosting », valide.
4. Firebase t'affiche un bloc `const firebaseConfig = { ... }`.
   Copie ces valeurs dans le fichier **`config.js`** de ce dépôt, à la place des `A_REMPLACER`.

> Ces valeurs ne sont pas secrètes, c'est normal qu'elles soient publiques sur GitHub.
> La protection repose sur les règles de l'étape 3.

## 2. Activer la connexion par mot de passe

1. Menu **Build → Authentication → Commencer**.
2. Onglet **Mode de connexion** → **E-mail/Mot de passe** → Activer → Enregistrer.
3. *(Recommandé, si l'option apparaît)* Onglet **Paramètres → Actions de l'utilisateur** →
   décoche **« Activer la création (inscription) »** → Enregistrer.
   C'est un verrou en plus : de toute façon, un inconnu qui réussirait à se créer un compte
   ne verrait rien tant qu'un membre ne l'a pas ajouté à la famille (voir étape 3).

### Créer les comptes de la famille

Onglet **Utilisateurs → Ajouter un utilisateur**, une fois par personne :

| Prénom tapé sur le site | Identifiant à saisir dans Firebase |
|---|---|
| Élodie | `elodie@example.com` |
| Mamie Jeanne | `mamie-jeanne@example.com` |
| Jean-Luc | `jean-luc@example.com` |

Règle : en minuscules, sans accents, espaces et apostrophes remplacés par des tirets, suivi de `@example.com`.
(Le site affiche aussi l'identifiant exact de chacun dans « Gérer la famille ».)

Choisis un mot de passe provisoire (6 caractères minimum) et transmets-le à la personne.
Chacun peut ensuite le changer depuis le bouton **Mot de passe** du site.

> Aucun e-mail n'est jamais envoyé : `example.com` est un domaine réservé, il sert juste de format.
> Conséquence : pas de « mot de passe oublié » automatique. Si quelqu'un oublie le sien,
> supprime son compte dans Firebase et recrée-le avec le même identifiant (ses cadeaux ne sont pas perdus).

## 3. Créer la base de données et ses règles de sécurité

1. Menu **Build → Firestore Database → Créer une base de données**.
2. Emplacement : `europe-west1` (Belgique) ou `europe-west9` (Paris). Mode : **production**.
3. Ouvre le fichier **`firestore.rules`** et remplace `'ton-prenom'` par **ton** identifiant
   (ex. `'romain'` si ton compte est `romain@example.com`). Tu es l'organisateur :
   le seul qui entre dans la famille tout seul, à sa première connexion.
4. Onglet **Règles** : efface tout, colle le contenu de `firestore.rules`, clique sur **Publier**.

### Qui a accès à quoi

- Pour voir quoi que ce soit, il faut **un compte** (étape 2) **et** être **dans la famille**.
- Tu entres dans la famille en te connectant la première fois. Ensuite, ajoute chacun dans
  **« Gérer la famille »** sur le site, en tapant le prénom exactement comme son identifiant
  (« Mamie Jeanne » → `mamie-jeanne`). Tout membre peut ensuite en ajouter d'autres.
- **Retirer** quelqu'un de la famille lui coupe immédiatement l'accès.
- Personne ne peut lire un cadeau qui lui est destiné, ni modifier le cadeau d'un autre.

## 4. Mettre le site en ligne avec GitHub Pages

1. Crée un dépôt sur <https://github.com/new> (ex. `cadeaux-famille`).
   Il peut être **public** : rien de privé n'est stocké dans le code.
2. Envoie-y tous les fichiers de ce dossier (bouton **Add file → Upload files**, ou `git push`).
3. Dans le dépôt : **Settings → Pages** → Source : **Deploy from a branch** → branche `main`, dossier `/ (root)` → Save.
4. Après une minute, ton site est à l'adresse `https://TON-PSEUDO.github.io/cadeaux-famille/`.

## 5. Autoriser l'adresse du site dans Firebase

**Authentication → Paramètres → Domaines autorisés → Ajouter un domaine** : `TON-PSEUDO.github.io`

C'est fini ! Envoie l'adresse du site à la famille avec les prénoms et mots de passe provisoires.

---

## Utilisation

- **Noter un cadeau** : choisis pour qui, le nom du cadeau, le prix, éventuellement un lien et une note (« caché dans le garage »).
- **Statuts** : *Idée* (pas encore acheté, ça évite que deux personnes aient la même idée), *Acheté*, *Emballé*.
- **Gérer la famille** : ajouter quelqu'un qui ne s'est pas encore connecté pour pouvoir déjà lui noter des cadeaux.
  Pense à lui créer aussi son compte dans Firebase (étape 2).

## Tester sur ton ordinateur (facultatif)

Le site utilise des modules JavaScript, il faut donc un petit serveur local (ouvrir `index.html` directement ne marche pas) :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

`localhost` est autorisé par défaut dans Firebase.

## Dépannage

| Message | Cause probable |
|---|---|
| « Le site n'est pas encore configuré » | `config.js` contient encore `A_REMPLACER` |
| « Prénom ou mot de passe incorrect » | Compte pas créé, ou identifiant Firebase mal orthographié (voir le tableau de l'étape 2) |
| Erreur `auth/unauthorized-domain` dans la console | Étape 5 oubliée |
| « Accès refusé par le serveur » | Règles de l'étape 3 pas publiées |

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `style.css` | L'apparence (thème clair et sombre automatique) |
| `app.js` | La logique : connexion, lecture et écriture des cadeaux |
| `config.js` | La configuration de ton projet Firebase |
| `firestore.rules` | Les règles de sécurité à coller dans Firebase |
| `tests/` | Tests automatiques des règles (facultatif, pour les curieux) |
