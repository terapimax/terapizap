const fs = require('fs');

let css = fs.readFileSync('extension/sidebar.css', 'utf8');

// Update Root and Panel (Smoother glass)
css = css.replace(
    'box-shadow: -10px 0 30px rgba(0, 0, 0, 0.3);',
    'box-shadow: -12px 0 40px rgba(0, 0, 0, 0.4), inset 1px 0 0 rgba(255,255,255,0.05);'
);
css = css.replace(
    'background: #0f172a;',
    'background: rgba(15, 23, 42, 0.85);\n    backdrop-filter: blur(20px);\n    -webkit-backdrop-filter: blur(20px);'
);

// Search input wrapper optimization for SVG alignment
css = css.replace(
    /padding: 12px 16px 12px 40px;/g,
    'padding: 12px 16px 12px 44px;'
);
css = css.replace(
    /left: 14px;/g,
    'left: 16px;'
);

// Filter buttons (more rounded, pill like)
css = css.replace(
    /padding: 6px 14px;\r?\n    border-radius: 20px;/g,
    'padding: 8px 16px;\n    border-radius: 24px;\n    display: flex;\n    align-items: center;\n    gap: 6px;'
);

// Items List padding to avoid scrollbar touch
css = css.replace(
    /padding: 16px 24px;\r?\n    display: flex;/g,
    'padding: 16px 20px 24px 24px;\n    display: flex;'
);

// Item Card Apple Polish
css = css.replace(
    /padding: 14px 16px;\r?\n    border-radius: 14px;\r?\n    background: #1e293b;\r?\n    border: 1px solid rgba\(255, 255, 255, 0\.03\);/g,
    'padding: 14px 18px;\n    border-radius: 18px;\n    background: rgba(30, 41, 59, 0.6);\n    backdrop-filter: blur(8px);\n    border: 1px solid rgba(255, 255, 255, 0.06);\n    box-shadow: 0 4px 6px rgba(0,0,0,0.1);'
);
css = css.replace(
    /background: #232f46;/g,
    'background: rgba(30, 41, 59, 0.95);'
);

// Fix SVG icons in Buttons
const svgFix = `
/* SVG Utilities added */
button svg, .zf-nav-icon svg, .zf-search-icon svg, .zf-item-icon svg {
    display: block;
}
.zf-filter-btn svg { width: 14px; height: 14px; }
.zf-item-action-btn svg { width: 16px; height: 16px; }
.zf-fav-toggle svg { width: 14px; height: 14px; stroke-width: 2.5; }
.zf-theme-btns { gap: 8px; }
.zf-theme-btn { border-radius: 12px; }
`;
css += svgFix;

// Fix Nav Icon SVG sizing
css = css.replace(
    /font-size: 20px;\r?\n    color: #64748b;/g,
    'color: #64748b;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    width: 24px;\n    height: 24px;'
);

// Settings Section Rounded Apple Look
css = css.replace(
    /border-radius: 16px;\r?\n    padding: 0 20px;/g,
    'border-radius: 20px;\n    padding: 0 20px;\n    background: rgba(30, 41, 59, 0.4);\n    backdrop-filter: blur(12px);'
);

fs.writeFileSync('extension/sidebar.css', css);
console.log('✅ Sidebar CSS Apple UI applied');
