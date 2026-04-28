# SOPROMER - POS Print Cash Move Ticket (v4 — Comportement scindé)

Module Odoo 18 ajoutant un bouton **Imprimer** sur le popup *Cash In / Cash Out* du Point de Vente, à droite du bouton *Annuler*. **La v4 scinde le comportement** entre `Confirmer` (impression directe rapide via modal HTML) et `Imprimer` (aperçu PDF 2 copies pour preview/save).

## Comportement v4

| Bouton | Action | Cas d'usage |
|---|---|---|
| **Annuler** | Ferme le popup sans rien faire (natif) | Abandon de saisie |
| **Confirmer** | Enregistre le cash move + imprime **2 tickets via modal HTML** (`printer.print(SopromerCashMoveReceipt)` × 2) | Impression rapide (caissier en flux), pas de tab navigateur, dialog Odoo standard |
| **Imprimer** | Enregistre le cash move + ouvre **1 aperçu PDF** (2 copies dans 1 PDF) | Preview avant impression / save PDF / impression contrôlée |

## Pourquoi v4 vs v3.1 ?

La v3.1 ouvrait systématiquement un aperçu PDF (`window.open`) sur **Confirmer** ET **Imprimer**. Inconvénients :

- En flux caisse, le caissier doit basculer vers un onglet navigateur à chaque cash move (lent)
- Le bloqueur de pop-up se déclenche parfois (UX cassée)
- Pas de différence d'usage entre les 2 boutons (alias UX redondant)

La v4 ressuscite le **mode v2** (printer.print modal HTML) pour le bouton **Confirmer** (rapide, pas de tab navigateur), et garde le **mode v3.1** (aperçu PDF) uniquement sur le bouton **Imprimer** (preview/save explicites).

## Format du ticket

### Mode Confirmer (modal HTML, ~32 chars)

```
================================
       SOPROMER
   <pos.config.name>
================================
Type     : SORTIE caisse
N° Pièce : CSH2/2026/00027
Montant  : 50 000,00 Ar
Motif    : Avance sur salaire
--------------------------------
Session  : POS/00876
Date     : 28/04/2026 14:30
Caissier : RAKOTO Jean
================================
       Signature caissier


================================
```

Rendu via le composant OWL `SopromerCashMoveReceipt` dans la modal Odoo standard. **Imprimé 2 fois** (= 2 modals successives, 1 par copie).

### Mode Imprimer (PDF QWeb, paperformat 80mm)

PDF avec **2 pages** identiques (Copie 1/2 + Copie 2/2), séparées par un saut de page CSS. Ouvert dans un nouvel onglet via `window.open('/report/pdf/sopromer_pos_cash_print.action_report_cash_move_ticket/<line_id>', '_blank')`. Le caissier appuie sur Ctrl+P pour imprimer ou Ctrl+S pour sauvegarder.

### Convention sign / type
- `account.bank.statement.line.amount > 0` → **ENTREE caisse** (cash in)
- `account.bank.statement.line.amount < 0` → **SORTIE caisse** (cash out)

### Champs imprimés
- **Nom du PdV** (`pos.session.config_id.name`) — bandeau d'en-tête
- **N° de pièce** comptable (`account.move.name` lié à la `account.bank.statement.line`, format `CSH2/YYYY/00xxx`)
- **Motif** (`account.bank.statement.line.payment_ref`)
- **Caissier** (`pos.session.user_id.name`)

## Architecture technique

```
sopromer_pos_cash_print/
├── __init__.py
├── __manifest__.py            # v18.0.4.0.0, depends point_of_sale + account
├── README.md
├── .gitignore
├── models/
│   ├── __init__.py
│   └── pos_session.py         # override try_cash_in_out -> {line_id, piece_number, payment_ref}
├── report/
│   ├── __init__.py            # vide
│   └── report_cash_move_ticket.xml   # paperformat + ir.actions.report + QWeb (mode Imprimer)
└── static/
    └── src/
        ├── js/
        │   └── cash_move_popup.js   # patch confirm() + nouveau confirmAndPrint() + SopromerCashMoveReceipt
        └── xml/
            └── cash_move_popup.xml  # bouton Imprimer + template ticket modal HTML
```

### Backend Python : `models/pos_session.py` (inchangé v2 → v4)
Hérite `pos.session`, override `try_cash_in_out(_type, amount, reason, extras)` : appelle `super()` puis recherche la dernière `account.bank.statement.line` créée pour la session, retourne `{line_id, piece_number, payment_ref}`.

### Backend XML : `report/report_cash_move_ticket.xml` (inchangé v3.1 → v4)
Sert uniquement le bouton **Imprimer**. Paperformat 80mm × 200mm, `ir.actions.report` qweb-pdf, 2 blocs ticket séparés par `<p style="page-break-before: always;"/>`.

