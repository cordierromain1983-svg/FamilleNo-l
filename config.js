// Configuration du projet Firebase "famille-noel".
// Ces valeurs ne sont pas secrètes : la sécurité repose sur les règles Firestore.
export const firebaseConfig = {
  apiKey: "AIzaSyC1g7PpgFeTiMA5wQ0FfLfvlbgDFoY4FY8",
  authDomain: "famille-noel.firebaseapp.com",
  projectId: "famille-noel",
  storageBucket: "famille-noel.firebasestorage.app",
  messagingSenderId: "64261132544",
  appId: "1:64261132544:web:21ebe3fda5ed880fcd23e5"
};

// Domaine "technique" utilisé en interne par Firebase (jamais affiché ni utilisé pour envoyer des e-mails).
export const DOMAINE_LOGIN = "example.com";

// Identifiant de l'organisateur : le seul compte qu'on peut créer depuis la page de connexion.
// Doit être identique à organisateur() dans firestore.rules.
export const ORGANISATEUR = "romain";
