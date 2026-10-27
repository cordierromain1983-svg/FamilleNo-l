import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, DOMAINE_LOGIN, ORGANISATEUR } from "./config.js";

/* ---------- Outils ---------- */
const $ = id => document.getElementById(id);
const STATUTS = { idee: "Idée", achete: "Acheté", emballe: "Emballé" };

// "Mamie Jeanne" -> "mamie-jeanne" (lettres, chiffres et tirets seulement)
export function slug(prenom) {
  return prenom.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const joli = s => s.trim().replace(/\s+/g, " ").replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
function safeUrl(u) {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; }
}
function notice(msg, ok = false) {
  const n = $("notice"); n.textContent = msg || ""; n.hidden = !msg; n.classList.toggle("ok", ok);
}
// Bouton à double clic pour confirmer une suppression
function confirmBtn(label, onConfirm) {
  const b = el("button", { class: "ghost", type: "button" }, label);
  let armed = false, t;
  b.addEventListener("click", () => {
    if (!armed) {
      armed = true; b.textContent = "Confirmer ?"; b.style.color = "var(--berry)";
      t = setTimeout(() => { armed = false; b.textContent = label; b.style.color = ""; }, 3000);
      return;
    }
    clearTimeout(t); onConfirm();
  });
  return b;
}
function show(view) {
  for (const v of ["loading", "login", "setup", "main"]) $(v).hidden = view !== v;
}
// L'identifiant est transformé en "adresse" technique, invisible pour l'utilisateur.
const versEmail = id => `${id}@${DOMAINE_LOGIN}`;
function messageAuth(e, defaut) {
  const c = e?.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found") || c.includes("invalid-email"))
    return "Identifiant ou mot de passe incorrect.";
  if (c.includes("email-already-in-use")) return "Cet identifiant est déjà pris.";
  if (c.includes("weak-password")) return "Mot de passe trop court (6 caractères minimum).";
  if (c.includes("too-many-requests")) return "Trop d'essais. Attends quelques minutes avant de réessayer.";
  if (c.includes("operation-not-allowed") || c.includes("admin-restricted")) return "La création de comptes est désactivée dans Firebase (Authentication → Paramètres → Actions des utilisateurs).";
  if (c.includes("network")) return "Pas de connexion internet.";
  return defaut;
}

/* ---------- Compte à rebours ---------- */
(() => {
  const now = new Date(), y = now.getFullYear();
  const today = new Date(y, now.getMonth(), now.getDate());
  let xmas = new Date(y, 11, 25);
  if (today > xmas) xmas = new Date(y + 1, 11, 25);
  const d = Math.round((xmas - today) / 864e5);
  $("countdown").innerHTML = d > 0 ? `<b>J-${d}</b>avant Noël` : `<b>Joyeux Noël</b>`;
})();

/* ---------- Firebase ---------- */
if (firebaseConfig.apiKey === "A_REMPLACER") {
  show("none");
  notice("Le site n'est pas encore configuré : remplis le fichier config.js avec les informations de ton projet Firebase (voir README).");
  throw new Error("config.js non rempli");
}
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

let moi = null;          // identifiant (slug) de la personne connectée
let members = [];        // [{id, nom}]
let gifts = [];          // idées et achats visibles (jamais ceux pour moi)
let wishes = [];         // les envies de toute la famille
let editing = null;      // idée/cadeau en cours de modification
let editingWish = null;  // envie en cours de modification
let unsubs = [];

/* ---------- Connexion ---------- */
let nomOrganisateur = "";   // nom saisi à la création du compte organisateur
$("login-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const id = slug($("l-id").value), mdp = $("l-mdp").value;
  if (!id) { notice("Identifiant ou mot de passe incorrect."); return; }
  $("l-submit").disabled = true;
  try { await signInWithEmailAndPassword(auth, versEmail(id), mdp); notice(""); }
  catch (e) { notice(messageAuth(e, "Connexion impossible pour le moment. Réessaie.")); }
  finally { $("l-submit").disabled = false; $("l-mdp").value = ""; }
});

