'use strict';

const EventEmitter = require('events').EventEmitter;
const ParsingStream = require('./pdu-stream').ParsingStream;

/**
 * Convenience wrapper for connection. It expects socket that is already connected.
 *
 * Usage example:
 *
 * ```
 *     net.createConnection(opts, (socket) => {
 *         const protocol = new Protocol(socket, pduParser, pduWriter);
 *         const smppSession = new Session(protocol, smppDefs);
 *         smppSession.start();
 *     });
 *
 *     tls.connect(opts, (socket) => {
 *         if (tls.authorized === true) {
 *             const protocol = new Protocol(socket, pduParser, pduWriter);
 *             const smppSession = new Session(protocol, smppDefs);
 *             smppSession.start();
 *         } else {
 *             console.debug('Peer cert is not authorized');
 *         }
 *     }
 * ```
 */
class Protocol extends EventEmitter {
    constructor(socket, pduParser, pduWriter) {
        super();
        this._socket = socket;
        this._writer = pduWriter;
        this._parsingStream = new ParsingStream({ parseSuppressError: true }, pduParser);

        this._setupSocketListeners();
        this._setupParsingStreamListeners();

        // pause stream so it will not try to emit data before consumer is ready
        this._socket.pause();
        this._socket.pipe(this._parsingStream);
    }

    get connectionMeta() {
        return this._connectionMetadata;
    }

    /**
     *
     * @param pdu
     * @returns {boolean} Uses
     * @throws on pdu serialization error
     */
    sendPdu(pdu) {
        // invalid pdu is programmer error, do not catch exception
        const pduBuffer = this._writer.write(pdu);
        return this._socket.write(pduBuffer);
    }

    /**
     * Delayed init to give session a chance to register its listeners before piping to transform stream.
     * It is intended for parseError listeners but also might be useful in case extra 'pdu' listeners are
     * attached before session.
     */
    init() {
        this._gatherConnectionMeta();
        // resume, at this point anyone interested should already be registered
        this._socket.resume();
    }

    /**
     * Stop emitting pdu event
     *
     * Uses underlying stream pause()
     */
    pause() {
        this._parsingStream.pause();
    }

    /**
     * Resume emitting pdu event
     *
     * Uses underlying stream unpause()
     */
    unpause() {
        this._parsingStream.unpause();
    }

    end() {
        this._socket.end();
    }

    destroy() {
        this._socket.destroy();
    }

    _setupSocketListeners() {
        this._socket.on('error', err => {
            this._parsingStream.end();
            this._socket.destroy();
            this.emit('error', err);
        });
        this._socket.on('close', () => {
            this._parsingStream.end();
            this.emit('close');
        });
        this._socket.on('drain', () => this.emit('drain'));
        // on('end') is handled by pipe
    }

    _setupParsingStreamListeners() {
        this._parsingStream.on('parseError', (...args) => this.emit('parseError', ...args));
        this._parsingStream.on('end', () => this.emit('end'));
        // proxy `pdu` event to parser stream
        this.on('newListener', (event, listener) => {
            if (event !== 'pdu') {
                return;
            }
            this._parsingStream.on('data', listener);
        });
        this.on('removeListener', (event, listener) => {
            if (event !== 'pdu') {
                return;
            }
            this._parsingStream.removeListener('data', listener);
        });
    }

    _gatherConnectionMeta() {
        // TODO check if more connection metadata is needed by client, specifically for tls
        this._connectionMetadata = {
            secure: !!this._socket.encrypted,
            remoteAddress: this._socket.remoteAddress,
            remotePort: this._socket.remotePort,
            remoteFamily: this._socket.remoteFamily,
        };
        if (this._socket.secure) {
            this._connectionMetadata.peerCertificate = this._socket.getPeerCertificate();
        }
    }
}

module.exports = Protocol;
