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

var smpp;

exports.setSmppDefinitions = function(defs) {
    smpp = defs;
};

/**
 * Thanks to the amazing improvements to buffers in node v0.6, we no longer have
 * to use a ridiculously complicated pack method or any crazy, un-readable
 * bit-wise operations in order to parse and create PDUs.
 *
 * Note: everything in SMPP is big-endian, so we'll always use buffer.read___BE()
 *
 * The parse method here takes a buffer containing one (and only one) individual
 * PDU. It will parse the whole thing, including the header, and return a PDU
 * object with a bunch of nifty information.
 */
exports.parse = function(buffer) {
    var format,
        field,
        result = {},
        offset = 0;

    // Read the PDU header
    result.command_length = buffer.readUInt32BE(offset);
    offset += 4;

    result.command_id = buffer.readUInt32BE(offset);
    offset += 4;

    result.command_status = buffer.readUInt32BE(offset);
    offset += 4;

    result.sequence_number = buffer.readUInt32BE(offset);
    offset += 4;

    if (smpp.command_formats[smpp.command_ids[result.command_id]] === undefined) {
        throw "command not supported";
    }

    format = smpp.command_formats[smpp.command_ids[result.command_id]];

    // for certain PDUs, the PDU body is omitted if there is a non-zero (error) status
    if (result.command_status != 0 && format.empty_body_if_error == true) {
        return result;
    }

    // Read each mandatory field from the command format definition
    for (var i = 0; i < format.body.length; i++) {
        var start, end;

        // shortcut to the current field
        field = format.body[i];

        /**
         * Read the field based on its type.
         *
         * int: there will be a field called "bytes", indicating the number of
         *      bytes the int should be
         *
         * c-string: your typical null-terminated string. lengths have a couple
         *           of different cases:
         *              - for variable-length strings min/max lengths are defined
         *              - for fixed-length strings, the string can either be
         *                empty (just a null terminator) or the the length
         *                defined in the "length" field
         *
         * string: similar to c-string, but not null-terminated; this is only
         *         really present in the short_message field, which is a special
         *         case anyway, due to the fact that its length is defined by
         *         the value of the sm_length field. In this case, the length of
         *         the string will be specified by the value parsed in the field
         *         named by length_field
         *
         *  For strings, WE WILL RETURN BUFFERS, NOT JS STRINGS. This is because
         *  some strings (I'm looking at you, submit_sm) might have a different
         *  encoding than we're expecting here, and this method needs to be 100%
         *  command-agnostic. It'll be up to the command handlers to turn those
         *  buffers into strings.
         */
        if (field.type == "int") {
            // Though I don't believe any mandatory params (aside from the
            // header) are 2- or 4-byte ints, we'll just be sure we can handle
            // them anyway
            switch (field.bytes) {
                case 1:
                    result[field.name] = buffer.readUInt8(offset);
                    offset += 1;
                    break;
                case 2:
                    result[field.name] = buffer.readUInt16BE(offset);
                    offset += 2;
                    break;
                case 4:
                    result[field.name] = buffer.readUInt32BE(offset);
                    offset += 4;
                    break;
            }
        } else if (field.type === "c-string") {
            if (field.length === undefined) {
                // variable-length c-string

                // check if the field is empty
                if (buffer[offset] === 0x0) {
                    result[field.name] = new Buffer([0x0]);
                    offset += 1;
                } else {
                    start = offset;
                    end = offset;

                    while (((end - start) <= field.max) && buffer[end] != 0x0) {
                        end++;
                    }

                    var temp = new Buffer(end - start);
                    buffer.copy(temp, 0, start, end);

                    result[field.name] = temp;

                    // Add the extra 1 to make sure we're not writing over the
                    // last character of the string
                    offset += (end - start) + 1;
                }
            } else {
                // fixed length c-string

                // check if the field is empty
                if (buffer[offset] === 0x0) {
                    result[field.name] = new Buffer([0x0]);
                    offset += 1;
                } else {
                     var temp = new Buffer(field.length);
                     buffer.copy(temp, 0, offset, offset + field.length);

                     result[field.name] = temp;
                     offset += field.length;
                }
            }
        } else if (field.type === "string") {
            var length = result[field.length_field];
            var temp = new Buffer(length);
            buffer.copy(temp, 0, offset, offset + length);

            result[field.name] = temp;
            offset += length;
        }
    }

    // try to parse optional params
    result.optional_params = {};
    while (offset !== buffer.length) {
        var tag, length, value;

        // TODO we should emit an error (probably ESME_RINVMSGLEN)
        if (offset > buffer.length - 4) {
            break;
        }

        // tag and length are 2-byte ints
        tag = buffer.readUInt16BE(offset);
        offset += 2;

        length = buffer.readUInt16BE(offset);
        offset += 2;

        // we're not going to bother trying to parse the value into whatever
        // type it is (bitmask, string, int, etc). the smpp command handler can
        // take care of that (or even the user's application code)
        value = new Buffer(length);

        buffer.copy(value, 0, offset, offset + length);
        offset += length;

        result.optional_params[smpp.optional_param_tags[tag]] = value;
    }

    return result;
};
