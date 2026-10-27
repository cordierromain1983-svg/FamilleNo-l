# 🎁 Carnet des cadeaux

Un petit site familial pour noter les cadeaux de Noël qu'on a achetés pour les autres,
**sans jamais pouvoir voir ceux qui nous sont destinés**.

👉 **https://cordierromain1983-svg.github.io/FamilleNo-l/**

- Connexion par **identifiant + mot de passe** (pas d'adresse e-mail)
- **Ma liste d'envies** : chacun note ce qu'il aimerait recevoir. Toute la famille la voit, mais personne ne sait lesquelles de ses envies ont été achetées
- Pour chaque personne, trois rubriques : **Ses envies**, **Idées** (notées par les autres, invisibles pour elle) et **Achetés**
- Un bouton **Je l'achète** sur chaque envie ou idée ; chaque acheteur a **sa couleur**, pour voir d'un coup d'œil qui a acheté quoi
- Aucun prix ni budget : ce n'est pas le sujet
- Le secret est garanti **par le serveur** (règles Firestore) : même en fouillant le code de la page, impossible de lire sa propre liste
- Hébergement gratuit : **GitHub Pages** (le site) + **Firebase** (comptes et base de données, offre gratuite « Spark »)

---

## Démarrer

1. Ouvre le site et clique sur **« Première installation : créer le compte de l'organisateur »**.
   Ton identifiant est `romain`. Choisis ton nom affiché et ton mot de passe.
   *À faire tout de suite : tant que ce compte n'existe pas, n'importe qui pourrait le créer à ta place.*
2. Une fois connecté, va tout en bas dans **« Gérer la famille »** et ajoute chaque personne :
   nom affiché, identifiant (proposé automatiquement) et un mot de passe provisoire.
3. Transmets à chacun son identifiant et son mot de passe provisoire.
   Chacun peut ensuite le changer avec le bouton **Mot de passe**.

Tout membre de la famille peut ajouter quelqu'un. **Retirer** quelqu'un lui coupe immédiatement l'accès.

**Les enfants** : coche « Enfant » en les ajoutant. Ils apparaissent dans le carnet pour qu'on leur note
des cadeaux, mais n'ont aucun accès au site (le serveur le refuse, même si quelqu'un avait leur identifiant).
Une personne déjà ajoutée peut être passée en enfant avec le bouton **Passer en enfant**.

## Questions pratiques

**Quelqu'un a oublié son mot de passe.**
Dans la [console Firebase](https://console.firebase.google.com/project/famille-noel/authentication/users),
Authentication → Utilisateurs : supprime son compte (il apparaît comme `identifiant@example.com`, c'est le format
interne de Firebase, personne ne le voit sur le site). Puis sur le site, dans « Gérer la famille »,
recrée son accès avec le même nom, le même identifiant et un nouveau mot de passe provisoire.
Ses cadeaux ne sont pas perdus. *(Il faut d'abord le retirer de la famille s'il y figure encore.)*

**« Cet identifiant est déjà pris ».**
Un compte existe déjà avec cet identifiant (par exemple quelqu'un retiré puis rajouté).
Choisis-en un autre, ou supprime l'ancien compte dans la console Firebase comme ci-dessus.

**Les identifiants** ne contiennent que des minuscules, des chiffres et des tirets.
Ce qu'on tape est converti automatiquement : « Mamie Jeanne » devient `mamie-jeanne`.

## Comment c'est protégé

- Pour voir quoi que ce soit, il faut un compte **et** faire partie de la famille.
  Un inconnu qui se créerait un compte ne verrait rien.
- Personne ne peut lire un cadeau qui lui est destiné, ni modifier le cadeau d'un autre, ni « réorienter »
  un cadeau vers soi pour le lire. Tout est vérifié par le serveur, voir `firestore.rules`.
- La configuration Firebase visible dans `config.js` n'est pas secrète, c'est normal.

## Configuration (déjà faite)

| Élément | Valeur |
|---|---|
| Projet Firebase | `famille-noel` |
| Base Firestore | `(default)`, région `europe-west9` (Paris), mode production |
| Connexion | E-mail/Mot de passe activé (utilisé en interne avec des identifiants) |
| Domaine autorisé | `cordierromain1983-svg.github.io` |
| Organisateur | `romain` (dans `config.js` **et** `firestore.rules`) |
| Hébergement | GitHub Pages, branche `main`, dossier racine |

Si tu modifies `firestore.rules`, recopie-le dans la console Firebase :
Firestore Database → Règles → coller → **Publier**.

## Tester sur ton ordinateur (facultatif)

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Tests automatiques des règles de sécurité (nécessite Node.js 18+ et Java 11+) :

```bash
cd tests && npm install && npm test
```

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `style.css` | L'apparence (thème clair et sombre automatique) |
| `app.js` | La logique : connexion, comptes, cadeaux |
| `config.js` | La configuration du projet Firebase et l'identifiant de l'organisateur |
| `firestore.rules` | Les règles de sécurité (copie de celles publiées dans Firebase) |
| `tests/` | Tests automatiques des règles |