/* ---------- Première installation : compte de l'organisateur ---------- */
$("s-id").textContent = ORGANISATEUR;
$("open-setup").addEventListener("click", () => { notice(""); show("setup"); $("s-nom").focus(); });
$("s-cancel").addEventListener("click", () => { $("setup-form").reset(); show("login"); });
$("setup-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  if ($("s-mdp").value !== $("s-mdp2").value) { notice("Les deux mots de passe ne sont pas identiques."); return; }
  nomOrganisateur = joli($("s-nom").value);
  $("s-submit").disabled = true;
  try {
    await createUserWithEmailAndPassword(auth, versEmail(ORGANISATEUR), $("s-mdp").value);
    $("setup-form").reset(); notice("");
  } catch (e) {
    notice(e.code?.includes("email-already-in-use")
      ? "Le compte de l'organisateur existe déjà : connecte-toi avec l'identifiant « " + ORGANISATEUR + " »."
      : messageAuth(e, "La création du compte n'a pas fonctionné. Réessaie."));
  } finally { $("s-submit").disabled = false; }
});

$("logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async user => {
  unsubs.forEach(u => u()); unsubs = []; members = []; gifts = []; wishes = []; cancelEdit(); cancelWish();
  if (!user) { moi = null; show("login"); return; }
  moi = (user.email || "").split("@")[0];
  show("loading");
  // Suis-je dans la famille ? Seul l'organisateur peut s'y inscrire seul (voir firestore.rules).
  const ref = doc(db, "membres", moi);
  let membre = false;
  try { membre = (await getDoc(ref)).exists(); } catch { /* refusé : pas encore membre */ }
  if (!membre) {
    try { await setDoc(ref, { nom: nomOrganisateur || joli(moi.replace(/-/g, " ")) }); membre = true; }
    catch { /* pas l'organisateur */ }
  }
  if (!membre) {
    notice(`Ton compte (« ${moi} ») n'a pas accès au carnet. Demande à l'organisateur de la famille.`);
    await signOut(auth);
    return;
  }

  unsubs.push(onSnapshot(collection(db, "membres"), s => {
    members = s.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr"));
    render();
  }, err));
  // Le serveur refuse de toute façon de renvoyer les cadeaux "pour moi" :
  // la requête doit donc les exclure explicitement.
  unsubs.push(onSnapshot(query(collection(db, "cadeaux"), where("pour", "!=", moi)), s => {
    gifts = s.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, err));
  unsubs.push(onSnapshot(collection(db, "envies"), s => {
    wishes = s.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, err));
  show("main");
  render();
});

function err(e) {
  console.error(e);
  if (e.code === "permission-denied") notice("Accès refusé par le serveur. Vérifie que les règles Firestore du README sont bien publiées.");
  else notice("Problème de connexion à la base. Recharge la page.");
}

/* ---------- Affichage ---------- */
const nameOf = id => members.find(m => m.id === id)?.nom || "Quelqu'un";
const parDate = (a, b) => (a.cree?.seconds || 0) - (b.cree?.seconds || 0);
const pl = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

// Qui a acheté ? (les anciennes fiches "acheté/emballé" sans acheteur comptent pour leur auteur)
const acheteurDe = g => g.achetePar || (g.statut === "achete" || g.statut === "emballe" ? g.par : null);

// Une teinte par personne, stable, bien espacée sur la roue des couleurs.
const TEINTES = [212, 345, 145, 32, 275, 185, 55, 320, 100, 250, 10, 165];
function teinte(id) {
  const adultes = members.filter(m => !m.enfant).map(m => m.id);
  const i = adultes.indexOf(id);
  return TEINTES[(i < 0 ? adultes.length : i) % TEINTES.length];
}
function puce(id) {
  const c = el("span", { class: "chip" }, id === moi ? "toi" : nameOf(id));
  c.style.setProperty("--h", teinte(id));
  return c;
}
function lienOuTexte(titre, lien) {
  const u = lien && safeUrl(lien);
  return u ? el("a", { href: u, target: "_blank", rel: "noopener noreferrer" }, titre) : titre;
}
function ligne({ titre, lien, meta = [], actions = [], acheteur = null }) {
  const li = el("li", { class: "gift" + (acheteur ? " bought" : "") },
    el("div", { class: "g-title" }, lienOuTexte(titre, lien)),
    el("div", { class: "g-act" }, ...actions),
    meta.length ? el("div", { class: "g-meta" }, ...meta) : null);
  if (acheteur) li.style.setProperty("--h", teinte(acheteur));
  return li;
}
function rubrique(titre, items, vide) {
  if (!items.length && !vide) return null;
  return el("div", { class: "section" },
    el("h4", {}, titre, items.length ? el("span", { class: "n" }, "· " + items.length) : null),
    items.length ? el("ul", { class: "gifts" }, ...items) : el("p", { class: "empty-tag" }, vide));
}
const bouton = (txt, onclick, cls = "ghost") => el("button", { class: cls, type: "button", onclick }, txt);

/* Actions d'achat */
async function acheterEnvie(w) {
  try {
    await addDoc(collection(db, "cadeaux"), {
      pour: w.pour, par: moi, achetePar: moi, envie: w.id,
      titre: w.titre, lien: w.lien || "", note: w.note || "", cree: serverTimestamp()
    });
  } catch (e) { writeErr(e); }
}
const acheterIdee = g => updateDoc(doc(db, "cadeaux", g.id), { achetePar: moi }).catch(writeErr);
function annulerAchat(g) {
  // Un achat fait depuis une liste d'envies disparaît ; une idée redevient une idée.
  const p = g.envie && g.par === moi ? deleteDoc(doc(db, "cadeaux", g.id))
    : updateDoc(doc(db, "cadeaux", g.id), g.statut ? { achetePar: null, statut: "idee" } : { achetePar: null });
  p.catch(writeErr);
}

function render() {
  if (!moi) return;
  $("me-name").textContent = nameOf(moi);

  const mesEnvies = wishes.filter(w => w.pour === moi).sort(parDate);
  const mesAchats = gifts.filter(g => acheteurDe(g) === moi);
  const mesIdees = gifts.filter(g => g.par === moi && !acheteurDe(g));
  const st = $("stats"); st.replaceChildren(
    el("span", {}, el("b", {}, String(mesEnvies.length)), mesEnvies.length > 1 ? " envies sur ta liste" : " envie sur ta liste"),
    el("span", {}, el("b", {}, String(mesIdees.length)), mesIdees.length > 1 ? " idées notées" : " idée notée"),
    el("span", {}, el("b", {}, String(mesAchats.length)), mesAchats.length > 1 ? " cadeaux achetés" : " cadeau acheté"));

  // --- Ma liste d'envies (sans jamais montrer ce qui est acheté) ---
  const mw = $("my-wishes"); mw.replaceChildren();
  if (!mesEnvies.length) mw.append(el("p", { class: "empty-tag" }, "Ta liste est vide. Ajoute ce qui te ferait plaisir."));
  for (const w of mesEnvies) mw.append(ligne({
    titre: w.titre, lien: w.lien, meta: w.note ? [el("span", {}, w.note)] : [],
    actions: [bouton("Modifier", () => startWish(w)),
              confirmBtn("Retirer", () => deleteDoc(doc(db, "envies", w.id)).catch(writeErr))]
  }));

  // --- Sélecteur "pour qui" ---
  const sel = $("f-pour"), keep = sel.value;
  sel.replaceChildren(el("option", { value: "" }, "Choisir…"));
  for (const m of members) if (m.id !== moi) sel.append(el("option", { value: m.id }, m.nom + (m.enfant ? " (enfant)" : "")));
  if (keep) sel.value = keep;

  // --- Légende des couleurs : les personnes qui ont acheté quelque chose ---
  const acheteurs = [...new Set(gifts.map(acheteurDe).filter(Boolean))]
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b), "fr"));
  const lg = $("legend"); lg.hidden = !acheteurs.length;
  lg.replaceChildren(el("span", {}, "Acheté par :"), ...acheteurs.map(puce));

  // --- Une étiquette par personne (sauf moi) ---
  const list = $("list"); list.replaceChildren();
  const others = members.filter(m => m.id !== moi);
  if (!others.length) list.append(el("p", { class: "note" }, "Ajoute les membres de la famille dans « Gérer la famille », tout en bas."));
  for (const m of others) {
    const sesCadeaux = gifts.filter(g => g.pour === m.id);
    const couvertes = new Map(sesCadeaux.filter(g => g.envie && acheteurDe(g)).map(g => [g.envie, g]));

    // Envies pas encore achetées
    const envies = wishes.filter(w => w.pour === m.id && !couvertes.has(w.id)).sort(parDate).map(w => ligne({
      titre: w.titre, lien: w.lien, meta: w.note ? [el("span", {}, w.note)] : [],
      actions: [bouton("Je l'achète", () => acheterEnvie(w), "buy")]
    }));
    // Idées pas encore achetées
    const idees = sesCadeaux.filter(g => !acheteurDe(g)).sort(parDate).map(g => ligne({
      titre: g.titre, lien: g.lien,
      meta: [el("span", {}, "idée de " + (g.par === moi ? "toi" : nameOf(g.par))), g.note ? el("span", {}, "· " + g.note) : null],
      actions: [bouton("Je l'achète", () => acheterIdee(g), "buy"),
                ...(g.par === moi ? [bouton("Modifier", () => startEdit(g)),
                                     confirmBtn("Supprimer", () => deleteDoc(doc(db, "cadeaux", g.id)).catch(writeErr))] : [])]
    }));
    // Achetés, avec la couleur de l'acheteur
    const achetes = sesCadeaux.filter(g => acheteurDe(g)).sort(parDate).map(g => {
      const qui = acheteurDe(g);
      const origine = g.envie ? "de sa liste" : g.par !== qui ? "idée de " + (g.par === moi ? "toi" : nameOf(g.par)) : null;
      const actions = [];
      if (qui === moi) {
        if (g.par === moi && !g.envie) actions.push(bouton("Modifier", () => startEdit(g)));
        actions.push(confirmBtn("Annuler l'achat", () => annulerAchat(g)));
      }
      return ligne({ titre: g.titre, lien: g.lien, acheteur: qui, actions,
        meta: [puce(qui), origine ? el("span", {}, origine) : null, g.note ? el("span", {}, "· " + g.note) : null] });
    });

    list.append(el("article", { class: "tag" },
      el("div", { class: "tag-head" },
        el("h3", {}, m.nom, m.enfant ? el("span", { class: "badge" }, "enfant") : null),
        el("span", { class: "sum" }, achetes.length ? pl(achetes.length, "cadeau acheté", "cadeaux achetés") : "")),
      m.enfant ? null : rubrique("Ses envies", envies, "Pas d'envie notée pour l'instant."),
      rubrique("Idées", idees, m.enfant ? "Pas encore d'idée. Note la première !" : null),
      rubrique("Achetés", achetes, null)));
  }

  // --- Gestion de la famille ---
  const ul = $("manage-list"); ul.replaceChildren();
  for (const m of members) {
    const li = el("li", { class: "me", style: "padding:8px 12px" },
      el("div", {},
        el("div", {}, m.nom + (m.id === moi ? " (toi)" : ""), m.enfant ? el("span", { class: "badge" }, "enfant") : null),
        el("div", { class: "sub small" }, m.enfant ? "sans accès au site" : "identifiant : " + m.id)));
    const act = el("div", { class: "row" });
    if (m.id !== moi && !m.enfant && m.id !== ORGANISATEUR)
      act.append(confirmBtn("Passer en enfant", () =>
        updateDoc(doc(db, "membres", m.id), { enfant: true }).catch(writeErr)));
    const utilise = gifts.some(g => g.pour === m.id || g.par === m.id || g.achetePar === m.id)
      || wishes.some(w => w.pour === m.id);
    if (m.id !== moi && !utilise)
      act.append(confirmBtn("Retirer", () => deleteDoc(doc(db, "membres", m.id)).catch(writeErr)));
    li.append(act);
    ul.append(li);
  }
}

