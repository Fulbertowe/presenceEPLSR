// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA5D2tCr03Y3J69Bv_k79uQ2TO00OYlssY",
  authDomain: "presenceepl.firebaseapp.com",
  databaseURL: "https://presenceepl-default-rtdb.firebaseio.com",
  projectId: "presenceepl",
  storageBucket: "presenceepl.firebasestorage.app",
  messagingSenderId: "1085221808507",
  appId: "1:1085221808507:web:8bc7ac61a8ad4d8b6e75de",
  measurementId: "G-7EP9H9ZP4B"
};

// Initialisation Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Références aux services Firebase
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Configuration Firestore
if (db) {
    db.settings({
        timestampsInSnapshots: true,
        merge: true
    });
}

// Gestion des erreurs Firebase
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log('Utilisateur connecté:', user.email);
    } else {
        console.log('Utilisateur non connecté');
        
        // Rediriger vers la page de connexion si on est sur une page protégée
        const protectedPages = ['index.html', 'dashboard.html'];
        const currentPage = window.location.pathname.split('/').pop();
        
        if (protectedPages.includes(currentPage)) {
            window.location.href = 'login.html';
        }
    }
});

// Export des services Firebase
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseStorage = storage;