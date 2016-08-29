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
 * @package    client
 */

'use strict';

const EventEmitter = require('events').EventEmitter;
const events = require('events');
const net = require('net');
const tls = require('tls');
const PduParser = require('./pdu-parser');
const PduWriter = require('./pdu-writer');
const Protocol = require('./protocol');
const Session = require('./session').Session;
const smppUtils = require('./utils');

class Client extends EventEmitter {
    constructor(config, smppDefs) {
        super();
        this._config = config || {};
        this._smppDefs = smppDefs;
        this._socket = {};

        this._shouldReconnect = !! config.shouldReconnect;
        this._reconnectTimer = false;
        this._session = null;

        this._pduWriter = new PduWriter(this._smppDefs);
        this._pduParser = new PduParser(this._smppDefs);
    }

    reconnect() {
        let interval = 2500;
        if (this._shouldReconnect && this._reconnectTimer === false) {
            if (this._config.client_reconnect_interval !== undefined) {
                interval = parseInt(this._config.client_reconnect_interval, 10);
            }

            this._reconnectTimer = setInterval(() => {
                if (this._session) {
                    this._session.destroy();
                    this._session = null;
                }
                this.connect();
            }, interval);
        }
    }

    connect(callback) {
        if (callback) {
            this.once('bindSuccess', callback);
        }

        const onConnect = (socket) => {
            clearInterval(this._reconnectTimer);
            this._reconnectTimer = false;

            const protocol = new Protocol(socket, this._pduParser, this._pduWriter);
            this._session = new Session(protocol, this._smppDefs);
            // start _session, enters open state
            this._setupSessionListeners();
            this._session.start();
            // attempt to bind
            // TODO consider implementing client listening for incoming OUTBIND instead
            this.bind();
            if (this._config.client_keepalive && this._config.client_keepalive === true) {
                this._session.setTimeout(this._config.timeout * 1000);
                this._session.on('timeout', () => {
                    this.sendEnquireLink();
                });
            }
        };

        // try connecting to the host:port from the _config file
        if (this._config.secure) {
            const opts = this._config.tls ? this._config.tls : {};
            const socket = this._socket = tls.connect(this._config.port, this._config.host, opts, () => {
                if (socket.authorized) {
                    onConnect(socket);
                } else {
                    socket.destroy();
                }
            });
        } else {
            const socket = this._socket = net.connect(this._config.port, this._config.host, () => {
                onConnect(socket);
            });
        }

        this._socket.on('close', this._onConnectionClose.bind(this));
        this._socket.on('error', this._onSocketError.bind(this));
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

    /**
     * The return value of this method is the submit_sm's SMPP sequence number
     * it can be used by the user implementation to track responses; potential
     * use is up to the user, and it's not necessary if it doesn't matter
     * whether messages were sent without error
     *
     * @param params
     * @param optional
     * @returns {Promise}
     */
    sendMessage(params, optional) {
        const parameters = Object.assign({}, params);
        if (parameters.sm_length === undefined) {
            if (parameters.short_message !== undefined) {
                if (Buffer.isBuffer(parameters.short_message)) {
                    parameters.sm_length = parameters.short_message.length;
                } else {
                    parameters.sm_length = Buffer.byteLength(parameters.short_message);
                }
            }
        }

        const pdu = {
            command: "submit_sm",
            command_status: "ESME_ROK",
            fields: parameters,
            optional_params: Object.assign({}, optional),
        };

        return this.sendPdu(pdu);
    }

    bind() {
        let command;

        if (this._config.mode === "receiver") {
            command = "bind_receiver";
        } else if (this._config.mode === "transmitter") {
            command = "bind_transmitter";
        } else {
            command = "bind_transceiver";
        }

        const pdu = {
            command,
            command_status: "ESME_ROK",
            fields: {
                system_id: this._config.system_id,
                password: this._config.password,
                system_type: this._config.system_type,
                interface_version: 0x34,
                addr_ton: 0,
                addr_npi: 1,
                address_range: "",
            },
            optional_params: {},
        };

        this._session.sendPdu(pdu);
    }

    unbind() {
        this._shouldReconnect = false;
        const pdu = {
            command: "unbind",
            fields: {},
            optional_params: {},
        };

        this._session.sendPdu(pdu);
    }

    destroy() {
        this._shouldReconnect = false;
        clearInterval(this._reconnectTimer);
        this._session.destroy();
    }

    /**
     *
     * @param pdu
     * @returns {Promise}
     */
    sendPdu(pdu) {
        return this._session.sendPdu(pdu);
    }

    _onConnectionClose() {
        this.emit('disconnect');
        this.reconnect();
    }

    _onSocketError(err) {
        this.emit('socketError', err);
        this._socket.destroy();
    }

    _setupSessionListeners() {
        this._session.on('state BOUND_RX', () => this.emit('state BOUND_RX'));
        this._session.on('state BOUND_TX', () => this.emit('state BOUND_TX'));
        this._session.on('state BOUND_TRX', () => this.emit('state BOUND_TRX'));
        this._session.on('state CLOSED', () => this.emit('state CLOSED'));
        this._session.on('bindSuccess', (pdu) => this.emit('bindSuccess', pdu));
        this._session.on('bindFailure', (err) => this.emit('bindFailure', err));
        this._session.on('parseError', (err) => this.emit('parseError', err));
        this._session.on('error', (err) => this.emit('error', err));
        this._session.on('unbind', () => this.emit('unbind'));

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
}
module.exports = Client;
