import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, DOMAINE_LOGIN } from "./config.js";

/* ---------- Outils ---------- */
const $ = id => document.getElementById(id);
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const STATUTS = { idee: "Idée", achete: "Acheté", emballe: "Emballé" };

// "Élodie Martin" -> "elodie-martin" (identifiant = elodie-martin@example.com)
export function slug(prenom) {
  return prenom.normalize("NFD").replace(/[̀-ͯ]/g, "")
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
  $("loading").hidden = view !== "loading";
  $("login").hidden = view !== "login";
  $("main").hidden = view !== "main";
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
let prenomSaisi = "";
$("login-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const prenom = $("l-prenom").value, mdp = $("l-mdp").value;
  const id = slug(prenom);
  if (!id) return;
  prenomSaisi = joli(prenom);
  $("l-submit").disabled = true;
  try {
    await signInWithEmailAndPassword(auth, `${id}@${DOMAINE_LOGIN}`, mdp);
    notice("");
  } catch (e) {
    const c = e.code || "";
    if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found") || c.includes("invalid-email"))
      notice("Prénom ou mot de passe incorrect.");
    else if (c.includes("too-many-requests"))
      notice("Trop d'essais. Attends quelques minutes avant de réessayer.");
    else notice("Connexion impossible pour le moment. Vérifie ta connexion internet.");
  } finally {
    $("l-submit").disabled = false; $("l-mdp").value = "";
  }
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
    try { await setDoc(ref, { nom: prenomSaisi || joli(moi.replace(/-/g, " ")) }); membre = true; }
    catch { /* pas l'organisateur */ }
  }
  if (!membre) {
    notice(`Ton compte (« ${moi} ») n'a pas encore été ajouté à la famille. Demande à un proche déjà connecté de t'ajouter dans « Gérer la famille » avec exactement ce prénom.`);
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
  if (!others.length) list.append(el("p", { class: "note" }, "Personne d'autre ne s'est encore connecté. Ajoute la famille ci-dessous."));
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
      el("div", {}, el("div", {}, m.nom + (m.id === moi ? " (toi)" : "")),
        el("div", { class: "sub small" }, "identifiant : " + m.id + "@" + DOMAINE_LOGIN)));
    if (m.id !== moi && !gifts.some(g => g.pour === m.id || g.par === m.id))
      li.append(confirmBtn("Retirer", () => deleteDoc(doc(db, "membres", m.id)).catch(writeErr)));
    ul.append(li);
  }
}

$("add-member").addEventListener("click", () => addMember($("new-member")));
$("new-member").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); addMember($("new-member")); }
});

async function addMember(input) {
  const nom = joli(input.value), id = slug(input.value);
  if (!id) return;
  if (members.some(m => m.id === id)) { notice(`${nom} est déjà dans la famille.`); return; }
  try { await setDoc(doc(db, "membres", id), { nom }); input.value = ""; notice(""); }
  catch (e) { writeErr(e); }
}

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
