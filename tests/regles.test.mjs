// Tests des règles de sécurité, dans l'émulateur Firebase (rien n'est envoyé en ligne).
// Prérequis : Node.js 18+ et Java 11+.   Lancer :  cd tests && npm install && npm test
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp
} from "firebase/firestore";

const ORGA = "romain"; // doit correspondre à organisateur() dans firestore.rules
let env;
const as = id => env.authenticatedContext(id, { email: `${id}@example.com` }).firestore();
const cadeau = (par, pour, extra = {}) => ({
  par, pour, titre: "Puzzle", lien: "", note: "", achetePar: null, envie: null, cree: serverTimestamp(), ...extra
});
const envie = (qui, extra = {}) => ({ par: qui, pour: qui, titre: "Un livre", lien: "", note: "", cree: serverTimestamp(), ...extra });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "carnet-test",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 }
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [id, nom] of [[ORGA, "Orga"], ["alice", "Alice"], ["bob", "Bob"]]) await setDoc(doc(db, "membres", id), { nom });
    await setDoc(doc(db, "cadeaux", "pourAlice"), { ...cadeau("bob", "alice"), cree: new Date() });
    await setDoc(doc(db, "cadeaux", "pourBob"), { ...cadeau("alice", "bob"), cree: new Date() });
  });
});

test("on ne lit jamais un cadeau qui nous est destiné", async () => {
  await assertFails(getDoc(doc(as("alice"), "cadeaux", "pourAlice")));
  await assertFails(getDocs(collection(as("alice"), "cadeaux")));
});
test("on lit les cadeaux des autres avec la requête de l'appli", async () => {
  await assertSucceeds(getDoc(doc(as("alice"), "cadeaux", "pourBob")));
  const s = await assertSucceeds(getDocs(query(collection(as("alice"), "cadeaux"), where("pour", "!=", "alice"))));
  if (s.docs.some(d => d.data().pour === "alice")) throw new Error("fuite !");
});
test("un inconnu (compte non membre) ne voit rien et ne peut pas s'ajouter", async () => {
  await assertFails(getDoc(doc(as("intrus"), "cadeaux", "pourBob")));
  await assertFails(getDocs(collection(as("intrus"), "membres")));
  await assertFails(setDoc(doc(as("intrus"), "membres", "intrus"), { nom: "Intrus" }));
});
test("l'organisateur peut s'inscrire seul la première fois", async () => {
  await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), "membres", ORGA)));
  await assertSucceeds(setDoc(doc(as(ORGA), "membres", ORGA), { nom: "Orga" }));
});
test("un membre ajoute quelqu'un, mais ne peut pas se retirer lui-même", async () => {
  await assertSucceeds(setDoc(doc(as("alice"), "membres", "mamie-jeanne"), { nom: "Mamie Jeanne" }));
  await assertFails(deleteDoc(doc(as("alice"), "membres", "alice")));
});
test("créer un cadeau : seulement en son nom et pas pour soi", async () => {
  await assertSucceeds(setDoc(doc(as("alice"), "cadeaux", "c1"), cadeau("alice", "bob")));
  await assertFails(setDoc(doc(as("alice"), "cadeaux", "c2"), cadeau("alice", "alice")));
  await assertFails(setDoc(doc(as("alice"), "cadeaux", "c6"), cadeau("alice", "bob", { prix: 20, budget: 1 })));
  await assertFails(setDoc(doc(as("alice"), "cadeaux", "c3"), cadeau("bob", "orga")));
  await assertFails(setDoc(doc(as("alice"), "cadeaux", "c4"), cadeau("alice", "inconnu")));
});
test("seul l'auteur modifie le contenu ou supprime sa fiche", async () => {
  await assertSucceeds(updateDoc(doc(as("alice"), "cadeaux", "pourBob"), { titre: "Puzzle 2000" }));
  await assertFails(updateDoc(doc(as(ORGA), "cadeaux", "pourBob"), { titre: "Autre" }));
  await assertFails(deleteDoc(doc(as(ORGA), "cadeaux", "pourBob")));
  await assertSucceeds(deleteDoc(doc(as("alice"), "cadeaux", "pourBob")));
});
test("acheter une idée : n'importe qui sauf le destinataire, et seulement pour soi", async () => {
  await assertSucceeds(updateDoc(doc(as(ORGA), "cadeaux", "pourBob"), { achetePar: ORGA }));
  await assertFails(updateDoc(doc(as("alice"), "cadeaux", "pourBob"), { achetePar: "alice" }));   // déjà pris
  await assertFails(updateDoc(doc(as("alice"), "cadeaux", "pourBob"), { achetePar: null }));      // pas le sien
  await assertFails(deleteDoc(doc(as("alice"), "cadeaux", "pourBob")));                          // acheté par un autre
  await assertSucceeds(updateDoc(doc(as(ORGA), "cadeaux", "pourBob"), { achetePar: null }));
  await assertFails(updateDoc(doc(as("bob"), "cadeaux", "pourBob"), { achetePar: "bob" }));       // destinataire
});
test("envies : chacun écrit les siennes, toute la famille les lit", async () => {
  await assertSucceeds(setDoc(doc(as("bob"), "envies", "e1"), envie("bob")));
  await assertFails(setDoc(doc(as("alice"), "envies", "e2"), envie("bob", { par: "alice" })));
  await assertSucceeds(getDoc(doc(as("alice"), "envies", "e1")));
  await assertSucceeds(getDoc(doc(as("bob"), "envies", "e1")));
  await assertFails(deleteDoc(doc(as("alice"), "envies", "e1")));
  // acheter une envie de Bob = une fiche cadeau liée, invisible pour Bob
  await assertSucceeds(setDoc(doc(as("alice"), "cadeaux", "a1"), cadeau("alice", "bob", { achetePar: "alice", envie: "e1" })));
  await assertFails(getDoc(doc(as("bob"), "cadeaux", "a1")));
  await assertFails(setDoc(doc(as("alice"), "cadeaux", "a2"), cadeau("alice", "bob", { achetePar: ORGA })));
});
test("on ne peut pas réorienter un cadeau vers soi pour le lire", async () => {
  await assertFails(updateDoc(doc(as("bob"), "cadeaux", "pourAlice"), { pour: "bob" }));
});
test("un enfant (sans accès) ne voit rien, même avec un compte à son identifiant", async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "membres", "enzo"), { nom: "Enzo", enfant: true }));
  await assertFails(getDocs(collection(as("enzo"), "membres")));
  await assertFails(getDoc(doc(as("enzo"), "cadeaux", "pourBob")));
  await assertSucceeds(setDoc(doc(as("alice"), "cadeaux", "c5"), cadeau("alice", "enzo")));
});
test("on ne peut pas passer soi-même ou l'organisateur en enfant", async () => {
  await assertFails(updateDoc(doc(as("alice"), "membres", "alice"), { enfant: true }));
  await assertFails(updateDoc(doc(as("alice"), "membres", ORGA), { enfant: true }));
  await assertSucceeds(updateDoc(doc(as("alice"), "membres", "bob"), { enfant: true }));
  await assertFails(getDocs(collection(as("bob"), "membres")));
});