/* ---------- Ajouter un membre (crée son accès) ---------- */
// Une 2e instance Firebase, en mémoire, crée le compte sans déconnecter la personne actuelle.
let authCreation = null;
function getAuthCreation() {
  if (!authCreation) authCreation = initializeAuth(initializeApp(firebaseConfig, "creation"), { persistence: inMemoryPersistence });
  return authCreation;
}
let idModifie = false;
function majFormMembre() {
  const enfant = $("m-enfant").checked;
  for (const e of document.querySelectorAll("#member-form .acces")) e.hidden = enfant;
  $("m-id").required = !enfant; $("m-mdp").required = !enfant;
  $("m-submit").textContent = enfant ? "Ajouter l'enfant" : "Créer son accès";
}
$("m-enfant").addEventListener("change", majFormMembre);
$("m-nom").addEventListener("input", () => { if (!idModifie) $("m-id").value = slug($("m-nom").value); });
$("m-id").addEventListener("input", () => { idModifie = $("m-id").value !== ""; });
$("m-id").addEventListener("blur", () => { $("m-id").value = slug($("m-id").value); });

$("member-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const nom = joli($("m-nom").value), enfant = $("m-enfant").checked;
  if (enfant) {
    // Pas de compte : juste une fiche, avec un identifiant interne unique.
    let id = slug(nom) || "enfant", n = 2;
    while (members.some(m => m.id === id)) id = slug(nom) + "-" + n++;
    $("m-submit").disabled = true;
    try {
      await setDoc(doc(db, "membres", id), { nom, enfant: true });
      $("member-form").reset(); idModifie = false; majFormMembre();
      notice(`${nom} a été ajouté(e). On peut lui noter des cadeaux.`, true);
    } catch (e) { writeErr(e); }
    finally { $("m-submit").disabled = false; }
    return;
  }
  const id = slug($("m-id").value), mdp = $("m-mdp").value;
  $("m-id").value = id;
  if (!nom || !id) return;
  if (members.some(m => m.id === id)) { notice(`L'identifiant « ${id} » est déjà utilisé dans la famille.`); return; }
  $("m-submit").disabled = true;
  try {
    const a = getAuthCreation();
    await createUserWithEmailAndPassword(a, versEmail(id), mdp);
    await signOut(a);
  } catch (e) {
    notice(e.code?.includes("email-already-in-use")
      ? `L'identifiant « ${id} » est déjà pris. Choisis-en un autre (ex. ${id}2).`
      : messageAuth(e, "La création de l'accès n'a pas fonctionné. Réessaie."));
    $("m-submit").disabled = false;
    return;
  }
  try {
    await setDoc(doc(db, "membres", id), { nom });
    $("member-form").reset(); idModifie = false; majFormMembre();
    notice(`Accès créé pour ${nom} : identifiant « ${id} ». Transmets-lui son mot de passe provisoire.`, true);
  } catch (e) { writeErr(e); }
  finally { $("m-submit").disabled = false; }
});

