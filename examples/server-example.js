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
    util   = require('util');

var messageId = 0;

var shortyServer = shorty.createServer('config.json');

// all event handlers must be set up before calling shortyServer.start()
shortyServer.on('bind', function(pdu, client, callback) {
    callback("ESME_ROK");
});

shortyServer.on('bindSuccess', function(client, pdu) {
    console.log('bind success');
});

shortyServer.on('deliver_sm_resp', function(client, pdu) {
    console.log("sms marked as delivered: " + pdu.sequence_number);
});

shortyServer.on('unbind', function(client, pdu) {
    console.log("client unbinding");
});

shortyServer.on('unbind_resp', function(client, pdu) {
    console.log("client unbound");
});

// client info, pdu info, callback(messageId, status)
shortyServer.on('submit_sm', function(clientInfo, pdu, callback) {
    var source = pdu.source_addr.toString('ascii'),
        dest = pdu.destination_addr.toString('ascii');

    console.log(pdu.short_message.toString('ascii'));

    // Any messages sent from this number will fail
    if (pdu.sender === "15555551234") {
        // indicate failure
        callback("ESME_RSUBMITFAIL", messageId++);
    } else {
        // indicate success
        callback("ESME_ROK", messageId++);
    }
});

shortyServer.start();

process.openStdin();
// called every time the user writes a line on stdin
process.stdin.on('data', function(chunk) {
    var line, parts, message, i, id;

    // buffer to a string
    line = chunk.toString();

    // remove the newline at the end
    line = line.substr(0, line.length - 1);

    // split by spaces
    parts = line.split(" ");

    // put the message back together
    message = "";
    for (i = 2; i < parts.length; i++) {
        message += parts[i] + " ";
    }

    id = shortyServer.deliverMessage('SMSCLOUD', {
        'source_addr': parts[0],
        'destination_addr': parts[1],
        'sm_length': Buffer.byteLength(message),
        'short_message': new Buffer(message)
    });
});

var sighandle = function() {
    shortyServer.stop();
};

process.on('exit', sighandle);
