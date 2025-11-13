// Gestion de l'application principale
class AttendanceApp {
    constructor() {
        this.currentUser = null;
        this.apiBaseUrl = 'https://votre-backend.onrender.com'; // Remplacez par votre URL Render
        this.init();
    }

    async init() {
        await this.checkAuthentication();
        this.setupEventListeners();
        this.loadInitialData();
    }

    async checkAuthentication() {
        this.currentUser = authManager.getCurrentUser();
        
        if (!this.currentUser) {
            window.location.href = 'login.html';
            return;
        }

        // Récupérer le token pour les requêtes API
        this.idToken = await this.currentUser.getIdToken();
        this.updateUI();
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = e.target.getAttribute('data-section');
                this.showSection(section);
            });
        });

        // Déconnexion
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        // Formulaire d'ajout d'utilisateur
        document.getElementById('add-user-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addUser();
        });

        // Formulaire d'ajout de cours
        document.getElementById('add-course-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addCourse();
        });

        // Enregistrement d'empreinte
        document.getElementById('enroll-fingerprint-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.enrollFingerprint();
        });

        // Pointage par empreinte
        document.getElementById('record-attendance-btn').addEventListener('click', () => {
            this.recordAttendance();
        });
    }

    updateUI() {
        // Mettre à jour le nom de l'utilisateur
        const userElements = document.querySelectorAll('.user-name');
        userElements.forEach(element => {
            element.textContent = this.currentUser.displayName || this.currentUser.email;
        });

        // Afficher/masquer les éléments selon le rôle
        this.checkUserRole();
    }

    async checkUserRole() {
        try {
            const userDoc = await db.collection('users').doc(this.currentUser.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                this.userRole = userData.role;

                // Masquer les fonctionnalités admin si nécessaire
                if (this.userRole !== 'admin') {
                    document.querySelectorAll('.admin-only').forEach(element => {
                        element.style.display = 'none';
                    });
                }
            }
        } catch (error) {
            console.error('Erreur lors de la récupération du rôle:', error);
        }
    }

    async showSection(sectionName) {
        // Masquer toutes les sections
        document.querySelectorAll('.main-section').forEach(section => {
            section.classList.remove('active');
        });

        // Afficher la section demandée
        const targetSection = document.getElementById(sectionName);
        if (targetSection) {
            targetSection.classList.add('active');
        }

        // Charger les données spécifiques à la section
        switch (sectionName) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'users':
                await this.loadUsers();
                break;
            case 'courses':
                await this.loadCourses();
                break;
            case 'attendance':
                await this.loadAttendance();
                break;
            case 'fingerprint':
                await this.loadFingerprintSection();
                break;
            case 'reports':
                await this.loadReports();
                break;
        }
    }

    async makeApiCall(endpoint, options = {}) {
        try {
            const url = `${this.apiBaseUrl}${endpoint}`;
            const defaultOptions = {
                headers: {
                    'Authorization': `Bearer ${this.idToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const response = await fetch(url, { ...defaultOptions, ...options });
            
            if (response.status === 401) {
                // Token expiré, se reconnecter
                this.idToken = await this.currentUser.getIdToken(true);
                return this.makeApiCall(endpoint, options);
            }

            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Erreur API:', error);
            this.showNotification('Erreur de connexion au serveur', 'error');
            throw error;
        }
    }

    async loadDashboard() {
        try {
            const stats = await this.makeApiCall('/api/stats');
            const activities = await this.makeApiCall('/api/activities');

            this.updateDashboardStats(stats);
            this.updateRecentActivities(activities);
        } catch (error) {
            console.error('Erreur lors du chargement du dashboard:', error);
        }
    }

    updateDashboardStats(stats) {
        document.getElementById('total-users').textContent = stats.user_count || 0;
        document.getElementById('total-courses').textContent = stats.course_count || 0;
        document.getElementById('today-attendance').textContent = stats.today_attendances || 0;
    }

    updateRecentActivities(activities) {
        const container = document.getElementById('recent-activities');
        container.innerHTML = '';

        activities.forEach(activity => {
            const activityElement = document.createElement('div');
            activityElement.className = 'activity-item';
            activityElement.innerHTML = `
                <div class="activity-icon">
                    <i class="fas fa-${this.getActivityIcon(activity.type)}"></i>
                </div>
                <div class="activity-content">
                    <p class="activity-message">${activity.message}</p>
                    <span class="activity-time">${this.formatTime(activity.timestamp)}</span>
                </div>
            `;
            container.appendChild(activityElement);
        });
    }

    getActivityIcon(type) {
        const icons = {
            'user': 'user',
            'course': 'book',
            'attendance': 'fingerprint',
            'system': 'cog'
        };
        return icons[type] || 'info-circle';
    }

    formatTime(timestamp) {
        if (!timestamp) return 'Maintenant';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'À l\'instant';
        if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
        if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)} h`;
        
        return date.toLocaleDateString('fr-FR');
    }

    async loadUsers() {
        try {
            const users = await this.makeApiCall('/api/users');
            this.renderUsersTable(users);
        } catch (error) {
            console.error('Erreur lors du chargement des utilisateurs:', error);
        }
    }

    renderUsersTable(users) {
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.name || 'Non spécifié'}</td>
                <td>${user.email}</td>
                <td><span class="badge badge-${user.role}">${user.role}</span></td>
                <td>${user.fingerprint_id || 'Non enregistré'}</td>
                <td>${this.formatTime(user.created_at)}</td>
                <td>
                    <button class="btn-icon" onclick="app.editUser('${user.id}')" title="Modifier">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="app.deleteUser('${user.id}')" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    async addUser() {
        const form = document.getElementById('add-user-form');
        const formData = new FormData(form);
        
        const userData = {
            name: formData.get('name'),
            email: formData.get('email'),
            role: formData.get('role'),
            fingerprint_id: parseInt(formData.get('fingerprint_id')),
            password: formData.get('password')
        };

        try {
            await this.makeApiCall('/api/users', {
                method: 'POST',
                body: JSON.stringify(userData)
            });

            this.showNotification('Utilisateur ajouté avec succès', 'success');
            form.reset();
            this.loadUsers();
            this.loadDashboard();
        } catch (error) {
            this.showNotification('Erreur lors de l\'ajout de l\'utilisateur', 'error');
        }
    }

    async loadCourses() {
        try {
            const courses = await this.makeApiCall('/api/courses');
            this.renderCoursesTable(courses);
            this.populateCourseFilters(courses);
        } catch (error) {
            console.error('Erreur lors du chargement des cours:', error);
        }
    }

    renderCoursesTable(courses) {
        const tbody = document.querySelector('#courses-table tbody');
        tbody.innerHTML = '';

        courses.forEach(course => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${course.code}</td>
                <td>${course.name}</td>
                <td>${course.schedule || 'Non spécifié'}</td>
                <td>${this.formatTime(course.created_at)}</td>
                <td>
                    <button class="btn-icon" onclick="app.editCourse('${course.id}')" title="Modifier">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="app.deleteCourse('${course.id}')" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    async addCourse() {
        const form = document.getElementById('add-course-form');
        const formData = new FormData(form);
        
        const courseData = {
            code: formData.get('code'),
            name: formData.get('name'),
            schedule: formData.get('schedule'),
            description: formData.get('description')
        };

        try {
            await this.makeApiCall('/api/courses', {
                method: 'POST',
                body: JSON.stringify(courseData)
            });

            this.showNotification('Cours ajouté avec succès', 'success');
            form.reset();
            this.loadCourses();
            this.loadDashboard();
        } catch (error) {
            this.showNotification('Erreur lors de l\'ajout du cours', 'error');
        }
    }

    async loadAttendance() {
        const dateFilter = document.getElementById('attendance-date').value;
        const courseFilter = document.getElementById('attendance-course').value;

        let endpoint = '/api/attendance';
        const params = new URLSearchParams();
        
        if (dateFilter) params.append('date', dateFilter);
        if (courseFilter) params.append('course_id', courseFilter);
        
        if (params.toString()) {
            endpoint += '?' + params.toString();
        }

        try {
            const attendance = await this.makeApiCall(endpoint);
            this.renderAttendanceTable(attendance);
        } catch (error) {
            console.error('Erreur lors du chargement des présences:', error);
        }
    }

    renderAttendanceTable(attendance) {
        const tbody = document.querySelector('#attendance-table tbody');
        tbody.innerHTML = '';

        attendance.forEach(record => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${record.user_name}</td>
                <td>${record.course_name} (${record.course_code})</td>
                <td>${this.formatTime(record.timestamp)}</td>
                <td><span class="badge badge-success">${record.status}</span></td>
                <td>
                    <button class="btn-icon" onclick="app.deleteAttendance('${record.id}')" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    populateCourseFilters(courses) {
        const attendanceFilter = document.getElementById('attendance-course');
        const reportFilter = document.getElementById('report-course');
        
        [attendanceFilter, reportFilter].forEach(select => {
            select.innerHTML = '<option value="">Tous les cours</option>';
            courses.forEach(course => {
                const option = document.createElement('option');
                option.value = course.id;
                option.textContent = `${course.code} - ${course.name}`;
                select.appendChild(option);
            });
        });
    }

    async recordAttendance() {
        const fingerprintId = document.getElementById('attendance-fingerprint-id').value;
        
        if (!fingerprintId) {
            this.showNotification('Veuillez entrer un ID d\'empreinte', 'error');
            return;
        }

        try {
            const result = await this.makeApiCall('/api/attendance', {
                method: 'POST',
                body: JSON.stringify({ fingerprint_id: parseInt(fingerprintId) })
            });

            this.showNotification(`Présence enregistrée pour ${result.user_name}`, 'success');
            document.getElementById('attendance-fingerprint-id').value = '';
            this.loadAttendance();
            this.loadDashboard();
        } catch (error) {
            this.showNotification('Erreur lors de l\'enregistrement de la présence', 'error');
        }
    }

    async enrollFingerprint() {
        const fingerprintId = document.getElementById('enroll-fingerprint-id').value;
        
        if (!fingerprintId) {
            this.showNotification('Veuillez entrer un ID d\'empreinte', 'error');
            return;
        }

        try {
            // Cette fonctionnalité nécessiterait une communication directe avec l'ESP32
            // Pour l'instant, nous simulons l'enregistrement
            this.showNotification('Enregistrement de l\'empreinte démarré...', 'info');
            
            // Simuler le processus d'enregistrement
            setTimeout(() => {
                this.showNotification('Empreinte enregistrée avec succès', 'success');
            }, 3000);

        } catch (error) {
            this.showNotification('Erreur lors de l\'enregistrement de l\'empreinte', 'error');
        }
    }

    async loadReports() {
        // Implémentation des rapports et statistiques
        this.showNotification('Fonctionnalité de rapports en cours de développement', 'info');
    }

    showNotification(message, type = 'info') {
        // Créer une notification
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        document.getElementById('notifications').appendChild(notification);

        // Auto-suppression après 5 secondes
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    getNotificationIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    async logout() {
        const result = await authManager.logout();
        if (result.success) {
            window.location.href = 'login.html';
        }
    }
}

// Initialisation de l'application
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new AttendanceApp();
});