function writeErr(e) {
  console.error(e);
  notice(e.code === "permission-denied"
    ? "Le serveur a refusé cette modification."
    : "L'enregistrement n'a pas fonctionné. Réessaie dans un instant.");
}

/* ---------- Formulaire : idée ou cadeau pour quelqu'un ---------- */
function startEdit(g) {
  editing = g;
  $("f-pour").value = g.pour; $("f-pour").disabled = true;
  $("f-type").value = acheteurDe(g) ? "achete" : "idee";
  $("f-type").disabled = !!(acheteurDe(g) && acheteurDe(g) !== moi) || (g.par !== moi);
  $("f-titre").value = g.titre || ""; $("f-lien").value = g.lien || ""; $("f-note").value = g.note || "";
  $("add-summary").textContent = "Modifier"; $("f-submit").textContent = "Mettre à jour";
  $("f-cancel").hidden = false; $("add-box").open = true;
  $("add-box").scrollIntoView({ behavior: "smooth", block: "start" });
}
function cancelEdit() {
  editing = null; $("gift-form").reset(); $("f-pour").disabled = false; $("f-type").disabled = false;
  $("add-summary").textContent = "Noter une idée ou un cadeau pour quelqu'un"; $("f-submit").textContent = "Enregistrer";
  $("f-cancel").hidden = true;
}
$("f-cancel").addEventListener("click", cancelEdit);

