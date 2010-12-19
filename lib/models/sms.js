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

var sms = function(sender, recipient, message, sequence_number, user_ref) {
    var self = this;
    self.sender = sender;
    self.recipient = recipient;
    self.message = message;
    self.sequence_number = sequence_number;
    self.confirmation = false;

    // user_ref is a reference a user can use to identify a particular sms for themselves
    if (user_ref == undefined) {
        self.user_ref = "";
    } else {
        self.user_ref = user_ref;
    }

}

exports.fromPdu = function(pdu) {
    from = pdu.pdu_body.toString('ascii', 3, 14);
    to = pdu.pdu_body.toString('ascii', 17, 28);
    length = pdu.pdu_body[38];
    message = pdu.pdu_body.toString('ascii', 39, myPdu.pdu_body.length);
    sequence_number = pdu.sequence_number;

    return new sms(from, to, message, sequence_number);
}

exports.create = function(sender, recipient, message, sequence_number, user_ref) {
    return new sms(sender, recipient, message, sequence_number, user_ref);
}
