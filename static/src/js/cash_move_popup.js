/** @odoo-module **/
/*
 * Copyright 2026 SOPROMER
 * License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
 *
 * v5 : Bouton "Imprimer" supprime — PDF apercu integre dans "Confirmer"
 * =====================================================================
 * - "Annuler"   : ferme le popup (natif inchange)
 * - "Confirmer" : valide + ouvre 1 onglet apercu PDF (2 copies dans 1 PDF)
 *
 * Composant patche : @point_of_sale/app/navbar/cash_move_popup/cash_move_popup
 */

import { _t } from "@web/core/l10n/translation";
import { parseFloat } from "@web/views/fields/parsers";
import { patch } from "@web/core/utils/patch";
import { CashMovePopup } from "@point_of_sale/app/navbar/cash_move_popup/cash_move_popup";

const REPORT_XMLID = "sopromer_pos_cash_print.report_cash_move_ticket_doc";

patch(CashMovePopup.prototype, {
    /**
     * Bouton "Confirmer" natif (override) : enregistre le cash move
     * puis ouvre 1 onglet apercu PDF contenant 2 copies. Preview avant
     * impression via Ctrl+P du navigateur.
     */
    async confirm() {
        const amount = parseFloat(this.state.amount);
        const formattedAmount = this.env.utils.formatCurrency(amount);
        if (!amount) {
            this.notification.add(_t("Cash in/out of %s is ignored.", formattedAmount));
            return this.props.close();
        }

        const type = this.state.type;
        const translatedType = _t(type);
        const extras = { formattedAmount, translatedType };
        const reason = this.state.reason.trim();

        const result = await this.pos.data.call(
            "pos.session",
            "try_cash_in_out",
            this._prepare_try_cash_in_out_payload(type, amount, reason, extras),
            {},
            true
        );

        await this.pos.logEmployeeMessage(
            `${_t("Cash")} ${translatedType} - ${_t("Amount")}: ${formattedAmount}`,
            "CASH_DRAWER_ACTION"
        );

        const lineId = result && result.line_id;
        if (lineId) {
            const pdfUrl = `/report/pdf/${REPORT_XMLID}/${lineId}`;
            window.open(pdfUrl, "_blank");
        } else {
            this.notification.add(
                _t("Cash move enregistre mais ticket PDF indisponible (id ligne manquant)."),
                5000
            );
        }

        this.props.close();
        this.notification.add(
            _t(
                "Cash %s valide : %s. Apercu PDF ouvert (2 copies).",
                type,
                formattedAmount
            ),
            3000
        );
    },
});