$("gift-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const pour = editing ? editing.pour : $("f-pour").value, titre = $("f-titre").value.trim();
  if (!moi || !pour || !titre || pour === moi) return;
  const texte = { titre, lien: $("f-lien").value.trim(), note: $("f-note").value.trim() };
  const achete = $("f-type").value === "achete";
  $("f-submit").disabled = true;
  try {
    if (editing && editing.par === moi) {
      // L'auteur réécrit sa fiche (en retirant les anciens champs prix/statut).
      const g = editing;
      await setDoc(doc(db, "cadeaux", g.id), {
        pour: g.pour, par: g.par, cree: g.cree, envie: g.envie || null, ...texte,
        achetePar: $("f-type").disabled ? (acheteurDe(g) || null) : (achete ? moi : null)
      });
    } else if (editing) {
      // Acheteur d'une idée d'un autre : il ne peut changer que l'achat, pas le texte.
      notice("Seule la personne qui a noté cette idée peut modifier son texte.");
    } else {
      await addDoc(collection(db, "cadeaux"), {
        pour, par: moi, achetePar: achete ? moi : null, envie: null, ...texte, cree: serverTimestamp()
      });
    }
    cancelEdit(); $("add-box").open = false;
  } catch (e) { writeErr(e); }
  finally { $("f-submit").disabled = false; }
});

