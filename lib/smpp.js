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

var sys = require('sys');

exports.commands = {};                               // Use commands to look up by command name
exports.command_ids = {                              // Use command_ids to look up by ID
    0x80000000: 'generic_nack',
    0x00000001: 'bind_receiver',
    0x80000001: 'bind_receiver_resp',
    0x00000002: 'bind_transmitter',
    0x80000002: 'bind_transmitter_resp',
    0x00000003: 'query_sm',
    0x80000003: 'query_sm_resp',
    0x00000004: 'submit_sm',
    0x80000004: 'submit_sm_resp',
    0x00000005: 'deliver_sm',
    0x80000005: 'deliver_sm_resp',
    0x00000006: 'unbind',
    0x80000006: 'unbind_resp',
    0x00000007: 'replace_sm',
    0x80000007: 'replace_sm_resp',
    0x00000008: 'cancel_sm',
    0x80000008: 'cancel_sm_resp',
    0x00000009: 'bind_transceiver',
    0x80000009: 'bind_transceiver_resp',
    0x0000000B: 'outbind',
    0x00000015: 'enquire_link',
    0x80000015: 'enquire_link_resp',
    0x00000021: 'submit_multi',
    0x80000021: 'submit_multi_resp',
    0x00000102: 'alert_notification',
    0x00000103: 'data_sm',
    0x80000103: 'data_sm_resp'
};

// Reverse coomand_ids into commands so we can have easy lookup either way!
for (var command_id in exports.command_ids) {
    exports.commands[ exports.command_ids[command_id] ] = command_id;
}

exports.readPdu = function(pdu) {
        dataStr = pdu;//.toString('binary');
        sys.puts(sys.inspect(pdu));
        pdu = {};
        pdu['length'] = (dataStr[0] << 24) +
                        (dataStr[1] << 16) +
                        (dataStr[2] << 8) +
                        (dataStr[3]);
        pdu['command_id'] = ((dataStr[4] << 24) +
                        (dataStr[5] << 16) +
                        (dataStr[6] << 8) +
                        (dataStr[7]) >>> 0);
        pdu['command_status'] = (dataStr[8] << 24) +
                        (dataStr[9] << 16) +
                        (dataStr[10] << 8) +
                        (dataStr[11]);
        pdu['sequence_number'] = (dataStr[12] << 24) +
                        (dataStr[13] << 16) +
                        (dataStr[14] << 8) +
                        (dataStr[15]);
        pdu['body'] = '';
        if ((pdu['length'] - 16) > 0) {
            for (i = 16; i < pdu['length']; i++) {
                pdu['body'] += String.fromCharCode(dataStr[i]);
            }
        }

        return pdu;
};

exports.pack = function(format) {
    var packed = '';
    var argi = 1;
    for (i = 0; i < format.length; i++) {
        var chr = format.charAt(i);
        var arg = arguments[argi];
        var num = '';
        switch (chr) {
            case 'A':
                num = '';
                while (format.charAt(i+1).match(/^\d$/)){
                    num = num + format.charAt(i+1);
                    i++;
                }
                if (num.length == 0) {
                    num = 1;
                }
                num = parseInt(num);
                for (j = 0; j <= num; j++) {
                    var chrj = arg.charAt(j);
                    if (j > arg.length) {
                        packed += ' ';
                    } else {
                        packed += chrj;
                    }
                }
                argi++;
                break;
            case 'a':
                num = '';
                while (format.charAt(i+1).match(/^\d$/)) {
                    num = num + format.charAt(i+1);
                    i++;
                }
                if (num.length == 0) {
                    num = 1;
                }
                num = parseInt(num);
                for (j = 0; j <= num; j++) {
                    var chrj = arg.charAt(j);
                    if (j > arg.length) {
                        packed += "\0";
                    } else {
                        packed += chrj;
                    }
                }
                argi++;
                break;
            case 'C':
            case 'c':
                num = '';
                while (format.charAt(i+1).match(/^\d$/)) {
                    num = num + format.charAt(i+1);
                    i++;
                }
                if (num.length == 0) {
                    num = 1;
                }
                num = parseInt(num);
                for (j = 1; j <= num; j++) {
                    packed += String.fromCharCode(arg);
                    argi++;
                    var arg = arguments[argi];
                }
                break;
            case 'N':
                num = '';
                while (format.charAt(i+1).match(/^\d$/)) {
                    num = num + format.charAt(i+1);
                    i++;
                }
                if (num.length == 0) {
                    num = 1;
                }
                num = parseInt(num);
                for (j = 1; j <= num; j++) {
                    packed += String.fromCharCode((arg >> 24) & 255, (arg >> 16) & 255, (arg >> 8) & 255, arg & 255);
                    argi++;
                    var arg = arguments[argi];
                }
                break;
        }
    }
    return packed;
};
