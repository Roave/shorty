/**
 * This file is part of Shorty.
 *
 * Shorty is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; version 3 of the License.
 *
 * Shorty is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Shorty.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @category   shorty
 * @license    http://www.gnu.org/licenses/gpl-3.0.txt GPL
 * @copyright  Copyright 2010 Evan Coury (http://www.Evan.pro/)
 * @package    models
 */

'use strict';

const events = require('events');
const EventEmitter = require('events').EventEmitter;
const ServerSession = require('./session').ServerSession;
const smppUtils = require('./utils');

/**
 * Server connection is the server side counterpart for client
 */
class ServerConnection extends EventEmitter {
    constructor(protocol, smppDefs, options) {
        this._smppDefs = smppDefs;

        this._options = options || {};
        this._protocol = protocol;
        this._session = new ServerSession(protocol, smppDefs, this._options);

        /**
         * @public
         * @type {Date}
         */
        this.connectTime = new Date();
    }

    init() {
        this._setupSessionListeners();
        this._session.start();
        this._session.setTimeout(this._config.timeout * 1000);
        this._session.on('timeout', () => {
            this.sendEnquireLink();
        });
    }

    /**
     * shortcut for deliver_sm pdu via sendPdu()
     *
     * @param params
     * @param optional
     * @returns {Promise}
     */
    deliverMessage(params, optional) {
        const pdu = {
            command: "deliver_sm",
            command_status: "ESME_ROK",
            fields: params,
            optional_params: optional,
        };

        return this.sendPdu(pdu);
    }

    unbind() {
        const pdu = {
            command: "unbind",
            command_status: "ESME_ROK",
            fields: {},
            optional_params: {},
        };

        this.sendPdu(pdu);
    }

    sendEnquireLink() {
        const pdu = {
            command: "enquire_link",
            command_status: "ESME_ROK",
            fields: {},
            optional_params: {},
        };
        this.sendPdu(pdu).then((respPdu) => {
            if (respPdu.command_status !== 'ESME_ROK') {
                // if link is not OK for whatever reason, try to unbind. Session will handle unbind timeout
                this.unbind();
            }
        }).error(() => {
            this.unbind();
        });
    }

    _handleBind(pdu) {
        if (events.listenerCount(this, 'bind') > 0) {
            this.emit('bind', this, pdu, status => this._bindAuthorization(pdu, status));
        } else {
            this._bindAuthorization(pdu, "ESME_RBINDFAIL");
        }
    }

    _bindAuthorization(pdu, status) {
        let command;

        switch (pdu.command) {
            case 'bind_receiver':
                command = "bind_receiver_resp";
                break;
            case 'bind_transmitter':
                command = "bind_transmitter_resp";
                break;
            case 'bind_transceiver':
                command = "bind_transceiver_resp";
                break;
            default:
        }

        const newPdu = {
            command,
            command_status: status,
            sequence_number: pdu.sequence_number,
            fields: {
                system_id: this._config.system_id,
            },
            optional_params: {},
        };

        this.sendPdu(newPdu);
    }

    _setupSessionListeners() {
        this._session.on('state BOUND_RX', () => this.emit('state BOUND_RX'));
        this._session.on('state BOUND_TX', () => this.emit('state BOUND_TX'));
        this._session.on('state BOUND_TRX', () => this.emit('state BOUND_TRX'));
        this._session.on('state CLOSED', () => this.emit('state CLOSED'));
        this._session.on('bindSuccess', (pdu) => this.emit('bindSuccess', pdu));
        this._session.on('bindFailure', (err, pdu) => this.emit('bindFailure', err, pdu));
        this._session.on('parseError', (err) => this.emit('parseError', err));
        this._session.on('error', (err) => this.emit('error', err));
        this._session.on('bind', this._handleBind.bind(this));

        this._session.on('pdu', (pdu) => {
            if (events.listenerCount(this, pdu.command) === 0) {
                this._handleNoHandlerForPdu(pdu);
                return;
            }
            setImmediate(() => {
                this.emit(pdu.command, pdu, (respPdu) => {
                    if (!smppUtils.isResponsePdu(this._smppDefs, respPdu)) {
                        throw new Error('Reply must be response pdu');
                    }
                    respPdu.sequence_number = pdu.sequence_number;
                    return this.sendPdu(respPdu);
                });
            });
        });
    }

    _handleNoHandlerForPdu(pdu) {
        const errorPdu = smppUtils.errorResponse(this._smppDefs, pdu, 'ESME_RSYSERR');
        this.sendPdu(errorPdu);
        this.emit('error', new Error(`No handler registered for command ${pdu.command}`));
    }


    /**
     * @param pdu
     * @returns {Promise}
     */
    sendPdu(pdu) {
        return this._session.sendPdu(pdu);
    }

    destroy() {
        this._session.destroy();
    }
}

module.exports = ServerConnection;

