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
 * @package    shorty
 */
'use strict';

const EventEmitter = require('events').EventEmitter;
const uuid = require('uuid');
const timers = require('timers');
const sessionStates = require('./smpp-definitions').sessionStates;
const smppUtils = require('./utils');
const states = require('./session/state');

/**
 * Events:
 *
 *   - `state OPEN` Session has started
 *     - `isServer` {boolean} If server or client session. Affects bind direction and who initiates binding process
 *   - `state BOUND_RX` Session is bound as receiver, direction depends on isServer
 *     - `isServer`
 *   - `state BOUND_RX` Session is bound as receiver, direction depends on isServer
 *     - `isServer`
 *   - `state BOUND_TX` Session is bound as transmitter, direction depends on isServer
 *     - `isServer`
 *   - `state BOUND_TRX` Session is bound as transmitter, direction depends on isServer
 *     - `isServer`
 *   - `state CLOSED` Session is closed
 *   - `bind` Emitted for incoming bind attempts. Normally can only happen in server session
 *      - `bindPdu`
 *      - `connectionMeta`
 *   - `outbind` Emitted for incoming outbind request. Response is to issue bind or close connection
 *      - `outbindPdu`
 *      - `connectionMeta`
 *   - `bindSuccess` On successful bind attempt, issued before bound state events
 *   - `bindFailure` On failed bind attempt, issued before closed state event
 *     - `bindPdu` {pdu} bind pdu sent if client or received if server
 *     - `bindResponsePdu` {pdu} response pdu or null
 *     - `isServer`
 *
 * @class
 * @param protocol
 * @param smppDefs
 */
class Session extends EventEmitter {
    constructor(protocol, smppDefs, options) {
        super();
        this._options = options || {};
        this._timeout = this._options.timeout ? this._options.timeout : 0;
        this._isServer = false;
        this._id = uuid.v4();
        this._protocol = protocol;
        this._smppDefs = smppDefs;

        this._context = {
            session: this,
            sessionState: null,
            setSessionState: (newState) => {
                // TODO add check if state is valid?
                if (newState === this._context.sessionState) {
                    return;
                }
                this._context.sessionState = newState;
                this.emit(`state ${newState}`, this._isServer);
            },
            sequenceNumber: 0,
            nextSequenceNumber: () => ++this._context.sequenceNumber,
            pendingResponse: new Map(),
            pendingReply: new Map(),
        };

        this._state = new (states.get('stateUninitialized'))(this._context);
    }


    /**
     * @private
     * @param newState
     */
    transitionStateHandler(newState) {
        if (!states.has(newState)) {
            throw new Error(`State ${newState} is not defined`);
        }
        this._state.onLeave();
        this._state = new (states.get(newState))(this._context);
        this._state.onEnter();
    }

    /**
     * Session identificator for logging purposes
     *
     * @returns {string}
     */
    get id() {
        return this._id;
    }

    /**
     * Session state
     *
     * @returns {string|null} Session state or null if session was not started
     */
    get state() {
        return this._context.sessionState;
    }

    /**
     *
     * @returns {Protocol}
     */
    get protocol() {
        return this._protocol;
    }

    /**
     * Is server or client session
     *
     * @returns {boolean}
     */
    get isServer() {
        return this._isServer;
    }

    get smppDefs() {
        return this._smppDefs;
    }

    start() {
        if (this.state !== null) {
            throw new Error('Session can only start once');
        }

        this._protocol.on('parseError', this._onParseError.bind(this));
        this._protocol.on('pdu', (pdu) => setImmediate(this._handleIncomingPdu.bind(this, pdu)));
        this._protocol.on('error', this.destroy.bind(this));

        const state = this._isServer ? 'stateServerOpen' : 'stateClientOpen';
        this.transitionStateHandler(state);
        this._protocol.init();

        this.setTimeout(this._timeout);
        this.on('state CLOSED', () => {
            // cleanup timeout timer when session is closed
            this.setTimeout(0);
            this.removeAllListeners('timeout');
        });
    }

    setTimeout(msecs, callback) {
        this._timeout = msecs;
        if (msecs === 0) {
            timers.unenroll(this);
            if (callback) {
                this.removeListener('timeout', callback);
            }
        } else {
            timers.enroll(this, msecs);
            timers.active(this);
            if (callback) {
                this.once('timeout', callback);
            }
        }
    }

    /**
     * Enrolled timeout handler
     * @private
     */
    _onTimeout() {
        this.emit('timeout');
    }

    /**
     *
     * @param session
     * @param pdu
     * @returns {Promise}
     */
    sendPdu(pdu) {
        // TODO validate pdu
        if (!this._state.canSendPdu(pdu)) {
            return Promise.reject(
                new Error(`Command ${pdu.command} can not be sent with smpp session state ${this.state}`)
            );
        }

        if (smppUtils.isResponsePdu(this.smppDefs, pdu.command)) {
            return this._state.sendResp(pdu);
        }
        return this._state.sendCommand(pdu);
    }

    _handleIncomingPdu(pdu) {
        // reset session timeout timer
        timers.active(this);
        // response is always allowed. It is either response to previously allowed command
        // or there is no matching command and as such it is noop
        if (smppUtils.isResponsePdu(this.smppDefs, pdu.command)) {
            this._state.handleIncomingResp(pdu);
            return;
        }

        if (!this._state.canReceivePdu(pdu)) {
            this._state.sendInvalidStateRespFor(pdu);
            return;
        }

        this._state.handleIncomingCommand(pdu);
    }

    /**
     * Attempts to unbind bound session first then closes connection and terminates session
     * Session will wait up to timeout for pending responses before closing
     *
     * @param closeListener will be added as a listener for the `state CLOSED` event once or
     *      invoked immediately if session is already closed
     */
    close(closeListener) {
        if (this.state === sessionStates.CLOSED) {
            closeListener();
            return;
        }
        this.once('state CLOSED', closeListener);
        this._state.close();
    }

    /**
     * Immediately kills connection and closes session
     */
    destroy() {
        this._state.destroy();
        this.protocol.destroy();
    }

    _onParseError(err) {
        const nackPdu = {
            command: 'generic_nack',
            sequence_number: null,
            command_status: 'ESME_RUNKNOWNERR',
        };
        if (err.pduSequenceNumber) {
            nackPdu.sequence_number = err.pduSequenceNumber;
        }
        if (err.pduErrorStatus) {
            nackPdu.command_status = err.pduErrorStatus;
        }
        this.sendPdu(nackPdu);
        // TODO implement better error handling in parser to allow proper parse error handling
        this.emit('parseError', err);
    }

}
module.exports.Session = Session;

class ServerSession extends Session {
    constructor(...args) {
        super(...args);
        this._isServer = true;
    }
}
module.exports.ServerSession = ServerSession;