/* ---------- Ma liste d'envies ---------- */
function startWish(w) {
  editingWish = w;
  $("w-titre").value = w.titre || ""; $("w-lien").value = w.lien || ""; $("w-note").value = w.note || "";
  $("wish-summary").textContent = "Modifier l'envie"; $("w-submit").textContent = "Mettre à jour";
  $("w-cancel").hidden = false; $("wish-box").open = true; $("w-titre").focus();
}
function cancelWish() {
  editingWish = null; $("wish-form").reset();
  $("wish-summary").textContent = "Ajouter une envie"; $("w-submit").textContent = "Ajouter à ma liste";
  $("w-cancel").hidden = true;
}
$("w-cancel").addEventListener("click", () => { cancelWish(); $("wish-box").open = false; });
$("wish-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const titre = $("w-titre").value.trim(); if (!moi || !titre) return;
  const texte = { titre, lien: $("w-lien").value.trim(), note: $("w-note").value.trim() };
  $("w-submit").disabled = true;
  try {
    if (editingWish) await updateDoc(doc(db, "envies", editingWish.id), texte);
    else await addDoc(collection(db, "envies"), { pour: moi, par: moi, ...texte, cree: serverTimestamp() });
    const continuer = !editingWish;
    cancelWish(); $("wish-box").open = continuer; if (continuer) $("w-titre").focus();
  } catch (e) { writeErr(e); }
  finally { $("w-submit").disabled = false; }
});

/* ---------- Mot de passe ---------- */
$("open-pwd").addEventListener("click", () => { $("pwd-form").hidden = false; $("p-old").focus(); });
$("p-cancel").addEventListener("click", () => { $("pwd-form").reset(); $("pwd-form").hidden = true; });
$("pwd-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const user = auth.currentUser; if (!user) return;
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, $("p-old").value));
    await updatePassword(user, $("p-new").value);
    $("pwd-form").reset(); $("pwd-form").hidden = true;
    notice("Mot de passe changé.", true);
  } catch (e) {
    const c = e.code || "";
    notice(c.includes("invalid-credential") || c.includes("wrong-password") ? "Le mot de passe actuel est incorrect."
      : c.includes("weak-password") ? "Le nouveau mot de passe est trop court (6 caractères minimum)."
      : "Le changement n'a pas fonctionné. Réessaie.");
  }
});
