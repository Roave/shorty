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

var smpp   = require('../lib/smpp');
    pdu    = require('../lib/models/pdu'),

exports.testPduModel = function(t) {
    myPdu = smpp.deliver_sm_resp(1);
    t.ok(myPdu.command_id == 0x80000005, "PDU command_id");
    t.ok(myPdu.sequence_number == 1, "PDU sequence_number");
    t.ok(myPdu.pdu_body.length == 1, "PDU body length");

    // Convert the PDU to a Buffer object and test the length
    buffer = myPdu.toBuffer();
    t.ok(buffer.length == 17, "PDU buffer length");

    // Now convert it back, and re-test the pdu object
    myPdu = pdu.individualPduFromBuffer(buffer);
    t.ok(myPdu.command_id == 0x80000005, "PDU command_id");
    t.ok(myPdu.sequence_number == 1, "PDU sequence_number");
    t.ok(myPdu.pdu_body.length == 1, "PDU body length");

    // This could probably be tested better to test the case that didn't work without creating the buffer byte-for-byte
    myBuffer = pdu.createBuffer('test');
    t.ok(myBuffer.toString('ascii') == 'test', "Testing that pdu.createBuffer behaves properly");

    t.done();
};

exports.testPduHeaderChange = function(t) {
    // This is to make sure that changing details in the pdu update the buffer that comes out
    myPdu = pdu.createPdu(smpp.commands.deliver_sm, 1, "\0");
    buffer1 = myPdu.toBuffer();
    myPdu.command_id = smpp.commands.deliver_sm_resp;
    buffer2 = myPdu.toBuffer();
    t.ok(buffer1.toString() !== buffer2.toString(), "Making sure the buffer output changes on update");
    t.done();
};
