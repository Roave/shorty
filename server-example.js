#!/usr/local/bin/node
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
 * @package    examples
 */

var shorty = require('./lib/shorty'),
    sys    = require('sys');

shortyServer = shorty.createServer('config.json');

// all clientOn event handlers must be set up before calling shortyServer.start()
shortyServer.clientOn('bindRequest', function(username, password, system_type, bind_type) {
    console.log('bind_request ('+bind_type+') callback fired');
    return true;
});

shortyServer.clientOn('deliverySuccess', function(mySms) {
    console.log("sms marked as delivered: " + mySms.user_ref);
});

shortyServer.clientOn('receiveOutgoing', function(mySms, clientData, responseCallback) {
    console.log(sys.inspect(mySms));
    if (mySms.sender == "15555551234") {
        // indicate failure
        responseCallback(mySms, false);
    } else {
        // indicate success
        responseCallback(mySms, true);
    }
});

shortyServer.start();
