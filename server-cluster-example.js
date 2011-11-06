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

var shorty  = require('./lib/shorty'),
    util    = require('util'),
    cluster = require('cluster'),
    numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('death', function(worker) {
        console.log('worker ' + worker.pid + ' died');
    });
} else {
    var shortyServer = shorty.createServer('config.json');

    // all clientOn event handlers must be set up before calling shortyServer.start()
    shortyServer.clientOn('bindRequest', function(client, callback) {
        callback(true);
    });

    shortyServer.clientOn('deliverySuccess', function(mySms) {
        console.log("sms marked as delivered: " + mySms.user_ref);
    });

    shortyServer.clientOn('receiveOutgoing', function(mySms, clientData, responseCallback) {
        console.log(mySms.sender + ' -> ' + mySms.recipient + ': ' + mySms.message);

        // Any messages sent from this number will fail
        if (mySms.sender === "15555551234") {
            // indicate failure
            responseCallback(mySms, false, messageId++);
        } else {
            // indicate success
            responseCallback(mySms, true, messageId++);
        }
    });

    shortyServer.start();
}
