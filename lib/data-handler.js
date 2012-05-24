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

var parser = require('./pdu-parser'),
    smpp;

exports.setSmppDefinitions = function(defs) {
    smpp = defs;
    parser.setSmppDefinitions(defs);
};

exports.fromBuffer = function(pduBuffer, splitBuffer) {
    var pdus = [], tempPduBuffer, bufferPosition, length, pdu, splitPacketBuffer;

    // If splitBuffer is not empty, then last time this method was called, there
    // was a PDU that hadn't been fully sent, so we need to prepend that data
    // before we start trying to parse anything.
    if (splitBuffer instanceof Buffer && splitBuffer.length > 0) {
        tempPduBuffer = new Buffer(pduBuffer.length);
        pduBuffer.copy(tempPduBuffer, 0, 0);

        pduBuffer = new Buffer(tempPduBuffer.length + splitBuffer.length);
        splitBuffer.copy(pduBuffer, 0, 0);
        tempPduBuffer.copy(pduBuffer, splitBuffer.length, 0);
    }

    // we should not receive a PDU that is less than 16 bytes. if we do, there's
    // something wrong
    if (pduBuffer.length < 16) {
        throw "not enough data";
    }

    bufferPosition = 0;

    // While there are still potential SMPP PDUs inside the buffer
    while (bufferPosition <= (pduBuffer.length - 16)) {

        // Read the PDU length from the PDU
        length = pduBuffer.readUInt32BE(bufferPosition);

        // if length is less than 16, there's something very wrong here
        // TODO: we should emit an error and shorty should send a generic_nack
        if (length < 16) {
            break;
        }
        
        /**
         * Here, we're going to break if trying to read the full PDU from the
         * buffer would cause us to run off the end of the buffer (indicating
         * that the entire PDU was not sent in one TCP segment or whatever
         * causes node socket data events to fire)
         */
        if (((bufferPosition + length) > pduBuffer.length) && (bufferPosition <= pduBuffer.length)) {
            break;
        }

        // Have the parser parse the full PDU
        pdu = parser.parse(pduBuffer.slice(bufferPosition, bufferPosition + length));

        // Push that PDU on to the stack of PDUs we read
        pdus.push(pdu);

        // Increment the buffer position
        bufferPosition += (length);
    }

    /**
     * If, after reading all of the full PDUs in the buffer we received, we are
     * not at the end of the buffer, there is obviously the beginning of another
     * PDU left in the buffer, so we need to save that and return it to whoever
     * is handling our connection so they can give it back to us next time
     */
    if (pduBuffer.length > bufferPosition) {
        // there was a partial PDU
        splitPacketBuffer = pduBuffer.slice(bufferPosition, pduBuffer.length);
    } else {
        // there was not a partial PDU
        splitPacketBuffer = new Buffer(0);
    }

    return { pdus: pdus, splitPacketBuffer: splitPacketBuffer };
};
