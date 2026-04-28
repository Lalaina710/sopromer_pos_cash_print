# -*- coding: utf-8 -*-
# Copyright 2026 SOPROMER
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""
Override de pos.session.try_cash_in_out

Le natif Odoo 18 valide le mouvement de caisse (creation d'une
account.bank.statement.line + son account.move associe) mais ne retourne
rien au frontend. Or, pour imprimer le ticket SOPROMER avec le n# de piece
comptable (move_id.name, format `CSH2/YYYY/00xxx`), le JS a besoin de cette
info juste apres l'appel.

On override en appelant super() puis en recherchant la derniere ligne
creee pour la session courante. On retourne un dict serialisable JSON.
"""

from odoo import models


class PosSession(models.Model):
    _inherit = "pos.session"

    def try_cash_in_out(self, _type, amount, reason, extras):
        """Apres le natif, retourne {line_id, piece_number, payment_ref}.

        :param str _type: 'in' ou 'out'
        :param float amount: montant signe selon le type
        :param str reason: motif libre saisi par le caissier
        :param dict extras: extras transmis par le frontend
            (translatedType, formattedAmount)
        :return: dict serialisable JSON contenant le n# piece ou None
        """
        # Le natif ne retourne rien dans Odoo 18 — on ignore son retour.
        super().try_cash_in_out(_type, amount, reason, extras)

        # Derniere ligne de releve creee pour cette/ces session(s).
        # Sur Odoo 18 la methode est appelee sur un singleton (self.ensure_one
        # implicite via le RPC), mais on reste robuste avec self.ids.
        line = self.env["account.bank.statement.line"].search(
            [("pos_session_id", "in", self.ids)],
            order="id desc",
            limit=1,
        )
        if not line:
            return {
                "line_id": False,
                "piece_number": "",
                "payment_ref": "",
            }
        return {
            "line_id": line.id,
            "piece_number": line.move_id.name or "",
            "payment_ref": line.payment_ref or "",
        }
