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
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
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
let gifts = [];          // cadeaux visibles (jamais ceux pour moi)
let editing = null;
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
  unsubs.forEach(u => u()); unsubs = []; members = []; gifts = []; cancelEdit();
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

function render() {
  if (!moi) return;
  $("me-name").textContent = nameOf(moi);

  const mine = gifts.filter(g => g.par === moi);
  const total = mine.reduce((s, g) => s + (Number(g.prix) || 0), 0);
  const todo = mine.filter(g => g.statut === "idee").length;
  const pl = (n, a, b) => n > 1 ? b : a;
  $("stats").replaceChildren(
    el("span", {}, el("b", {}, String(mine.length)), " " + pl(mine.length, "cadeau noté", "cadeaux notés")),
    el("span", {}, el("b", {}, euro.format(total)), " prévus"),
    el("span", {}, el("b", {}, String(todo)), " " + pl(todo, "idée à acheter", "idées à acheter"))
  );

  // Sélecteur "pour qui"
  const sel = $("f-pour"), keep = sel.value;
  sel.replaceChildren(el("option", { value: "" }, "Choisir…"));
  for (const m of members) if (m.id !== moi) sel.append(el("option", { value: m.id }, m.nom));
  if (keep) sel.value = keep;

  // Une étiquette par membre (sauf moi)
  const list = $("list"); list.replaceChildren();
  const others = members.filter(m => m.id !== moi);
  if (!others.length) list.append(el("p", { class: "note" }, "Ajoute les membres de la famille dans « Gérer la famille », tout en bas."));
  for (const m of others) {
    const gs = gifts.filter(g => g.pour === m.id)
      .sort((a, b) => (a.cree?.seconds || 0) - (b.cree?.seconds || 0));
    const sum = gs.reduce((s, g) => s + (Number(g.prix) || 0), 0);
    const ul = el("ul", { class: "gifts" });
    for (const g of gs) {
      const u = g.lien && safeUrl(g.lien);
      const title = u ? el("a", { href: u, target: "_blank", rel: "noopener noreferrer" }, g.titre) : g.titre;
      const meta = el("div", { class: "g-meta" },
        el("span", { class: "pill s-" + (STATUTS[g.statut] ? g.statut : "achete") }, STATUTS[g.statut] || "Acheté"),
        el("span", {}, "par " + (g.par === moi ? "toi" : nameOf(g.par))),
        g.note ? el("span", {}, "· " + g.note) : null);
      const act = el("div", { class: "g-act" });
      if (g.par === moi) {
        act.append(el("button", { class: "ghost", type: "button", onclick: () => startEdit(g) }, "Modifier"));
        act.append(confirmBtn("Supprimer", () => deleteDoc(doc(db, "cadeaux", g.id)).catch(writeErr)));
      }
      ul.append(el("li", { class: "gift" },
        el("div", { class: "g-title" }, title),
        el("div", { class: "g-price" }, typeof g.prix === "number" ? euro.format(g.prix) : "—"),
        meta, act));
    }
    list.append(el("article", { class: "tag" },
      el("div", { class: "tag-head" }, el("h3", {}, m.nom),
        el("span", { class: "sum" }, gs.length ? `${gs.length} ${pl(gs.length, "cadeau", "cadeaux")} · ${euro.format(sum)}` : "")),
      gs.length ? ul : el("p", { class: "empty-tag" }, "Rien de prévu pour l'instant.")));
  }

  // Gestion de la famille
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
    if (m.id !== moi && !gifts.some(g => g.pour === m.id || g.par === m.id))
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

/* ---------- Formulaire cadeau ---------- */
function startEdit(g) {
  editing = g.id;
  $("f-pour").value = g.pour; $("f-statut").value = g.statut || "achete";
  $("f-titre").value = g.titre || ""; $("f-prix").value = g.prix ?? "";
  $("f-lien").value = g.lien || ""; $("f-note").value = g.note || "";
  $("add-summary").textContent = "Modifier le cadeau"; $("f-submit").textContent = "Mettre à jour";
  $("f-cancel").hidden = false; $("add-box").open = true;
  $("add-box").scrollIntoView({ behavior: "smooth", block: "start" });
}
function cancelEdit() {
  editing = null; $("gift-form").reset(); $("f-statut").value = "achete";
  $("add-summary").textContent = "Noter un cadeau"; $("f-submit").textContent = "Enregistrer";
  $("f-cancel").hidden = true;
}
$("f-cancel").addEventListener("click", cancelEdit);

$("gift-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const pour = $("f-pour").value, titre = $("f-titre").value.trim();
  if (!moi || !pour || !titre || pour === moi) return;
  const prixRaw = $("f-prix").value;
  const data = {
    pour, par: moi, titre, statut: $("f-statut").value,
    prix: prixRaw === "" ? null : Math.round(Number(prixRaw) * 100) / 100,
    lien: $("f-lien").value.trim(), note: $("f-note").value.trim()
  };
  $("f-submit").disabled = true;
  try {
    if (editing) await updateDoc(doc(db, "cadeaux", editing), data);
    else await addDoc(collection(db, "cadeaux"), { ...data, cree: serverTimestamp() });
    cancelEdit(); $("add-box").open = false; notice("");
  } catch (e) { writeErr(e); }
  finally { $("f-submit").disabled = false; }
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
