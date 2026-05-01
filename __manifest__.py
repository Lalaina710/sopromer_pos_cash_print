# -*- coding: utf-8 -*-
# Copyright 2026 SOPROMER
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
{
    'name': 'POS Print Cash Move Ticket',
    'version': '18.0.6.1.1',
    'category': 'Point of Sale',
    'summary': 'Confirmer cash move = apercu PDF 2 copies (bouton Imprimer supprime)',
    'description': """
SOPROMER - POS Print Cash Move Ticket (v4 — Comportement scinde)
======================================================================

Changement v4 vs v3.1
---------------------
La v3.1 ouvrait systematiquement un apercu PDF (window.open) sur
Confirmer ET Imprimer, ce qui forcait le caissier a passer par un onglet
navigateur a chaque cash move (lent en flux).

La v4 scinde le comportement :
- Confirmer (natif, patche) -> impression directe via 2 modals HTML
  (this.printer.print(SopromerCashMoveReceipt) x 2). Pas de tab
  navigateur, dialog Odoo standard. Mode rapide pour le caissier en flux.
- Imprimer (nouveau bouton)  -> ouvre 1 apercu PDF (2 copies dans 1 PDF).
  Mode controle/sauvegarde, preview avant impression possible.

| Bouton          | Action                                                         |
|-----------------|----------------------------------------------------------------|
| **Annuler**     | Ferme le popup, rien (natif)                                   |
| **Confirmer**   | Valide + impression directe 2x via printer.print (modal HTML)  |
| **Imprimer**    | Valide + ouvre 1 apercu PDF (2 copies, preview navigateur)     |

Ticket SOPROMER (PDF, paperformat 80mm)
---------------------------------------
* Bandeau : SOPROMER + nom du PdV (pos.config.name)
* Type    : SORTIE / ENTREE caisse (deduit du sign de amount)
* N# Piece: account.move.name (ex: CSH2/2026/00027)
* Montant + Motif (= payment_ref)
* Tracabilite : session, date, caissier
* Zone signature

Architecture technique
----------------------
* Backend Python : models/pos_session.py — override try_cash_in_out
  retourne {line_id, piece_number, payment_ref}. Inchange depuis v2.
* Backend XML : report/report_cash_move_ticket.xml — paperformat 80mm
  + ir.actions.report qweb-pdf + template QWeb (2 copies dans 1 PDF,
  separees par un saut de page CSS). Inchange depuis v3.1, sert le
  bouton Imprimer (mode aperçu).
* Frontend OWL : static/src/js/cash_move_popup.js — patch confirm()
  (printer.print x 2 modal HTML) + nouvelle methode confirmAndPrint()
  (window.open PDF). Composant SopromerCashMoveReceipt restaure (v2).
* Frontend XML : static/src/xml/cash_move_popup.xml — bouton Imprimer
  (t-on-click="confirmAndPrint") + template SopromerCashMoveReceipt
  (32 chars largeur, classes pos-receipt).

Bloqueurs popups
----------------
Concerne uniquement le bouton "Imprimer" (mode aperçu PDF). Si le
navigateur bloque la fenetre pop-up, autoriser explicitement le domaine
Odoo (Chrome : icone barre d'URL > "Toujours autoriser les pop-up et
redirections de https://odoo.sopromer.mg"). Le bouton Confirmer n'est
pas concerne (impression via modal Odoo, pas de window.open).

Cas d'usage business
--------------------
Tracabilite physique des sorties de caisse en magasin (avances, achats
fournisseur, depenses diverses). Les 2 copies du PDF (Copie 1/2 +
Copie 2/2) permettent 1 exemplaire signe pour le coffre + 1 exemplaire
pour le caissier.
    """,
    'author': 'SOPROMER',
    'website': 'https://github.com/Lalaina710/sopromer_pos_cash_print',
    'license': 'LGPL-3',
    'depends': [
        'point_of_sale',
        'account',
    ],
    'data': [
        'report/report_cash_move_ticket.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'sopromer_pos_cash_print/static/src/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
