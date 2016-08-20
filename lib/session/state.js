'use strict';

const sessionStates = require('../smpp-definitions').sessionStates;
const smppUtils = require('../utils');

// TODO adjust value
// 5 minutes is probably way too high
const PDU_RESP_WAIT_TIMEOUT = 300 * 1000;
const states = new Map;

module.exports = exports = states;

class StateHandler {
    constructor(context) {
        this._context = context;
        this._session = context.session;
        this._smppDefs = this._session.smppDefs;
    }

    /**
     *
     * @param pdu
     * @returns {Promise}
     */
    sendCommand(pdu) {
        const seqNum = this._context.nextSequenceNumber();
        return new Promise((resolve, reject) => {
            pdu.sequence_number = seqNum;
            const resend = setTimeout(() => {
                if (!this._context.pendingResponse.has(seqNum)) {
                    return;
                }
                this._context.pendingResponse.get(pdu.sequence_number).callback(
                    new Error('Timeout while waiting for pdu response')
                );
            }, PDU_RESP_WAIT_TIMEOUT);
            const callback = (err, respPdu) => {
                clearTimeout(resend);
                this._context.pendingResponse.delete(pdu.sequence_number);
                if (err) {
                    reject(err);
                }
                resolve(respPdu);
            };
            this._context.pendingResponse.set(pdu.sequence_number, { pdu, callback });
            this._session.protocol.sendPdu(pdu);
        });
    }

    /**
     *
     * @param pdu
     * @returns {Promise}
     */
    sendResp(pdu) {
        // TODO assert response is an appropriate type for the command
        this._session.protocol.sendPdu(pdu);
        return Promise.resolve();
    }

    canSendPdu(pdu) {
        return smppUtils.isPduAllowedForSessionState(
            this._smppDefs,
            pdu.command,
            this._session.state,
            this._session.isServer
        );
    }

    handleIncomingCommand(pdu) {
        // TODO handle processing timeouts
        this._session.emit('pdu', pdu);
    }

    handleIncomingResp(pdu) {
        if (!this._context.pendingResponse.has(pdu.sequence_number)) {
            // noop if we do not have command waiting for response
            return;
        }
        this._context.pendingResponse.get(pdu.sequence_number).callback(null, pdu);
    }

    canReceivePdu(pdu) {
        // invert isServer since we are checking for the opposite
        return smppUtils.isPduAllowedForSessionState(
            this._smppDefs,
            pdu.command,
            this._session.state,
            !this._session.isServer
        );
    }

    sendInvalidStateRespFor(pdu) {
        let commandId = this._smppDefs.commands[pdu.command];
        commandId = (commandId | 0x80000000) >>> 0;
        const reply = {
            command: 'generic_nack',
            command_status: 'ESME_RINVBNDSTS',
            sequence_number: pdu.sequence_number,
            fields: {},
            optional_params: {},
        };
        if (this._smppDefs.command_ids[commandId]) {
            reply.command = this._smppDefs.command_ids[commandId];
        }
        this.sendResp(reply);
    }

    close() {
        this._session.transitionStateHandler('stateClosed');
    }

    destroy() {
        this._session.transitionStateHandler('stateClosed');
    }

    onEnter(/* _session */) {
        // noop
    }

    onLeave(/* _session */) {
        // noop
    }
}

class StateUninitialized extends StateHandler {
    sendCommand() {
        throw Error('Session is not initialized');
    }

    sendResp() {
        throw Error('Session is not initialized');
    }

    handleIncomingCommand() {
        throw Error('Session is not initialized');
    }

    handleIncomingResp() {
        throw Error('Session is not initialized');
    }

    sendInvalidStateRespFor() {
        // noop
    }

    canSendPdu() {
        return false;
    }

    canReceivePdu() {
        return false;
    }
}

/**
 * @private
 */
class StateClientOpen extends StateHandler {
    sendCommand(pdu) {
        const promise = super.sendCommand(pdu);
        switch (pdu.command) {
            case 'bind_receiver':
            case 'bind_transceiver':
            case 'bind_transmitter':
                promise
                    .then(this.handleBindResp.bind(this))
                    .catch((err) => {
                        this._session.emit('bindFailure', err);
                        this._session.transitionStateHandler('stateClosed');
                    });
                break;
            default:
        }
        return promise;
    }

    handleBindResp(pdu) {
        // If the bind was successful (no error code)
        if (pdu.command_status === 'ESME_ROK') {
            // determine the bind type
            let bindState = null;
            switch (pdu.command) {
                case 'bind_receiver_resp':
                    bindState = 'stateBoundRx';
                    break;
                case 'bind_transmitter_resp':
                    bindState = 'stateBoundTx';
                    break;
                case 'bind_transceiver_resp':
                    bindState = 'stateBoundTrx';
                    break;
                default:
                    this._session.emit('bindFailure', new Error('Unknown bind type'));
                    this._session.transitionStateHandler('stateClosed');
                    return;
            }
            this._session.emit('bindSuccess', pdu);
            this._session.transitionStateHandler(bindState);
            return;
        }

        // TODO add status code name to error message
        this._session.emit('bindFailure',
            new Error(`Bind rejected with status code ${pdu.command_status}`),
            pdu
        );
        this._session.transitionStateHandler('stateClosed');
    }

