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
    sms    = require('../lib/models/sms'),

exports.testSmsModel = function(t) {
    // first we create an sms object
    mySms = sms.create('11234567890', '11235677890', 'Test message', 1, 'reference');
    t.ok(mySms.sender == '11234567890', "Properties in sms model properly set");
    // now we convert the sms object to a pdu object
    myPdu = mySms.toPdu(smpp.commands.submit_sm);
    // now we convert the pdu object to a buffer
    myBuffer = myPdu.toBuffer();
    t.ok(myBuffer.length == 67, "Testing buffer length");
    // now convert the buffer back to a pdu object
    myPdu = pdu.individualPduFromBuffer(myBuffer);
    // now convert the pdu back to an sms object and test it
    mySms = sms.fromPdu(myPdu);
    t.ok(mySms.sender == '11234567890', "Properties in sms model properly set");
    t.done();
};