### Frontend OWL : `static/src/js/cash_move_popup.js` (v4 = restauration v2 + ajout v3.1)
- Composant OWL **`SopromerCashMoveReceipt`** restauré (rendu modal HTML)
- Override `confirm()` : appel `try_cash_in_out` puis `this.printer.print(SopromerCashMoveReceipt, props)` × 2
- Nouvelle méthode `confirmAndPrint()` : appel `try_cash_in_out` puis `window.open('/report/pdf/...')`
- Helper `_buildSopromerReceiptProps(ctx)` : centralise le formatage (date, session, caissier, type)

### Frontend XML : `static/src/xml/cash_move_popup.xml` (v4)
- XPath `//button[hasclass('cancel')]` position="after" → bouton Imprimer (`t-on-click="confirmAndPrint"`)
- Template `sopromer_pos_cash_print.SopromerCashMoveReceipt` (32 chars largeur, classes `pos-receipt` standard) restauré

## Bloqueurs popups (mode Imprimer uniquement)

Le bouton **Confirmer** n'est plus concerné (impression via modal Odoo, pas de `window.open`). Seul le bouton **Imprimer** ouvre un onglet navigateur. Si le navigateur bloque l'aperçu :

> **Chrome/Edge** : icône "pop-up bloqué" dans la barre d'URL → *Toujours autoriser les pop-up et redirections de https://odoo.sopromer.mg* → recharger la POS.

## Installation / Mise à jour

```bash
# Copier le dossier sur le serveur (ou git pull)
cp -r sopromer_pos_cash_print /opt/odoo18/custom_addons/dev/

# Mettre a jour le module (recharge schema + assets + report)
docker exec -u odoo odoo-dev /opt/odoo/odoo-bin -c /etc/odoo/odoo.conf \
    -d <BASE> -u sopromer_pos_cash_print --stop-after-init --no-http

# Restart pour recharger les assets POS
docker restart odoo-dev
```

Recharger la POS (clic *Reload* depuis le PdV ou `?debug=assets`).

## Test fonctionnel

Dans la POS :
1. Cliquer sur la navbar > **Cash In/Out**
2. Saisir un montant (ex: 5000) et un motif (ex: "test")
3. Tester **Confirmer** → 2 modals HTML SOPROMER s'affichent successivement (dialog Odoo) → fermer chaque modal après impression
4. Refaire un cash out 6000, motif "test2"
5. Tester **Imprimer** → 1 onglet PDF s'ouvre avec 2 pages (Copie 1/2 + Copie 2/2) → Ctrl+P
6. Tester **Annuler** → ferme le popup sans rien faire

### Vérifications attendues

- **Confirmer** : 2 modals HTML successives, dialog Odoo standard, pas de nouvel onglet navigateur, ticket SOPROMER lisible (32 chars). Cash move enregistré dans `account.bank.statement.line` avec `payment_ref = motif`.
- **Imprimer** : 1 nouvel onglet PDF, 2 pages identiques avec marqueur Copie 1/2 / Copie 2/2 en bas. Mêmes valeurs que la modal HTML (n° pièce, montant, motif, session, caissier).

## Compatibilité

- Odoo Community/Enterprise 18
- wkhtmltopdf installé côté serveur (mode Imprimer uniquement)
- Service POS `printer` natif (mode Confirmer)

## Historique de versions

- **v18.0.4.0.0** (2026-04-28) — **Comportement scindé** : Confirmer = impression directe via 2 modals HTML (mode v2 ressuscité, rapide, pas de tab navigateur). Imprimer = aperçu PDF 2 copies (mode v3.1 conservé). Composant OWL `SopromerCashMoveReceipt` restauré + nouvelle méthode `confirmAndPrint()`.
- **v18.0.3.1.0** (2026-04-28) — Aperçu unique avec 2 copies dans 1 PDF : 1 seul `window.open` (Confirmer + Imprimer = alias UX), PDF 2 pages séparées par saut de page CSS.
- **v18.0.3.0.0** (2026-04-28) — Bascule en mode PDF : QWeb côté serveur (paperformat 80mm), suppression de `SopromerCashMoveReceipt`, 2× `window.open('/report/pdf/...')` après try_cash_in_out.
- **v18.0.2.0.0** (2026-04-28) — Comportement v2 : impression systématique de 2 tickets ESC/POS sur Confirmer (+ Imprimer alias). Ajout n° de pièce comptable via override `try_cash_in_out`. "Raison" → "Motif".
- **v18.0.1.0.0** — v1 initiale : bouton Imprimer optionnel, Confirmer silencieux.

## Auteur

SOPROMER — Madagascar
License LGPL-3
