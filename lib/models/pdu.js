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

var pdu = function(command_id, sequence_number, pdu_body) {
    var self = this;
    self.command_id = command_id;
    self.sequence_number = sequence_number;
    if (pdu_body == undefined) {
        pdu_body = "";
    }
    self.pdu_body = pdu_body;
    self.header = exports.pack('NNNN', self.pdu_body.length + 16, self.command_id, 0, self.sequence_number);

    self.toBuffer = function() {
        return exports.createBuffer(self.header + self.pdu_body);
    };
};

exports.fromBuffer = function(pduBuffer) {
    length = (pduBuffer[0] << 24) +
             (pduBuffer[1] << 16) +
             (pduBuffer[2] << 8) +
             (pduBuffer[3]);
    command_id = ((pduBuffer[4] << 24) +
              (pduBuffer[5] << 16) +
              (pduBuffer[6] << 8) +
              (pduBuffer[7]) >>> 0);
    command_status = (pduBuffer[8] << 24) +
              (pduBuffer[9] << 16) +
              (pduBuffer[10] << 8) +
              (pduBuffer[11]);
    sequence_number = (pduBuffer[12] << 24) +
              (pduBuffer[13] << 16) +
              (pduBuffer[14] << 8) +
              (pduBuffer[15]);
    if ((length - 16) > 0) {
        pdu_body = pduBuffer.slice(16, length);
    } else {
        pdu_body = undefined;
    }
    return new pdu(command_id, sequence_number, pdu_body);
};

/**
 * This is just for convenience.
 */
exports.createPdu = function(command_id, sequence_number, pdu_body) {
    return new pdu(command_id, sequence_number, pdu_body);
}

exports.createBuffer = function(str) {
    buf = new Buffer(str.length);
    for (var i = 0; i < str.length; i++) {
        buf[i] = str.charCodeAt(i);
    }
    return buf;
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
