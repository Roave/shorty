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
 * @package    server
 */
'use strict';

const Transform = require('stream').Transform;

/**
 * Transform stream operating in object mode
 * Accepts stream of binary PDUs and transforms them into object representation
 */
class ParsingStream extends Transform {
    constructor(options, pduParser) {
        options.readableObjectMode = true;
        super(options);
        this.parseSuppressError = !!options.parseSuppressError;
        this._partial = false;
        this._pduParser = pduParser;
    }

    _transform(chunk, encoding, callback) {
        let buffer = chunk;
        if (Buffer.isBuffer(buffer)) {
            buffer = Buffer.from(buffer, 'binary');
        }
        if (buffer.length < 1) {
            // noop on empty buffer
            return;
        }
        if (this._partial !== false) {
            // combine
            buffer = Buffer.concat([this._partial, buffer]);
        }

        let bufferPosition = 0;
        // Copied from original code.
        // Minimum possible pdu size is 16 so it makes sense to wait for more data before attempting to handle it
        while (bufferPosition <= (buffer.length - 16)) {
            // Read the PDU length from the PDU
            const pduLength = buffer.readUInt32BE(bufferPosition);

            /**
             * Here, we're going to break if trying to read the full PDU from the
             * buffer would cause us to run off the end of the buffer (indicating
             * that the entire PDU was not sent in one TCP segment or whatever
             * causes node socket data events to fire)
             */
            if (((bufferPosition + pduLength) > buffer.length) && (bufferPosition <= buffer.length)) {
                break;
            }

            const pduBuffer = buffer.slice(bufferPosition, bufferPosition + pduLength);
            try {
                this.push(this._pduParser.parse(pduBuffer));
            } catch (err) {
                this.emit('parseError', err, pduBuffer);
                if (!this.parseSuppressError) {
                    this.emit('error', err);
                }
            }

            // Increment the buffer position
            bufferPosition += (pduLength);
        }

        if (buffer.length > bufferPosition) {
            // there was a partial PDU
            this._partial = buffer.slice(bufferPosition, buffer.length);
        } else {
            this._partial = false;
        }
        callback();
    }

    // TODO implement _flush to warn about unprocessed partial buffer?

}
exports.ParsingStream = ParsingStream;

/**
 * Transform stream operating in object mode
 * Accepts PDU objects and transforms them to binary representation
 */
class SerializingStream extends Transform {
    constructor(options, pduWriter) {
        options.writableObjectMode = true;
        super(options);
        this._pduWriter = pduWriter;
    }

    /**
     *
     * @param {Object} object representing smpp pdu
     * @param encoding not applicable
     * @param callback
     * @private
     */
    _transform(pdu, encoding, callback) {
        try {
            const pduBuffer = this._pduWriter.write(pdu);
            callback(null, pduBuffer);
        } catch (err) {
            callback(err);
        }
    }

}
exports.SerializingStream = SerializingStream;


