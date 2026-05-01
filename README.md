# SOPROMER - POS Print Cash Move Ticket (v5 — Confirmer = aperçu PDF unique)

Module Odoo 18 imprimant 2 tickets de cash in/out sur le Point de Vente. **La v5 supprime le bouton Imprimer séparé** : tout le flow d'impression PDF apercu est intégré dans le bouton Confirmer natif.

## Comportement v5

| Bouton | Action | Cas d'usage |
|---|---|---|
| **Annuler** | Ferme le popup sans rien faire (natif) | Abandon de saisie |
| **Confirmer** | Enregistre le cash move + ouvre **1 onglet aperçu PDF** (2 copies dans 1 PDF) | Validation + impression contrôlée via Ctrl+P |

## Pourquoi v5 vs v4 ?

La v4 avait 2 boutons (`Confirmer` impression directe modal HTML, `Imprimer` aperçu PDF). En production SOPROMER, certains caissiers cliquaient **les deux** → 4 tickets imprimés (2 modal + 2 PDF). UX confuse.

La v5 unifie : un seul flow Confirmer → 1 PDF avec 2 copies. Plus de redondance, plus d'erreurs.

## Format du ticket (PDF QWeb, paperformat 80mm)

PDF avec **2 pages** identiques (Copie 1/2 + Copie 2/2), séparées par un saut de page CSS. Ouvert dans un nouvel onglet via `window.open('/report/pdf/sopromer_pos_cash_print.report_cash_move_ticket_doc/<line_id>', '_blank')`. Le caissier appuie sur Ctrl+P pour imprimer ou Ctrl+S pour sauvegarder.

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
├── __manifest__.py            # v18.0.5.0.0
├── README.md
├── .gitignore
├── models/
│   ├── __init__.py
│   └── pos_session.py         # override try_cash_in_out -> {line_id, piece_number, payment_ref}
├── report/
│   ├── __init__.py
│   └── report_cash_move_ticket.xml   # paperformat 80mm + ir.actions.report + QWeb (2 copies)
└── static/
    └── src/
        ├── js/
        │   └── cash_move_popup.js   # patch confirm() — window.open PDF
        └── xml/
            └── cash_move_popup.xml  # placeholder, plus de bouton ajouté
```

### Backend Python : `models/pos_session.py` (inchangé)
Hérite `pos.session`, override `try_cash_in_out(_type, amount, reason, extras)` : appelle `super()` puis recherche la dernière `account.bank.statement.line` créée pour la session, retourne `{line_id, piece_number, payment_ref}`.

### Backend XML : `report/report_cash_move_ticket.xml` (inchangé)
Paperformat 80mm × 200mm, `ir.actions.report` qweb-pdf, 2 blocs ticket séparés par `<p style="page-break-before: always;"/>`.

### Frontend OWL : `static/src/js/cash_move_popup.js` (v5)
- Override `confirm()` : appel `try_cash_in_out` puis `window.open('/report/pdf/...')` avec line_id retourné
- Suppression méthode `confirmAndPrint()` et composant OWL `SopromerCashMoveReceipt` (plus utilisés)

### Frontend XML : `static/src/xml/cash_move_popup.xml` (v5)
Plus de xpath ajoutant le bouton Imprimer. Fichier conservé pour compatibilité asset bundle mais ne contient que le placeholder XML.

## Bloqueurs popups

Si le navigateur bloque l'aperçu PDF :

> **Chrome/Edge** : icône "pop-up bloqué" dans la barre d'URL → *Toujours autoriser les pop-up et redirections de https://odoo.sopromer.mg* → recharger la POS.

## Installation / Mise à jour

```bash
# Copier le dossier sur le serveur (overwrite via tar+stream)
cd /c/odoo18/custom-addons
tar --exclude='__pycache__' --exclude='.git' -czf - sopromer_pos_cash_print | \
  ssh odoo@192.73.0.45 "cd /opt/odoo18/custom_addons/dev && tar xzf -"

# Mettre a jour le module (recharge schema + assets + report)
docker exec odoo-dev /opt/odoo/odoo-bin -c /etc/odoo/odoo.conf \
    -d <BASE> -u sopromer_pos_cash_print --stop-after-init --no-http

# Restart pour recharger les assets POS
docker restart odoo-dev
```

Recharger la POS (Ctrl+F5 ou clic *Reload* depuis le PdV).

## Test fonctionnel

Dans la POS :
1. Cliquer sur la navbar > **Cash In/Out**
2. Saisir un montant (ex: 5000) et un motif (ex: "test")
3. Cliquer **Confirmer** → 1 onglet PDF s'ouvre avec 2 pages (Copie 1/2 + Copie 2/2) → Ctrl+P pour imprimer
4. Vérifier que **seuls 2 boutons sont visibles** : Annuler + Confirmer

### Vérifications attendues

- 1 nouvel onglet PDF, 2 pages identiques avec marqueur Copie 1/2 / Copie 2/2 en bas
- Cash move enregistré dans `account.bank.statement.line` avec `payment_ref = motif`
- Pas de modal HTML (mode v4 supprimé)
- Pas de bouton "Imprimer" séparé

## Compatibilité

- Odoo Community/Enterprise 18
- wkhtmltopdf installé côté serveur

## Historique de versions

- **v18.0.6.1.1** (2026-05-01) — Fix syntaxe XML t-if avec parenthèses + `and` Python (compat OWL templating Odoo 18). Expression : `(pos.user._role || (pos.user.raw and pos.user.raw.role)) === 'manager'`.
- **v18.0.6.1.0** (2026-05-01) — Fallback `pos.user.raw.role` quand `pos.user._role` undefined (timing init popup). Cohérent avec `sopromer_pos_balance_lock` v18.0.1.1.2. Évite que les admins voient le bouton Cash In caché si `_role` n'est pas posé au moment du rendu.
- **v18.0.6.0.0** (2026-04-30) — **Cash In caché aux caissiers** : seuls les managers POS voient le bouton Cash In. Caissiers voient uniquement Cash Out (default state.type='out'). Détection via `pos.user._role === 'manager'` côté OWL.
- **v18.0.5.0.0** (2026-04-30) — **Bouton Imprimer supprimé**, logique PDF aperçu intégrée dans Confirmer. Suppression composant OWL `SopromerCashMoveReceipt` et méthode `confirmAndPrint()`. UX simplifiée pour éviter erreurs caissiers (double impression).
- **v18.0.4.0.0** (2026-04-28) — Comportement scindé : Confirmer = impression directe via 2 modals HTML, Imprimer = aperçu PDF 2 copies. Composant OWL `SopromerCashMoveReceipt` restauré.
- **v18.0.3.1.0** (2026-04-28) — Aperçu unique avec 2 copies dans 1 PDF.
- **v18.0.3.0.0** (2026-04-28) — Bascule en mode PDF QWeb côté serveur (paperformat 80mm).
- **v18.0.2.0.0** (2026-04-28) — Comportement v2 : impression systématique de 2 tickets ESC/POS sur Confirmer.
- **v18.0.1.0.0** — v1 initiale : bouton Imprimer optionnel.

## Déploiement

| Environnement | Serveur | DB cible | Statut |
|---------------|---------|----------|--------|
| TEST | `192.73.0.45` | `SOPROMER-REST2904` | ✅ installé v18.0.5.0.0 |
| PROD | `192.73.0.43` | `SOPROMER` | ✅ installé v18.0.5.0.0 (2026-04-30) |

## Auteur

SOPROMER — Madagascar
License LGPL-3
