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
var smpp  = require('../smpp');
var pdu = function(command_id, sequence_number, pdu_body) {
    var self = this;
    self.command_id = command_id;
    self.sequence_number = sequence_number;
    if (pdu_body == undefined) {
        pdu_body = "";
    }
    self.pdu_body = pdu_body;
    self.header = smpp.pack('NNNN', self.pdu_body.length + 16, self.command_id, 0, self.sequence_number);

    self.createBuffer = function() {
        return smpp.createBuffer(header + pdu_body);
    };
};

exports.createFromBuffer = function(pduBuffer) {
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
        body = pduBuffer.slice(16, length);
    } else {
        body = undefined;
    }
    return new pdu(command_id, sequence_number, pdu_body);
};