    handleIncomingPdu(pdu) {
        // session is not yet bound, just close it
        if (pdu.command === 'unbind') {
            this._session.transitionStateHandler('stateClosed');
            return;
        }
        super.handleIncomingPdu(pdu);
    }

    onEnter() {
        this._context.setSessionState(sessionStates.OPEN);
    }
}

/**
 * @private
 */
class StateServerOpen extends StateHandler {
    sendResp(pdu) {
        const promise = super.sendCommand(pdu);
        switch (pdu.command) {
            case 'bind_receiver_resp':
            case 'bind_transceiver_resp':
            case 'bind_transmitter_resp':
                this.handleBindResp(pdu);
                break;
            default:
        }
        return promise;
    }

    handleBindResp(pdu) {
        // If the bind was successful (no error code)
        if (pdu.command_status === 'ESME_ROK') {
            // determine the bind type
            let bindState = null;
            switch (pdu.command) {
                case 'bind_receiver_resp':
                    bindState = 'stateBoundRx';
                    break;
                case 'bind_transmitter_resp':
                    bindState = 'stateBoundTx';
                    break;
                case 'bind_transceiver_resp':
                    bindState = 'stateBoundTrx';
                    break;
                default:
                    this._session.emit('bindFailure', new Error('Unknown bind type'));
                    this._session.transitionStateHandler('stateClosed');
                    return;
            }
            this._session.emit('bindSuccess', pdu);
            this._session.transitionStateHandler(bindState);
            return;
        }

        // TODO add status code name to error message
        this._session.emit('bindFailure',
            new Error(`Bind rejected with status code ${pdu.command_status}`),
            pdu
        );
        this._session.transitionStateHandler('stateClosed');
    }

    handleIncomingPdu(pdu) {
        switch (pdu.command) {
            case 'bind_receiver':
            case 'bind_transceiver':
            case 'bind_transmitter':
                if (this._bindTimeout) {
                    // if there is pending bind
                    this._state.sendInvalidStateRespFor(pdu);
                    return;
                }
                // 10 seconds is more than enough
                this._bindTimeout = setTimeout(() => {
                    this._session.transitionStateHandler('stateClosed');
                }, 10000);
                this._session.emit('bind', pdu);
                break;
            default:
        }
        // session is not yet bound, just close it
        if (pdu.command === 'unbind') {
            this._session.transitionStateHandler('stateClosed');
            return;
        }
        super.handleIncomingPdu(pdu);
    }

    onEnter() {
        this._context.setSessionState(sessionStates.OPEN);
    }

    onExit() {
        if (this._bindtimeout) {
            clearTimeout(this._bindTimeout);
        }
    }
}

/**
 * @private
 * @param {Session} session
 * @param {string} bindType
 */
class StateBound extends StateHandler {
    sendCommand(pdu) {
        const promise = super.sendCommand(pdu);
        switch (pdu.command) {
            case 'unbind':
                promise
                    .then(() => this._session.transitionStateHandler('stateClosed'))
                    .catch(() => {
                        // on timeout
                        this._session.transitionStateHandler('stateClosed');
                    });
                break;
            default:
        }
        return promise;
    }

    sendResp(pdu) {
        const promise = super.sendCommand(pdu);
        if (pdu.command === 'unbind_resp') {
            promise.then(() => this._session.transitionStateHandler('stateClosed'));
        }
        return promise;
    }

    handleIncomingPdu(pdu) {
        if (pdu.command === 'unbind') {
            this._session.sendPdu({
                command: "unbind_resp",
                command_status: "ESME_ROK",
                sequence_number: pdu.sequence_number,
                fields: {},
            });
            return;
        }
        super.handleIncomingPdu(pdu);
    }
}

class StateBoundRx extends StateBound {
    onEnter() {
        this._context.setSessionState(sessionStates.BOUND_RX);
    }
}

class StateBoundTx extends StateBound {
    onEnter() {
        this._context.setSessionState(sessionStates.BOUND_TX);
    }
}

class StateBoundTrx extends StateBound {
    onEnter() {
        this._context.setSessionState(sessionStates.BOUND_TRX);
    }
}

/**
 * @private
 * @param {Session} session
 * @param {string} bindType
 */
class StateClosed extends StateHandler {
    onEnter() {
        this._context.setSessionState(sessionStates.CLOSED);
        this._session.protocol.end();
        setImmediate(() => {
            this._context.pendingResponse.forEach((entry) => {
                entry.callback(new Error('Session closed before response is received'));
            });
            this._session.protocol.destroy();
        });
    }

    sendCommand() {
        return Promise.reject(new Error('Session is closed'));
    }

    sendResp() {
        return Promise.reject(new Error('Session is closed'));
    }

    handleIncomingCommand() {
        // noop
    }

    sendInvalidStateRespFor() {
        // noop
    }
}

exports.set('stateUninitialized', StateUninitialized);
exports.set('stateClientOpen', StateClientOpen);
exports.set('stateServerOpen', StateServerOpen);
exports.set('stateBoundRx', StateBoundRx);
exports.set('stateBoundTx', StateBoundTx);
exports.set('stateBoundTrx', StateBoundTrx);
exports.set('stateClosed', StateClosed);
