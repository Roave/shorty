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

'use strict';

const common = require('./common.js');

let smpp;

module.exports = exports = class PduWriter {
    constructor(smppDefs) {
        exports.setSmppDefinitions(smppDefs);
    }

    write(pdu) {
        return exports.write(pdu);
    }
};

exports.setSmppDefinitions = function (defs) {
    smpp = defs;
};

exports.write = function (pdu) {
    const format = smpp.command_formats[pdu.command];
    const fields = [];

    let offset = 0;
    let length = 0;

    // if empty body is not allowed don't skip it
    // if command status is not error don't skip body
    // if body was provided then don't skip it
    if (
        format.empty_body_if_error !== true
        || pdu.command_status === 'ESME_ROK'
        || (pdu.fields && pdu.fields.length > 0)
    ) {
        /**
         * Put the mandatory fields in order, merge with defaults, and calculate writelength
         */
        for (let i = 0; i < format.body.length; i++) {
            const field = common.clone(format.body[i]);

            if (typeof pdu.fields[field.name] !== "undefined") {
                field.value = pdu.fields[field.name];
            } else {
                field.value = field.default;
            }

            fields.push(field);

            if (field.type === "int") {
                length += field.bytes;
            } else if (field.type === "c-string") {
                // get the actual byte writelength of the string, then add 1 for the
                // null terminator

                // Don't try to do anything to a buffer
                if (!Buffer.isBuffer(field.value)) {
                    if (typeof field.value === 'string') {
                        field.value = new Buffer(field.value);
                    } else {
                        try {
                            field.value = new Buffer(field.value.toString());
                        } catch (ex) {
                            throw new Error(`Could not cast value for ${field.name} to string`);
                        }
                    }
                }

                if (typeof field.value === 'undefined') {
                    length = 1;
                } else {
                    length += field.value.length + 1;
                }
            } else if (field.type === "string") {
                // Don't try to do anything to a buffer
                if (!Buffer.isBuffer(field.value)) {
                    if (typeof field.value === 'string') {
                        field.value = new Buffer(field.value);
                    } else {
                        try {
                            field.value = new Buffer(field.value.toString());
                        } catch (ex) {
                            throw new Error(`Could not cast value for ${field.name} to string`);
                        }
                    }
                }

                if (typeof field.value === 'undefined') {
                    length = 0;
                } else {
                    length += field.value.length;
                }
            }
        }
    }

    if (pdu.optional_params !== undefined) {
        for (const param in pdu.optional_params) {
            if (!{}.hasOwnProperty.call(pdu.optional_params, param)) {
                continue;
            }
            const definition = smpp.optional_params[param];

            // tag and writelength fields are 2 bytes each
            length += 4;

            if (definition.octets !== undefined) {
                length += definition.octets;
            } else {
                if (Buffer.isBuffer(pdu.optional_params[param])) {
                    length += pdu.optional_params[param].length;
                } else {
                    length += Buffer.byteLength(pdu.optional_params[param]);
                }
            }
        }
    }

    // PDU header is always 16 bytes
    length += 16;
    const buffer = new Buffer(length);

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

    // TODO command status is only used in responses, set it to null
    if (!pdu.command_status) {
        pdu.command_status = 'ESME_ROK';
    }
    buffer.writeUInt32BE(smpp.command_status[pdu.command_status].value, offset);
    offset += 4;

    buffer.writeUInt32BE(pdu.sequence_number, offset);
    offset += 4;

    // Write mandatory fields to the PDU
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
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
                default:
                    throw new RangeError('Unsupported int field size');
            }
        } else if (field.type === "c-string") {
            // TODO still need to do error checking for out-of-bounds lengths

            /**
             * Unlike with reading, this method can actually be the same for
             * fixed- and variable-writelength strings
             */
            if (field.value.length === 0) {
                buffer.writeUInt8(0x0, offset);
                offset += 1;
            } else {
                field.value.copy(buffer, offset);
                offset += field.value.length;

                buffer.writeUInt8(0x0, offset);
                offset += 1;
            }
        } else if (field.type === "string") {
            if (field.value.length !== 0) {
                field.value.copy(buffer, offset);
                offset += field.value.length;
            }
        }
    }

    if (pdu.optional_params !== undefined) {
        for (const paramName in pdu.optional_params) {
            if (!{}.hasOwnProperty.call(pdu.optional_params, paramName)) {
                continue;
            }
            const definition = smpp.optional_params[paramName];
            const param = pdu.optional_params[paramName];
            let writelength = 0;

            if (definition.octets !== undefined) {
                writelength += definition.octets;
            } else {
                if (Buffer.isBuffer(param)) {
                    writelength += param.length;
                } else {
                    writelength += Buffer.byteLength(param);
                }
            }

            // Write the tag and writelength -- 2 bytes each
            buffer.writeUInt16BE(definition.tag, offset);
            offset += 2;

            buffer.writeUInt16BE(writelength, offset);
            offset += 2;

            if (definition.type === "int") {
                switch (definition.octets) {
                    case 1:
                        buffer.writeUInt8(param, offset);
                        offset += 1;
                        break;
                    case 2:
                        buffer.writeUInt16BE(param, offset);
                        offset += 2;
                        break;
                    case 4:
                        buffer.writeUInt32BE(param, offset);
                        offset += 2;
                        break;
                    default:
                        throw new RangeError('Unsupported int field size');
                }
            } else if (definition.type === "octets") {
                if (Buffer.isBuffer(param)) {
                    param.copy(buffer, offset);
                    offset += param.length;
                } else {
                    buffer.write(param, offset);
                    offset += Buffer.byteLength(param);
                }
            } else if (definition.type === "c-string") {
                if (param.length === 0) {
                    buffer.writeUInt8(0x0, offset);
                    offset += 1;
                } else {
                    offset += buffer.write(param, offset);
                    buffer.writeUInt8(0x0, offset);
                    offset += 1;
                }
            } else if (definition.type === "string") {
                if (param.length !== 0) {
                    offset += buffer.write(param, offset);
                }
            }
        }
    }

    return buffer;
};

exports.serialize = function (pdu) {
    const newPdu = {};

    for (const key in pdu) {
        if (!{}.hasOwnProperty.call(pdu, key)) {
            continue;
        }
        let value = pdu[key];

        if (Buffer.isBuffer(value)) {
            value = {
                format: 'base64',
                value: value.toString('base64'),
            };
        }

        newPdu[key] = value;
    }

    return newPdu;
};

exports.unserialize = function (pdu) {
    const newPdu = {};

    for (const key in pdu) {
        if (!{}.hasOwnProperty.call(pdu, key)) {
            continue;
        }
        let value = pdu[key];

        if (value.format !== undefined && value.value !== undefined) {
            value = new Buffer(value.value, value.format);
        }

        newPdu[key] = value;
    }

    return newPdu;
};
