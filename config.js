// ⚙️ À remplir avec la configuration de TON projet Firebase
// (Console Firebase → Paramètres du projet → Vos applications → Application Web → Config).
// Ces valeurs ne sont pas secrètes : la sécurité repose sur les règles Firestore.
export const firebaseConfig = {
  apiKey: "A_REMPLACER",
  authDomain: "A_REMPLACER.firebaseapp.com",
  projectId: "A_REMPLACER",
  storageBucket: "A_REMPLACER.appspot.com",
  messagingSenderId: "A_REMPLACER",
  appId: "A_REMPLACER"
};

// Domaine "technique" des identifiants. Le prénom "Élodie" devient elodie@example.com.
// Aucun e-mail n'est jamais envoyé ; ne change ce domaine que si tu sais pourquoi.
export const DOMAINE_LOGIN = "example.com";
