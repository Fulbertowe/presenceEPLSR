// Gestion de l'authentification
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.initAuthListener();
    }

    initAuthListener() {
        auth.onAuthStateChanged((user) => {
            if (user) {
                this.currentUser = user;
                this.handleUserLoggedIn(user);
            } else {
                this.currentUser = null;
                this.handleUserLoggedOut();
            }
        });
    }

    async login(email, password) {
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: this.getErrorMessage(error) };
        }
    }

    async register(email, password, name) {
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            await userCredential.user.updateProfile({
                displayName: name
            });

            // Sauvegarder les informations supplémentaires dans Firestore
            await db.collection('users').doc(userCredential.user.uid).set({
                name: name,
                email: email,
                role: 'user',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: this.getErrorMessage(error) };
        }
    }

    async loginWithGoogle() {
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.addScope('profile');
            provider.addScope('email');
            
            const userCredential = await auth.signInWithPopup(provider);
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: this.getErrorMessage(error) };
        }
    }

    async resetPassword(email) {
        try {
            await auth.sendPasswordResetEmail(email);
            return { success: true };
        } catch (error) {
            return { success: false, error: this.getErrorMessage(error) };
        }
    }

    async logout() {
        try {
            await auth.signOut();
            return { success: true };
        } catch (error) {
            return { success: false, error: this.getErrorMessage(error) };
        }
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    handleUserLoggedIn(user) {
        // Rediriger vers la page d'accueil si on est sur une page d'authentification
        if (window.location.pathname.includes('login.html') || 
            window.location.pathname.includes('register.html') ||
            window.location.pathname.includes('forgot-password.html')) {
            window.location.href = 'index.html';
        }
        
        // Mettre à jour l'interface utilisateur
        this.updateUIForAuthenticatedUser(user);
    }

    handleUserLoggedOut() {
        // Rediriger vers la page de connexion si on est sur une page protégée
        if (!window.location.pathname.includes('login.html') && 
            !window.location.pathname.includes('register.html') &&
            !window.location.pathname.includes('forgot-password.html')) {
            window.location.href = 'login.html';
        }
        
        // Mettre à jour l'interface utilisateur
        this.updateUIForLoggedOutUser();
    }

    updateUIForAuthenticatedUser(user) {
        // Mettre à jour la navigation
        const authElements = document.querySelectorAll('.auth-element');
        authElements.forEach(element => {
            if (element.classList.contains('logged-in')) {
                element.style.display = 'block';
            } else {
                element.style.display = 'none';
            }
        });

        // Afficher le nom de l'utilisateur
        const userDisplayElements = document.querySelectorAll('.user-display');
        userDisplayElements.forEach(element => {
            element.textContent = user.displayName || user.email;
        });
    }

    updateUIForLoggedOutUser() {
        const authElements = document.querySelectorAll('.auth-element');
        authElements.forEach(element => {
            if (element.classList.contains('logged-out')) {
                element.style.display = 'block';
            } else {
                element.style.display = 'none';
            }
        });
    }

    getErrorMessage(error) {
        switch (error.code) {
            case 'auth/invalid-email':
                return 'Adresse email invalide.';
            case 'auth/user-disabled':
                return 'Ce compte a été désactivé.';
            case 'auth/user-not-found':
                return 'Aucun compte trouvé avec cette adresse email.';
            case 'auth/wrong-password':
                return 'Mot de passe incorrect.';
            case 'auth/email-already-in-use':
                return 'Cette adresse email est déjà utilisée.';
            case 'auth/weak-password':
                return 'Le mot de passe est trop faible.';
            case 'auth/network-request-failed':
                return 'Erreur de connexion. Vérifiez votre connexion internet.';
            default:
                return 'Une erreur est survenue. Veuillez réessayer.';
        }
    }
}

// Initialisation de l'authentification
const authManager = new AuthManager();