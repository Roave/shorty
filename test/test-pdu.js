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
 * @package    tests
 */
var pdu    = require('../lib/models/pdu'),
    smpp   = require('../lib/smpp');

exports.testPduModel = function(t) {
    myPdu = smpp.deliver_sm_resp(1);
    t.ok(myPdu.command_id == 0x80000005, "PDU command_id");
    buffer = myPdu.toBuffer();
    t.ok(buffer.length == 17, "PDU buffer length");
    myPdu2 = pdu.fromBuffer(buffer);
    t.ok(myPdu2.command_id == 0x80000005, "PDU command_id after converting to/from buffer");
    myBuffer = pdu.createBuffer('test');
    // This could probably be tested better to test the case that didn't work without creating the buffer byte-for-byte
    t.ok(myBuffer.toString('ascii') == 'test', "Testing that pdu.createBuffer behaves properly");
    t.done();
}
