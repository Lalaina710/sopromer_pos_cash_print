/** @odoo-module **/
/*
 * Copyright 2026 SOPROMER
 * License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
 *
 * v4 : Comportement scinde (mode hybride v2 + v3.1)
 * ==================================================
 * - "Annuler"   : ferme le popup (natif inchange)
 * - "Confirmer" : valide + impression directe via 2 modals HTML
 *                 (this.printer.print(SopromerCashMoveReceipt) x 2)
 *                 -> rapide, pas d'aperçu navigateur, dialog Odoo standard
 * - "Imprimer"  : valide + ouvre 1 onglet aperçu PDF (2 copies dans 1 PDF)
 *                 -> preview avant impression, save PDF possible
 *
 * Justification : le caissier en flux veut le mode rapide (Confirmer
 * = ticket immediat sans tab navigateur). Le mode PDF aperçu est
 * reserve a l'usage controle/sauvegarde via le bouton "Imprimer".
 *
 * Composant patche : @point_of_sale/app/navbar/cash_move_popup/cash_move_popup
 */

import { _t } from "@web/core/l10n/translation";
import { parseFloat } from "@web/views/fields/parsers";
import { patch } from "@web/core/utils/patch";
import { Component } from "@odoo/owl";
import { CashMovePopup } from "@point_of_sale/app/navbar/cash_move_popup/cash_move_popup";

// XMLID complet du ir.actions.report defini dans report/report_cash_move_ticket.xml
// URL Odoo /report/pdf utilise le `report_name` du template QWeb,
// pas le XMLID de l'action ir.actions.report.
const REPORT_XMLID = "sopromer_pos_cash_print.report_cash_move_ticket_doc";

/**
 * Composant OWL minimal pour rendre le ticket SOPROMER dans la modal
 * d'impression POS (this.printer.print). Le rendu est piloté par le
 * template QWeb `sopromer_pos_cash_print.SopromerCashMoveReceipt` defini
 * dans static/src/xml/cash_move_popup.xml.
 */
export class SopromerCashMoveReceipt extends Component {
    static template = "sopromer_pos_cash_print.SopromerCashMoveReceipt";
    static props = {
        companyName: String,
        posName: String,
        translatedType: String,
        formattedAmount: String,
        reason: String,
        sessionName: String,
        date: String,
        cashier: String,
        pieceNumber: String,
    };
}

patch(CashMovePopup.prototype, {
    /**
     * Bouton "Confirmer" natif (override) : enregistre le cash move
     * puis imprime 2 tickets via le service POS printer (modal HTML).
     * Pas d'aperçu navigateur, dialog Odoo standard.
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

        // Backend : creation cash move + retour {line_id, piece_number, payment_ref}
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

        // Mode v2 : impression directe via 2 modals HTML SOPROMER
        const ticketProps = this._buildSopromerReceiptProps({
            type,
            translatedType,
            formattedAmount,
            reason,
            pieceNumber: (result && result.piece_number) || "",
        });
        try {
            await this.printer.print(SopromerCashMoveReceipt, ticketProps);
            await this.printer.print(SopromerCashMoveReceipt, ticketProps);
        } catch (err) {
            this.notification.add(
                _t("Erreur impression ticket : %s", err && err.message ? err.message : err),
                5000
            );
        }

        this.props.close();
        this.notification.add(
            _t("Cash %s valide : %s. 2 tickets imprimes.", type, formattedAmount),
            3000
        );
    },

    /**
     * Bouton "Imprimer" (nouveau) : enregistre le cash move puis
     * ouvre 1 onglet aperçu PDF contenant 2 copies. Preview avant
     * impression via Ctrl+P du navigateur.
     */
    async confirmAndPrint() {
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

        // Mode v3.1 : aperçu PDF (1 onglet, 2 copies dans le meme PDF)
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

    /**
     * Construit les props passees au composant OWL SopromerCashMoveReceipt.
     * Centralise le formatage date/session/caissier pour eviter la
     * duplication entre confirm() et confirmAndPrint().
     */
    _buildSopromerReceiptProps(ctx) {
        const session = this.pos.session || {};
        const config = this.pos.config || {};
        const company = (this.pos.company && this.pos.company.name) || "SOPROMER";
        const cashier =
            (this.pos.get_cashier && this.pos.get_cashier() && this.pos.get_cashier().name) ||
            (this.pos.user && this.pos.user.name) ||
            "";
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        // Libelle FR du type (ENTREE/SORTIE) base sur le sign physique
        const typeLabel = ctx.type === "in" ? _t("ENTREE caisse") : _t("SORTIE caisse");

        return {
            companyName: company,
            posName: config.name || "",
            translatedType: typeLabel,
            formattedAmount: ctx.formattedAmount,
            reason: ctx.reason || "",
            sessionName: session.name || "",
            date: dateStr,
            cashier: cashier,
            pieceNumber: ctx.pieceNumber || "",
        };
    },
});
