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
 * @package    smpp
 */

var smpp = require('./smpp-definitions'),
    Sms = require('./models/sms'); // for testing

var clone = function(obj) {
    if (obj === null || typeof obj !== "object") {
        return obj;
    }

    var clone = obj.constructor();
    for (var attrib in obj) {
        if (obj.hasOwnProperty(attrib)) {
            clone[attrib] = obj[attrib];
        }
    }

    return clone;
};

exports.write = function(pdu) {
    var format, buffer, fields = [], offset = 0, length = 0;

    format = smpp.command_formats[pdu.command];
    fields = [];

    /**
     * Put the fields in order, merge with defaults, and calculate length
     */
    for (var i = 0; i < format.body.length; i++) {
        var field, value;

        field = clone(format.body[i]);
        field.value = pdu.fields[field.name] ? pdu.fields[field.name] : field.default;
        fields.push(field);

        if (field.type === "int") {
            length += field.bytes;
        } else if (field.type === "c-string") {
            // get the actual byte length of the string, then add 1 for the
            // null terminator
            length += Buffer.byteLength(field.value) + 1;
        } else if (field.type === "string") {
            length += Buffer.byteLength(field.value);
        }
    }

    // PDU header is always 16 bytes
    length += 16;
    buffer = new Buffer(length);

    /**
     * Write the PDU header:
     *  - command_length
     *  - command_id
     *  - command_status
     *  - sequence_number
     */
    buffer.writeUInt32BE(length, offset);
    offset += 4;

    buffer.writeUInt32BE(smpp.commands[pdu.command], offset);
    offset += 4;

    buffer.writeUInt32BE(smpp.command_status[pdu.command_status].value, offset);
    offset += 4;

    buffer.writeUInt32BE(pdu.sequence_number, offset);
    offset += 4;

    // Write mandatory fields to the PDU
    for (var i = 0; i < fields.length; i++) {
        var start, end, field = fields[i];
        if (field.type === "int") {
            switch (field.bytes) {
                case 1:
                    buffer.writeUInt8(field.value, offset);
                    offset += 1;
                    break;
                case 2:
                    buffer.writeUInt16BE(field.value, offset);
                    offset += 2;
                    break;
                case 4:
                    buffer.writeUInt32BE(field.value, offset);
                    offset += 4;
                    break;
            }
        } else if (field.type === "c-string") {
            // TODO still need to do error checking for out-of-bounds lengths
            
            /**
             * Unlike with reading, this method can actually be the same for
             * fixed- and variable-length strings
             */
            if (field.value.length === 0) {
                buffer.writeUInt8(0x0, offset);
                offset += 1;
            } else {
                offset += buffer.write(field.value, offset);
                buffer.writeUInt8(0x0, offset);
                offset += 1;
            }
        } else if (field.type === "string") {
            if (field.value.length !== 0) {
                offset += buffer.write(field.value, offset);
            }
        }
    }

    return buffer;
};

var pdu = {
    command: "submit_sm",
    command_status: "ESME_ROK",
    sequence_number: 5,
    fields: {
        source_addr: "15551231234",
        destination_addr: "15553214321",
        short_message: "test",
        sm_length: 4,
    }
};

var buffer = exports.write(pdu);
console.log(require('./pdu-parser').parse(buffer));
