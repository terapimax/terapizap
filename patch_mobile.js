const fs = require('fs');

let css = fs.readFileSync('styles.css', 'utf8');

const mobileCSS = \`
/* ============================================================
   MOBILE RESPONSIVENESS (ZAPFLOW SAAS DASHBOARD)
   ============================================================ */

/* Mobile Variables and Overlay classes */
body {
    overflow-x: hidden;
}

@media (max-width: 768px) {
    /* 1. Sidebar Collapse */
    #sidebar {
        position: fixed;
        left: 0;
        top: 0;
        bottom: 0;
        transform: translateX(-100%);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 50;
        box-shadow: 10px 0 30px rgba(0,0,0,0.5);
    }

    #sidebar.sidebar-open {
        transform: translateX(0);
    }

    /* Dimmer Overlay for Sidebar */
    .mobile-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        z-index: 40;
    }
    
    .mobile-overlay.active {
        display: block;
    }

    /* Add a hamburger toggle to the main content header */
    #main-app-container header {
        padding-left: 1rem !important;
        padding-right: 1rem !important;
    }

    /* 2. Dashboard Grids */
    .grid-cols-4, .grid-cols-3, .grid-cols-2 {
        grid-template-columns: 1fr !important;
        gap: 1rem !important;
    }

    /* 3. Kanban Horizontal Scroll */
    #kanban-board {
        display: flex !important;
        flex-direction: row !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        scroll-snap-type: x mandatory;
        padding-bottom: 20px;
        -webkit-overflow-scrolling: touch;
        gap: 16px;
    }

    .kanban-col {
        min-width: 85vw !important;
        scroll-snap-align: center;
        flex-shrink: 0;
    }

    /* 4. Auth Screen Mobile */
    #auth-form-container {
        width: 90% !important;
        padding: 2rem !important;
    }

    /* 5. Modals */
    .max-w-5xl {
        width: 95vw !important;
        max-width: none !important;
        height: 95vh !important;
    }

    /* 6. Typography */
    .text-4xl { font-size: 2rem !important; }
    .text-3xl { font-size: 1.5rem !important; }
}
\`;

if(!css.includes('MOBILE RESPONSIVENESS')) {
    css += '\\n\\n' + mobileCSS;
}

fs.writeFileSync('styles.css', css);

// Now patch app.js to create the hamburger button and mobile overlay dynamically
let appjs = fs.readFileSync('app.js', 'utf8');

const mobileMenuScript = \`
    // --- LÓGICA MOBILE HAMBURGUER MENU ---
    const sidebar = document.getElementById('sidebar');
    if(sidebar) {
        // Create an overlay
        let overlay = document.createElement('div');
        overlay.className = 'mobile-overlay';
        document.body.appendChild(overlay);

        // Function to toggle
        window.toggleMobileSidebar = () => {
            sidebar.classList.toggle('sidebar-open');
            overlay.classList.toggle('active');
        };

        overlay.addEventListener('click', window.toggleMobileSidebar);

        // Inject Hamburger button into Headers
        const headers = document.querySelectorAll('#main-app-container header');
        headers.forEach(h => {
            // Check if hamburger already injected
            if(!h.querySelector('.mobile-hamburger-btn')) {
                const btn = document.createElement('button');
                btn.className = 'mobile-hamburger-btn md:hidden p-2 -ml-2 mr-2 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors';
                btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
                btn.onclick = window.toggleMobileSidebar;
                h.insertBefore(btn, h.firstChild);
            }
        });
        
        // Auto-close sidebar on item click (mobile)
        const navLinks = sidebar.querySelectorAll('a[data-target], button[data-target]');
        navLinks.forEach(l => {
            l.addEventListener('click', () => {
                if(window.innerWidth <= 768 && sidebar.classList.contains('sidebar-open')) {
                    window.toggleMobileSidebar();
                }
            });
        });
    }
\`;

if(!appjs.includes('toggleMobileSidebar')) {
    appjs = appjs.replace("document.addEventListener('DOMContentLoaded', () => {", "document.addEventListener('DOMContentLoaded', () => {" + mobileMenuScript);
    fs.writeFileSync('app.js', appjs);
}

console.log('Mobile patch complete.');
