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
    sys    = require('util');


var shortyClient = shorty.createClient('config.json');

shortyClient.on('submit_sm_resp', function (pdu) {
    console.log('sms marked as sent: ' + pdu.sequence_number);
});

shortyClient.on('sendFailure', function (id) {
    console.log('sms failed (rejected by smsc): ' + id);
});

// example bind success callback
shortyClient.on('bindSuccess', function(pdu) {
    console.log('bind successful');
});

shortyClient.on('bindFailure', function(pdu) {
    console.log('bind failed');
});

shortyClient.on('unbind', function(pdu) {
    console.log('unbinding from server');
});

shortyClient.on('unbind_resp', function(pdu) {
    console.log('unbind confirmed');
});

shortyClient.on('disconnect', function() {
    console.log('disconnected');
});

// example incoming message callback
shortyClient.on('deliver_sm', function(pdu) {
    console.log('incoming message callback fired');
});

shortyClient.connect();


process.openStdin();
// called every time the user writes a line on stdin
process.stdin.on('data', function(chunk) {
    var line, parts, i, message, id;

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

    id = shortyClient.sendMessage({
       souce_addr_ton: 0x01,
       source_addr: parts[0],
       dest_addr_ton: 0x01,
       destination_addr: parts[1],
       data_coding: 0x03,
       short_message: message
    });
});

var sighandle = function() {
    process.stdin.end();
    shortyClient.unbind();
    process.exit();
};

process.on('SIGHUP', sighandle);
process.on('SIGINT', sighandle);
process.on('SIGQUIT', sighandle);
process.on('SIGKILL', sighandle);
process.on('SIGTERM', sighandle);
process.on('SIGSTOP', sighandle); 
